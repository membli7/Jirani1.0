"use strict";

const incrementScript = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { hits, redis.call('PTTL', KEYS[1]) }
`;
const readScript = `
local hits = redis.call('GET', KEYS[1])
if not hits then return { 0, -2 } end
return { hits, redis.call('PTTL', KEYS[1]) }
`;
const decrementScript = `
local hits = redis.call('DECR', KEYS[1])
if hits <= 0 then redis.call('DEL', KEYS[1]) end
return hits
`;

class RedisRateLimitStore {
  constructor({ client, prefix, windowMs }) {
    if (!client || !prefix || !Number.isSafeInteger(windowMs) || windowMs < 1) throw new TypeError("A Redis client, prefix, and positive windowMs are required.");
    this.client = client;
    this.prefix = prefix;
    this.windowMs = windowMs;
    this.localKeys = false;
  }

  key(key) { return `${this.prefix}${key}`; }

  async increment(key) {
    const [hits, ttl] = await this.client.sendCommand(["EVAL", incrementScript, "1", this.key(key), String(this.windowMs)]);
    return { totalHits: Number(hits), resetTime: new Date(Date.now() + Math.max(0, Number(ttl))) };
  }

  async get(key) {
    const [hits, ttl] = await this.client.sendCommand(["EVAL", readScript, "1", this.key(key)]);
    return Number(hits) > 0 ? { totalHits: Number(hits), resetTime: new Date(Date.now() + Math.max(0, Number(ttl))) } : undefined;
  }

  async decrement(key) { await this.client.sendCommand(["EVAL", decrementScript, "1", this.key(key)]); }
  async resetKey(key) { await this.client.sendCommand(["DEL", this.key(key)]); }
}

module.exports = { RedisRateLimitStore };
