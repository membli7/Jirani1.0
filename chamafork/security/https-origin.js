"use strict";

function parseCanonicalHttpsOrigin(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let parsed;
  try { parsed = new URL(raw); }
  catch { throw new Error("APP_CANONICAL_ORIGIN must be a valid HTTPS origin."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("APP_CANONICAL_ORIGIN must contain only an HTTPS scheme and host.");
  }
  return parsed.origin;
}

function httpsRedirectLocation(origin, requestTarget) {
  if (!origin) return null;
  const target = typeof requestTarget === "string" && requestTarget.startsWith("/") && !requestTarget.startsWith("//")
    ? requestTarget
    : "/";
  return `${origin}${target}`;
}

module.exports = { parseCanonicalHttpsOrigin, httpsRedirectLocation };
