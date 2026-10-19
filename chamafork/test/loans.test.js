"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-loans-test-"));
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
  { id: "borrower", name: "Borrower A", phone: "+254711000004", role: "member", pin: "456789", shareCapital: 1000 },
  { id: "richer", name: "Borrower B", phone: "+254711000005", role: "member", pin: "567890", shareCapital: 5000 },
  { id: "g1", name: "Guarantor One", phone: "+254711000006", role: "member", pin: "678901", shareCapital: 1000 },
  { id: "g2", name: "Guarantor Two", phone: "+254711000007", role: "member", pin: "789012", shareCapital: 1000 },
  { id: "g3", name: "Guarantor Three", phone: "+254711000008", role: "member", pin: "890123", shareCapital: 300 },
  { id: "g4", name: "Guarantor Four", phone: "+254711000009", role: "member", pin: "901234", shareCapital: 300 },
];

// A fixed cash balance, so approvals are never blocked by group funds.
const seedTransaction = { id: "seed-cash", at: "2026-09-01T08:00:00.000Z", memberId: "chair", memberName: "Test Chair", amount: 100000, method: "Cash", paymentType: "Monthly Contribution", note: "Opening cash", status: "confirmed", source: "manual-cash", recordedBy: "treasurer", loanId: null, welfareAmount: 0, shareCapitalAmount: 0, penaltyAmount: 0, contributionMonth: "2026-09" };

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  users: people.map(person => ({ id: person.id, name: person.name, phone: person.phone, role: person.role, status: "active", pinHash: pinHash(person.pin), mustChangePin: false, shareCapital: person.shareCapital })),
  transactions: [seedTransaction],
  loans: [],
  payouts: [],
  invitations: [],
  leadershipChanges: [],
  pendingMpesas: [],
  idempotency: {},
  registers: [],
  auditLog: [],
  penalties: [],
  welfareReserve: 0,
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

function requestLoan(cookie, body) {
  return post("/api/loans", cookie, body);
}

function decide(loanId, cookie, decision) {
  return post(`/api/loans/${loanId}/decisions`, cookie, { decision, reason: "Reviewed against the savings and guarantors" });
}

async function approveLoan(loanId) {
  for (const officer of ["chair", "treasurer", "g4"]) {
    const response = await decide(loanId, cookies[officer], "approve");
    assert.equal(response.status, 200);
  }
  return persistedState().loans.find(item => item.id === loanId);
}

function loanById(id) {
  return persistedState().loans.find(item => item.id === id);
}

function memberHeld(loan, memberId) {
  return (loan.guarantors || []).find(item => item.memberId === memberId)?.held;
}

function unpledged(memberId) {
  const saved = persistedState();
  const member = saved.users.find(item => item.id === memberId);
  const held = saved.loans.filter(loan => loan.status === "approved" || ["Requested", "pending", "Waiting for decisions"].includes(loan.status))
    .flatMap(loan => (loan.guarantors || []).filter(item => item.memberId === memberId).map(item => item.held))
    .reduce((sum, value) => sum + value, 0);
  return member.shareCapital - held;
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
    env: { ...process.env, NODE_ENV: "test", PORT: String(port), SESSION_SECRET: "loans-test-session-secret", CHAMA_DATA_FILE: dataFile, AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" },
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

test("reducing balance: KES 1,000 over 2 months at 5% a month", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 1000, months: 2, interestModel: "reducing", guarantorIds: ["g1", "g2"] });
  assert.equal(response.status, 201);
  const loan = await approveLoan((await response.json()).data.id);
  assert.equal(loan.status, "approved");
  // Installment = 1000 × 0.05 / (1 − 1.05⁻²) = 537.80, rounded to 538.
  assert.deepEqual(loan.schedule.map(row => row.installment), [538, 538]);
  // Month 1 interest is 5% of 1,000 = 50, so principal is 488 and 512 remains.
  // Month 2 interest is 5% of 512 = 25.6, rounded to 26, and the final installment clears 512.
  assert.deepEqual(loan.schedule.map(row => row.interest), [50, 26]);
  assert.deepEqual(loan.schedule.map(row => row.principal), [488, 512]);
  assert.equal(loan.totalPayable, 1076);
  assert.equal(loan.outstanding, 1076);
});

test("flat rate: KES 1,000 over 2 months charges 5% of principal each month", async () => {
  const response = await requestLoan(cookies.richer, { amount: 1000, months: 2, interestModel: "flat", guarantorIds: ["g2", "g3"] });
  assert.equal(response.status, 201);
  const loan = await approveLoan((await response.json()).data.id);
  assert.deepEqual(loan.schedule.map(row => row.interest), [50, 50]);
  assert.deepEqual(loan.schedule.map(row => row.principal), [500, 500]);
  assert.deepEqual(loan.schedule.map(row => row.installment), [550, 550]);
  assert.equal(loan.totalPayable, 1100, "total interest is P × r × t = 1000 × 0.05 × 2 = 100");
});

test("borrowing above three times share capital is rejected", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 3001, months: 1, guarantorIds: ["g3", "g4"] });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /KES 3000/);
});

