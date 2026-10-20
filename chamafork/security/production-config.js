"use strict";

const { parseCanonicalHttpsOrigin } = require("./https-origin");

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
  if (env.DATA_BACKEND !== "postgres" || !env.DATABASE_URL) errors.push("Production requires DATA_BACKEND=postgres and DATABASE_URL.");
  let redisProtocol = null;
  try { redisProtocol = new URL(env.REDIS_URL).protocol; } catch {}
  if (redisProtocol !== "rediss:" || env.SESSION_STORE !== "redis") errors.push("Production requires a TLS-protected rediss:// REDIS_URL and SESSION_STORE=redis for shared sessions and rate limits.");
  if (env.TRUST_PROXY !== "1") errors.push("Production TLS termination requires TRUST_PROXY=1 behind the trusted public HTTPS proxy.");
  if (env.PGSSL !== "verify-full") errors.push("Production requires PGSSL=verify-full to validate the database TLS certificate.");
  if (!strongSecret(env.METRICS_BEARER_TOKEN)) errors.push("METRICS_BEARER_TOKEN must be a non-placeholder value of at least 32 bytes with sufficient character diversity.");
  if (errors.length) throw new Error(`Unsafe production configuration: ${errors.join(" ")}`);
}

module.exports = { parseAllowedOrigins, strongSecret, validateProductionConfig };
