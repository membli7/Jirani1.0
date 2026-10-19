"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-idempotency-test-"));
const dataFile = path.join(tempDir, "data.json");
let port;
let serverProcess;

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

const chair = { id: "chair", name: "Test Chair", phone: "+254711000001", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false };
const treasurer = { id: "treasurer", name: "Test Treasurer", phone: "+254711000002", role: "treasurer", status: "active", pinHash: pinHash("234567"), mustChangePin: false };
const member = { id: "member", name: "Test Member", phone: "+254711000003", role: "member", status: "active", pinHash: pinHash("345678"), mustChangePin: false };
const expiredKey = crypto.randomUUID();
const expiredBody = { memberId: member.id, amount: 500, paymentType: "Monthly Contribution", method: "Cash", note: "Pilot cash payment", referenceNumber: "RCPT-0900", date: "2026-10-01" };
const expiredAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
const expiredRecord = { id: "old-transaction", at: expiredAt, memberId: member.id, memberName: member.name, amount: 500, method: "Cash", paymentType: "Monthly Contribution", note: expiredBody.note, loanId: null, recordedBy: treasurer.id, recordedByName: treasurer.name, source: "manual-cash", status: "confirmed" };

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  users: [chair, treasurer, member],
  transactions: [expiredRecord],
  loans: [{ id: "loan", memberId: member.id, memberName: member.name, amount: 1000, months: 1, outstanding: 1000, status: "approved", createdAt: expiredAt, approvals: [], approvalHistory: [] }],
  payouts: [],
  invitations: [],
  leadershipChanges: [],
  pendingMpesas: [],
  idempotency: {
    [expiredKey]: {
      fingerprint: crypto.createHash("sha256").update(JSON.stringify(["POST", "/api/contributions", treasurer.id, expiredBody])).digest("hex"),
      status: 201,
      body: { message: "Payment recorded successfully.", data: expiredRecord },
    },
  },
}));

let baseUrl;
let chairCookie;
let treasurerCookie;

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

function writeRequest(route, cookie, key, body) {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
}

async function persistedState() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
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
      PORT: String(port),
      SESSION_SECRET: "idempotency-test-session-secret",
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
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("invitation retries return the saved invitation and activation code without duplicating it", async () => {
  const key = crypto.randomUUID();
  const body = { name: "Invite Test", phone: "0711000004", role: "member" };
  const first = await writeRequest("/api/invitations", chairCookie, key, body);
  assert.equal(first.status, 201);
  const firstBody = await json(first);
  assert.equal(firstBody.invitation.idempotencyKey, key);
  assert.equal(typeof firstBody.invitation.id, "string");
  assert.equal(typeof firstBody.invitation.invitedAt, "string");
  assert.equal(firstBody.invitation.attemptsRemaining, 5);
  assert.equal(firstBody.invitation.invitedBy, chair.id);
  assert.equal(firstBody.invitation.codeHash, undefined);
  assert.match(firstBody.activationCode, /^\d{6}$/);

  const retry = await writeRequest("/api/invitations", chairCookie, key, body);
  assert.equal(retry.status, 201);
  const retryBody = await json(retry);
  assert.deepEqual(retryBody.invitation, firstBody.invitation);
  assert.equal(retryBody.activationCode, undefined);
  const saved = await persistedState();
  const { codeHash, usedCodeHash, ...savedInvitation } = saved.invitations.find(item => item.idempotencyKey === key);
  assert.deepEqual(firstBody.invitation, savedInvitation);
  assert.equal(saved.invitations.filter(item => item.idempotencyKey === key).length, 1);
});

test("concurrent invitation retries with the same key create one invitation", async () => {
  const key = crypto.randomUUID();
  const body = { name: "Concurrent Invite", phone: "0711000005", role: "member" };
  const responses = await Promise.all(Array.from({ length: 3 }, () => writeRequest("/api/invitations", chairCookie, key, body)));
  const responseBodies = await Promise.all(responses.map(json));
  assert.ok(responses.every(response => response.status === 201));
  assert.ok(responseBodies.every(item => item.invitation.id === responseBodies[0].invitation.id));
  const saved = await persistedState();
  assert.equal(saved.invitations.filter(item => item.idempotencyKey === key).length, 1);
});

test("contribution retries return the same transaction without duplicating it", async () => {
  const key = crypto.randomUUID();
  const body = { memberId: member.id, amount: 800, paymentType: "Monthly Contribution", method: "Cash", note: "Monthly cash contribution", referenceNumber: "RCPT-1001", date: "2026-10-05" };
  const first = await writeRequest("/api/contributions", treasurerCookie, key, body);
  assert.equal(first.status, 201);
  const firstBody = await json(first);
  assert.equal(firstBody.data.idempotencyKey, key);
  assert.equal(typeof firstBody.data.id, "string");
  assert.equal(typeof firstBody.data.at, "string");

  const retry = await writeRequest("/api/contributions", treasurerCookie, key, body);
  assert.equal(retry.status, 201);
  assert.deepEqual(await json(retry), firstBody);
  const saved = await persistedState();
  assert.deepEqual(firstBody.data, saved.transactions.find(item => item.idempotencyKey === key));
  assert.equal(saved.transactions.filter(item => item.idempotencyKey === key).length, 1);
});

test("loan repayment retries do not subtract the payment twice", async () => {
  const key = crypto.randomUUID();
  const body = { memberId: member.id, amount: 200, paymentType: "Loan Repayment", method: "Cash", note: "Repayment received", loanId: "loan", referenceNumber: "RCPT-2000", date: "2026-10-05" };
  const first = await writeRequest("/api/loan-repayment", treasurerCookie, key, body);
  assert.equal(first.status, 201);
  const firstBody = await json(first);
  const retry = await writeRequest("/api/loan-repayment", treasurerCookie, key, body);
  assert.equal(retry.status, 201);
  assert.deepEqual(await json(retry), firstBody);
  const saved = await persistedState();
  assert.equal(saved.transactions.filter(item => item.idempotencyKey === key).length, 1);
  assert.equal(saved.loans.find(item => item.id === "loan").outstanding, 800);
});

test("a contribution key older than 24 hours creates a new transaction", async () => {
  const first = await writeRequest("/api/contributions", treasurerCookie, expiredKey, expiredBody);
  assert.equal(first.status, 201);
  const result = await json(first);
  assert.notEqual(result.data.id, expiredRecord.id);
  assert.equal(result.data.idempotencyKey, expiredKey);
  const saved = await persistedState();
  assert.equal(saved.transactions.filter(item => item.memberId === member.id && item.amount === expiredBody.amount).length, 2);
});
