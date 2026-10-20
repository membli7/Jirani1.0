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
// Legacy accounts: no shareCapital field and no welfareReserve or penalties arrays in the saved file.
const member = { id: "member", name: "Test Member", phone: "+254711000003", role: "member", status: "active", pinHash: pinHash("345678"), mustChangePin: false };
const otherMember = { id: "other", name: "Other Member", phone: "+254711000004", role: "member", status: "active", pinHash: pinHash("456789"), mustChangePin: false };
const thirdMember = { id: "third", name: "Third Member", phone: "+254711000005", role: "member", status: "active", pinHash: pinHash("567890"), mustChangePin: false };

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  users: [chair, treasurer, member, otherMember, thirdMember],
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

function contribute(memberId, body) {
  return fetch(`${baseUrl}/api/contributions`, {
    method: "POST",
    headers: {
      Cookie: treasurerCookie,
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ memberId, method: "Cash", note: "Cash received at meeting", referenceNumber: "RCPT-1000", date: "2026-10-05", ...body }),
  });
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

test("the first payment of the month sends KES 500 to welfare and the rest to share capital", async () => {
  const response = await contribute(member.id, { amount: 1500 });
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.welfareAmount, 500);
  assert.equal(transaction.shareCapitalAmount, 1000);
  assert.equal(transaction.penaltyAmount, 0);
  assert.equal(transaction.contributionMonth, "2026-10");
  assert.equal(transaction.referenceNumber, "RCPT-1000");
  assert.equal(transaction.date, "2026-10-05");

  const saved = persistedState();
  assert.equal(saved.welfareReserve, 500);
  assert.equal(saved.users.find(item => item.id === member.id).shareCapital, 1000);
  const entry = saved.auditLog.find(item => item.type === "contribution.recorded" && item.entityId === transaction.id);
  assert.ok(entry, "contribution should be audited");
  assert.equal(entry.by.role, "treasurer");
  assert.equal(entry.welfareAmount, 500);
  assert.equal(entry.shareCapitalAmount, 1000);
});

test("a second payment in the same month goes entirely to share capital", async () => {
  const response = await contribute(member.id, { amount: 800, date: "2026-10-04", referenceNumber: "RCPT-1001" });
  assert.equal(response.status, 201);
  const transaction = (await response.json()).data;
  assert.equal(transaction.welfareAmount, 0);
  assert.equal(transaction.shareCapitalAmount, 800);

  const saved = persistedState();
  assert.equal(saved.welfareReserve, 500, "welfare is charged once per month");
  assert.equal(saved.users.find(item => item.id === member.id).shareCapital, 1800);
});

test("the welfare reserve pools fees from every member", async () => {
  assert.equal((await contribute(otherMember.id, { amount: 500, referenceNumber: "RCPT-1002" })).status, 201);
  const saved = persistedState();
  assert.equal(saved.welfareReserve, 1000);
  assert.equal(saved.users.find(item => item.id === otherMember.id).shareCapital, 0);
});

test("a payment below the welfare fee is rejected and changes nothing", async () => {
  const before = persistedState();
  const response = await contribute(thirdMember.id, { amount: 300, referenceNumber: "RCPT-1003" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /KES 500 welfare fee/);
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

test("a legacy file gains the penalties ledger and member share capital", async () => {
  const saved = persistedState();
  assert.equal(saved.users.find(item => item.id === member.id).shareCapital, 1800);
  assert.equal(Array.isArray(saved.penalties), true);
});
