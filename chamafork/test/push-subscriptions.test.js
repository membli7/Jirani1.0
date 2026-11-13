"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createPushSubscriptionStore, normalizeSubscription } = require("../push-subscriptions");

function subscription(id = "one") {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    expirationTime: null,
    keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
  };
}

test("accepts supported secure push endpoints and rejects unsafe or malformed endpoints", () => {
  assert.equal(normalizeSubscription(subscription()).endpoint, subscription().endpoint);
  assert.throws(() => normalizeSubscription({ ...subscription(), endpoint: "http://fcm.googleapis.com/fcm/send/x" }), /Unsupported/);
  assert.throws(() => normalizeSubscription({ ...subscription(), endpoint: "https://fcm.googleapis.com.evil.example/send/x" }), /Unsupported/);
  assert.throws(() => normalizeSubscription({ ...subscription(), keys: { p256dh: "bad", auth: "bad" } }), /keys/);
});

test("stores subscriptions by Chama and account, replaces duplicate endpoints, and supports removal", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "jirani-push-store-"));
  const filePath = path.join(directory, "private", "subscriptions.json");
  const store = createPushSubscriptionStore({ filePath, now: () => "2026-11-13T07:45:00.000Z" });
  try {
    await store.upsert("chama-a", "user-a", subscription());
    await store.upsert("chama-b", "user-a", subscription());
    await store.upsert("chama-a", "user-b", subscription());
    await store.upsert("chama-a", "user-a", subscription());
    assert.equal((await store.get("chama-a", "user-a")).length, 1);
    assert.equal((await store.get("chama-b", "user-a")).length, 1);
    assert.equal((await store.get("chama-a", "user-b")).length, 1);
    assert.equal((await store.listForChama("chama-a", ["user-a", "user-b"])).length, 2);
    assert.equal(await store.remove("chama-a", "user-a", subscription().endpoint), 1);
    assert.equal((await store.get("chama-a", "user-a")).length, 0);
    const stored = JSON.parse(await fs.readFile(filePath, "utf8"));
    assert.equal(stored.version, 1);
    assert.equal(stored.entries["chama-a:user-a"], undefined);
    assert.equal(stored.entries["chama-a:user-b"].length, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("limits the number of devices kept for one user", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "jirani-push-limit-"));
  const store = createPushSubscriptionStore({ filePath: path.join(directory, "subscriptions.json") });
  try {
    for (let index = 0; index < 10; index += 1) await store.upsert("chama-a", "user-a", subscription(String(index)));
    assert.equal((await store.get("chama-a", "user-a")).length, 8);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
