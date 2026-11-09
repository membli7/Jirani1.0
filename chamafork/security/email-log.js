"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_BACKUPS = 2;
const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000;
const APP_ROOT = path.resolve(__dirname, "..", "..");

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function safeTarget(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) throw new Error("SMTP_LOG_FILE must be configured.");
  const tempRoot = path.resolve(os.tmpdir());
  const realTempRoot = fs.realpathSync(tempRoot);
  const target = path.resolve(filePath);
  if (target === tempRoot || !isWithin(tempRoot, target) || isWithin(APP_ROOT, target)) {
    throw new Error("SMTP_LOG_FILE must be under a private directory in the OS temporary folder.");
  }

  const directory = path.dirname(target);
  let ancestor = directory;
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error("SMTP_LOG_FILE parent directory is unavailable.");
    ancestor = parent;
  }
  const realAncestor = fs.realpathSync(ancestor);
  if (!isWithin(realTempRoot, realAncestor) || isWithin(APP_ROOT, realAncestor)) {
    throw new Error("SMTP_LOG_FILE must be under a private directory in the OS temporary folder.");
  }

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const realDirectory = fs.realpathSync(directory);
  if (!isWithin(realTempRoot, realDirectory) || isWithin(APP_ROOT, realDirectory)) {
    throw new Error("SMTP_LOG_FILE must be under a private directory in the OS temporary folder.");
  }
  if (process.platform !== "win32" && (fs.statSync(realDirectory).mode & 0o077) !== 0) {
    throw new Error("SMTP_LOG_FILE parent directory must be private to the current user.");
  }
  return target;
}

function privateFileStats(filePath) {
  let stats;
  try {
    stats = fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Secure local email capture could not be accessed.");
  }
  if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink > 1) {
    throw new Error("Secure local email capture must be a regular, unlinked file.");
  }
  if (process.platform !== "win32") {
    try { fs.chmodSync(filePath, 0o600); }
    catch { throw new Error("Secure local email capture permissions could not be set."); }
  }
  return fs.statSync(filePath);
}

function pruneExpired(target, now) {
  for (let index = 0; index <= MAX_BACKUPS; index += 1) {
    const filePath = index === 0 ? target : `${target}.${index}`;
    const stats = privateFileStats(filePath);
    if (stats && now - stats.mtimeMs > MAX_LOG_AGE_MS) fs.unlinkSync(filePath);
  }
}

function rotate(target) {
  for (let index = MAX_BACKUPS; index >= 1; index -= 1) {
    const source = index === 1 ? target : `${target}.${index - 1}`;
    const destination = `${target}.${index}`;
    if (!privateFileStats(source)) continue;
    if (privateFileStats(destination)) fs.unlinkSync(destination);
    fs.renameSync(source, destination);
    if (process.platform !== "win32") fs.chmodSync(destination, 0o600);
  }
}

function appendJsonEmailCapture(filePath, message) {
  let payload;
  try { payload = JSON.parse(String(message)); }
  catch { throw new Error("Local email capture must be valid JSON."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Local email capture must contain a JSON object.");
  }
  const line = `${JSON.stringify(payload)}\n`;
  const lineBytes = Buffer.byteLength(line, "utf8");
  if (lineBytes > MAX_LOG_BYTES) throw new Error("Local email capture message is too large.");
  const target = safeTarget(filePath);

  try {
    const now = Date.now();
    pruneExpired(target, now);
    const current = privateFileStats(target);
    const day = timestamp => new Date(timestamp).toISOString().slice(0, 10);
    if (current && (day(current.mtimeMs) !== day(now) || current.size + lineBytes > MAX_LOG_BYTES)) rotate(target);
    pruneExpired(target, now);

    const noFollow = process.platform === "win32" ? 0 : (fs.constants.O_NOFOLLOW || 0);
    const flags = fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY | noFollow;
    const descriptor = fs.openSync(target, flags, 0o600);
    try {
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile() || opened.nlink > 1) throw new Error("Not a private regular file.");
      if (process.platform !== "win32") fs.fchmodSync(descriptor, 0o600);
      fs.writeFileSync(descriptor, line, { encoding: "utf8" });
    } finally {
      fs.closeSync(descriptor);
    }
    privateFileStats(target);
    return true;
  } catch {
    throw new Error("Secure local email capture could not be written.");
  }
}

module.exports = { appendJsonEmailCapture };
