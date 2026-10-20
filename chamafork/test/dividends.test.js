"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-dividends-test-"));
const dataFile = path.join(tempDir, "data.json");
let serverProcess;
let baseUrl;
const cookies = {};

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

const people = [
  { id: "chair", name: "Test Chair", phone: "+254711000001", role: "chairperson", pin: "123456", shareCapital: 0 },
  { id: "secretary", name: "Test Secretary", phone: "+254711000002", role: "secretary", pin: "234567", shareCapital: 0 },
  { id: "treasurer", name: "Test Treasurer", phone: "+254711000003", role: "treasurer", pin: "345678", shareCapital: 0 },
  { id: "a", name: "Member A", phone: "+254711000004", role: "member", pin: "456789", shareCapital: 3000 },
  { id: "b", name: "Member B", phone: "+254711000005", role: "member", pin: "567890", shareCapital: 1000 },
  { id: "c", name: "Member C", phone: "+254711000006", role: "member", pin: "678901", shareCapital: 500 },
  { id: "d", name: "Member D", phone: "+254711000007", role: "member", pin: "789012", shareCapital: 1500 },
];

// October income: interest 300 + 200 and penalties 200 + 200 = 900. Admin expenses 150 leave a pool of 750.
// The 2026-11 interest and the 2026-09 penalty fall outside the October cycle.
// December income: interest 100 only.
const repayment = (id, date, interestAmount) => ({ id, at: `${date}T08:00:00.000Z`, date, memberId: "a", memberName: "Member A", amount: 500 + interestAmount, method: "Cash", paymentType: "Loan Repayment", note: "Repayment", referenceNumber: `RCPT-${id}`, loanId: null, principalAmount: 500, interestAmount, recordedBy: "treasurer", source: "manual-cash", status: "confirmed" });
const penalty = (id, paidAt, status = "paid") => ({ id, memberId: "c", memberName: "Member C", amount: 200, reason: "Late contribution", status, transactionId: null, paidTransactionId: status === "paid" ? "t" : null, paidAt: status === "paid" ? paidAt : undefined, date: paidAt ? paidAt.slice(0, 10) : "2026-10-01", at: "2026-10-01T08:00:00.000Z" });

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  users: people.map(person => ({ id: person.id, name: person.name, phone: person.phone, role: person.role, status: "active", pinHash: pinHash(person.pin), mustChangePin: false, shareCapital: person.shareCapital })),
  transactions: [
    repayment("r1", "2026-10-05", 300),
    repayment("r2", "2026-10-20", 200),
    repayment("r3", "2026-11-02", 999),
    repayment("r4", "2026-12-05", 100),
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
  penalties: [
    penalty("p1", "2026-10-08T08:00:00.000Z"),
    penalty("p2", "2026-10-30T08:00:00.000Z"),
    penalty("p3", "2026-09-30T08:00:00.000Z"),
    penalty("p4", null, "outstanding"),
  ],
  dividendCycles: [],
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

function calculate(cookie, body) {
  return post("/api/dividends/calculate", cookie, body);
}

const October = { cycleStartDate: "2026-10-01", cycleEndDate: "2026-10-31", adminExpenses: 150 };

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
    env: { ...process.env, NODE_ENV: "test", DATA_BACKEND: "json", PORT: String(port), SESSION_SECRET: "dividends-test-session-secret", CHAMA_DATA_FILE: dataFile, AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" },
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
  for (const person of people) cookies[person.id] = await login(person);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("only the Chairperson and Treasurer can calculate dividends", async () => {
  assert.equal((await calculate(cookies.secretary, October)).status, 403);
  assert.equal((await calculate(cookies.a, October)).status, 403);
  assert.equal((await calculate(cookies.chair, October)).status, 200);
  assert.equal((await calculate(cookies.treasurer, October)).status, 200);
});

test("the preview deducts admin expenses from penalties and interest in the cycle only", async () => {
  const response = await calculate(cookies.treasurer, October);
  const preview = (await response.json()).data;
  assert.equal(preview.interestIncome, 500, "interest from 2026-10 only: 300 + 200");
  assert.equal(preview.penaltyIncome, 400, "paid penalties from 2026-10 only: 200 + 200");
  assert.equal(preview.totalIncome, 900);
  assert.equal(preview.adminExpenses, 150);
  assert.equal(preview.distributablePool, 750);
  assert.equal(preview.totalShareCapital, 6000);
  assert.equal(preview.overlapsCommitted, false);
});

test("each member's share is pro-rata to the shilling, and the payouts add up to the pool", async () => {
  const preview = (await (await calculate(cookies.treasurer, October)).json()).data;
  const payouts = Object.fromEntries(preview.payouts.map(item => [item.memberId, item.dividend]));
  // 750 × 3000/6000 = 375; × 1000/6000 = 125; × 500/6000 = 62.5; × 1500/6000 = 187.5.
  // The two halves are rounded down, then the one leftover shilling goes to C, the first of the tied remainders.
  assert.deepEqual(payouts, { a: 375, b: 125, c: 63, d: 187, chair: 0, secretary: 0, treasurer: 0 });
  assert.equal(preview.payouts.reduce((sum, item) => sum + item.dividend, 0), 750);
});

test("calculating does not change any balances or records", async () => {
  const before = persistedState();
  await calculate(cookies.chair, October);
  const after = persistedState();
  assert.deepEqual(after.users.map(item => item.shareCapital), before.users.map(item => item.shareCapital));
  assert.equal(after.dividendCycles.length, 0);
  assert.equal(after.auditLog.length, before.auditLog.length);
});

test("admin expenses larger than the income are rejected", async () => {
  const response = await calculate(cookies.treasurer, { ...October, adminExpenses: 1000 });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /exceed/);
});

test("invalid cycle dates are rejected", async () => {
  assert.equal((await calculate(cookies.treasurer, { ...October, cycleStartDate: "2026-11-01" })).status, 400);
  assert.equal((await calculate(cookies.treasurer, { ...October, cycleStartDate: "10/01/2026" })).status, 400);
  assert.equal((await calculate(cookies.treasurer, { ...October, adminExpenses: -5 })).status, 400);
});

test("a commit with payouts that differ from the figures is rejected and changes nothing", async () => {
  const preview = (await (await calculate(cookies.treasurer, October)).json()).data;
  const tampered = preview.payouts.map(item => ({ memberId: item.memberId, dividend: item.memberId === "c" ? 500 : item.dividend }));
  const response = await post("/api/dividends/commit", cookies.treasurer, { ...October, payouts: tampered });
  assert.equal(response.status, 409);
  assert.equal(persistedState().users.find(item => item.id === "c").shareCapital, 500);
});

test("a commit adds each dividend to share capital and writes one audit entry", async () => {
  const preview = (await (await calculate(cookies.treasurer, October)).json()).data;
  const response = await post("/api/dividends/commit", cookies.treasurer, { ...October, payouts: preview.payouts.map(item => ({ memberId: item.memberId, dividend: item.dividend })) });
  assert.equal(response.status, 201);
  const cycle = (await response.json()).data;
  assert.equal(cycle.distributed, 750);

  const saved = persistedState();
  assert.deepEqual(saved.users.filter(item => ["a", "b", "c", "d"].includes(item.id)).map(item => item.shareCapital), [3375, 1125, 563, 1687]);
  assert.equal(saved.dividendCycles.length, 1);
  const entries = saved.auditLog.filter(item => item.type === "dividend.distributed");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].distributed, 750);
  assert.equal(entries[0].by.role, "treasurer");
});

