"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createWebPushService } = require("../web-push-service");

function fakeWebPush() {
  const calls = { vapid: null, sent: [] };
  return {
    calls,
    setVapidDetails(...args) { calls.vapid = args; },
    async sendNotification(subscription, payload, options) { calls.sent.push({ subscription, payload: JSON.parse(payload), options }); },
  };
}

function subscription(endpoint = "https://fcm.googleapis.com/fcm/send/device-1") {
  return { endpoint, keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } };
}

function makeStore(records = [subscription()]) {
  const calls = { gets: [], removes: [] };
  return {
    calls,
    async get(chamaId, userId) { calls.gets.push([chamaId, userId]); return records; },
    async remove(chamaId, userId, endpoint) { calls.removes.push([chamaId, userId, endpoint]); return 1; },
  };
}

const config = {
  publicKey: "public-vapid-key",
  privateKey: "private-vapid-key",
  subject: "mailto:notifications@example.test",
};

test("browser push remains disabled until all server-only VAPID values are configured", () => {
  const webPush = fakeWebPush();
  const store = makeStore();
  const disabled = createWebPushService({ webPush, subscriptionStore: store, ...config, privateKey: "", getActiveUser: () => ({ id: "u1" }) });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.publicKey, null);
  assert.equal(webPush.calls.vapid, null);
});

test("exposes only the public key and delivers generic message alerts to that active member's Chama subscription", async () => {
  const webPush = fakeWebPush();
  const store = makeStore();
  const service = createWebPushService({
    webPush,
    subscriptionStore: store,
    ...config,
    getActiveUser: (userId, chamaId) => userId === "u1" && chamaId === "c1" ? { id: userId, chamaId } : null,
  });
  assert.equal(service.enabled, true);
  assert.equal(service.publicKey, config.publicKey);
  assert.equal(Object.hasOwn(service, "privateKey"), false);
  assert.equal(webPush.calls.vapid[0], config.subject);
  const delivered = await service.dispatch({
    id: "n1", recipientId: "u1", chamaId: "c1", category: "message", title: "New group message",
    text: "New message from Eli. Open Group chat to read it.", notificationKey: "message:m1",
  });
  assert.equal(delivered, 1);
  assert.deepEqual(store.calls.gets, [["c1", "u1"]]);
  assert.equal(webPush.calls.sent.length, 1);
  assert.deepEqual(webPush.calls.sent[0].payload, {
    title: "New group message",
    body: "New message from Eli. Open Group chat to read it.",
    tag: "message:m1",
    url: "/",
  });
  assert.equal(webPush.calls.sent[0].options.TTL, 3600);
});

test("does not query subscriptions for inactive or unsupported-category events", async () => {
  const store = makeStore();
  const service = createWebPushService({ webPush: fakeWebPush(), subscriptionStore: store, ...config, getActiveUser: () => null });
  assert.equal(await service.dispatch({ recipientId: "u1", chamaId: "c1", category: "message" }), 0);
  assert.equal(await service.dispatch({ recipientId: "u1", chamaId: "c1", category: "election" }), 0);
  assert.deepEqual(store.calls.gets, []);
});

test("removes expired push endpoints without logging or forwarding subscription details", async () => {
  const webPush = fakeWebPush();
  webPush.sendNotification = async () => { const error = new Error("expired"); error.statusCode = 410; throw error; };
  const store = makeStore();
  const service = createWebPushService({ webPush, subscriptionStore: store, ...config, getActiveUser: () => ({ id: "u1", chamaId: "c1" }), logger: { warn() {} } });
  assert.equal(await service.dispatch({ recipientId: "u1", chamaId: "c1", category: "fine", title: "Fine recorded", text: "A fine was recorded.", notificationKey: "fine:f1" }), 0);
  assert.deepEqual(store.calls.removes, [["c1", "u1", subscription().endpoint]]);
});
