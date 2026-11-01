"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const dotenv = require("dotenv");
const { createTrustedProxyPredicate, isPrivateIp, parseAllowedOrigins, parseTrustedProxyIps, resolveAppBindHost, strongSecret, validateProductionConfig } = require("../security/production-config");

const good = {
  NODE_ENV: "production",
  APP_CANONICAL_ORIGIN: "https://chama.example.test",
  APP_ALLOWED_ORIGINS: "https://chama.example.test",
  SESSION_SECRET: "A9b8C7d6E5f4G3h2J1k0LmNqRsTuVwXy",
  METRICS_BEARER_TOKEN: "M9n8B7v6C5x4Z3a2Q1w0ErTyUiOpLsKd",
  DATA_BACKEND: "postgres",
  DATABASE_URL: "postgresql://runtime:private@db.example.test/chama",
  REDIS_URL: "rediss://redis.example.test",
  SESSION_STORE: "redis",
  TRUST_PROXY: "1",
  TRUSTED_PROXY_IPS: "127.0.0.1,::1",
  PGSSL: "verify-full",
};

test("production startup requires secure origins, strong secrets, PostgreSQL, Redis, and verified TLS", () => {
  assert.doesNotThrow(() => validateProductionConfig(good));
  for (const [key, value] of Object.entries({
    SESSION_SECRET: "short",
    METRICS_BEARER_TOKEN: "example-token-that-is-long-but-not-private-12345",
    APP_ALLOWED_ORIGINS: "http://chama.example.test",
    DATA_BACKEND: "json",
    REDIS_URL: "",
    TRUST_PROXY: "0",
    PGSSL: "require",
  })) {
    assert.throws(() => validateProductionConfig({ ...good, [key]: value }), /Unsafe production configuration/);
  }
  assert.throws(() => validateProductionConfig({ ...good, REDIS_URL: "redis://redis.example.test" }), /Unsafe production configuration/);
});

test("origin parsing rejects paths and non-HTTPS origins", () => {
  assert.deepEqual(parseAllowedOrigins("https://chama.example.test, https://app.example.test/"), ["https://chama.example.test", "https://app.example.test"]);
  assert.throws(() => parseAllowedOrigins("https://chama.example.test/dashboard"), /HTTPS scheme and host/);
});

test("production trusts only explicit private proxies and rejects public proxy or bind addresses", () => {
  assert.deepEqual(parseTrustedProxyIps("127.0.0.1,::ffff:127.0.0.1,10.0.0.8"), ["127.0.0.1", "10.0.0.8"]);
  const trustsProxy = createTrustedProxyPredicate("127.0.0.1,10.0.0.8");
  assert.equal(trustsProxy("::ffff:127.0.0.1"), true);
  assert.equal(trustsProxy("203.0.113.4"), false);
  assert.equal(isPrivateIp("0.0.0.0"), false);
  assert.equal(isPrivateIp("203.0.113.4"), false);
  assert.throws(() => parseTrustedProxyIps("203.0.113.4"), /exact loopback or private/);
  assert.throws(() => validateProductionConfig({ ...good, APP_BIND_HOST: "0.0.0.0" }), /APP_BIND_HOST must be/);
  assert.throws(() => validateProductionConfig({ ...good, TRUSTED_PROXY_IPS: "" }), /TRUSTED_PROXY_IPS must list/);
});

test("the app binds to localhost by default and honors an explicit bind address", () => {
  assert.equal(resolveAppBindHost({ NODE_ENV: "development" }), "127.0.0.1");
  assert.equal(resolveAppBindHost({ APP_BIND_HOST: "10.0.0.8" }), "10.0.0.8");
  assert.equal(resolveAppBindHost({ APP_BIND_HOST: "  " }), "127.0.0.1");
});

test("the example environment selects safe local development services", () => {
  const example = dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env.example")));
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.equal(example.PORT, "8001");
  assert.match(serverSource, /const PORT = Number\(process\.env\.PORT \|\| 8001\)/);
  assert.equal(example.DATA_BACKEND, "json");
  assert.equal(example.SESSION_STORE, "memory");
  assert.equal(example.REDIS_URL, "");
  assert.equal(example.TRUST_PROXY, "0");
  assert.equal(resolveAppBindHost(example), "127.0.0.1");
});

test("secret strength rejects short and placeholder values", () => {
  assert.equal(strongSecret("short"), false);
  assert.equal(strongSecret("a long example password value that is not secret"), false);
  assert.equal(strongSecret(good.SESSION_SECRET), true);
});
