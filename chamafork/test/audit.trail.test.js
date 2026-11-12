"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-audit-test-"));
const dataFile = path.join(tempDir, "data.json");
let port;
let serverProcess;
let baseUrl;
let chairCookie;
let treasurerCookie;
let memberCookie;

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

const chair = { id: "chair", name: "Test Chair", phone: "+254711000001", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };
const treasurer = { id: "treasurer", name: "Test Treasurer", phone: "+254711000002", role: "treasurer", status: "active", pinHash: pinHash("234567"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };
const member = { id: "member", name: "Test Member", phone: "+254711000003", role: "member", status: "active", pinHash: pinHash("345678"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };
const secretary = { id: "secretary", name: "Test Secretary", phone: "+254711000004", role: "secretary", status: "active", pinHash: pinHash("456789"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  chamas: [{ id: "test-chama", name: "Test Chama", subscription: require("./active-subscription-fixture").activeSubscription() }],
  users: [chair, treasurer, member, secretary],
  transactions: [],
  loans: [],
  payouts: [],
  invitations: [],
  leadershipChanges: [],
  pendingMpesas: [],
  idempotency: {},
  registers: [],
  auditLog: [],
}));

function json(response) {
  return response.json();
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

function writeRequest(route, cookie, body, method = "POST") {
  return fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
}

function readAuditLog(cookie) {
  return fetch(`${baseUrl}/api/audit-log`, { headers: { Cookie: cookie } });
}

before(async () => {
  port = await new Promise((resolve, reject) => {
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
      SESSION_SECRET: "audit-test-session-secret",
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
  chairCookie = await login(chair, "123456");
  treasurerCookie = await login(treasurer, "234567");
  memberCookie = await login(member, "345678");
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("only the Chairperson and Treasurer can read the audit log", async () => {
  assert.equal((await readAuditLog(chairCookie)).status, 200);
  assert.equal((await readAuditLog(treasurerCookie)).status, 200);
  assert.equal((await readAuditLog(memberCookie)).status, 403);
  const secretaryCookie = await login(secretary, "456789");
  assert.equal((await readAuditLog(secretaryCookie)).status, 403);
});

test("the audit log has no write routes", async () => {
  const post = await writeRequest("/api/audit-log", chairCookie, { type: "forged" });
  assert.equal(post.status, 404);
  const put = await writeRequest("/api/audit-log", chairCookie, { type: "forged" }, "PUT");
  assert.equal(put.status, 404);
  const remove = await writeRequest("/api/audit-log", chairCookie, {}, "DELETE");
  assert.equal(remove.status, 404);
});

test("a recorded contribution writes an audit entry naming the Treasurer", async () => {
  const response = await writeRequest("/api/contributions", treasurerCookie, { memberId: member.id, amount: 500, method: "Cash", note: "Pilot cash payment", referenceNumber: "RCPT-0500", date: "2026-10-05" });
  assert.equal(response.status, 201);
  const transaction = (await json(response)).data;
  const entries = (await json(await readAuditLog(chairCookie))).data;
  const entry = entries.find(item => item.type === "contribution.recorded" && item.entityId === transaction.id);
  assert.ok(entry, "payment should be audited");
  assert.deepEqual(entry.by, { id: treasurer.id, name: treasurer.name, role: "treasurer" });
  assert.equal(entry.amount, 500);
  assert.equal(entry.memberId, member.id);
  assert.ok(entry.at);
});

test("members need share capital and guarantors to borrow", async () => {
  for (const [memberId, reference] of [["member", "RCPT-0301"], ["treasurer", "RCPT-0302"], ["secretary", "RCPT-0303"]]) {
    const credit = await writeRequest("/api/contributions", treasurerCookie, { memberId, amount: 5000, method: "Cash", note: "Share capital for loan tests", referenceNumber: reference, date: "2026-10-05" });
    assert.equal(credit.status, 201);
  }
  const policy = await writeRequest("/api/loans/policy", chairCookie, { maxGroupCashPercent: 100, maxMemberContributionPercent: 300, tiers: [{ maxAmountKsh: 10000, minActiveDays: 0, minShareContributionKsh: 0 }] });
  assert.equal(policy.status, 200);
});

test("loan requests receive an automatic decision and write both audit entries, newest first", async () => {
  const requested = await writeRequest("/api/loans", memberCookie, { amount: 1000, months: 1, guarantorIds: ["treasurer", "secretary"] });
  assert.equal(requested.status, 201);
  const loan = (await json(requested)).data;
  assert.equal(loan.status, "approved");
  assert.equal(loan.automatedDecision.decision, "approve");
  const obsoleteVote = await writeRequest(`/api/loans/${loan.id}/decisions`, chairCookie, { decision: "reject", reason: "Role votes are disabled." });
  assert.equal(obsoleteVote.status, 409);

  const entries = (await json(await readAuditLog(chairCookie))).data;
  const decided = entries.findIndex(item => item.type === "loan.decided" && item.entityId === loan.id);
  const requestedIndex = entries.findIndex(item => item.type === "loan.requested" && item.entityId === loan.id);
  assert.ok(decided >= 0 && requestedIndex >= 0, "both loan events should be audited");
  assert.ok(decided < requestedIndex, "newest entries come first");
  assert.equal(entries[decided].decision, "approve");
  assert.equal(entries[decided].decisionSource, "automated");
  assert.equal(entries[decided].status, "approved");
  assert.equal(entries[decided].by.role, "member", "the audit identifies the applicant while separately marking the decision source");
  assert.equal(entries[requestedIndex].by.id, member.id);
});

test("direct officer assignment is limited to initial setup", async () => {
  const response = await writeRequest("/api/leadership-changes", chairCookie, { role: "secretary", incomingUserId: member.id, effectiveDate: "2026-10-12" });
  assert.equal(response.status, 409);
  assert.match((await json(response)).message, /member election/i);
});

test("the audit log is append-only in the saved data", async () => {
  const beforeWrite = JSON.parse(fs.readFileSync(dataFile, "utf8")).auditLog;
  await writeRequest("/api/loans", memberCookie, { amount: 200, months: 2, guarantorIds: ["treasurer", "secretary"] });
  const afterWrite = JSON.parse(fs.readFileSync(dataFile, "utf8")).auditLog;
  assert.equal(afterWrite.length, beforeWrite.length + 2, "a request and its automatic decision are separate audit events");
  for (const entry of beforeWrite) {
    assert.deepEqual(afterWrite.find(item => item.id === entry.id), entry);
  }
});

test("dashboard shows the audit panel only to the Chairperson and Treasurer", async () => {
  const permissionsFor = async cookie => (await json(await fetch(`${baseUrl}/api/dashboard`, { headers: { Cookie: cookie } }))).permissions;
  assert.equal((await permissionsFor(chairCookie)).viewAuditLog, true);
  assert.equal((await permissionsFor(treasurerCookie)).viewAuditLog, true);
  assert.equal((await permissionsFor(memberCookie)).viewAuditLog, false);
  assert.equal((await permissionsFor(await login(secretary, "456789"))).viewAuditLog, false);
});

test("audit viewer is hidden by default and handles a 403 without the global permission notice", async () => {
  const page = await (await fetch(`${baseUrl}/`)).text();
  assert.match(page, /<div id="root"><\/div>/);
  const dashboardTemplate = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "index.html"), "utf8");
  assert.match(dashboardTemplate, /<section class="panel" id="audit-panel"[^>]*hidden>/);
  assert.match(dashboardTemplate, /id="react-audit-root"/);
  const auditPanel = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "react", "src", "components", "AuditLogPanel.jsx"), "utf8");
  const auditActions = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "react", "src", "auditActions.mjs"), "utf8");
  assert.match(auditPanel, /permissions\?\.viewAuditLog === true/);
  assert.match(auditPanel, /You do not have permission to view the audit log\./);
  assert.match(auditActions, /\/api\/audit-log/);
  const script = await (await fetch(`${baseUrl}/chama.js`)).text();
  assert.doesNotMatch(script, /api\("\/api\/audit-log/);
});
