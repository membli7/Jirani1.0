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

function pinHash(pin, salt) {
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

function account(id, name, phone, role, chamaId, shareCapital = 0) {
  return { id, name, phone, role, status: "active", pinHash: pinHash("123456", `salt-${id}`), mustChangePin: false, shareCapital, chamaId };
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
    chamas: [{ id: "chama-a", name: "Chama A" }, { id: "chama-b", name: "Chama B" }],
    users: [
      account("a-chair", "A Chair", "+254711100001", "chairperson", "chama-a"),
      account("a-borrower", "A Borrower", "+254711100002", "member", "chama-a", 1000),
      account("a-guarantor-1", "A Guarantor One", "+254711100003", "member", "chama-a", 1000),
      account("a-guarantor-2", "A Guarantor Two", "+254711100004", "member", "chama-a", 1000),
      account("b-chair", "B Chair", "+254711200001", "chairperson", "chama-b"),
    ],
    transactions: [
      { id: "a-cash", at: "2026-10-01T08:00:00.000Z", memberId: "a-chair", memberName: "A Chair", amount: 100, status: "confirmed", chamaId: "chama-a" },
      { id: "b-cash", at: "2026-10-01T08:00:00.000Z", memberId: "b-chair", memberName: "B Chair", amount: 500000, status: "confirmed", chamaId: "chama-b" },
    ],
    loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {},
    registers: [], auditLog: [], penalties: [], welfareReserve: 0,
    settings: { defaultDeadlineDay: 5, meetingDates: {} }, dividendCycles: [], messages: [],
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
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Chama A loan approval cannot use Chama B's balance", async () => {
  const loanResponse = await fetch(`${baseUrl}/api/loans`, {
    method: "POST",
    headers: { Cookie: borrowerCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ amount: 600, months: 1, interestModel: "reducing", guarantorIds: ["a-guarantor-1", "a-guarantor-2"] }),
  });
  assert.equal(loanResponse.status, 201);
  const loanId = (await loanResponse.json()).data.id;

  const approval = await fetch(`${baseUrl}/api/loans/${loanId}/decisions`, {
    method: "POST",
    headers: { Cookie: chairCookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ decision: "approve", reason: "Check funds for this chama" }),
  });
  assert.equal(approval.status, 409);
  const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.notEqual(saved.loans.find(item => item.id === loanId).status, "approved");
});
