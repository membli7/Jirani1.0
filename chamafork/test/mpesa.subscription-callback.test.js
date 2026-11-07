"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { after, before, test } = require("node:test");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-c2b-subscription-"));
const dataFile = path.join(directory, "data.json");
const port = 30000 + (process.pid % 10000);
const baseUrl = `http://127.0.0.1:${port}`;
const sessionSecret = "mpesa-c2b-test-session-secret";
const salt = "jirani-c2b-test-salt";
const pinHash = pin => `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
const createdAt = new Date().toISOString();

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  chamas: [{ id: "c2b-chama", name: "C2B Callback Test", createdAt }],
  users: [{ id: "c2b-chair", name: "Test Chair", phone: "+254711000001", email: "chair@example.test", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false, chamaId: "c2b-chama" }],
  transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [],
  idempotency: {}, registers: [], auditLog: [], welfareReserve: 0, penalties: [], dividendCycles: [], messages: [],
  settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 5, meetingDates: {} },
}), "utf8");

let server;
async function request(pathname, options = {}) {
  return fetch(baseUrl + pathname, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama", ...(options.headers || {}) },
  });
}
function sessionCookie(response) {
  const value = response.headers.getSetCookie?.()[0] || response.headers.get("set-cookie");
  assert.ok(value, "successful sign-in should establish a session cookie");
  return value.split(";")[0];
}
async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(baseUrl + "/api/health")).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("C2B subscription test server did not start.");
}
async function sendCallback(pathname, payload) {
  // Deliberately omit browser write headers; the server uses provider source-IP checks.
  return fetch(baseUrl + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

before(async () => {
  const testEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATA_BACKEND: "json",
    CHAMA_DATA_FILE: dataFile,
    PORT: String(port),
    SESSION_SECRET: sessionSecret,
    MPESA_ENV: "sandbox",
    MPESA_C2B_CALLBACKS_ENABLED: "1",
    MPESA_C2B_VALIDATION_URL: "https://sandbox.example.test/api/mpesa/c2b/validation",
    MPESA_C2B_CONFIRMATION_URL: "https://sandbox.example.test/api/mpesa/c2b/confirmation",
    MPESA_SHORTCODE_CHAMA_MAP: "c2b-chama=600001",
    MPESA_TEST_CALLBACK_IPS: "127.0.0.1,::1",
    MPESA_CONSUMER_KEY: "",
    MPESA_CONSUMER_SECRET: "",
    MPESA_PASSKEY: "",
    MPESA_STK_CALLBACK_URL: "",
  };
  server = execFile(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: testEnv });
  await waitForServer();
});

after(async () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise(resolve => server.once("exit", resolve));
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

test("sandbox C2B confirmation activates only an exact pending plan and is idempotent", async () => {
  const login = await request("/api/login", { method: "POST", body: JSON.stringify({ phone: "0711000001", pin: "123456" }) });
  assert.equal(login.status, 200);
  const cookie = sessionCookie(login);

  const selection = await request("/api/subscription/selection", {
    method: "POST",
    headers: { Cookie: cookie, "Idempotency-Key": "c2b-plan-selection-0001" },
    body: JSON.stringify({ tier: "basic", billing: "annual" }),
  });
  assert.equal(selection.status, 201);
  const selectionBody = await selection.json();
  assert.equal(selectionBody.plan.tier, "Basic");
  assert.equal(selectionBody.plan.memberCap, 10);
  assert.equal(selectionBody.plan.amount, 2880);
  assert.equal(selectionBody.plan.currency, "KES");
  assert.equal(selectionBody.plan.annualSavings, 720);
  assert.equal(selectionBody.plan.paymentEnabled, false);
  assert.equal(selectionBody.plan.paymentRequestStarted, false);
  assert.match(selectionBody.plan.reference, /^JC[A-F0-9]{12}$/);
  assert.match(selectionBody.message, /No payment request was sent/i);

  const payment = {
    TransID: "TESTRECEIPT001",
    BusinessShortCode: "600001",
    BillRefNumber: selectionBody.plan.reference,
    TransTime: "20261107123456",
    TransAmount: "2880.00",
    MSISDN: "254711000001",
  };
  const amountMismatch = await sendCallback("/api/mpesa/c2b/validation", { ...payment, TransAmount: "2880.01" });
  assert.equal(amountMismatch.status, 200);
  assert.equal((await amountMismatch.json()).ResultCode, 1);

  const validation = await sendCallback("/api/mpesa/c2b/validation", payment);
  assert.equal(validation.status, 200);
  assert.equal((await validation.json()).ResultCode, 0);
  const beforeConfirmation = await request("/api/dashboard", { headers: { Cookie: cookie } });
  assert.notEqual((await beforeConfirmation.json()).subscription.status, "active");

  const wrongReference = await sendCallback("/api/mpesa/c2b/confirmation", { ...payment, TransID: "TESTWRONG001", BillRefNumber: "JCWRONGREFERENCE" });
  assert.equal(wrongReference.status, 200);
  assert.equal((await wrongReference.json()).ResultCode, 1);
  const stillUnpaid = await request("/api/dashboard", { headers: { Cookie: cookie } });
  assert.notEqual((await stillUnpaid.json()).subscription.status, "active");

  const confirmation = await sendCallback("/api/mpesa/c2b/confirmation", payment);
  assert.equal(confirmation.status, 200);
  assert.equal((await confirmation.json()).ResultCode, 0);
  const dashboard = await request("/api/dashboard", { headers: { Cookie: cookie } });
  const subscription = (await dashboard.json()).subscription;
  assert.equal(subscription.status, "active");
  assert.equal(subscription.tier, "Basic");
  assert.equal(subscription.maxMembers, 10);
  assert.equal(subscription.expectedAmount, 2880);
  const endsAt = subscription.endsAt;

  const duplicate = await sendCallback("/api/mpesa/c2b/confirmation", payment);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).ResultCode, 0);
  const afterDuplicate = await request("/api/dashboard", { headers: { Cookie: cookie } });
  assert.equal((await afterDuplicate.json()).subscription.endsAt, endsAt);

  const stored = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(stored.pendingMpesas.filter(item => item.mpesaReceiptNumber === payment.TransID).length, 1);
  assert.equal(stored.pendingMpesas.find(item => item.mpesaReceiptNumber === payment.TransID).status, "Verified");
});
