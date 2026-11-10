"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-financials-test-"));
const dataFile = path.join(tempDir, "data.json");
let serverProcess;
let baseUrl;
let treasurerCookie;

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

const chair = { id: "chair", name: "Test Chair", phone: "+254711000001", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false };
const treasurer = { id: "treasurer", name: "Test Treasurer", phone: "+254711000002", role: "treasurer", status: "active", pinHash: pinHash("234567"), mustChangePin: false };
const secretary = { id: "secretary", name: "Test Secretary", phone: "+254711000006", role: "secretary", status: "active", pinHash: pinHash("678901"), mustChangePin: false };
// Legacy accounts: no shareCapital field and no welfareReserve or penalties arrays in the saved file.
const member = { id: "member", name: "Test Member", phone: "+254711000003", role: "member", status: "active", pinHash: pinHash("345678"), mustChangePin: false };
const otherMember = { id: "other", name: "Other Member", phone: "+254711000004", role: "member", status: "active", pinHash: pinHash("456789"), mustChangePin: false };
const thirdMember = { id: "third", name: "Third Member", phone: "+254711000005", role: "member", status: "active", pinHash: pinHash("567890"), mustChangePin: false };
const foreignMember = { id: "foreign-member", name: "Foreign Member", phone: "+254711000007", role: "member", status: "active", pinHash: pinHash("789012"), mustChangePin: false, chamaId: "foreign-chama" };

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  chamas: [
    { id: "test-chama", name: "Test Chama", subscription: require("./active-subscription-fixture").activeSubscription() },
    { id: "foreign-chama", name: "Foreign Chama", subscription: require("./active-subscription-fixture").activeSubscription() },
  ],
  users: [chair, treasurer, secretary, member, otherMember, thirdMember, foreignMember],
  transactions: [],
  loans: [],
  payouts: [],
  invitations: [],
  leadershipChanges: [],
  pendingMpesas: [],
  idempotency: {},
  registers: [],
  auditLog: [],
  settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 350, lateContributionPenalty: 125, loanMonthlyRatePercent: 5, meetingDates: {} },
}));

function persistedState() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

async function login(user, pin) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone: user.phone, pin }),
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie()[0].split(";")[0];
}

function postCash(route, body, idempotencyKey = crypto.randomUUID()) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      Cookie: treasurerCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

function contribute(memberId, body, idempotencyKey = crypto.randomUUID()) {
  return postCash("/api/contributions", {
    memberId,
    paymentType: "Monthly Contribution",
    method: "Cash",
    note: "Cash received at meeting",
    referenceNumber: "RCPT-1000",
    date: "2026-10-05",
    ...body,
  }, idempotencyKey);
}

before(async () => {
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const availablePort = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(availablePort));
    });
  });
  serverProcess = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_BACKEND: "json",
      PORT: String(port),
      SESSION_SECRET: "financials-test-session-secret",
      CHAMA_DATA_FILE: dataFile,
      AFRICASTALKING_USERNAME: "",
      AFRICASTALKING_API_KEY: "",
    },
  });
  let output = "";
  serverProcess.stdout.on("data", chunk => { output += chunk; });
  serverProcess.stderr.on("data", chunk => { output += chunk; });
  baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 8000);
    const check = setInterval(() => {
      if (output.includes(`localhost:${port}`)) {
        clearTimeout(timeout);
        clearInterval(check);
        resolve();
      }
    }, 20);
    serverProcess.once("exit", code => {
      clearTimeout(timeout);
      clearInterval(check);
      reject(new Error(`Server exited with code ${code}. Output: ${output}`));
    });
  });
  treasurerCookie = await login(treasurer, "234567");
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("the first payment of the month uses the configured welfare amount", async () => {
  const response = await contribute(member.id, { amount: 1500 });
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.note, "Cash received at meeting");
  assert.equal(transaction.welfareAmount, 350);
  assert.equal(transaction.shareCapitalAmount, 1150);
  assert.equal(transaction.penaltyAmount, 0);
  assert.equal(transaction.contributionMonth, "2026-10");
  assert.equal(transaction.referenceNumber, "RCPT-1000");
  assert.equal(transaction.date, "2026-10-05");

  const saved = persistedState();
  assert.equal(saved.welfareReserve, 350);
  assert.equal(saved.transactions.find(item => item.id === transaction.id).note, "Cash received at meeting");
  assert.equal(saved.users.find(item => item.id === member.id).shareCapital, 1150);
  const entry = saved.auditLog.find(item => item.type === "contribution.recorded" && item.entityId === transaction.id);
  assert.ok(entry, "contribution should be audited");
  assert.equal(entry.by.role, "treasurer");
  assert.equal(entry.welfareAmount, 350);
  assert.equal(entry.shareCapitalAmount, 1150);
});

