"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-assess-test-"));
const dataFile = path.join(tempDir, "data.json");
let serverProcess;
let baseUrl;
const cookies = {};

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

const people = [
  { id: "chair", name: "Test Chair", phone: "+254711000001", role: "chairperson", pin: "123456", status: "active" },
  { id: "secretary", name: "Test Secretary", phone: "+254711000002", role: "secretary", pin: "234567", status: "active" },
  { id: "treasurer", name: "Test Treasurer", phone: "+254711000003", role: "treasurer", pin: "345678", status: "active" },
  { id: "none", name: "Paid Nothing", phone: "+254711000004", role: "member", pin: "456789", status: "active" },
  { id: "short", name: "Paid Too Little", phone: "+254711000005", role: "member", pin: "567890", status: "active" },
  { id: "ontime", name: "Paid On Time", phone: "+254711000006", role: "member", pin: "678901", status: "active" },
  { id: "late", name: "Paid Late", phone: "+254711000007", role: "member", pin: "789012", status: "active" },
  { id: "gone", name: "Inactive", phone: "+254711000008", role: "member", pin: "890123", status: "inactive" },
];

const contribution = (id, memberId, amount, date) => ({ id, at: `${date}T08:00:00.000Z`, date, memberId, memberName: memberId, amount, method: "Cash", paymentType: "Monthly Contribution", note: "Cash received", referenceNumber: `RCPT-${id}`, contributionMonth: date.slice(0, 7), welfareAmount: 0, shareCapitalAmount: amount, penaltyAmount: 0, loanId: null, recordedBy: "treasurer", source: "manual-cash", status: "confirmed" });

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  users: people.map(person => ({ id: person.id, name: person.name, phone: person.phone, role: person.role, status: person.status, pinHash: pinHash(person.pin), mustChangePin: false, shareCapital: 0 })),
  transactions: [
    contribution("t-short", "short", 300, "2026-08-03"),
    contribution("t-ontime", "ontime", 500, "2026-08-04"),
    contribution("t-late", "late", 500, "2026-08-07"),
  ],
  loans: [],
  payouts: [],
  invitations: [],
  leadershipChanges: [],
  pendingMpesas: [],
  idempotency: {},
  registers: [],
  auditLog: [],
  welfareReserve: 0,
  // "Paid Late" already has a late-payment penalty for August, so the assessment skips them.
  penalties: [{ id: "late-pen", memberId: "late", memberName: "Paid Late", amount: 200, reason: "Late contribution", status: "paid", transactionId: "t-late", paidTransactionId: "t-late", date: "2026-08-07", at: "2026-08-07T08:00:00.000Z" }],
}));

function persistedState() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

async function login(person) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone: person.phone, pin: person.pin }),
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

before(async () => {
  const port = await freePort();
  serverProcess = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", DATA_BACKEND: "json", PORT: String(port), SESSION_SECRET: "assess-test-session-secret", CHAMA_DATA_FILE: dataFile, AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" },
  });
  let output = "";
  serverProcess.stdout.on("data", chunk => { output += chunk; });
  serverProcess.stderr.on("data", chunk => { output += chunk; });
  baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 8000);
    const check = setInterval(() => {
      if (output.includes(`localhost:${port}`)) { clearTimeout(timeout); clearInterval(check); resolve(); }
    }, 20);
    serverProcess.once("exit", code => { clearTimeout(timeout); clearInterval(check); reject(new Error(`Server exited with code ${code}. Output: ${output}`)); });
  });
  for (const person of people.filter(item => item.status === "active")) cookies[person.id] = await login(person);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("only the Chairperson and Secretary can assess penalties", async () => {
  const response = await post("/api/penalties/assess", cookies.treasurer, { month: "2026-08" });
  assert.equal(response.status, 403);
});

test("penalties cannot be assessed before the month's deadline has passed", async () => {
  const response = await post("/api/penalties/assess", cookies.chair, { month: "2999-01" });
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /2999-01-05/);
});

test("members who paid less than KES 500 by the deadline get an outstanding KES 200 penalty", async () => {
  const response = await post("/api/penalties/assess", cookies.chair, { month: "2026-08" });
  assert.equal(response.status, 201);
  const assessed = (await response.json()).data.assessed.map(item => item.memberId).sort();
  // Officers and the inactive member are handled separately below.
  assert.ok(assessed.includes("none"), "member who paid nothing is penalised");
  assert.ok(assessed.includes("short"), "member who paid KES 300 is penalised");
  assert.ok(!assessed.includes("ontime"), "member who paid KES 500 on time is not penalised");
  assert.ok(!assessed.includes("late"), "member with a late-payment penalty for the month is not penalised twice");
  assert.ok(!assessed.includes("gone"), "inactive members are not penalised");

  const saved = persistedState();
  const charge = saved.penalties.find(item => item.memberId === "none" && item.month === "2026-08");
  assert.equal(charge.amount, 200);
  assert.equal(charge.status, "outstanding");
  assert.equal(charge.reason, "Missed monthly contribution");
  const entries = saved.auditLog.filter(item => item.type === "penalty.assessed");
  assert.ok(entries.some(item => item.entityId === charge.id && item.by.role === "chairperson"));
  assert.ok(entries.some(item => item.memberId === "short" && item.paidByDeadline === 300));
});

test("assessing the same month again adds no penalties", async () => {
  const before = persistedState().penalties.length;
  const response = await post("/api/penalties/assess", cookies.secretary, { month: "2026-08" });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.assessed.length, 0);
  assert.equal(persistedState().penalties.length, before);
});

test("an outstanding assessed penalty is settled by the member's next payment", async () => {
  const response = await post("/api/contributions", cookies.treasurer, { memberId: "none", amount: 700, method: "Cash", note: "Catch-up payment", referenceNumber: "RCPT-NONE1", date: "2026-09-03" });
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.penaltyAmount, 200);
  assert.equal(transaction.welfareAmount, 500);
  const charge = persistedState().penalties.find(item => item.memberId === "none" && item.month === "2026-08");
  assert.equal(charge.status, "paid");
  assert.equal(charge.paidTransactionId, transaction.id);
});
