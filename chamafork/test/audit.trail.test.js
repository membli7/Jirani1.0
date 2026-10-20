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

const chair = { id: "chair", name: "Test Chair", phone: "+254711000001", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false };
const treasurer = { id: "treasurer", name: "Test Treasurer", phone: "+254711000002", role: "treasurer", status: "active", pinHash: pinHash("234567"), mustChangePin: false };
const member = { id: "member", name: "Test Member", phone: "+254711000003", role: "member", status: "active", pinHash: pinHash("345678"), mustChangePin: false };
const secretary = { id: "secretary", name: "Test Secretary", phone: "+254711000004", role: "secretary", status: "active", pinHash: pinHash("456789"), mustChangePin: false };

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
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
});

test("loan requests and decisions write audit entries, newest first", async () => {
  const requested = await writeRequest("/api/loans", memberCookie, { amount: 1000, months: 1, guarantorIds: ["treasurer", "secretary"] });
  assert.equal(requested.status, 201);
  const loan = (await json(requested)).data;
  const rejected = await writeRequest(`/api/loans/${loan.id}/decisions`, chairCookie, { decision: "reject", reason: "Savings too low this cycle" });
  assert.equal(rejected.status, 200);

  const entries = (await json(await readAuditLog(chairCookie))).data;
  const decided = entries.findIndex(item => item.type === "loan.decided" && item.entityId === loan.id);
  const requestedIndex = entries.findIndex(item => item.type === "loan.requested" && item.entityId === loan.id);
  assert.ok(decided >= 0 && requestedIndex >= 0, "both loan events should be audited");
  assert.ok(decided < requestedIndex, "newest entries come first");
  assert.equal(entries[decided].decision, "reject");
  assert.equal(entries[decided].status, "rejected");
  assert.equal(entries[decided].by.role, "chairperson");
  assert.equal(entries[requestedIndex].by.id, member.id);
});

test("officer appointments write audit entries when proposed", async () => {
  const response = await writeRequest("/api/leadership-changes", chairCookie, { role: "secretary", incomingUserId: member.id, effectiveDate: "2026-10-12" });
  assert.equal(response.status, 201);
  const record = (await json(response)).data;
  const entries = (await json(await readAuditLog(chairCookie))).data;
  const entry = entries.find(item => item.entityId === record.id);
  assert.ok(entry, "leadership change should be audited");
  assert.equal(entry.role, "secretary");
  assert.equal(entry.incomingUserId, member.id);
});

test("the audit log is append-only in the saved data", async () => {
  const beforeWrite = JSON.parse(fs.readFileSync(dataFile, "utf8")).auditLog;
  await writeRequest("/api/loans", memberCookie, { amount: 200, months: 2, guarantorIds: ["treasurer", "secretary"] });
  const afterWrite = JSON.parse(fs.readFileSync(dataFile, "utf8")).auditLog;
  assert.equal(afterWrite.length, beforeWrite.length + 1);
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
  assert.match(page, /<section class="panel" id="audit-panel"[^>]*hidden>/);
  assert.match(page, /id="audit-notice"[^>]*hidden/);
  const script = await (await fetch(`${baseUrl}/chama.js`)).text();
  assert.match(script, /api\("\/api\/audit-log", \{ silentForbidden: true \}\)/);
  assert.match(script, /You do not have permission to view the audit log\./);
});
