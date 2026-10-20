"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { RedisRateLimitStore } = require("../storage/redis-rate-limit-store");

test("rate limit counters use atomic Redis increments with shared expiry", async () => {
  const commands = [];
  const client = { sendCommand: async command => { commands.push(command); return ["3", "45000"]; } };
  const store = new RedisRateLimitStore({ client, prefix: "jirani:ratelimit:login:", windowMs: 60000 });
  const result = await store.increment("198.51.100.10");
  assert.equal(result.totalHits, 3);
  assert.ok(result.resetTime instanceof Date);
  assert.equal(store.localKeys, false);
  assert.equal(commands[0][0], "EVAL");
  assert.equal(commands[0][3], "jirani:ratelimit:login:198.51.100.10");
  assert.match(commands[0][1], /PEXPIRE/);
});

test("rate limit reads, decrements, and reset stay on the shared Redis key", async () => {
  const commands = [];
  const client = { sendCommand: async command => { commands.push(command); return command[0] === "DEL" ? 1 : ["2", "12000"]; } };
  const store = new RedisRateLimitStore({ client, prefix: "shared:", windowMs: 15000 });
  assert.equal((await store.get("client")).totalHits, 2);
  await store.decrement("client");
  await store.resetKey("client");
  assert.ok(commands.every(command => command.includes("shared:client")));
  assert.equal(commands[2][0], "DEL");
});
