"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-backfill-test-"));
const dataFile = path.join(tempDir, "data.json");
let serverProcess;
let baseUrl;
let chairCookie;
let treasurerCookie;
let secretaryCookie;

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

const users = [
  { id: "chair", name: "Test Chair", phone: "+254711000001", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false },
  { id: "treasurer", name: "Test Treasurer", phone: "+254711000002", role: "treasurer", status: "active", pinHash: pinHash("234567"), mustChangePin: false },
  { id: "secretary", name: "Test Secretary", phone: "+254711000006", role: "secretary", status: "active", pinHash: pinHash("678901"), mustChangePin: false },
  { id: "a", name: "Legacy A", phone: "+254711000003", role: "member", status: "active", pinHash: pinHash("345678"), mustChangePin: false },
  { id: "b", name: "Legacy B", phone: "+254711000004", role: "member", status: "active", pinHash: pinHash("456789"), mustChangePin: false },
  { id: "c", name: "Owes Penalty", phone: "+254711000005", role: "member", status: "active", pinHash: pinHash("567890"), mustChangePin: false },
  { id: "d", name: "Late Payer", phone: "+254711000007", role: "member", status: "active", pinHash: pinHash("789012"), mustChangePin: false },
  { id: "e", name: "On Time", phone: "+254711000008", role: "member", status: "active", pinHash: pinHash("890123"), mustChangePin: false },
  { id: "f", name: "Custom Date", phone: "+254711000009", role: "member", status: "active", pinHash: pinHash("901234"), mustChangePin: false },
];

// Legacy transactions have no welfare or share capital split, as saved before the contribution split.
const legacyTransactions = [
  { id: "legacy-a1", at: "2026-09-03T08:00:00.000Z", memberId: "a", memberName: "Legacy A", amount: 1500, method: "Cash", paymentType: "Monthly Contribution", status: "confirmed", source: "manual-cash", recordedBy: "treasurer", loanId: null },
  { id: "legacy-a2", at: "2026-09-20T08:00:00.000Z", memberId: "a", memberName: "Legacy A", amount: 800, method: "Cash", paymentType: "Monthly Contribution", status: "confirmed", source: "manual-cash", recordedBy: "treasurer", loanId: null },
  { id: "legacy-b1", at: "2026-09-10T08:00:00.000Z", memberId: "b", memberName: "Legacy B", amount: 300, method: "Cash", paymentType: "Monthly Contribution", status: "confirmed", source: "manual-cash", recordedBy: "treasurer", loanId: null },
  { id: "legacy-repay", at: "2026-09-11T08:00:00.000Z", memberId: "a", memberName: "Legacy A", amount: 200, method: "Cash", paymentType: "Loan Repayment", status: "confirmed", source: "manual-cash", recordedBy: "treasurer", loanId: null },
];

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  users,
  transactions: legacyTransactions,
  loans: [],
  payouts: [],
  invitations: [],
  leadershipChanges: [],
  pendingMpesas: [],
  idempotency: {},
  registers: [],
  auditLog: [],
  // A penalty charged earlier and still unpaid.
  penalties: [{ id: "pen-c", memberId: "c", memberName: "Owes Penalty", amount: 200, reason: "Late contribution", status: "outstanding", transactionId: null, paidTransactionId: null, date: "2026-08-07", at: "2026-08-07T08:00:00.000Z" }],
}));

function persistedState() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

async function login(phone, pin) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone, pin }),
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie()[0].split(";")[0];
}

function post(route, cookie, body) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

function contribute(memberId, amount, date, referenceNumber) {
  return post("/api/contributions", treasurerCookie, { memberId, amount, method: "Cash", note: "Cash received at meeting", referenceNumber, date });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const availablePort = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(availablePort));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const proc = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", DATA_BACKEND: "json", PORT: String(port), SESSION_SECRET: "backfill-test-session-secret", CHAMA_DATA_FILE: dataFile, AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" },
  });
  let output = "";
  proc.stdout.on("data", chunk => { output += chunk; });
  proc.stderr.on("data", chunk => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 8000);
    const check = setInterval(() => {
      if (output.includes(`localhost:${port}`)) { clearTimeout(timeout); clearInterval(check); resolve(); }
    }, 20);
    proc.once("exit", code => { clearTimeout(timeout); clearInterval(check); reject(new Error(`Server exited with code ${code}. Output: ${output}`)); });
  });
  return { proc, url };
}

async function stopServer(proc) {
  if (proc && proc.exitCode === null) {
    proc.kill("SIGTERM");
    await new Promise(resolve => proc.once("exit", resolve));
  }
}

before(async () => {
  const started = await startServer();
  serverProcess = started.proc;
  baseUrl = started.url;
  chairCookie = await login("+254711000001", "123456");
  treasurerCookie = await login("+254711000002", "234567");
  secretaryCookie = await login("+254711000006", "678901");
});