test("a second payment in the same month goes entirely to share capital", async () => {
  const response = await contribute(member.id, { amount: 800, date: "2026-10-04", referenceNumber: "RCPT-1001" });
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.welfareAmount, 0);
  assert.equal(transaction.shareCapitalAmount, 800);

  const saved = persistedState();
  assert.equal(saved.welfareReserve, 350, "welfare is charged once per month");
  assert.equal(saved.users.find(item => item.id === member.id).shareCapital, 1950);
});

test("the welfare reserve pools fees from every member", async () => {
  assert.equal((await contribute(otherMember.id, { amount: 500, referenceNumber: "RCPT-1002" })).status, 201);
  const saved = persistedState();
  assert.equal(saved.welfareReserve, 700);
  assert.equal(saved.users.find(item => item.id === otherMember.id).shareCapital, 150);
});

test("group financial trends aggregate dated transactions without exposing member records", async () => {
  const response = await fetch(`${baseUrl}/api/summary`, { headers: { Cookie: treasurerCookie } });
  assert.equal(response.status, 200);
  const summary = (await response.json()).data;
  assert.equal(summary.financialTrends.months.length, 6);
  const october = summary.financialTrends.months.indexOf("2026-10");
  assert.ok(october >= 0);
  assert.equal(summary.financialTrends.contributions[october], 2800);
  assert.equal(summary.financialTrends.loanRepayments[october], 0);
  assert.equal(JSON.stringify(summary.financialTrends).includes("memberId"), false);

  const memberCookie = await login(member, "345678");
  const memberResponse = await fetch(`${baseUrl}/api/summary`, { headers: { Cookie: memberCookie } });
  assert.equal(memberResponse.status, 200);
  const memberSummary = (await memberResponse.json()).data;
  assert.equal(memberSummary.balance, null);
  assert.equal(memberSummary.financialTrends.contributions[october], 2800);
});

test("a payment below the welfare fee is rejected and changes nothing", async () => {
  const before = persistedState();
  const response = await contribute(thirdMember.id, { amount: 300, referenceNumber: "RCPT-1003" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /KES 350 welfare fee/);
  const after = persistedState();
  assert.equal(after.welfareReserve, before.welfareReserve);
  assert.equal(after.transactions.length, before.transactions.length);
  assert.equal(after.auditLog.length, before.auditLog.length);
});

test("reference number and date are required and must be well formed", async () => {
  assert.equal((await contribute(thirdMember.id, { amount: 500, referenceNumber: "" })).status, 400);
  assert.equal((await contribute(thirdMember.id, { amount: 500, referenceNumber: "A" })).status, 400);
  assert.equal((await contribute(thirdMember.id, { amount: 500, date: "05/10/2026" })).status, 400);
  assert.equal((await contribute(thirdMember.id, { amount: 500, date: "2026-13-45" })).status, 400);
  assert.equal(persistedState().transactions.filter(item => item.memberId === thirdMember.id).length, 0);
});

test("a late contribution uses the configured penalty amount", async () => {
  const response = await contribute(thirdMember.id, { amount: 600, date: "2026-10-08", referenceNumber: "RCPT-1004" });
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.welfareAmount, 350);
  assert.equal(transaction.penaltyAmount, 125);
  assert.equal(transaction.shareCapitalAmount, 125);
  assert.equal(persistedState().penalties.at(-1).amount, 125);
});

