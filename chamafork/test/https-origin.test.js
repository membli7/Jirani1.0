"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { httpsRedirectLocation, parseCanonicalHttpsOrigin } = require("../security/https-origin");

test("HTTPS redirects use a configured canonical origin and preserve a local path", () => {
  const origin = parseCanonicalHttpsOrigin("https://chama.example.test/");
  assert.equal(httpsRedirectLocation(origin, "/api/health?check=1"), "https://chama.example.test/api/health?check=1");
});

test("HTTPS redirects cannot be steered by a request host or protocol-relative target", () => {
  const origin = parseCanonicalHttpsOrigin("https://chama.example.test");
  assert.equal(httpsRedirectLocation(origin, "//attacker.example/path"), "https://chama.example.test/");
  assert.equal(httpsRedirectLocation(origin, "https://attacker.example/path"), "https://chama.example.test/");
});

test("canonical redirect configuration rejects non-HTTPS origins and path components", () => {
  assert.throws(() => parseCanonicalHttpsOrigin("http://chama.example.test"), /only an HTTPS scheme and host/);
  assert.throws(() => parseCanonicalHttpsOrigin("https://chama.example.test/path"), /only an HTTPS scheme and host/);
  assert.equal(parseCanonicalHttpsOrigin(""), null);
});
