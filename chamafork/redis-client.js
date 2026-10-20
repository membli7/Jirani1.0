"use strict";

function makeRedisClient(redisUrl, label = "app") {
  if (!redisUrl) throw new Error("A Redis URL is required to create a Redis client.");
  const { createClient } = require("redis");
  const client = createClient({ url: redisUrl });
  client.on("error", error => console.error(`Redis ${label} error:`, error.message));
  return client;
}

module.exports = { makeRedisClient };
