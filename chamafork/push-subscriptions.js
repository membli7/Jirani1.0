"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const REDIS_HASH = "jirani:push:subscriptions:v1";
const MAX_SUBSCRIPTIONS_PER_USER = 8;
const MAX_ENDPOINT_LENGTH = 2048;
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;
const ALLOWED_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "web.push.apple.com.cn",
]);

function safeIdentity(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function allowedPushHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return ALLOWED_PUSH_HOSTS.has(host)
    || host.endsWith(".push.services.mozilla.com")
    || host.endsWith(".push.apple.com")
    || host.endsWith(".notify.windows.com");
}

function normalizeEndpoint(value) {
  if (typeof value !== "string" || !value || value.length > MAX_ENDPOINT_LENGTH) throw new TypeError("Invalid push endpoint.");
  let url;
  try { url = new URL(value); } catch { throw new TypeError("Invalid push endpoint."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443") || !allowedPushHost(url.hostname)) {
    throw new TypeError("Unsupported push service endpoint.");
  }
  return url.toString();
}

function normalizeSubscription(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid push subscription.");
  const endpoint = normalizeEndpoint(value.endpoint);
  const keys = value.keys && typeof value.keys === "object" && !Array.isArray(value.keys) ? value.keys : {};
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (!KEY_PATTERN.test(p256dh) || p256dh.length < 40 || !KEY_PATTERN.test(auth) || auth.length < 16 || auth.length > 32) {
    throw new TypeError("Invalid push subscription keys.");
  }
  const expirationTime = value.expirationTime === null || value.expirationTime === undefined
    ? null
    : Number.isFinite(value.expirationTime) && value.expirationTime > 0 ? value.expirationTime : null;
  return { endpoint, keys: { p256dh, auth }, expirationTime };
}

function identityField(chamaId, userId) {
  if (!safeIdentity(chamaId) || !safeIdentity(userId)) throw new TypeError("Invalid subscription owner.");
  return `${chamaId}:${userId}`;
}

function parseRecord(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.flatMap(item => {
      try { return [{ ...normalizeSubscription(item), createdAt: item.createdAt, updatedAt: item.updatedAt }]; }
      catch { return []; }
    }) : [];
  } catch { return []; }
}

function createPushSubscriptionStore({ filePath, redisClient = null, now = () => new Date().toISOString() } = {}) {
  if (typeof filePath !== "string" || !filePath) throw new TypeError("A private subscription file path is required.");
  let fileQueue = Promise.resolve();

  function enqueueFile(operation) {
    const result = fileQueue.then(operation, operation);
    fileQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function readFileStore() {
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
      return parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries) ? parsed.entries : {};
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }

  async function writeFileStore(entries) {
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temporary, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, filePath);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  }

  async function get(chamaId, userId) {
    const field = identityField(chamaId, userId);
    if (redisClient?.isOpen) return parseRecord(await redisClient.hGet(REDIS_HASH, field) || "");
    const entries = await readFileStore();
    return parseRecord(JSON.stringify(entries[field] || []));
  }

  async function upsert(chamaId, userId, input) {
    const field = identityField(chamaId, userId);
    const subscription = normalizeSubscription(input);
    return enqueueFile(async () => {
      if (redisClient?.isOpen) {
        const current = parseRecord(await redisClient.hGet(REDIS_HASH, field) || "");
        const next = current.filter(item => item.endpoint !== subscription.endpoint);
        next.push({ ...subscription, createdAt: current.find(item => item.endpoint === subscription.endpoint)?.createdAt || now(), updatedAt: now() });
        await redisClient.hSet(REDIS_HASH, field, JSON.stringify(next.slice(-MAX_SUBSCRIPTIONS_PER_USER)));
        return { count: Math.min(next.length, MAX_SUBSCRIPTIONS_PER_USER) };
      }
      const entries = await readFileStore();
      const current = parseRecord(JSON.stringify(entries[field] || []));
      const next = current.filter(item => item.endpoint !== subscription.endpoint);
      next.push({ ...subscription, createdAt: current.find(item => item.endpoint === subscription.endpoint)?.createdAt || now(), updatedAt: now() });
      entries[field] = next.slice(-MAX_SUBSCRIPTIONS_PER_USER);
      await writeFileStore(entries);
      return { count: entries[field].length };
    });
  }

  async function remove(chamaId, userId, endpoint) {
    const field = identityField(chamaId, userId);
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    return enqueueFile(async () => {
      if (redisClient?.isOpen) {
        const current = parseRecord(await redisClient.hGet(REDIS_HASH, field) || "");
        const next = current.filter(item => item.endpoint !== normalizedEndpoint);
        if (next.length) await redisClient.hSet(REDIS_HASH, field, JSON.stringify(next));
        else await redisClient.hDel(REDIS_HASH, field);
        return current.length - next.length;
      }
      const entries = await readFileStore();
      const current = parseRecord(JSON.stringify(entries[field] || []));
      const next = current.filter(item => item.endpoint !== normalizedEndpoint);
      if (next.length) entries[field] = next;
      else delete entries[field];
      if (current.length !== next.length) await writeFileStore(entries);
      return current.length - next.length;
    });
  }

  async function listForChama(chamaId, userIds) {
    if (!safeIdentity(chamaId) || !Array.isArray(userIds)) return [];
    const identities = [...new Set(userIds.filter(safeIdentity))];
    if (redisClient?.isOpen) {
      const records = await Promise.all(identities.map(async userId => parseRecord(await redisClient.hGet(REDIS_HASH, identityField(chamaId, userId)) || "")));
      return records.flat();
    }
    const entries = await readFileStore();
    return identities.flatMap(userId => parseRecord(JSON.stringify(entries[identityField(chamaId, userId)] || [])));
  }

  return { get, upsert, remove, listForChama, normalizeSubscription };
}

module.exports = { createPushSubscriptionStore, normalizeSubscription, normalizeEndpoint, allowedPushHost, MAX_SUBSCRIPTIONS_PER_USER };
