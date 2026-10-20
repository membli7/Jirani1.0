"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseAllowedOrigins, strongSecret, validateProductionConfig } = require("../security/production-config");

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
});

test("origin parsing rejects paths and non-HTTPS origins", () => {
  assert.deepEqual(parseAllowedOrigins("https://chama.example.test, https://app.example.test/"), ["https://chama.example.test", "https://app.example.test"]);
  assert.throws(() => parseAllowedOrigins("https://chama.example.test/dashboard"), /HTTPS scheme and host/);
});

test("secret strength rejects short and placeholder values", () => {
  assert.equal(strongSecret("short"), false);
  assert.equal(strongSecret("a long example password value that is not secret"), false);
  assert.equal(strongSecret(good.SESSION_SECRET), true);
});
