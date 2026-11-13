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
let primaryLoanId;
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
  { id: "rate-b", name: "Other Chama Chair", phone: "+254711000010", role: "chairperson", pin: "012345", shareCapital: 0, chamaId: "other-chama" },
];

// A fixed cash balance, so approvals are never blocked by group funds.
const seedTransaction = { id: "seed-cash", at: "2026-09-01T08:00:00.000Z", memberId: "chair", memberName: "Test Chair", amount: 100000, method: "Cash", paymentType: "Monthly Contribution", note: "Opening cash", status: "confirmed", source: "manual-cash", recordedBy: "treasurer", loanId: null, welfareAmount: 0, shareCapitalAmount: 0, penaltyAmount: 0, contributionMonth: "2026-09", referenceNumber: "CROSS-TYPE-3000" };
const baselineLoanPolicy = {
  maxGroupCashPercent: 100,
  maxMemberContributionPercent: 300,
  tiers: [
    { maxAmountKsh: 500, minActiveDays: 0, minShareContributionKsh: 0 },
    { maxAmountKsh: 10000, minActiveDays: 30, minShareContributionKsh: 500 },
  ],
};

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  chamas: [
    { id: "test-chama", name: "Test Chama", subscription: require("./active-subscription-fixture").activeSubscription() },
    { id: "other-chama", name: "Other Chama", settings: { loanMonthlyRatePercent: 2.5 }, subscription: require("./active-subscription-fixture").activeSubscription() },
  ],
  users: people.map(person => ({ id: person.id, name: person.name, phone: person.phone, role: person.role, status: "active", pinHash: pinHash(person.pin), mustChangePin: false, shareCapital: person.shareCapital, chamaId: person.chamaId || "test-chama", createdAt: "2026-09-01T08:00:00.000Z" })),
  transactions: [seedTransaction, ...people.filter(person => person.shareCapital > 0).map((person, index) => ({ id: `seed-share-${person.id}`, at: "2026-09-01T08:00:00.000Z", memberId: person.id, memberName: person.name, amount: person.shareCapital, method: "Cash", paymentType: "Monthly Contribution", note: "Seed share capital", status: "confirmed", source: "manual-cash", recordedBy: "treasurer", loanId: null, welfareAmount: 0, shareCapitalAmount: person.shareCapital, penaltyAmount: 0, contributionMonth: "2026-09", referenceNumber: `TEST-SHARE-${index + 1}` }))],
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
  settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 7.5, meetingDates: {} },
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

async function setLoanPolicy(policy) {
  const response = await post("/api/loans/policy", cookies.chair, policy);
  assert.equal(response.status, 200);
  return (await response.json()).data;
}

test("guarantor choices expose only active same-group member names", async () => {
  const response = await fetch(`${baseUrl}/api/loans/guarantors`, { headers: { Cookie: cookies.borrower, "X-Requested-With": "chama" } });
  assert.equal(response.status, 200);
  const ids = (await response.json()).data.map(member => member.id);
  assert.ok(ids.includes("g1"));
  assert.ok(!ids.includes("borrower"));
});

