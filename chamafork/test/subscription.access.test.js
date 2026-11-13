"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { after, before, test } = require("node:test");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-subscription-"));
const dataFile = path.join(directory, "data.json");
const port = 46000 + (process.pid % 10000);
const baseUrl = `http://127.0.0.1:${port}`;
const sessionSecret = "subscription-test-secret";
const salt = "jirani-test-salt";
const pinHash = pin => `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
const hashCode = code => crypto.createHash("sha256").update(code).digest("hex");
const expiredAt = new Date(Date.now() - 1000).toISOString();
const futureAt = new Date(Date.now() + 30 * 86400000).toISOString();
for (const key of ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_PASSKEY", "MPESA_STK_CALLBACK_URL"]) process.env[key] = "";
process.env.MPESA_ENV = "sandbox";
process.env.MPESA_C2B_CALLBACKS_ENABLED = "1";
process.env.MPESA_C2B_VALIDATION_URL = "https://sandbox.example.test/api/mpesa/c2b/validation";
process.env.MPESA_C2B_CONFIRMATION_URL = "https://sandbox.example.test/api/mpesa/c2b/confirmation";
process.env.MPESA_SHORTCODE_CHAMA_MAP = "subscription-chama=600001";
process.env.MPESA_TEST_CALLBACK_IPS = "127.0.0.1,::1";

// Synthetic state only for exercising already-verified entitlements in tests.
function subscription({ status = "active", tier = "basic", maxMembers = 10, endsAt = futureAt } = {}) {
  return {
    id: `test-${tier}-${maxMembers}`, status, tier, billing: "monthly", currency: "KES",
    expectedAmount: tier === "growth" ? 600 : 300, maxMembers,
    startedAt: new Date(Date.now() - 86400000).toISOString(), endsAt,
    reference: "TEST-VERIFIED-REFERENCE", verifiedAt: new Date(Date.now() - 86400000).toISOString(),
    provider: "test-fixture", history: []
  };
}

const expiredCode = "123456";
const cappedCode = "654322";
fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  chamas: [
    { id: "subscription-chama", name: "Subscription Test", createdAt: expiredAt, subscription: { ...subscription({ endsAt: expiredAt }), pendingPayment: { reference: "JCABCDEF123456", planKey: "basic", tier: "Basic", billing: "annual", amount: 2880, currency: "KES", maxMembers: 10, annualSavings: 720, status: "pending", createdAt: expiredAt, expiresAt: futureAt } } },
    { id: "capped-chama", name: "Capped Test", createdAt: new Date().toISOString(), subscription: subscription({ maxMembers: 1 }) }
  ],
  users: [
    { id: "chair", name: "Test Chair", phone: "+254711000001", email: "chair@example.test", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false, chamaId: "subscription-chama" },
    { id: "treasurer", name: "Test Treasurer", phone: "+254711000005", email: "treasurer@example.test", role: "treasurer", status: "active", pinHash: pinHash("234567"), mustChangePin: false, chamaId: "subscription-chama" },
    { id: "capped-chair", name: "Capped Chair", phone: "+254711000003", email: "capped@example.test", role: "chairperson", status: "active", pinHash: pinHash("345678"), mustChangePin: false, chamaId: "capped-chama" }
  ],
  transactions: [{ id: "old-transaction", at: new Date().toISOString(), memberId: "chair", memberName: "Test Chair", amount: 100, method: "Cash", paymentType: "Monthly Contribution", ref: "old-entry", chamaId: "subscription-chama" }],
  loans: [{ id: "pending-loan", memberId: "another-member", amount: 1000, months: 2, status: "Requested", approvals: [], guarantors: [], chamaId: "subscription-chama" }],
  invitations: [
    { id: "expired-invitation", name: "Blocked Member", phone: "+254711000002", email: "blocked@example.test", requestedRole: "member", codeHash: hashCode(expiredCode), attemptsRemaining: 5, invitedBy: "chair", invitedAt: new Date().toISOString(), expiresAt: futureAt, usedAt: null, chamaId: "subscription-chama" },
    { id: "capped-invitation", name: "At-Cap Member", phone: "+254711000004", email: "at-cap@example.test", requestedRole: "member", codeHash: hashCode(cappedCode), attemptsRemaining: 5, invitedBy: "capped-chair", invitedAt: new Date().toISOString(), expiresAt: futureAt, usedAt: null, chamaId: "capped-chama" }
  ],
  leadershipChanges: [{ id: "expired-officer-change", type: "appointment", bootstrap: true, role: "treasurer", outgoingUserId: null, incomingUserId: "treasurer", status: "confirmed", audit: [{ action: "proposed" }, { action: "confirmed" }], chamaId: "subscription-chama" }],
  pendingMpesas: [], idempotency: {}, registers: [], auditLog: [], penalties: [], dividendCycles: [], messages: [],
  settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 5, meetingDates: {} }
}), "utf8");

let server;
let serverOutput = "";
async function request(pathname, options = {}) {
  return fetch(baseUrl + pathname, { ...options, headers: { "Content-Type": "application/json", "X-Requested-With": "chama", ...(options.headers || {}) } });
}
function sessionCookie(response) {
  const value = response.headers.getSetCookie?.()[0] || response.headers.get("set-cookie");
  assert.ok(value, "successful sign-in should establish a session cookie");
  return value.split(";")[0];
}
async function login(phone, pin) {
  const response = await request("/api/login", { method: "POST", body: JSON.stringify({ phone, pin }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  return sessionCookie(response);
}
async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(baseUrl + "/api/health")).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const exitDetail = server && server.exitCode !== null ? ` Child exit code: ${server.exitCode}.` : "";
  throw new Error(`Subscription test server did not start.${exitDetail} ${serverOutput}`);
}

before(async () => {
  server = execFile(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, NODE_ENV: "test", DATA_BACKEND: "json", CHAMA_DATA_FILE: dataFile, PORT: String(port), SESSION_SECRET: sessionSecret } });
  server.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
  server.stderr.on("data", chunk => { serverOutput += chunk.toString(); });
  await waitForServer();
});

after(async () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise(resolve => server.once("exit", resolve));
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

test("disabled subscriptions do not restrict access while payment flows stay paused", async () => {
  const chairCookie = await login("0711000001", "123456");
  const treasurerCookie = await login("0711000005", "234567");
  const dashboard = await request("/api/dashboard", { headers: { Cookie: chairCookie } });
  assert.equal(dashboard.status, 200);
  assert.equal((await dashboard.json()).subscription.status, "expired");

  const exportResponse = await request("/api/export.csv", { headers: { Cookie: chairCookie } });
  assert.equal(exportResponse.status, 200);
  assert.match(await exportResponse.text(), /old-entry/);

  const paymentResponse = await request("/api/payments", { method: "POST", headers: { Cookie: treasurerCookie, "Idempotency-Key": "subscription-payment-0001" }, body: JSON.stringify({}) });
  assert.equal(paymentResponse.status, 400);
  const invite = await request("/api/invitations", { method: "POST", headers: { Cookie: chairCookie, "Idempotency-Key": "subscription-invite-0001" }, body: JSON.stringify({ name: "New Member", phone: "0711000006", email: "new@example.test", role: "member" }) });
  assert.equal(invite.status, 201);

  const decision = await request("/api/loans/pending-loan/decisions", { method: "POST", headers: { Cookie: chairCookie, "Idempotency-Key": "subscription-loan-dec-0001" }, body: JSON.stringify({ decision: "approve", reason: "Reviewed the request." }) });
  assert.equal(decision.status, 409);
  const activation = await request("/api/invitations/activate", { method: "POST", body: JSON.stringify({ phone: "0711000002", code: expiredCode, pin: "456789", termsAccepted: true }) });
  assert.equal(activation.status, 201);

  const selectedPlan = await request("/api/subscription/selection", { method: "POST", headers: { Cookie: chairCookie, "Idempotency-Key": "subscription-selection-0001" }, body: JSON.stringify({ tier: "basic", billing: "annual" }) });
  assert.equal(selectedPlan.status, 503);
  const selectionBody = await selectedPlan.json();
  assert.equal(selectionBody.plan.amount, 2880);
  assert.equal(selectionBody.plan.currency, "KES");
  assert.equal(selectionBody.plan.paymentEnabled, false);
  assert.equal(selectionBody.plan.paymentRequestStarted, false);
  assert.match(selectionBody.message, /temporarily paused/i);

  const payment = { TransID: "TESTRECEIPT001", BusinessShortCode: "600001", BillRefNumber: "JCABCDEF123456", TransTime: "20261107123456", TransAmount: "2880.00", MSISDN: "254711000001" };
  const validation = await request("/api/mpesa/c2b/validation", { method: "POST", body: JSON.stringify(payment) });
  assert.equal(validation.status, 503);
  assert.match((await validation.json()).ResultDesc, /temporarily paused/i);
  const confirmation = await request("/api/mpesa/c2b/confirmation", { method: "POST", body: JSON.stringify(payment) });
  assert.equal(confirmation.status, 503);
  assert.match((await confirmation.json()).ResultDesc, /temporarily paused/i);

  const callback = await request("/api/mpesa/callback", { method: "POST", body: JSON.stringify({ paid: true, amount: 2880 }) });
  assert.equal(callback.status, 503);
  assert.match((await callback.json()).message, /No payment request was sent/i);

  const chat = await request("/api/messages", { method: "POST", headers: { Cookie: chairCookie, "Idempotency-Key": "subscription-message-0001" }, body: JSON.stringify({ text: "History and chat remain available." }) });
  assert.equal(chat.status, 201);
  const messages = await request("/api/messages", { headers: { Cookie: chairCookie } });
  assert.equal(messages.status, 200);
  assert.ok((await messages.json()).data.some(message => message.text === "History and chat remain available."));
});

test("disabled subscriptions do not block loans or account-security actions", async () => {
  const expiredChairCookie = await login("0711000001", "123456");
  const loansBefore = JSON.parse(fs.readFileSync(dataFile, "utf8")).loans.length;
  const blockedLoan = await request("/api/loans", { method: "POST", headers: { Cookie: expiredChairCookie, "Idempotency-Key": "subscription-new-loan-0001" }, body: JSON.stringify({ amount: 100 }) });
  assert.equal(blockedLoan.status, 400);
  assert.equal(JSON.parse(fs.readFileSync(dataFile, "utf8")).loans.length, loansBefore);

  const activeChairCookie = await login("0711000003", "345678");
  const activeLoanValidation = await request("/api/loans", { method: "POST", headers: { Cookie: activeChairCookie, "Idempotency-Key": "subscription-active-loan-validation-0001" }, body: JSON.stringify({ amount: 0 }) });
  assert.equal(activeLoanValidation.status, 400);

  const revoke = await request("/api/leadership-changes/expired-officer-change/revoke", { method: "POST", headers: { Cookie: expiredChairCookie, "Idempotency-Key": "subscription-role-revoke-0001" }, body: JSON.stringify({ reason: "Protect group account security." }) });
  assert.equal(revoke.status, 200);
  assert.equal((await revoke.json()).message, "Leadership role revoked.");
  const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(saved.users.find(user => user.id === "treasurer").role, "member");
  assert.ok(saved.auditLog.some(entry => entry.type === "leadership.role.revoked" && entry.memberId === "treasurer"));
});

test("disabled subscriptions do not enforce member caps", async () => {
  const chairCookie = await login("0711000003", "345678");
  const invite = await request("/api/invitations", { method: "POST", headers: { Cookie: chairCookie, "Idempotency-Key": "subscription-cap-invite-0001" }, body: JSON.stringify({ name: "Over Cap", phone: "0711000007", email: "over-cap@example.test", role: "member" }) });
  assert.equal(invite.status, 201);
  const activation = await request("/api/invitations/activate", { method: "POST", body: JSON.stringify({ phone: "0711000004", code: cappedCode, pin: "567890", termsAccepted: true }) });
  assert.equal(activation.status, 201);
  const state = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(state.users.some(user => user.phone === "+254711000004"), true);
  assert.equal(state.invitations.find(item => item.id === "capped-invitation").usedAt !== null, true);
});
