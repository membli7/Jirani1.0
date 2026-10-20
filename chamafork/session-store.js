"use strict";

function createSessionBackend({
  redisUrl = process.env.REDIS_URL,
  production = process.env.NODE_ENV === "production",
  testMode = process.env.NODE_ENV === "test",
  sessionStore = process.env.SESSION_STORE,
  prefix = process.env.SESSION_REDIS_PREFIX || "jirani:sess:",
} = {}) {
  const explicitlyRedis = sessionStore === "redis";
  const explicitlyMemory = sessionStore === "memory";
  const useRedis = production || explicitlyRedis || (!testMode && !explicitlyMemory && Boolean(redisUrl));
  if (!useRedis) return { store: undefined, connect: async () => {}, close: async () => {}, usingRedis: false };
  if (!redisUrl) throw new Error("REDIS_URL must be set when Redis sessions are enabled.");

  const { createClient } = require("redis");
  const { RedisStore } = require("connect-redis");
  const client = createClient({ url: redisUrl });
  client.on("error", error => console.error("Redis session store error:", error.message));
  return {
    store: new RedisStore({ client, prefix }),
    connect: async () => { if (!client.isOpen) await client.connect(); },
    close: async () => { if (client.isOpen) await client.quit(); },
    usingRedis: true,
  };
}

module.exports = { createSessionBackend };
