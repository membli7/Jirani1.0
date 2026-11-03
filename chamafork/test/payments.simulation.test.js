"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-payment-simulation-"));
const dataFile = path.join(tempDir, "data.json");
const serverPath = path.join(__dirname, "..", "server.js");
const serverSource = fs.readFileSync(serverPath, "utf8");
let serverProcess;
let baseUrl;

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

const users = [
  { id: "chair", name: "Test Chair", phone: "+254711000001", role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false, chamaId: "test-chama", shareCapital: 0 },
  { id: "treasurer", name: "Test Treasurer", phone: "+254711000002", role: "treasurer", status: "active", pinHash: pinHash("234567"), mustChangePin: false, chamaId: "test-chama", shareCapital: 0 },
  { id: "member", name: "Test Member", phone: "+254711000003", role: "member", status: "active", pinHash: pinHash("345678"), mustChangePin: false, chamaId: "test-chama", shareCapital: 0 },
];

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function request(route, { method = "GET", body, cookie, idempotencyKey = crypto.randomUUID() } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["X-Requested-With"] = "chama";
  }
  if (method !== "GET") headers["Idempotency-Key"] = idempotencyKey;
  return fetch(`${baseUrl}${route}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function login(phone, pin) {
  const response = await request("/api/login", { method: "POST", body: { phone, pin } });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie()[0].split(";")[0];
}

before(async () => {
  const port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  fs.writeFileSync(dataFile, JSON.stringify({
    version: 2,
    chamas: [{ id: "test-chama", name: "Test Chama", createdAt: new Date().toISOString() }],
    users,
    transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [],
    idempotency: {}, registers: [], auditLog: [], welfareReserve: 0, penalties: [], dividendCycles: [], messages: [],
  }));
  serverProcess = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_BACKEND: "json",
      APP_BIND_HOST: "127.0.0.1",
      PORT: String(port),
      SESSION_SECRET: "payment-simulation-test-session-secret",
      CHAMA_DATA_FILE: dataFile,
      CHAMA_PROFILE_ICON_DIR: path.join(tempDir, "profile-icons"),
      CHAMA_PROFILE_DETAILS_FILE: path.join(tempDir, "profile-details.json"),
      AFRICASTALKING_USERNAME: "",
      AFRICASTALKING_API_KEY: "",
    },
  });
  let output = "";
  serverProcess.stdout.on("data", chunk => { output += chunk; });
  serverProcess.stderr.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Test server did not start: ${output}`)), 5000);
    serverProcess.stdout.on("data", () => {
      if (!output.includes(`localhost:${port}`)) return;
      clearTimeout(timeout);
      resolve();
    });
    serverProcess.once("error", reject);
    serverProcess.once("exit", code => reject(new Error(`Test server exited (${code}): ${output}`)));
  });
});

after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    await new Promise(resolve => serverProcess.once("exit", resolve));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("simulated payments stay unverified, Treasurer-only, fake-only, and outside balances", async () => {
  const chairCookie = await login("+254711000001", "123456");
  assert.equal((await request("/api/payments/inbox", { cookie: chairCookie })).status, 403);
  assert.equal((await request("/api/payments/simulate", { method: "POST", cookie: chairCookie, body: {} })).status, 403);

  const treasurerCookie = await login("+254711000002", "234567");
  assert.deepEqual(await (await request("/api/payments/inbox", { cookie: treasurerCookie })).json(), { data: [] });
  const beforeDashboard = await (await request("/api/dashboard", { cookie: treasurerCookie })).json();
  assert.equal(beforeDashboard.summary.balance, 0);

  const timestamp = "2026-10-31T09:15:00.000Z";
  const basePayment = { transactionId: "TEST-PAY-2026-001", phoneNumber: "TEST-PHONE-001", amount: 1250.5, reference: "TEST-REF-001", timestamp };
  const realLike = await request("/api/payments/simulate", { method: "POST", cookie: treasurerCookie, body: { ...basePayment, transactionId: "QAB123456", phoneNumber: "+254711000003" } });
  assert.equal(realLike.status, 400, "real-looking identifiers must not enter the simulation inbox");
  assert.equal(JSON.parse(fs.readFileSync(dataFile, "utf8")).pendingMpesas.length, 0);
  const invalidAmount = await request("/api/payments/simulate", { method: "POST", cookie: treasurerCookie, body: { ...basePayment, amount: "0x10" } });
  assert.equal(invalidAmount.status, 400, "amounts must use plain KES decimal notation");
  const invalidTimestamp = await request("/api/payments/simulate", { method: "POST", cookie: treasurerCookie, body: { ...basePayment, timestamp: "yesterday" } });
  assert.equal(invalidTimestamp.status, 400, "timestamps must be ISO 8601 with a timezone");
  assert.equal(JSON.parse(fs.readFileSync(dataFile, "utf8")).pendingMpesas.length, 0);

  const created = await request("/api/payments/simulate", { method: "POST", cookie: treasurerCookie, body: basePayment });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.data.status, "Unverified");
  assert.equal(createdBody.data.transactionId, basePayment.transactionId);
  assert.equal(createdBody.data.phoneNumber, basePayment.phoneNumber);
  assert.equal(createdBody.data.amount, basePayment.amount);
  assert.equal(createdBody.data.reference, basePayment.reference);
  assert.equal(createdBody.data.timestamp, timestamp);
  assert.equal(createdBody.data.rawPayload.testOnly, true);
  assert.equal(createdBody.data.rawPayload.Body.stkCallback.CallbackMetadata.Item[0].Value, basePayment.amount);

  const inbox = await (await request("/api/payments/inbox", { cookie: treasurerCookie })).json();
  assert.equal(inbox.data.length, 1);
  assert.equal(inbox.data[0].status, "Unverified");
  assert.equal(inbox.data[0].rawPayload.testOnly, true);

  const duplicate = await request("/api/payments/simulate", { method: "POST", cookie: treasurerCookie, body: basePayment });
  assert.equal(duplicate.status, 409);
  assert.equal((await (await request("/api/payments/inbox", { cookie: treasurerCookie })).json()).data.length, 1);

  const after = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.equal(after.pendingMpesas.length, 1);
  assert.equal(after.transactions.length, 0);
  assert.equal(after.users.find(user => user.id === "member").shareCapital, 0);
  assert.equal(after.welfareReserve, 0);
  assert.equal((await (await request("/api/dashboard", { cookie: treasurerCookie })).json()).summary.balance, beforeDashboard.summary.balance);
});

test("the real callback endpoint stays disabled and simulator is loopback-only", async () => {
  const before = JSON.parse(fs.readFileSync(dataFile, "utf8")).pendingMpesas.length;
  const callback = await request("/api/mpesa/callback", { method: "POST", body: { testOnly: true } });
  assert.equal(callback.status, 503);
  assert.equal(JSON.parse(fs.readFileSync(dataFile, "utf8")).pendingMpesas.length, before);
  assert.match(serverSource, /SIMULATED_PAYMENTS_ENABLED = process\.env\.NODE_ENV !== "production" && \["127\.0\.0\.1", "::1", "localhost"\]\.includes\(APP_BIND_HOST\)/);
});