test("the same income cannot be distributed twice", async () => {
  const preview = (await (await calculate(cookies.treasurer, October)).json()).data;
  assert.equal(preview.overlapsCommitted, true);
  const response = await post("/api/dividends/commit", cookies.chair, { ...October, payouts: preview.payouts.map(item => ({ memberId: item.memberId, dividend: item.dividend })) });
  assert.equal(response.status, 409);
  assert.equal(persistedState().users.find(item => item.id === "a").shareCapital, 3375);
});

test("the next cycle is pro-rata on the new share capital, with exact rounding", async () => {
  // Pool 100 over total share capital 6750: a gets 50 exactly; b gets 16.67, c 8.34, d 24.99.
  // Floors give 98, and the two leftover shillings go to d (.99) and b (.67).
  const december = { cycleStartDate: "2026-12-01", cycleEndDate: "2026-12-31", adminExpenses: 0 };
  const preview = (await (await calculate(cookies.treasurer, december)).json()).data;
  assert.equal(preview.distributablePool, 100);
  const payouts = Object.fromEntries(preview.payouts.map(item => [item.memberId, item.dividend]));
  assert.deepEqual(payouts, { a: 50, b: 17, c: 8, d: 25, chair: 0, secretary: 0, treasurer: 0 });
  assert.equal(Object.values(payouts).reduce((sum, value) => sum + value, 0), 100);
});