test("repayment estimates require a session, use the caller's Chama rate, and reject hidden model overrides", async () => {
  const a = await fetch(`${baseUrl}/api/loans/estimate?amount=10000&months=3`, { headers: { Cookie: cookies.borrower } });
  assert.equal(a.status, 200);
  assert.equal(a.headers.get("cache-control"), "no-store");
  const estimateA = (await a.json()).data;
  assert.equal(estimateA.monthlyRatePercent, 7.5);
  assert.equal(estimateA.interestModel, "reducing");
  assert.equal(estimateA.schedule.length, 3);
  assert.equal(estimateA.totalPayable, estimateA.schedule.reduce((sum, row) => sum + row.installment, 0));
  assert.ok(estimateA.totalInterest > 0);

  const b = await fetch(`${baseUrl}/api/loans/estimate?amount=10000&months=3`, { headers: { Cookie: cookies["rate-b"] } });
  assert.equal(b.status, 200);
  assert.equal((await b.json()).data.monthlyRatePercent, 2.5);

  const unauthenticated = await fetch(`${baseUrl}/api/loans/estimate?amount=10000&months=3`);
  assert.equal(unauthenticated.status, 401);
  const invalid = await fetch(`${baseUrl}/api/loans/estimate?amount=0&months=3`, { headers: { Cookie: cookies.borrower } });
  assert.equal(invalid.status, 400);

  const existingCount = persistedState().loans.length;
  const hiddenModel = await requestLoan(cookies.borrower, { amount: 100, months: 1, guarantorIds: ["g1", "g2"], interestModel: "flat" });
  assert.equal(hiddenModel.status, 400);
  assert.equal(persistedState().loans.length, existingCount);
  for (let index = 0; index < 58; index += 1) {
    const repeated = await fetch(`${baseUrl}/api/loans/estimate?amount=10000&months=3`, { headers: { Cookie: cookies.borrower } });
    assert.equal(repeated.status, 200);
  }
  const throttled = await fetch(`${baseUrl}/api/loans/estimate?amount=10000&months=3`, { headers: { Cookie: cookies.borrower } });
  assert.equal(throttled.status, 429);
  const otherMemberStillAllowed = await fetch(`${baseUrl}/api/loans/estimate?amount=10000&months=3`, { headers: { Cookie: cookies["rate-b"] } });
  assert.equal(otherMemberStillAllowed.status, 200);
});

function decide(loanId, cookie, decision) {
  return post(`/api/loans/${loanId}/decisions`, cookie, { decision, reason: "Reviewed against the savings and guarantors" });
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

function todayInNairobi() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
}

