"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-security-batch-a-"));
const dataFile = path.join(tempDir, "data.json");
let serverProcess;
let baseUrl;
let chairCookie;
let borrowerCookie;
let aTreasurerCookie;
let bChairCookie;

function pinHash(pin, salt) {
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

function account(id, name, phone, role, chamaId, shareCapital = 0) {
  return { id, name, phone, role, status: "active", pinHash: pinHash("123456", `salt-${id}`), mustChangePin: false, shareCapital, chamaId, createdAt: "2026-09-01T08:00:00.000Z" };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function login(phone) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone, pin: "123456" }),
  });
  assert.equal(response.status, 200);
  return (response.headers.getSetCookie?.()[0] || response.headers.get("set-cookie")).split(";")[0];
}

before(async () => {
  fs.writeFileSync(dataFile, JSON.stringify({
    version: 2,
    chamas: [{ id: "chama-a", name: "Chama A", subscription: require("./active-subscription-fixture").activeSubscription() }, { id: "chama-b", name: "Chama B", subscription: require("./active-subscription-fixture").activeSubscription() }],
    users: [
      account("a-chair", "A Chair", "+254711100001", "chairperson", "chama-a"),
      account("a-secretary", "A Secretary", "+254711100005", "secretary", "chama-a"),
      account("a-election-winner", "A Election Winner", "+254711100006", "member", "chama-a"),
      account("a-borrower", "A Borrower", "+254711100002", "member", "chama-a", 1000),
      account("a-guarantor-1", "A Guarantor One", "+254711100003", "member", "chama-a", 1000),
      account("a-guarantor-2", "A Guarantor Two", "+254711100004", "member", "chama-a", 1000),
      account("b-chair", "B Chair", "+254711200001", "chairperson", "chama-b"),
    ],
    transactions: [
      { id: "a-cash", at: "2026-10-01T08:00:00.000Z", memberId: "a-chair", memberName: "A Chair", amount: 100, status: "confirmed", chamaId: "chama-a" },
      { id: "a-borrower-share", at: "2026-10-01T08:00:00.000Z", memberId: "a-borrower", memberName: "A Borrower", amount: 1000, paymentType: "Monthly Contribution", shareCapitalAmount: 1000, status: "confirmed", chamaId: "chama-a" },
      { id: "b-cash", at: "2026-10-01T08:00:00.000Z", memberId: "b-chair", memberName: "B Chair", amount: 500000, status: "confirmed", chamaId: "chama-b" },
    ],
    loans: [{ id: "b-pending-loan", chamaId: "chama-b", memberId: "b-chair", memberName: "B Chair", amount: 5000, status: "pending", approvalSteps: [] }], payouts: [], invitations: [], leadershipChanges: [{ id: "due-startup-election", type: "election", chamaId: "chama-a", role: "treasurer", status: "verified", winnerId: "a-election-winner", candidateIds: ["a-election-winner"], candidateNames: [{ id: "a-election-winner", name: "A Election Winner" }], activationAt: new Date(Date.now() - 1000).toISOString() }], pendingMpesas: [], idempotency: {},
    registers: [], auditLog: [
      { id: "a-loan-policy", type: "loan.policy.updated", chamaId: "chama-a", at: "2026-10-01T08:00:00.000Z", policy: { maxGroupCashPercent: 100, maxMemberContributionPercent: 1000, tiers: [{ maxAmountKsh: 5000, minActiveDays: 0, minShareContributionKsh: 0 }] } },
      { id: "b-loan-policy", type: "loan.policy.updated", chamaId: "chama-b", at: "2026-10-01T08:00:00.000Z", policy: { maxGroupCashPercent: 100, maxMemberContributionPercent: 1000, tiers: [{ maxAmountKsh: 5000, minActiveDays: 0, minShareContributionKsh: 0 }] } },
    ], penalties: [], welfareReserve: 0,
    settings: { defaultDeadlineDay: 5, meetingDates: {} }, dividendCycles: [], messages: [{ id: "b-private-message", chamaId: "chama-b", authorId: "b-chair", authorName: "B Chair", text: "SYNTHETIC-B-PRIVATE", at: "2026-10-01T08:00:00.000Z" }],
  }), "utf8");

  const port = await freePort();
  serverProcess = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "test", DATA_BACKEND: "json", PORT: String(port), SESSION_SECRET: "security-batch-a-test-session-secret", CHAMA_DATA_FILE: dataFile, AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" },
  });
  let output = "";
  serverProcess.stdout.on("data", chunk => { output += chunk; });
  serverProcess.stderr.on("data", chunk => { output += chunk; });
  baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 8000);
    const timer = setInterval(() => {
      if (output.includes(`localhost:${port}`)) { clearTimeout(timeout); clearInterval(timer); resolve(); }
    }, 20);
    serverProcess.once("exit", code => { clearTimeout(timeout); clearInterval(timer); reject(new Error(`Server exited with code ${code}. Output: ${output}`)); });
  });
  chairCookie = await login("+254711100001");
  borrowerCookie = await login("+254711100002");
  aTreasurerCookie = await login("+254711100006");
  bChairCookie = await login("+254711200001");
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Chama A automatic loan limit cannot use Chama B's balance", async () => {
  const loanResponse = await fetch(`${baseUrl}/api/loans`, {
    method: "POST",
    headers: { Cookie: borrowerCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ amount: 2000, months: 1, interestModel: "reducing", guarantorIds: ["a-guarantor-1", "a-guarantor-2"] }),
  });
  assert.equal(loanResponse.status, 201);
  const loan = (await loanResponse.json()).data;
  const loanId = loan.id;
  assert.equal(loan.status, "rejected");
  assert.match(loan.automatedDecision.reason, /group-balance limit is KES 1100/);

  const approval = await fetch(`${baseUrl}/api/loans/${loanId}/decisions`, {
    method: "POST",
    headers: { Cookie: chairCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ decision: "approve", reason: "Check funds for this chama" }),
  });
  assert.equal(approval.status, 409);
  const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(saved.loans.find(item => item.id === loanId).status, "rejected");
  assert.equal(saved.auditLog.find(item => item.type === "loan.decided" && item.entityId === loanId).criteria.groupBalance, 1100);
});

