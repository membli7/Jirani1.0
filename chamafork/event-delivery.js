"use strict";

function createEventDelivery({ getPublisher, isReady, broadcastLocal, onError = () => {} }) {
  const report = error => {
    try { onError(error); } catch {}
  };
  const fallback = (chamaId, payload, error) => {
    if (error) report(error);
    try { broadcastLocal(chamaId, payload); } catch (broadcastError) { report(broadcastError); }
  };

  return (chamaId, payload) => {
    if (!chamaId) return;
    let ready = false;
    try { ready = Boolean(isReady()); } catch (error) { report(error); }
    if (!ready) {
      fallback(chamaId, payload);
      return;
    }

    let result;
    try {
      const publisher = typeof getPublisher === "function" ? getPublisher() : getPublisher;
      if (!publisher || typeof publisher.publish !== "function") throw new Error("Redis event publisher is unavailable.");
      result = publisher.publish(`chama:${chamaId}:events`, payload);
    } catch (error) {
      fallback(chamaId, payload, error);
      return;
    }
    Promise.resolve(result).catch(error => fallback(chamaId, payload, error));
  };
}

async function connectEventClients({ publisher, subscriber, subscribe, onFailure = () => {} }) {
  try {
    if (!publisher || !subscriber || typeof subscribe !== "function") return false;
    if (!publisher.isOpen) await publisher.connect();
    if (!subscriber.isOpen) await subscriber.connect();
    await subscribe(subscriber);
    return true;
  } catch (error) {
    try { onFailure(error); } catch {}
    return false;
  }
}

module.exports = { connectEventClients, createEventDelivery };
