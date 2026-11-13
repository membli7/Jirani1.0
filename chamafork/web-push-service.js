"use strict";

const { PUSH_CATEGORIES } = require("./notification-scheduler");

function createWebPushService({ webPush, subscriptionStore, publicKey, privateKey, subject, getActiveUser, logger = console } = {}) {
  const publicVapidKey = typeof publicKey === "string" ? publicKey.trim() : "";
  const privateVapidKey = typeof privateKey === "string" ? privateKey.trim() : "";
  const vapidSubject = typeof subject === "string" ? subject.trim() : "";
  let enabled = false;
  if (webPush && subscriptionStore && publicVapidKey && privateVapidKey && vapidSubject) {
    try {
      webPush.setVapidDetails(vapidSubject, publicVapidKey, privateVapidKey);
      enabled = true;
    } catch (error) {
      logger.warn?.("Browser push is disabled because the VAPID settings are invalid", { err: error.message });
    }
  }

  async function dispatch(notification) {
    if (!enabled || !PUSH_CATEGORIES.has(notification?.category) || !notification?.recipientId || !notification?.chamaId) return 0;
    const user = getActiveUser?.(notification.recipientId, notification.chamaId);
    if (!user) return 0;
    let subscriptions;
    try {
      subscriptions = await subscriptionStore.get(notification.chamaId, notification.recipientId);
    } catch (error) {
      logger.warn?.("Could not load a user's browser push subscriptions", { category: notification.category, err: error.message });
      return 0;
    }
    const payload = JSON.stringify({
      title: String(notification.title || "Jirani Chama").slice(0, 100),
      body: String(notification.text || "You have a new Chama notification.").slice(0, 300),
      tag: String(notification.notificationKey || notification.id || "jirani-chama-notification").slice(0, 180),
      url: "/",
    });
    const results = await Promise.allSettled(subscriptions.map(async subscription => {
      try {
        await webPush.sendNotification(subscription, payload, { TTL: 3600 });
        return true;
      } catch (error) {
        const statusCode = Number(error?.statusCode);
        if (statusCode === 404 || statusCode === 410) {
          await subscriptionStore.remove(notification.chamaId, notification.recipientId, subscription.endpoint).catch(() => {});
        } else {
          logger.warn?.("Browser push delivery failed", { category: notification.category, statusCode: Number.isFinite(statusCode) ? statusCode : null });
        }
        return false;
      }
    }));
    return results.filter(result => result.status === "fulfilled" && result.value).length;
  }

  return { enabled, publicKey: enabled ? publicVapidKey : null, dispatch };
}

module.exports = { createWebPushService };