test("monthly close is a read-only officer report over existing chama records", async () => {
  const before = persistedState();
  const response = await fetch(`${baseUrl}/api/monthly-close?month=2026-10`, { headers: { Cookie: treasurerCookie } });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.month, "2026-10");
  assert.equal(data.totals.contributionCount, 4);
  assert.equal(data.totals.contributionTotal, 3400);
  assert.equal(data.totals.welfareAmount, 1050);
  assert.equal(data.totals.shareCapitalAmount, 2225);
  assert.equal(data.totals.repaymentTotal, 0);
  assert.equal(data.entries.length, 4);
  assert.equal(data.exceptions.incompleteReferences.length, 0);
  assert.ok(data.exceptions.membersWithoutContribution.some(item => item.id === chair.id));
  assert.deepEqual(data.exceptions.pendingLoanRequests, []);
  assert.deepEqual(data.exceptions.outstandingPenalties, []);

  const memberCookie = await login(member, "345678");
  assert.equal((await fetch(`${baseUrl}/api/monthly-close?month=2026-10`, { headers: { Cookie: memberCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/monthly-close?month=9999-01`, { headers: { Cookie: treasurerCookie } })).status, 400);
  const after = persistedState();
  assert.deepEqual(after.transactions, before.transactions, "a report must not create or change ledger rows");
  assert.deepEqual(after.auditLog, before.auditLog, "a report must not create audit mutations");
});

test("ordinary members cannot backdate contributions, and invalid or future dates change nothing", async () => {
  const before = persistedState();
  const memberCookie = await login(member, "345678");
  const memberBackdate = await fetch(`${baseUrl}/api/contributions`, {
    method: "POST",
    headers: { Cookie: memberCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ memberId: thirdMember.id, amount: 500, method: "Cash", note: "Attempted backdate", referenceNumber: "RCPT-MEMBER", date: "2026-10-03" }),
  });
  assert.equal(memberBackdate.status, 403, "member role cannot write a backdated cash entry");

  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const tomorrow = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  assert.equal((await contribute(thirdMember.id, { amount: 500, date: tomorrow.toISOString().slice(0, 10), referenceNumber: "RCPT-FUTURE" })).status, 400);
  assert.equal((await contribute(thirdMember.id, { amount: 500, date: "2026-02-30", referenceNumber: "RCPT-IMPOSSIBLE" })).status, 400);

  const after = persistedState();
  assert.equal(after.transactions.length, before.transactions.length);
  assert.equal(after.auditLog.length, before.auditLog.length);
});

test("contribution date correction is authorized, same-month, classification-safe, and auditable", async () => {
  const before = persistedState();
  const transaction = before.transactions.find(item => item.referenceNumber === "RCPT-1000");
  assert.ok(transaction);
  const sendCorrection = (cookie, body, key = crypto.randomUUID()) => fetch(`${baseUrl}/api/contributions/${transaction.id}/correct-date`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });

  const memberCookie = await login(member, "345678");
  const secretaryCookie = await login(secretary, "678901");
  assert.equal((await sendCorrection(memberCookie, { date: "2026-10-03", reason: "Unauthorized" })).status, 403);
  assert.equal((await sendCorrection(secretaryCookie, { date: "2026-10-03", reason: "Unauthorized" })).status, 403);
  assert.equal((await sendCorrection(treasurerCookie, { date: "2026-10-03", reason: "   " })).status, 400, "a blank reason is rejected after trimming");

  const firstBody = { date: "2026-10-03", reason: "Receipt date was entered incorrectly" };
  const firstKey = crypto.randomUUID();
  const [firstResponse, concurrentReplay] = await Promise.all([
    sendCorrection(treasurerCookie, firstBody, firstKey),
    sendCorrection(treasurerCookie, firstBody, firstKey),
  ]);
  assert.equal(firstResponse.status, 200);
  assert.equal(concurrentReplay.status, 200);
  const first = (await firstResponse.json()).data;
  const replay = (await concurrentReplay.json()).data;
  assert.equal(first.audit.id, replay.audit.id, "concurrent retries with the same idempotency key reuse one audit event");
  assert.equal(first.audit.by.id, treasurer.id);
  assert.equal(first.audit.by.role, "treasurer");
  assert.ok(Number.isFinite(Date.parse(first.audit.at)), "the audit event has a timestamp");
  assert.equal(first.audit.oldDate, transaction.date);
  assert.equal(first.audit.newDate, firstBody.date);
  assert.equal(first.audit.reason, firstBody.reason);

  const chairCookie = await login(chair, "123456");
  const secondBody = { date: "2026-10-04", reason: "Verified against the original cash receipt" };
  const secondResponse = await sendCorrection(chairCookie, secondBody);
  assert.equal(secondResponse.status, 200);
  const second = (await secondResponse.json()).data;
  assert.equal(second.audit.by.id, chair.id);
  assert.equal(second.audit.by.role, "chairperson");
  assert.equal(second.audit.oldDate, firstBody.date);
  assert.equal(second.audit.newDate, secondBody.date);
  assert.equal(second.audit.reason, secondBody.reason);

  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const tomorrow = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const rejected = [
    [{ date: "2026-02-30", reason: "Invalid calendar date" }, 400],
    [{ date: tomorrow.toISOString().slice(0, 10), reason: "Future date" }, 400],
    [{ date: "2026-11-01", reason: "Cross-month change" }, 409],
    [{ date: "2026-10-06", reason: "Would change on-time status" }, 409],
    [{ date: secondBody.date, reason: "No actual date change" }, 409],
  ];
  for (const [body, status] of rejected) assert.equal((await sendCorrection(treasurerCookie, body)).status, status);

  const after = persistedState();
  const correctedTransaction = after.transactions.find(item => item.id === transaction.id);
  assert.deepEqual(correctedTransaction, { ...transaction, date: secondBody.date }, "amount, member, allocations, and other fields remain unchanged");
  assert.deepEqual(after.auditLog.slice(0, before.auditLog.length), before.auditLog, "corrections append audit entries without rewriting history");
  const correctionEvents = after.auditLog.filter(item => item.type === "contribution.date_corrected");
  assert.equal(correctionEvents.length, 2, "the concurrent idempotent retry must not duplicate an audit event");
});

test("receipt display preserves entered text while trimmed case-insensitive duplicates are rejected", async () => {
  const displayReference = "  MiXeD-Receipt-2026  ";
  const first = await contribute(thirdMember.id, { amount: 500, referenceNumber: displayReference, date: "2026-10-12" });
  assert.equal(first.status, 201);
  const transaction = (await first.json()).data;
  assert.equal(transaction.referenceNumber, displayReference);
  assert.equal(persistedState().transactions.find(item => item.id === transaction.id).referenceNumber, displayReference);

  const transactionCount = persistedState().transactions.length;
  const duplicate = await contribute(otherMember.id, { amount: 500, referenceNumber: "mixed-receipt-2026", date: "2026-10-12" });
  assert.equal(duplicate.status, 409);
  assert.equal(persistedState().transactions.length, transactionCount);
});

test("cash entry note validation rejects missing, short, and long notes and persists valid boundary notes", async () => {
  const beforeInvalid = persistedState();
  const invalidNotes = [
    ["missing", undefined],
    ["short", "ab"],
    ["long", "x".repeat(501)],
  ];
  for (const [label, note] of invalidNotes) {
    const response = await contribute(thirdMember.id, {
      amount: 500,
      note,
      referenceNumber: `RCPT-NOTE-${label.toUpperCase()}`,
      date: "2026-10-04",
    });
    assert.equal(response.status, 400, `${label} notes must be rejected`);
  }
  const afterInvalid = persistedState();
  assert.deepEqual(afterInvalid.transactions, beforeInvalid.transactions);
  assert.deepEqual(afterInvalid.auditLog, beforeInvalid.auditLog);

  for (const [referenceNumber, note] of [
    ["RCPT-MIN-NOTE", "abc"],
    ["RCPT-MAX-NOTE", "x".repeat(500)],
  ]) {
    const response = await contribute(thirdMember.id, { amount: 500, note, referenceNumber, date: "2026-10-04" });
    assert.equal(response.status, 201);
    const transaction = (await response.json()).data;
    assert.equal(transaction.note, note);
    const saved = persistedState();
    assert.equal(saved.transactions.find(item => item.id === transaction.id).note, note);
    const audit = saved.auditLog.find(item => item.type === "contribution.recorded" && item.entityId === transaction.id);
    assert.ok(audit, "successful cash entries are audited");
    assert.equal(audit.by.role, "treasurer");
  }
});

test("unsupported cash types and directions are rejected instead of recorded as inflows", async () => {
  const before = persistedState();
  for (const [index, paymentType] of ["Other Income", "Cash-out", "Unexpected", ""].entries()) {
    const response = await contribute(member.id, {
      amount: 500,
      paymentType,
      referenceNumber: `RCPT-UNSUPPORTED-${index}`,
      date: "2026-10-04",
    });
    assert.equal(response.status, 400, `unsupported type ${JSON.stringify(paymentType)} must be rejected`);
  }
  assert.equal((await postCash("/api/payments", {
    memberId: member.id, amount: 50, paymentType: "Other Income", method: "Cash", note: "Cash already received",
  })).status, 400);

  assert.equal((await contribute(member.id, {
    amount: 500, flowDirection: "out", referenceNumber: "RCPT-OUT-CONTRIBUTION", date: "2026-10-04",
  })).status, 400);
  assert.equal((await contribute(member.id, {
    amount: 500, flowDirection: "sideways", referenceNumber: "RCPT-UNKNOWN-DIRECTION", date: "2026-10-04",
  })).status, 400);
  assert.equal((await contribute(member.id, {
    amount: 500, cashOutType: "Expenses", referenceNumber: "RCPT-CASH-OUT", date: "2026-10-04",
  })).status, 400);
  assert.equal((await postCash("/api/payments", {
    memberId: member.id, amount: 50, paymentType: "Fine", method: "Cash", note: "Cash already received", flowDirection: "out",
  })).status, 400);
  assert.equal((await postCash("/api/loans/repay", {
    loanId: "missing-loan", amount: 50, paymentType: "Loan Repayment", method: "Cash", note: "Cash already received",
    referenceNumber: "RCPT-OUT-REPAYMENT", date: "2026-10-04", flowDirection: "out",
  })).status, 400);

  const after = persistedState();
  assert.deepEqual(after.transactions, before.transactions, "rejected cash types/directions must not create ledger rows");
  assert.deepEqual(after.auditLog, before.auditLog, "rejected cash types/directions must not create audit events");
});

test("cash-entry endpoints reject member IDs from a different chama", async () => {
  const before = persistedState();
  const contribution = await contribute(foreignMember.id, {
    amount: 500, referenceNumber: "RCPT-FOREIGN-CONTRIBUTION", date: "2026-10-04",
  });
  assert.equal(contribution.status, 404);
  const fine = await postCash("/api/payments", {
    memberId: foreignMember.id, amount: 50, paymentType: "Fine", method: "Cash", note: "Cash already received",
  });
  assert.equal(fine.status, 404);
  const after = persistedState();
  assert.deepEqual(after.transactions, before.transactions);
  assert.deepEqual(after.auditLog, before.auditLog);
});

test("a manual Fine cash entry persists its canonical note and audit event", async () => {
  const before = persistedState();
  const response = await postCash("/api/payments", {
    memberId: member.id, amount: 50, paymentType: "Fine", method: "Cash", note: "Fine cash received",
  });
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.paymentType, "Fine");
  assert.equal(transaction.note, "Fine cash received");
  const saved = persistedState();
  assert.equal(saved.transactions.length, before.transactions.length + 1);
  assert.deepEqual(saved.transactions.find(item => item.id === transaction.id), transaction);
  const audit = saved.auditLog.find(item => item.type === "payment.recorded" && item.entityId === transaction.id);
  assert.ok(audit, "manual cash entry must be audited");
  assert.equal(audit.by.id, treasurer.id);
  assert.equal(audit.amount, 50);
});

test("repeated contribution idempotency keys create only one transaction and audit event", async () => {
  const before = persistedState();
  const body = { amount: 500, note: "Cash received for the monthly contribution", referenceNumber: "RCPT-IDEMPOTENT-CASH", date: "2026-10-04" };
  const key = crypto.randomUUID();
  const [firstResponse, replayResponse] = await Promise.all([
    contribute(otherMember.id, body, key),
    contribute(otherMember.id, body, key),
  ]);
  assert.equal(firstResponse.status, 201);
  assert.equal(replayResponse.status, 201);
  const first = (await firstResponse.json()).data;
  const replay = (await replayResponse.json()).data;
  assert.equal(replay.id, first.id);
  const saved = persistedState();
  assert.equal(saved.transactions.length, before.transactions.length + 1);
  assert.equal(saved.transactions.filter(item => item.id === first.id).length, 1);
  assert.equal(saved.auditLog.filter(item => item.type === "contribution.recorded" && item.entityId === first.id).length, 1);
});

test("a legacy file gains the penalties ledger and member share capital", async () => {
  const saved = persistedState();
  assert.equal(saved.users.find(item => item.id === member.id).shareCapital, 1950);
  assert.equal(Array.isArray(saved.penalties), true);
});
