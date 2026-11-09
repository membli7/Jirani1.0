"use strict";

function callSessionStore(store, method, ...args) {
  if (!store || typeof store[method] !== "function") return Promise.reject(new Error(`Session store does not support ${method}.`));
  return new Promise((resolve, reject) => {
    try {
      store[method](...args, (error, value) => error ? reject(error) : resolve(value));
    } catch (error) {
      reject(error);
    }
  });
}

async function revokeSessionsForUser(store, userId) {
  const storedSessions = await callSessionStore(store, "all");
  const entries = Array.isArray(storedSessions)
    ? storedSessions.map(item => [item?.id, item])
    : Object.entries(storedSessions || {});
  const sessionIds = entries
    .filter(([id, item]) => typeof id === "string" && item?.userId === userId)
    .map(([id]) => id);
  const results = await Promise.allSettled(sessionIds.map(id => callSessionStore(store, "destroy", id)));
  const failure = results.find(result => result.status === "rejected");
  if (failure) throw failure.reason;
}

async function resetPinAfterRevokingSessions({ sessionStore, userId, consumeChallenge, persistPin }) {
  await revokeSessionsForUser(sessionStore, userId);
  await consumeChallenge();
  await persistPin();
}

module.exports = { resetPinAfterRevokingSessions, revokeSessionsForUser };