test("a request at the limit still needs guarantors that cover the principal", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 3000, months: 1, guarantorIds: ["g3", "g4"] });
  assert.equal(response.status, 409, "limit passes, but g3 and g4 have only KES 600 unpledged");
  assert.match((await response.json()).message, /does not cover/);
});

test("a loan needs exactly two different guarantors who are not the borrower", async () => {
  assert.equal((await requestLoan(cookies.borrower, { amount: 500, months: 1, guarantorIds: ["g3"] })).status, 400);
  assert.equal((await requestLoan(cookies.borrower, { amount: 500, months: 1, guarantorIds: ["g3", "g3"] })).status, 400);
  assert.equal((await requestLoan(cookies.borrower, { amount: 500, months: 1, guarantorIds: ["borrower", "g3"] })).status, 400);
  assert.equal((await requestLoan(cookies.borrower, { amount: 500, months: 1, guarantorIds: ["g3", "nobody"] })).status, 400);
});

test("guarantors' combined unpledged share capital must cover the principal", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 1000, months: 1, guarantorIds: ["g3", "g4"] });
  assert.equal(response.status, 409);
});

test("pledged share capital stays locked for other loans until repaid", async () => {
  // g1's KES 1,000 is pledged to the approved loan above, so g1 has nothing left to back KES 500.
  assert.equal(unpledged("g1"), 0);
  const response = await requestLoan(cookies.richer, { amount: 500, months: 1, guarantorIds: ["g1", "g3"] });
  assert.equal(response.status, 409);
});

test("rejecting a request releases its pledges", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 600, months: 1, guarantorIds: ["g3", "g4"] });
  assert.equal(response.status, 201);
  const loanId = (await response.json()).data.id;
  assert.equal(unpledged("g3"), 0);
  const rejected = await decide(loanId, cookies.chair, "reject");
  assert.equal(rejected.status, 200);
  assert.equal(loanById(loanId).status, "rejected");
  assert.equal(unpledged("g3"), 300);
  assert.equal(unpledged("g4"), 300);
});

test("repayments split interest first, then release pledges as principal falls", async () => {
  const loanId = persistedState().loans.find(item => item.memberId === "borrower" && item.status === "approved").id;
  const first = await post("/api/loans/repay", cookies.treasurer, { loanId, amount: 538, method: "Cash", note: "First installment", referenceNumber: "RCPT-3001", date: "2026-10-05" });
  assert.equal(first.status, 201);
  const transaction = (await first.json()).data;
  assert.equal(transaction.interestAmount, 50);
  assert.equal(transaction.principalAmount, 488);

  const loan = loanById(loanId);
  assert.equal(loan.outstanding, 538);
  assert.equal(loan.schedule[0].paidInterest, 50);
  assert.equal(loan.schedule[0].paidPrincipal, 488);
  // 512 of principal remains, so g1's 1,000 pledge shrinks to 512.
  assert.equal(memberHeld(loan, "g1"), 512);
  assert.equal(unpledged("g1"), 488);
  assert.ok(persistedState().auditLog.some(item => item.type === "pledge.released" && item.loanId === loanId && item.amount === 488));
});

test("overpaying a loan is rejected", async () => {
  const loanId = persistedState().loans.find(item => item.memberId === "borrower" && item.status === "approved").id;
  const response = await post("/api/loans/repay", cookies.treasurer, { loanId, amount: 600, method: "Cash", note: "Too much", referenceNumber: "RCPT-3002", date: "2026-10-05" });
  assert.equal(response.status, 400);
  assert.equal(loanById(loanId).outstanding, 538);
});

test("the final repayment closes the loan and releases every pledge", async () => {
  const loanId = persistedState().loans.find(item => item.memberId === "borrower" && item.status === "approved").id;
  const response = await post("/api/loans/repay", cookies.treasurer, { loanId, amount: 538, method: "Cash", note: "Final installment", referenceNumber: "RCPT-3003", date: "2026-11-05" });
  assert.equal(response.status, 201);
  const loan = loanById(loanId);
  assert.equal(loan.status, "repaid");
  assert.equal(loan.outstanding, 0);
  assert.equal(memberHeld(loan, "g1"), 0);
  assert.equal(unpledged("g1"), 1000);
});

test("loan requests, decisions, repayments, and releases are audited", async () => {
  const saved = persistedState();
  const loanId = saved.loans.find(item => item.memberId === "borrower" && item.status === "repaid").id;
  const types = saved.auditLog.filter(item => item.entityId === loanId || item.loanId === loanId).map(item => item.type);
  assert.ok(types.includes("loan.requested"));
  assert.ok(types.filter(type => type === "loan.decided").length >= 3);
  assert.equal(types.filter(type => type === "loan.repaid").length, 2);
  assert.ok(types.includes("pledge.released"));
  const requested = saved.auditLog.find(item => item.type === "loan.requested" && item.entityId === loanId);
  assert.equal(requested.by.id, "borrower");
  assert.equal(requested.interestModel, "reducing");
});