function tomorrowInNairobi() {
  const date = new Date(`${todayInNairobi()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
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
    env: { ...process.env, NODE_ENV: "test", DATA_BACKEND: "json", PORT: String(port), SESSION_SECRET: "loans-test-session-secret", CHAMA_DATA_FILE: dataFile, AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" },
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
  await setLoanPolicy(baselineLoanPolicy);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("reducing balance: eligible KES 1,000 request is decided automatically under the configured rules", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 1000, months: 2, interestModel: "reducing", guarantorIds: ["g1", "g2"] });
  assert.equal(response.status, 201);
  const loan = (await response.json()).data;
  primaryLoanId = loan.id;
  assert.equal(loan.status, "approved");
  assert.equal(loan.approvalCount, 0);
  assert.equal(loan.requiredApprovals, 0);
  assert.equal(loan.automatedDecision.decision, "approve");
  assert.deepEqual(loanById(loan.id).guarantors, [{ memberId: "g1", pledged: 1000, held: 1000 }, { memberId: "g2", pledged: 0, held: 0 }]);
  // At 7.5%, each equal installment is KES 557 after rounding.
  assert.deepEqual(loan.schedule.map(row => row.installment), [557, 557]);
  assert.deepEqual(loan.schedule.map(row => row.interest), [75, 39]);
  assert.deepEqual(loan.schedule.map(row => row.principal), [482, 518]);
  assert.equal(loan.totalPayable, 1114);
  assert.equal(loan.outstanding, 1114);
});

test("new loans use the disclosed reducing model and preserve the Chama rate snapshot", async () => {
  const response = await requestLoan(cookies.richer, { amount: 1000, months: 2, guarantorIds: ["g2", "g3"] });
  assert.equal(response.status, 201);
  const loan = (await response.json()).data;
  assert.equal(loan.status, "approved");
  assert.equal(loan.interestModel, "reducing");
  assert.equal(loan.monthlyRatePercent, 7.5);
  assert.deepEqual(loan.schedule.map(row => row.interest), [75, 39]);
  assert.deepEqual(loan.schedule.map(row => row.principal), [482, 518]);
  assert.deepEqual(loan.schedule.map(row => row.installment), [557, 557]);
  assert.equal(loan.totalPayable, 1114);
  assert.equal(loanById(loan.id).monthlyRatePercent, 7.5);
});

test("member contribution limits are configurable and reduce by existing principal", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 2001, months: 1, guarantorIds: ["g3", "g4"] });
  assert.equal(response.status, 201);
  const loan = (await response.json()).data;
  assert.equal(loan.status, "rejected");
  assert.match(loan.automatedDecision.reason, /remaining member-contribution limit is KES 2000/);
});

test("a request at the member limit still needs guarantors that cover the principal", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 2000, months: 1, guarantorIds: ["g3", "g4"] });
  assert.equal(response.status, 201);
  const loan = (await response.json()).data;
  assert.equal(loan.status, "rejected", "g3 and g4 have only KES 600 combined unpledged share capital");
  assert.match(loan.automatedDecision.reason, /does not cover/);
});

test("a loan needs exactly two different guarantors who are not the borrower", async () => {
  assert.equal((await requestLoan(cookies.borrower, { amount: 500, months: 1, guarantorIds: ["g3"] })).status, 400);
  assert.equal((await requestLoan(cookies.borrower, { amount: 500, months: 1, guarantorIds: ["g3", "g3"] })).status, 400);
  assert.equal((await requestLoan(cookies.borrower, { amount: 500, months: 1, guarantorIds: ["borrower", "g3"] })).status, 400);
  assert.equal((await requestLoan(cookies.borrower, { amount: 500, months: 1, guarantorIds: ["g3", "nobody"] })).status, 400);
});

test("insufficient guarantor capacity produces a visible automatic rejection", async () => {
  const response = await requestLoan(cookies.borrower, { amount: 1000, months: 1, guarantorIds: ["g3", "g4"] });
  assert.equal(response.status, 201);
  const loan = (await response.json()).data;
  assert.equal(loan.status, "rejected");
  assert.match(loan.automatedDecision.reason, /does not cover/);
});

test("pledged share capital stays locked for other loans until repaid", async () => {
  // g1's KES 1,000 is pledged to the first approved loan above, so g1 has nothing left to back KES 500.
  assert.equal(unpledged("g1"), 0);
  const response = await requestLoan(cookies.richer, { amount: 500, months: 1, guarantorIds: ["g1", "g3"] });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).data.status, "rejected");
});

test("human review records an independent upheld result and makes the written history visible without changing a loan", async () => {
  const loanId = primaryLoanId;
  const before = structuredClone(loanById(loanId));
  const invalidRequest = await post(`/api/loans/${loanId}/review-requests`, cookies.borrower, { reason: { text: "Please review my records." } });
  assert.equal(invalidRequest.status, 400, "review request explanations must be strings");
  const tooLongRequest = await post(`/api/loans/${loanId}/review-requests`, cookies.borrower, { reason: "x".repeat(1001) });
  assert.equal(tooLongRequest.status, 400, "review request explanations are bounded");

  const reviewRequest = await post(`/api/loans/${loanId}/review-requests`, cookies.borrower, { reason: "Please consider my explanation and the contribution receipt details." });
  assert.equal(reviewRequest.status, 201);
  const pending = (await reviewRequest.json()).data;
  assert.equal(pending.humanReview.status, "requested");
  assert.deepEqual(pending.humanReview.history.map(item => item.stage), ["requested"]);

  const reviewerInput = {
    outcome: "upheld",
    memberExplanationConsidered: true,
    noConflictOfInterest: true,
    informationConsidered: "Member explanation, original automated-decision record, and the Chama contribution ledger.",
    reason: "The member's stated records support the original decision and no discrepancy was found in the entries reviewed.",
  };
  const memberAttempt = await post(`/api/loans/${loanId}/reviews`, cookies.richer, reviewerInput);
  assert.equal(memberAttempt.status, 403, "a non-officer cannot submit a review result");
  const otherChamaAttempt = await post(`/api/loans/${loanId}/reviews`, cookies["rate-b"], reviewerInput);
  assert.equal(otherChamaAttempt.status, 404, "a reviewer in another Chama cannot access this loan");

  const review = await post(`/api/loans/${loanId}/reviews`, cookies.chair, reviewerInput);
  assert.equal(review.status, 200);
  const result = (await review.json()).data;
  assert.equal(result.status, "approved");
  assert.equal(result.humanReview.status, "completed");
  assert.equal(result.humanReview.response.outcome, "upheld");
  assert.equal(result.humanReview.response.noConflictOfInterest, true);
  assert.equal(result.humanReview.response.reviewerName, "Test Chair");
  assert.equal(result.humanReview.response.informationConsidered, reviewerInput.informationConsidered);
  assert.equal(result.humanReview.response.reason, reviewerInput.reason);
  assert.deepEqual(loanById(loanId), before, "review must not mutate status, schedules, balances, or guarantor holds");

  const completed = persistedState().auditLog.find(item => item.type === "loan.review.completed" && item.entityId === loanId);
  assert.equal(completed.by.id, "chair");
  assert.equal(completed.by.role, "chairperson");
  assert.equal(completed.outcome, "upheld");
  assert.equal(completed.noConflictOfInterest, true);
  assert.equal(completed.informationConsidered, reviewerInput.informationConsidered);
  assert.equal(completed.reasoning, reviewerInput.reason);
  assert.equal(completed.originalDecision, "approve");
  assert.equal(completed.resultingStatus, before.status);

  const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, { headers: { Cookie: cookies.borrower } });
  assert.equal(dashboardResponse.status, 200);
  const borrowerDashboard = await dashboardResponse.json();
  const borrowerLoan = borrowerDashboard.loans.find(item => item.id === loanId);
  assert.equal(borrowerLoan.humanReview.status, "completed");
  assert.deepEqual(borrowerLoan.humanReview.history.map(item => item.stage), ["requested", "completed"]);
  assert.equal(borrowerLoan.humanReview.history[1].outcome, "upheld");
  assert.equal(borrowerLoan.humanReview.history[1].noConflictOfInterest, true);
  assert.equal(borrowerLoan.humanReview.history[1].reason, reviewerInput.reason);
  const reviewNotice = borrowerDashboard.notifications.find(item => item.title === "Human loan review completed");
  assert.ok(reviewNotice, "the borrower receives an in-app written review result");
  assert.match(reviewNotice.text, /original automated decision was upheld/);
  assert.ok(reviewNotice.text.includes(reviewerInput.reason));
});

test("borrowers and guarantors who are officers cannot review their own loan decision", async () => {
  const chairLoanResponse = await requestLoan(cookies.chair, { amount: 100, months: 1, guarantorIds: ["g1", "g2"] });
  assert.equal(chairLoanResponse.status, 201);
  const chairLoan = (await chairLoanResponse.json()).data;
  assert.equal(chairLoan.status, "rejected");
  assert.equal((await post(`/api/loans/${chairLoan.id}/review-requests`, cookies.chair, { reason: "Please consider my records and explanation." })).status, 201);
  const reviewerInput = {
    outcome: "upheld", memberExplanationConsidered: true,
    noConflictOfInterest: true,
    informationConsidered: "The member explanation and the recorded eligibility decision.",
    reason: "The available information supports upholding the original automated decision.",
  };
  assert.equal((await post(`/api/loans/${chairLoan.id}/reviews`, cookies.chair, reviewerInput)).status, 403);

  const guarantorLoanResponse = await requestLoan(cookies.borrower, { amount: 2000, months: 1, guarantorIds: ["chair", "g2"] });
  assert.equal(guarantorLoanResponse.status, 201);
  const guarantorLoan = (await guarantorLoanResponse.json()).data;
  assert.equal(guarantorLoan.status, "rejected");
  assert.equal((await post(`/api/loans/${guarantorLoan.id}/review-requests`, cookies.borrower, { reason: "Please consider my records and explanation." })).status, 201);
  assert.equal((await post(`/api/loans/${guarantorLoan.id}/reviews`, cookies.chair, reviewerInput)).status, 403);
});

test("a reviewer can reach a different human finding from the automated rules without changing the rejected loan", async () => {
  await setLoanPolicy({ ...baselineLoanPolicy, tiers: [baselineLoanPolicy.tiers[0], { ...baselineLoanPolicy.tiers[1], minShareContributionKsh: 5000 }] });
  const response = await requestLoan(cookies.borrower, { amount: 1200, months: 1, guarantorIds: ["richer", "g4"] });
  assert.equal(response.status, 201);
  const rejected = (await response.json()).data;
  assert.equal(rejected.status, "rejected");
  assert.match(rejected.automatedDecision.reason, /requires KES 5000 in recorded share-capital contributions/);
  assert.equal(memberHeld(loanById(rejected.id), "g4"), 0, "rejected applications must not hold guarantor shares");
  const before = structuredClone(loanById(rejected.id));

  const reviewRequest = await post(`/api/loans/${rejected.id}/review-requests`, cookies.borrower, { reason: "Please consider my explanation and the contribution receipt details." });
  assert.equal(reviewRequest.status, 201);
  assert.equal((await decide(rejected.id, cookies.chair, "approve")).status, 409, "role votes are no longer available");
  const validReviewerInput = {
    outcome: "not_upheld",
    memberExplanationConsidered: true,
    noConflictOfInterest: true,
    informationConsidered: "Member explanation, the original decision record, and the submitted receipt details.",
    reason: "The explanation and receipt show that the recorded contribution value should not determine this human review result.",
  };
  assert.equal((await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, { ...validReviewerInput, outcome: "reassess" })).status, 400);
  assert.equal((await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, { ...validReviewerInput, memberExplanationConsidered: false })).status, 400);
  assert.equal((await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, { ...validReviewerInput, noConflictOfInterest: false })).status, 400);
  assert.equal((await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, { ...validReviewerInput, informationConsidered: ["not", "text"] })).status, 400);
  assert.equal((await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, { ...validReviewerInput, informationConsidered: "no" })).status, 400);
  assert.equal((await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, { ...validReviewerInput, informationConsidered: "x".repeat(2001) })).status, 400);
  assert.equal((await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, { ...validReviewerInput, reason: "Too short." })).status, 400);
  assert.equal((await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, { ...validReviewerInput, reason: "x".repeat(2001) })).status, 400);

  const review = await post(`/api/loans/${rejected.id}/reviews`, cookies.chair, validReviewerInput);
  assert.equal(review.status, 200);
  const reviewed = (await review.json()).data;
  assert.equal(reviewed.status, "rejected");
  assert.equal(reviewed.humanReview.response.outcome, "not_upheld");
  assert.equal(reviewed.humanReview.response.reason, validReviewerInput.reason);
  assert.deepEqual(loanById(rejected.id), before, "an independent review result must not itself change any loan fields");
  const completed = persistedState().auditLog.find(item => item.type === "loan.review.completed" && item.entityId === rejected.id);
  assert.equal(completed.originalDecision, "reject");
  assert.equal(completed.outcome, "not_upheld");
  assert.equal(completed.resultingStatus, "rejected");
  assert.equal(persistedState().auditLog.filter(item => item.type === "loan.decided" && item.entityId === rejected.id).length, 1);
});

test("repayments split interest first, then release pledges as principal falls", async () => {
  const loanId = primaryLoanId;
  const first = await post("/api/loans/repay", cookies.treasurer, { loanId, amount: 538, method: "Cash", note: "First installment", referenceNumber: "RCPT-3001", date: todayInNairobi() });
  assert.equal(first.status, 201);
  const transaction = (await first.json()).data;
  assert.equal(transaction.interestAmount, 75);
  assert.equal(transaction.principalAmount, 463);

  const loan = loanById(loanId);
  assert.equal(loan.outstanding, 576);
  assert.equal(loan.schedule[0].paidInterest, 75);
  assert.equal(loan.schedule[0].paidPrincipal, 463);
  // 537 of principal remains, so g1's 1,000 pledge shrinks to 537.
  assert.equal(memberHeld(loan, "g1"), 537);
  assert.equal(unpledged("g1"), 463);
  assert.ok(persistedState().auditLog.some(item => item.type === "pledge.released" && item.loanId === loanId && item.amount === 463));
});

test("repayment dates reject impossible calendar values and future dates without changing the loan", async () => {
  const loanId = primaryLoanId;
  const before = persistedState();
  const beforeLoan = loanById(loanId);
  for (const [index, date] of ["2026-02-30", "2025-02-29", "2026-2-09"].entries()) {
    const response = await post("/api/loans/repay", cookies.treasurer, {
      loanId, amount: 1, method: "Cash", note: "Invalid date attempt", referenceNumber: `INVALID-DATE-${index}`, date,
    });
    assert.equal(response.status, 400, `expected ${date} to be rejected`);
  }
  const future = await post("/api/loans/repay", cookies.treasurer, {
    loanId, amount: 1, method: "Cash", note: "Future date attempt", referenceNumber: "FUTURE-DATE-3000", date: tomorrowInNairobi(),
  });
  assert.equal(future.status, 400);
  assert.equal(loanById(loanId).outstanding, beforeLoan.outstanding);
  assert.equal(persistedState().transactions.length, before.transactions.length);
});

test("a contribution receipt cannot be reused for a loan repayment after trimming and case-folding", async () => {
  const loanId = primaryLoanId;
  const outstanding = loanById(loanId).outstanding;
  const transactionCount = persistedState().transactions.length;
  const response = await post("/api/loans/repay", cookies.treasurer, {
    loanId, amount: 1, method: "Cash", note: "Duplicate receipt attempt", referenceNumber: "  cross-type-3000  ", date: "2026-10-05",
  });
  assert.equal(response.status, 409);
  assert.equal(loanById(loanId).outstanding, outstanding);
  assert.equal(persistedState().transactions.length, transactionCount);
});

test("overpaying a loan is rejected", async () => {
  const loanId = primaryLoanId;
  const response = await post("/api/loans/repay", cookies.treasurer, { loanId, amount: 600, method: "Cash", note: "Too much", referenceNumber: "RCPT-3002", date: "2026-10-05" });
  assert.equal(response.status, 400);
  assert.equal(loanById(loanId).outstanding, 576);
});

test("the final repayment closes the loan and releases every pledge", async () => {
  const loanId = primaryLoanId;
  const response = await post("/api/loans/repay", cookies.treasurer, { loanId, amount: 576, method: "Cash", note: "Final installment", referenceNumber: "RCPT-3003", date: "2026-11-05" });
  assert.equal(response.status, 201);
  const loan = loanById(loanId);
  assert.equal(loan.status, "repaid");
  assert.equal(loan.outstanding, 0);
  assert.equal(memberHeld(loan, "g1"), 0);
  assert.equal(unpledged("g1"), 1000);
});

test("loan requests, decisions, repayments, and releases are audited", async () => {
  const saved = persistedState();
  const loanId = primaryLoanId;
  const types = saved.auditLog.filter(item => item.entityId === loanId || item.loanId === loanId).map(item => item.type);
  assert.ok(types.includes("loan.requested"));
  assert.equal(types.filter(type => type === "loan.decided").length, 1);
  assert.equal(types.filter(type => type === "loan.repaid").length, 2);
  assert.ok(types.includes("pledge.released"));
  const requested = saved.auditLog.find(item => item.type === "loan.requested" && item.entityId === loanId);
  assert.equal(requested.by.id, "borrower");
  assert.equal(requested.interestModel, "reducing");
  assert.equal(saved.loans.find(item => item.id === loanId).approvals.map(item => item.role).join(","), "automated");
  assert.equal(saved.auditLog.find(item => item.type === "loan.decided" && item.entityId === loanId).decisionSource, "automated");
});
