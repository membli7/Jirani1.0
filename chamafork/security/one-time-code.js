"use strict";

const crypto = require("node:crypto");

function createOneTimeCodeVerifier(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("ONE_TIME_CODE_HMAC_SECRET must be at least 32 bytes.");
  }
  const key = Buffer.from(secret, "utf8");

  function hashCode(code) {
    if (typeof code !== "string") throw new TypeError("One-time codes must be strings.");
    return crypto.createHmac("sha256", key).update(code, "utf8").digest("hex");
  }

  function verifyCodeHash(code, storedHash) {
    if (typeof code !== "string") return false;
    const wellFormed = typeof storedHash === "string" && /^[a-f0-9]{64}$/.test(storedHash);
    const stored = Buffer.from(wellFormed ? storedHash : "0".repeat(64), "hex");
    const hmacDigest = Buffer.from(hashCode(code), "hex");
    // Accept existing SHA-256 verifiers until their already-defined expiry; all new writes use HMAC.
    const legacyDigest = crypto.createHash("sha256").update(code, "utf8").digest();
    const hmacMatches = crypto.timingSafeEqual(stored, hmacDigest);
    const legacyMatches = crypto.timingSafeEqual(stored, legacyDigest);
    return wellFormed && (hmacMatches || legacyMatches);
  }

  return Object.freeze({ hashCode, verifyCodeHash });
}

module.exports = { createOneTimeCodeVerifier };
