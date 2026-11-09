"use strict";

const { parseCanonicalHttpsOrigin } = require("./https-origin");
const net = require("node:net");

function normalizeIp(value) {
  const ip = String(value || "").trim().toLowerCase();
  return ip.startsWith("::ffff:") && net.isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

function isPrivateIp(value) {
  const ip = normalizeIp(value);
  if (ip === "localhost" || ip === "::1") return true;
  const version = net.isIP(ip);
  if (version === 4) {
    const octets = ip.split(".").map(Number);
    return octets[0] === 10 || octets[0] === 127 || octets[0] === 192 && octets[1] === 168 ||
      octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 169 && octets[1] === 254;
  }
  return version === 6 && (/^(fc|fd)/.test(ip) || /^fe[89ab]/.test(ip));
}

function parseTrustedProxyIps(value) {
  const entries = String(value || "").split(",").map(item => normalizeIp(item)).filter(Boolean);
  if (!entries.length || entries.some(ip => !isPrivateIp(ip))) {
    throw new Error("TRUSTED_PROXY_IPS must list exact loopback or private proxy IP addresses.");
  }
  return [...new Set(entries)];
}

function createTrustedProxyPredicate(value) {
  const trusted = new Set(parseTrustedProxyIps(value));
  return address => trusted.has(normalizeIp(address));
}

function resolveAppBindHost(env = process.env) {
  return String(env.APP_BIND_HOST || "").trim() || "127.0.0.1";
}

function strongSecret(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32) return false;
  if (/(change.?me|example|password|admin|development|test|secret)/i.test(value)) return false;
  return new Set(value).size >= 16;
}

function parseAllowedOrigins(value) {
  const entries = String(value || "").split(",").map(item => item.trim()).filter(Boolean);
  const origins = [];
  for (const entry of entries) {
    const origin = parseCanonicalHttpsOrigin(entry);
    if (!origin) throw new Error("APP_ALLOWED_ORIGINS must contain HTTPS origins.");
    origins.push(origin);
  }
  return [...new Set(origins)];
}

function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== "production") return;
  const errors = [];
  let canonicalOrigin = null;
  let allowedOrigins = [];
  try { canonicalOrigin = parseCanonicalHttpsOrigin(env.APP_CANONICAL_ORIGIN); }
  catch (error) { errors.push(error.message); }
  if (!canonicalOrigin) errors.push("APP_CANONICAL_ORIGIN must be set to the public HTTPS origin.");
  try { allowedOrigins = parseAllowedOrigins(env.APP_ALLOWED_ORIGINS); }
  catch (error) { errors.push(error.message); }
  if (!allowedOrigins.length) errors.push("APP_ALLOWED_ORIGINS must list at least one trusted HTTPS origin.");
  if (canonicalOrigin && allowedOrigins.length && !allowedOrigins.includes(canonicalOrigin)) errors.push("APP_ALLOWED_ORIGINS must include APP_CANONICAL_ORIGIN.");
  if (!strongSecret(env.SESSION_SECRET)) errors.push("SESSION_SECRET must be a non-placeholder value of at least 32 bytes with sufficient character diversity.");
  if (!strongSecret(env.ONE_TIME_CODE_HMAC_SECRET)) errors.push("ONE_TIME_CODE_HMAC_SECRET must be a non-placeholder value of at least 32 bytes with sufficient character diversity.");
  if (env.ONE_TIME_CODE_HMAC_SECRET === env.SESSION_SECRET) errors.push("ONE_TIME_CODE_HMAC_SECRET must be distinct from SESSION_SECRET.");
  if (!strongSecret(env.SETUP_BOOTSTRAP_SECRET)) errors.push("SETUP_BOOTSTRAP_SECRET must be a non-placeholder value of at least 32 bytes with sufficient character diversity.");
  for (const key of ["SESSION_SECRET", "ONE_TIME_CODE_HMAC_SECRET", "METRICS_BEARER_TOKEN"]) {
    if (env.SETUP_BOOTSTRAP_SECRET && env.SETUP_BOOTSTRAP_SECRET === env[key]) errors.push(`SETUP_BOOTSTRAP_SECRET must be distinct from ${key}.`);
  }
  if (env.DATA_BACKEND !== "postgres" || !env.DATABASE_URL) errors.push("Production requires DATA_BACKEND=postgres and DATABASE_URL.");
  if (String(env.SMTP_TRANSPORT || "").trim().toLowerCase() === "json") errors.push("SMTP_TRANSPORT=json is prohibited in production; configure authenticated SMTP.");
  if (typeof env.SMTP_LOG_FILE === "string" && env.SMTP_LOG_FILE.trim()) errors.push("SMTP_LOG_FILE is prohibited in production because it can contain one-time codes.");
  let redisProtocol = null;
  try { redisProtocol = new URL(env.REDIS_URL).protocol; } catch {}
  if (redisProtocol !== "rediss:" || env.SESSION_STORE !== "redis") errors.push("Production requires a TLS-protected rediss:// REDIS_URL and SESSION_STORE=redis for shared sessions and rate limits.");
  if (env.TRUST_PROXY !== "1") errors.push("Production TLS termination requires TRUST_PROXY=1 behind the trusted public HTTPS proxy.");
  try { parseTrustedProxyIps(env.TRUSTED_PROXY_IPS); }
  catch (error) { errors.push(error.message); }
  if (env.APP_BIND_HOST && !isPrivateIp(env.APP_BIND_HOST)) errors.push("APP_BIND_HOST must be a loopback or private IP address in production.");
  if (env.PGSSL !== "verify-full") errors.push("Production requires PGSSL=verify-full to validate the database TLS certificate.");
  if (!strongSecret(env.METRICS_BEARER_TOKEN)) errors.push("METRICS_BEARER_TOKEN must be a non-placeholder value of at least 32 bytes with sufficient character diversity.");
  if (errors.length) throw new Error(`Unsafe production configuration: ${errors.join(" ")}`);
}

module.exports = { createTrustedProxyPredicate, isPrivateIp, normalizeIp, parseAllowedOrigins, parseTrustedProxyIps, resolveAppBindHost, strongSecret, validateProductionConfig };
