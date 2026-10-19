"use strict";

// Shared Redis client factory.
// Pub/sub requires a dedicated client that cannot share a connection
// with regular commands. Call createClient() again for each role.

const { createClient } = require("redis");

function makeRedisClient(redisUrl, label) {
  const client = createClient({ url: redisUrl });
  client.on("error", err => console.error(`Redis ${label} error:`, err.message));
  return client;
}

module.exports = { makeRedisClient };
