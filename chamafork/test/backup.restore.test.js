"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-synthetic-restore-"));
const sourceFile = path.join(tempDir, "synthetic-source.json");
const backupFile = path.join(tempDir, "synthetic-backup.json");
const restoreFile = path.join(tempDir, "restored-data.json");
const chamaId = "synthetic-restore-chama";
const expectedTransactionId = "synthetic-restored-contribution";
let serverProcess;
let baseUrl;
let chairCookie;

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
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

function isolatedTestEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/MPESA|M_PESA|AFRICASTALKING|EMAIL|SMTP|REDIS|DATABASE_URL|^PG(?:HOST|PORT|USER|PASSWORD|DATABASE|SSLMODE|SSLROOTCERT)$/i.test(key)) delete env[key];
  }
  return {
    ...env,
    NODE_ENV: "test",
    DATA_BACKEND: "json",
    EMAIL_ENABLED: "0",
    PORT: "",
    SESSION_SECRET: "synthetic-restore-test-session-secret",
    CHAMA_DATA_FILE: restoreFile,
    AFRICASTALKING_USERNAME: "",
    AFRICASTALKING_API_KEY: "",
  };
}

before(async () => {
  const state = {
    version: 2,
    chamas: [{ id: chamaId, name: "Synthetic Restore Chama", subscription: require("./active-subscription-fixture").activeSubscription() }],
    users: [{ id: "restore-chair", name: "Synthetic Restore Chair", phone: "+254711900001", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false, shareCapital: 0, chamaId }],
    transactions: [{ id: expectedTransactionId, at: "2026-10-12T08:00:00.000Z", date: "2026-10-12", memberId: "restore-chair", memberName: "Synthetic Restore Chair", amount: 750, method: "Cash", paymentType: "Monthly Contribution", status: "confirmed", source: "synthetic-restore-test", referenceNumber: "TEST-RESTORE-001", chamaId }],
    loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {},
    registers: [], auditLog: [], welfareReserve: 0, penalties: [],
    settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 0, lateContributionPenalty: 0, loanMonthlyRatePercent: 5, meetingDates: {} },
    dividendCycles: [], messages: [],
  };
  fs.writeFileSync(sourceFile, JSON.stringify(state), "utf8");

  // Simulate a recoverable loss in disposable files, then restore only the synthetic backup.
  fs.copyFileSync(sourceFile, backupFile);
  fs.writeFileSync(restoreFile, JSON.stringify({ version: 2, chamas: [], users: [], transactions: [] }), "utf8");
  fs.copyFileSync(backupFile, restoreFile);
  assert.deepEqual(JSON.parse(fs.readFileSync(restoreFile, "utf8")), state);

  const port = await freePort();
  serverProcess = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...isolatedTestEnv(), PORT: String(port) },
  });
  let output = "";
  serverProcess.stdout.on("data", chunk => { output += chunk; });
  serverProcess.stderr.on("data", chunk => { output += chunk; });
  baseUrl = `http://127.0.0.1:${port}`;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Restored JSON server did not start. Output: ${output}`)), 8000);
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
      reject(new Error(`Restored JSON server exited with code ${code}. Output: ${output}`));
    });
  });

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone: "+254711900001", pin: "123456" }),
  });
  assert.equal(login.status, 200);
  chairCookie = login.headers.getSetCookie()[0].split(";")[0];
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("a synthetic JSON backup restores and serves authenticated chama records", async () => {
  const response = await fetch(`${baseUrl}/api/transactions`, { headers: { Cookie: chairCookie } });
  assert.equal(response.status, 200);
  const transactions = (await response.json()).data;
  const restored = transactions.find(item => item.id === expectedTransactionId);
  assert.ok(restored, "the app should load the restored synthetic transaction");
  assert.equal(restored.amount, 750);
  assert.equal(restored.referenceNumber, "TEST-RESTORE-001");
  assert.equal(restored.chamaId, chamaId);
});