test("leadership elections reject outside-group candidates and voters, and overdue roles activate on startup", async () => {
  const secretaryCookie = await login("+254711100005");
  const outsiderCookie = await login("+254711200001");
  const secretaryDashboard = await fetch(`${baseUrl}/api/dashboard`, { headers: { Cookie: secretaryCookie } });
  assert.equal((await secretaryDashboard.json()).user.role, "secretary");

  const aDashboardResponse = await fetch(`${baseUrl}/api/dashboard`, { headers: { Cookie: chairCookie } });
  assert.equal(aDashboardResponse.status, 200);
  const aDashboard = await aDashboardResponse.json();
  assert.equal(aDashboard.members.find(user => user.id === "a-election-winner").role, "treasurer");
  const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(saved.leadershipChanges.find(item => item.id === "due-startup-election").status, "completed");
  assert.ok(saved.messages.some(item => item.recipientId === "a-chair" && item.text.includes("now the treasurer")));

  const write = (cookie, route, body) => fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const dateValues = Object.fromEntries(dateParts.map(part => [part.type, part.value]));
  const scheduledDate = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
  const foreignCandidateProposal = await write(secretaryCookie, "/api/leadership-elections", { role: "treasurer", candidateIds: ["a-guarantor-1", "b-chair"], scheduledDate });
  assert.equal(foreignCandidateProposal.status, 404);

  const proposal = await write(secretaryCookie, "/api/leadership-elections", { role: "treasurer", candidateIds: ["a-guarantor-1", "a-guarantor-2"], scheduledDate });
  assert.equal(proposal.status, 201);
  const electionId = (await proposal.json()).data.id;
  const accepted = await write(chairCookie, `/api/leadership-elections/${electionId}/accept`, {});
  assert.equal(accepted.status, 409);

  const outsideElections = await fetch(`${baseUrl}/api/leadership-elections`, { headers: { Cookie: outsiderCookie } });
  assert.deepEqual((await outsideElections.json()).data, []);
  const outsideVote = await write(outsiderCookie, `/api/leadership-elections/${electionId}/vote`, { candidateId: "a-guarantor-1" });
  assert.equal(outsideVote.status, 404);
  const insideElection = (await (await fetch(`${baseUrl}/api/leadership-elections`, { headers: { Cookie: chairCookie } })).json()).data.find(item => item.id === electionId);
  assert.equal(insideElection.votesCast, 0);
});

