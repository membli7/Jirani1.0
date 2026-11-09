"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");
const { createOneTimeCodeVerifier } = require("../security/one-time-code");

const secret = "one-time-code-hmac-test-key-not-for-production";

test("new code verifiers are keyed HMAC-SHA-256 digests", () => {
  const { hashCode, verifyCodeHash } = createOneTimeCodeVerifier(secret);
  const code = "314159";
  const digest = hashCode(code);
  const expectedHmac = crypto.createHmac("sha256", secret).update(code).digest("hex");
  const legacyDigest = crypto.createHash("sha256").update(code).digest("hex");

  assert.equal(digest, expectedHmac);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, legacyDigest);
  assert.equal(verifyCodeHash(code, digest), true);
  assert.equal(verifyCodeHash("271828", digest), false);
});

test("legacy SHA-256 verifiers continue to work during their existing expiry window", () => {
  const { verifyCodeHash } = createOneTimeCodeVerifier(secret);
  const code = "271828";
  const legacyDigest = crypto.createHash("sha256").update(code).digest("hex");

  assert.equal(verifyCodeHash(code, legacyDigest), true);
  assert.equal(verifyCodeHash("314159", legacyDigest), false);
});

test("malformed verifier values fail closed and weak verifier keys are rejected", () => {
  const { verifyCodeHash } = createOneTimeCodeVerifier(secret);
  assert.equal(verifyCodeHash("123456", "not-a-digest"), false);
  assert.throws(() => createOneTimeCodeVerifier("short"), /at least 32 bytes/);
});
