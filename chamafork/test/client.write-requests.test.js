"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createWriteRequester, unconfirmedMessage } = require("../../en public/write-requests.js");

const savedRecord = key => ({
  message: "Payment recorded successfully.",
  data: { id: "transaction-id", at: new Date().toISOString(), idempotencyKey: key },
});

test("write success waits for a parsed, validated server response", async () => {
  const key = "39adf219-4962-4708-84c5-a467bcb21fae";
  let respond;
  let successShown = false;
  const requester = createWriteRequester({
    keyGenerator: () => key,
    fetchImpl: () => new Promise(resolve => { respond = resolve; }),
  });
  const request = requester.submit({
    owner: {},
    path: "/api/contributions",
    body: { amount: 20 },
    validate: (data, expectedKey) => data.data?.id === "transaction-id" && data.data.idempotencyKey === expectedKey,
  }).then(() => { successShown = true; });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(successShown, false);
  respond({ ok: true, status: 201, json: async () => savedRecord(key) });
  await request;
  assert.equal(successShown, true);
});

test("a timed-out write shows the verify-before-retry message", async () => {
  const requester = createWriteRequester({
    keyGenerator: () => "c1ff4c1b-b5fb-4b0b-a133-9442d3ddf71d",
    timeoutMs: 5,
    fetchImpl: (_path, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }),
  });

  await assert.rejects(
    requester.submit({ owner: {}, path: "/api/contributions", body: { amount: 20 } }),
    error => error.uncertain === true && error.message.includes("timed out"),
  );
  assert.equal(
    unconfirmedMessage("Transactions"),
    "We couldn't confirm this was saved. Please check the Transactions tab to verify, or try again.",
  );
});

test("retrying an uncertain request reuses its key and creates only one record", async () => {
  const keys = [];
  const records = new Map();
  let attempt = 0;
  const key = "5f5924d4-7fd6-41fe-9499-04731b503613";
  const requester = createWriteRequester({
    keyGenerator: () => key,
    fetchImpl: async (_path, options) => {
      attempt += 1;
      keys.push(options.headers["Idempotency-Key"]);
      if (attempt === 1) throw new TypeError("Network failure after request was sent");
      if (!records.has(options.headers["Idempotency-Key"])) {
        records.set(options.headers["Idempotency-Key"], savedRecord(key));
      }
      return { ok: true, status: 201, json: async () => records.get(key) };
    },
  });
  const owner = {};
  const input = { owner, path: "/api/contributions", body: { amount: 20 } };

  await assert.rejects(requester.submit(input), error => error.uncertain === true);
  const result = await requester.submit(input);
  assert.equal(result.data.idempotencyKey, key);
  assert.deepEqual(keys, [key, key]);
  assert.equal(records.size, 1);
});
