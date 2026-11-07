"use strict";

const fs = require("node:fs");

function activeSubscription({ tier = "growth", maxMembers = 30 } = {}) {
  const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return {
    id: `test-${tier}-${maxMembers}`,
    status: "active",
    tier,
    billing: "monthly",
    currency: "KES",
    expectedAmount: tier === "basic" ? 300 : 600,
    maxMembers,
    startedAt,
    endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    reference: "TEST-VERIFIED-SUBSCRIPTION",
    verifiedAt: startedAt,
    provider: "test-fixture",
    history: [{ type: "test.subscription.fixture", at: startedAt }]
  };
}

async function activateTestSubscription({ dataFile, baseUrl, chamaId }) {
  const state = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const chama = (state.chamas || []).find(item => item.id === chamaId);
  if (!chama) throw new Error(`Test chama not found: ${chamaId}`);
  chama.subscription = activeSubscription();
  fs.writeFileSync(dataFile, JSON.stringify(state), "utf8");

  // The JSON activation path reloads persisted state under its file lock; this deliberately invalid code only refreshes test state.
  const reload = await fetch(`${baseUrl}/api/invitations/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone: "0700000000", code: "000000", pin: "123456" })
  });
  if (reload.status !== 400) throw new Error(`Test entitlement state reload returned ${reload.status}, expected 400 for an invalid code.`);
}

module.exports = { activeSubscription, activateTestSubscription };