test("authenticated reads and writes remain isolated across chamas", async () => {
  const aPost = await fetch(`${baseUrl}/api/messages`, {
    method: "POST",
    headers: { Cookie: chairCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ text: "SYNTHETIC-A-PRIVATE", chamaId: "chama-b" }),
  });
  assert.equal(aPost.status, 201);
  assert.equal((await aPost.json()).data.chamaId, "chama-a", "tenant ownership must come from the authenticated account");
  const bPost = await fetch(`${baseUrl}/api/messages`, {
    method: "POST",
    headers: { Cookie: bChairCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ text: "SYNTHETIC-B-PRIVATE" }),
  });
  assert.equal(bPost.status, 201);

  const aMessages = (await (await fetch(`${baseUrl}/api/messages`, { headers: { Cookie: chairCookie } })).json()).data;
  const bMessages = (await (await fetch(`${baseUrl}/api/messages`, { headers: { Cookie: bChairCookie } })).json()).data;
  assert.ok(aMessages.some(item => item.text === "SYNTHETIC-A-PRIVATE"));
  assert.ok(!aMessages.some(item => item.text.includes("SYNTHETIC-B")));
  assert.ok(bMessages.some(item => item.text === "SYNTHETIC-B-PRIVATE"));
  assert.ok(!bMessages.some(item => item.text.includes("SYNTHETIC-A")));

  const aTransactions = (await (await fetch(`${baseUrl}/api/transactions`, { headers: { Cookie: chairCookie } })).json()).data;
  const bTransactions = (await (await fetch(`${baseUrl}/api/transactions`, { headers: { Cookie: bChairCookie } })).json()).data;
  assert.ok(aTransactions.some(item => item.id === "a-cash"));
  assert.ok(!aTransactions.some(item => item.id === "b-cash"));
  assert.ok(bTransactions.some(item => item.id === "b-cash"));
  const aLoans = (await (await fetch(`${baseUrl}/api/loans`, { headers: { Cookie: chairCookie } })).json()).data;
  assert.ok(!aLoans.some(item => item.id === "b-pending-loan"));

  const before = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const foreignContribution = await fetch(`${baseUrl}/api/contributions`, {
    method: "POST",
    headers: { Cookie: aTreasurerCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ memberId: "b-chair", amount: 500, method: "Cash", note: "Synthetic isolation check", referenceNumber: "QA-A-001", date: "2026-10-05" }),
  });
  assert.equal(foreignContribution.status, 404);
  const foreignCorrection = await fetch(`${baseUrl}/api/contributions/b-cash/correct-date`, {
    method: "POST",
    headers: { Cookie: chairCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ date: "2026-10-02", reason: "Synthetic foreign record correction check" }),
  });
  assert.equal(foreignCorrection.status, 404);
  const foreignDecision = await fetch(`${baseUrl}/api/loans/b-pending-loan/decisions`, {
    method: "POST",
    headers: { Cookie: chairCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ decision: "approve", reason: "Synthetic cross-tenant check" }),
  });
  assert.equal(foreignDecision.status, 409, "the retired vote endpoint is uniformly disabled and never edits the foreign loan");
  const after = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(after.transactions.length, before.transactions.length, "a foreign contribution must not create a ledger entry");
  assert.equal(after.loans.find(item => item.id === "b-pending-loan").status, "pending", "a foreign loan must remain unchanged");
  assert.equal(after.messages.find(item => item.text === "SYNTHETIC-B-PRIVATE").chamaId, "chama-b");
});