after(async () => {
  await stopServer(serverProcess);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("legacy contributions are backfilled with the welfare fee on the first payment of each month", async () => {
  const saved = persistedState();
  const a1 = saved.transactions.find(item => item.id === "legacy-a1");
  const a2 = saved.transactions.find(item => item.id === "legacy-a2");
  assert.equal(a1.welfareAmount, 500);
  assert.equal(a1.shareCapitalAmount, 1000);
  assert.equal(a1.contributionMonth, "2026-09");
  assert.equal(a2.welfareAmount, 0, "second September payment has no welfare fee");
  assert.equal(a2.shareCapitalAmount, 800);
  assert.equal(saved.users.find(item => item.id === "a").shareCapital, 1800);

  const b1 = saved.transactions.find(item => item.id === "legacy-b1");
  assert.equal(b1.welfareAmount, 300, "a payment under the fee sends all of it to welfare");
  assert.equal(b1.shareCapitalAmount, 0);
  assert.equal(saved.users.find(item => item.id === "b").shareCapital, 0);

  assert.equal(saved.welfareReserve, 800);
  assert.equal(saved.transactions.find(item => item.id === "legacy-repay").welfareAmount, undefined, "loan repayments are not backfilled");
  const audited = saved.auditLog.filter(item => item.type === "contribution.backfilled");
  assert.equal(audited.length, 3);
  assert.equal(audited[0].by.role, "system");
});

test("a meeting date is set per month and only the Chairperson or Secretary can set it", async () => {
  const forbidden = await post("/api/settings/meeting-date", treasurerCookie, { month: "2026-11", date: "2026-11-12" });
  assert.equal(forbidden.status, 403);
  const outside = await post("/api/settings/meeting-date", chairCookie, { month: "2026-11", date: "2026-12-01" });
  assert.equal(outside.status, 400);
  const saved = await post("/api/settings/meeting-date", secretaryCookie, { month: "2026-11", date: "2026-11-12" });
  assert.equal(saved.status, 200);
  assert.equal(persistedState().settings.meetingDates["2026-11"], "2026-11-12");
});

test("an outstanding penalty is paid first, then the welfare fee, then share capital", async () => {
  const short = await contribute("c", 600, "2026-09-03", "RCPT-C01");
  assert.equal(short.status, 400, "the payment must cover the outstanding penalty plus the welfare fee");
  const response = await contribute("c", 700, "2026-09-03", "RCPT-C02");
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.penaltyAmount, 200);
  assert.equal(transaction.welfareAmount, 500);
  assert.equal(transaction.shareCapitalAmount, 0);
  const saved = persistedState();
  const charge = saved.penalties.find(item => item.id === "pen-c");
  assert.equal(charge.status, "paid");
  assert.equal(charge.paidTransactionId, transaction.id);
  assert.ok(saved.auditLog.some(item => item.type === "penalty.paid" && item.entityId === "pen-c"));
});

test("a payment logged after the default 5th charges KES 200 and settles it in the same payment", async () => {
  const response = await contribute("d", 1000, "2026-10-07", "RCPT-D01");
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.penaltyAmount, 200);
  assert.equal(transaction.welfareAmount, 500);
  assert.equal(transaction.shareCapitalAmount, 300);
  const saved = persistedState();
  const charges = saved.penalties.filter(item => item.memberId === "d");
  assert.equal(charges.length, 1);
  assert.equal(charges[0].status, "paid");
  assert.ok(saved.auditLog.some(item => item.type === "penalty.charged" && item.memberId === "d"));
  assert.ok(saved.auditLog.some(item => item.type === "penalty.paid" && item.entityId === charges[0].id));
});

test("a payment on the default 5th is on time", async () => {
  const response = await contribute("e", 500, "2026-10-05", "RCPT-E01");
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.penaltyAmount, 0);
});

test("a custom meeting date replaces the default deadline for that month only", async () => {
  const onTime = await contribute("f", 500, "2026-11-10", "RCPT-F01");
  assert.equal(onTime.status, 201, "logged before the custom meeting date");
  assert.equal((await onTime.json()).data.penaltyAmount, 0);
  const late = await contribute("f", 300, "2026-11-13", "RCPT-F02");
  assert.equal(late.status, 201);
  const transaction = (await late.json()).data;
  assert.equal(transaction.penaltyAmount, 200);
  assert.equal(transaction.welfareAmount, 0);
  assert.equal(transaction.shareCapitalAmount, 100);
});

test("the welfare reserve and share capital survive a restart unchanged", async () => {
  const before = persistedState();
  await stopServer(serverProcess);
  const restarted = await startServer();
  serverProcess = restarted.proc;
  baseUrl = restarted.url;
  const after = persistedState();
  assert.equal(after.welfareReserve, before.welfareReserve);
  assert.equal(after.welfareReserve, 2800);
  assert.equal(after.users.find(item => item.id === "a").shareCapital, 1800);
  assert.equal(after.auditLog.filter(item => item.type === "contribution.backfilled").length, 3);
  assert.equal(after.transactions.length, before.transactions.length);
});
