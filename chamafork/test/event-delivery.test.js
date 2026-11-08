"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { connectEventClients, createEventDelivery } = require("../event-delivery");

const flushMicrotasks = () => new Promise(resolve => setImmediate(resolve));

test("local SSE receives events when Redis pub/sub is not ready", () => {
  const delivered = [];
  const dispatch = createEventDelivery({
    getPublisher: () => null,
    isReady: () => false,
    broadcastLocal: (chamaId, payload) => delivered.push({ chamaId, payload }),
  });
  dispatch("chama-a", "event: messages-updated\n\n");
  assert.deepEqual(delivered, [{ chamaId: "chama-a", payload: "event: messages-updated\n\n" }]);
});

test("a rejected Redis publish logs the failure and falls back to local SSE", async () => {
  const delivered = [];
  const errors = [];
  const dispatch = createEventDelivery({
    getPublisher: () => ({ publish: async () => { throw new Error("synthetic Redis outage"); } }),
    isReady: () => true,
    broadcastLocal: (chamaId, payload) => delivered.push({ chamaId, payload }),
    onError: error => errors.push(error.message),
  });
  dispatch("chama-a", "event: loans-updated\n\n");
  await flushMicrotasks();
  assert.deepEqual(delivered, [{ chamaId: "chama-a", payload: "event: loans-updated\n\n" }]);
  assert.deepEqual(errors, ["synthetic Redis outage"]);
});

test("a synchronous publisher failure also falls back and does not escape", () => {
  const delivered = [];
  const errors = [];
  const dispatch = createEventDelivery({
    getPublisher: () => ({ publish: () => { throw new Error("synthetic sync failure"); } }),
    isReady: () => true,
    broadcastLocal: (chamaId, payload) => delivered.push({ chamaId, payload }),
    onError: error => errors.push(error.message),
  });
  assert.doesNotThrow(() => dispatch("chama-a", "payload"));
  assert.deepEqual(delivered, [{ chamaId: "chama-a", payload: "payload" }]);
  assert.deepEqual(errors, ["synthetic sync failure"]);
});

test("Redis pub/sub connection failure is optional and reported, not thrown", async () => {
  const errors = [];
  const publisher = { isOpen: false, async connect() { throw new Error("synthetic connect failure"); } };
  const subscriber = { isOpen: false, async connect() { throw new Error("should not run"); } };
  const ready = await connectEventClients({ publisher, subscriber, subscribe: async () => {}, onFailure: error => errors.push(error.message) });
  assert.equal(ready, false);
  assert.deepEqual(errors, ["synthetic connect failure"]);
});

test("Redis pub/sub connects and subscribes before reporting distributed readiness", async () => {
  const calls = [];
  const publisher = { isOpen: false, async connect() { calls.push("publisher"); this.isOpen = true; } };
  const subscriber = { isOpen: false, async connect() { calls.push("subscriber"); this.isOpen = true; } };
  const ready = await connectEventClients({ publisher, subscriber, subscribe: async client => { assert.equal(client, subscriber); calls.push("subscribe"); } });
  assert.equal(ready, true);
  assert.deepEqual(calls, ["publisher", "subscriber", "subscribe"]);
});
