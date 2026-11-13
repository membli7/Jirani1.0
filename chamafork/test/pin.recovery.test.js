"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile, spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");
const { resetPinAfterRevokingSessions } = require("../security/pin-recovery");

const servers = [];
const redisServers = [];
function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}
async function startServer({ emailEnabled = true, mailFails = false, resetTtlMs = "", logFile = "", testSessionRedisUrl = "" } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-test-"));
  const dataFile = path.join(directory, "data.json");
  const email = "member@example.test";
  const phone = "+254711123456";
  fs.writeFileSync(dataFile, JSON.stringify({
    version: 2,
    chamas: [{ id: "chama-1", name: "Test Chama", subscription: require("./active-subscription-fixture").activeSubscription() }],
    users: [{ id: "member-1", name: "Test Member", phone, email, role: "chairperson", status: "active", pinHash: pinHash("123456"), mustChangePin: false, chamaId: "chama-1" }],
    transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {},
  }));
  const port = 37000 + (process.pid % 10000) + servers.length;
  const env = {
    ...process.env, NODE_ENV: "test", DATA_BACKEND: "json", PORT: String(port), SESSION_SECRET: "pin-recovery-test-session-secret",
    CHAMA_DATA_FILE: dataFile, AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "", PIN_RESET_TTL_MS: resetTtlMs,
    PIN_RECOVERY_TEST_REDIS_URL: testSessionRedisUrl, SESSION_REDIS_PREFIX: `jirani:pin-test:${process.pid}:${servers.length}:`,
  };
  if (mailFails) { env.SMTP_TRANSPORT = ""; env.SMTP_HOST = "127.0.0.1"; env.SMTP_PORT = "1"; env.SMTP_USER = "test-user"; env.SMTP_PASS = "test-password"; }
  else if (emailEnabled) { env.SMTP_TRANSPORT = "json"; env.SMTP_LOG_FILE = logFile; }
  else { env.SMTP_TRANSPORT = ""; env.SMTP_HOST = ""; env.SMTP_USER = ""; env.SMTP_PASS = ""; }
  const child = execFile(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 8000);
    const ready = setInterval(() => { if (output.includes(`localhost:${port}`)) { clearTimeout(timer); clearInterval(ready); resolve(); } }, 20);
    child.once("exit", code => { clearTimeout(timer); clearInterval(ready); reject(new Error(`Server exited (${code}): ${output}`)); });
  });
  const server = {
    baseUrl: `http://127.0.0.1:${port}`, dataFile, email, phone,
    async stop() { if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); } fs.rmSync(directory, { recursive: true, force: true }); },
  };
  servers.push(server);
  return server;
}
function redisServerExecutable() {
  if (process.env.PIN_RECOVERY_REDIS_SERVER) return process.env.PIN_RECOVERY_REDIS_SERVER;
  const lookup = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(lookup, ["redis-server"], { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean)?.trim() || "" : "";
}
async function allocatePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
function isRedisReady(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = ready => { socket.destroy(); resolve(ready); };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(300, () => finish(false));
  });
}
async function startDisposableRedis(t) {
  const executable = redisServerExecutable();
  if (!executable) {
    t.skip("redis-server is unavailable; the Redis-backed integration test requires a local disposable Redis binary.");
    return null;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-redis-"));
  const port = await allocatePort();
  const child = spawn(executable, ["--bind", "127.0.0.1", "--port", String(port), "--protected-mode", "yes", "--save", "", "--appendonly", "no", "--dir", directory, "--loglevel", "warning"], {
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let output = "";
  let spawnError = null;
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  child.once("error", error => { spawnError = error; });
  const redis = {
    url: `redis://127.0.0.1:${port}`,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 3000);
          child.once("exit", () => { clearTimeout(timer); resolve(); });
        });
      }
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
  redisServers.push(redis);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Could not start disposable Redis: ${spawnError.message}`);
    if (child.exitCode !== null) throw new Error(`Disposable Redis exited (${child.exitCode}): ${output}`);
    if (await isRedisReady(port)) return redis;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Disposable Redis did not become ready: ${output}`);
}
async function post(server, route, body, cookie = "") {
  return fetch(`${server.baseUrl}${route}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID(), ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
}
function cookie(response) { return response.headers.getSetCookie?.()[0]?.split(";")[0] || response.headers.get("set-cookie")?.split(";")[0] || ""; }
function latestCode(logFile, subject) {
  const messages = fs.readFileSync(logFile, "utf8").trim().split("\n").map(JSON.parse);
  const message = messages.reverse().find(item => item.subject === subject);
  return message.text.match(/(\d{6})/)[1];
}
async function requestReset(server, logFile, email = server.email, sessionCookie = "") {
  const response = await post(server, "/api/forgot-pin", { email }, sessionCookie);
  return { response, body: await response.json(), cookie: cookie(response), code: fs.existsSync(logFile) ? latestCode(logFile, "Jirani Chama PIN Reset Code") : null };
}
after(async () => {
  for (const server of servers) await server.stop();
  for (const redis of redisServers) await redis.stop();
});

test("PIN reset preserves the old PIN and retryable challenge when session enumeration fails", async () => {
  let pin = "old-pin-hash";
  let challengeAvailable = true;
  const store = { all(callback) { callback(new Error("session enumeration failed")); } };
  await assert.rejects(resetPinAfterRevokingSessions({
    sessionStore: store,
    userId: "member-1",
    consumeChallenge: async () => { challengeAvailable = false; },
    persistPin: async () => { pin = "new-pin-hash"; },
  }), /session enumeration failed/);
  assert.equal(pin, "old-pin-hash");
  assert.equal(challengeAvailable, true);
});

test("PIN reset preserves the old PIN and retryable challenge after partial session destruction, then retries safely", async () => {
  let pin = "old-pin-hash";
  let challengeAvailable = true;
  let failDestroy = true;
  const attempted = [];
  const store = {
    all(callback) {
      callback(null, [
        { id: "session-1", userId: "member-1" },
        { id: "session-2", userId: "member-1" },
        { id: "unrelated-session", userId: "member-2" },
      ]);
    },
    destroy(id, callback) {
      attempted.push(id);
      setImmediate(() => callback(failDestroy && id === "session-2" ? new Error("session destroy failed") : null));
    },
  };
  const reset = () => resetPinAfterRevokingSessions({
    sessionStore: store,
    userId: "member-1",
    consumeChallenge: async () => { challengeAvailable = false; },
    persistPin: async () => { pin = "new-pin-hash"; },
  });
  await assert.rejects(reset(), /session destroy failed/);
  assert.deepEqual(attempted.slice().sort(), ["session-1", "session-2"]);
  assert.equal(pin, "old-pin-hash");
  assert.equal(challengeAvailable, true);

  failDestroy = false;
  attempted.length = 0;
  await reset();
  assert.deepEqual(attempted.slice().sort(), ["session-1", "session-2"]);
  assert.equal(pin, "new-pin-hash");
  assert.equal(challengeAvailable, false);
});

test("resets a PIN with an emailed, purpose-specific single-use code", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-mail-"));
  const logFile = path.join(directory, "mail.jsonl");
  const server = await startServer({ logFile });
  const reset = await requestReset(server, logFile);
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.message, "If an active account uses this email address, a PIN reset code may be sent.");
  const mail = JSON.parse(fs.readFileSync(logFile, "utf8").trim());
  assert.equal(mail.to[0].address, server.email);
  assert.equal(mail.subject, "Jirani Chama PIN Reset Code");
  assert.match(mail.text, /PIN reset code is \d{6}\. It expires in 10 minutes/);
  const changed = await post(server, "/api/reset-pin", { email: server.email, code: reset.code, newPin: "654321" }, reset.cookie);
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).message, "PIN reset. Please sign in with your new PIN.");
  assert.equal((await post(server, "/api/login", { phone: server.phone, pin: "123456" })).status, 401);
  assert.equal((await post(server, "/api/login", { phone: server.phone, pin: "654321" })).status, 200);
  const reused = await post(server, "/api/reset-pin", { email: server.email, code: reset.code, newPin: "765432" }, reset.cookie);
  assert.equal(reused.status, 400);
  assert.equal((await reused.json()).message, "Invalid or expired PIN reset code.");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("PIN recovery revokes every existing session for the account", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-sessions-"));
  const logFile = path.join(directory, "mail.jsonl");
  const server = await startServer({ logFile });
  const sessionCookies = [];
  for (let index = 0; index < 2; index += 1) {
    const signedIn = await post(server, "/api/login", { phone: server.phone, pin: "123456" });
    assert.equal(signedIn.status, 200);
    sessionCookies.push(cookie(signedIn));
  }
  const reset = await requestReset(server, logFile, server.email, sessionCookies[0]);
  const changed = await post(server, "/api/reset-pin", { email: server.email, code: reset.code, newPin: "654321" }, reset.cookie);
  assert.equal(changed.status, 200);

  for (const sessionCookie of sessionCookies) {
    const dashboard = await fetch(`${server.baseUrl}/api/dashboard`, { headers: { Cookie: sessionCookie } });
    assert.equal(dashboard.status, 401, "a pre-recovery session must no longer authenticate");
  }
  fs.rmSync(directory, { recursive: true, force: true });
});

test("PIN recovery revokes sessions using a disposable Redis session store", async t => {
  const redis = await startDisposableRedis(t);
  if (!redis) return;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-redis-test-"));
  const logFile = path.join(directory, "mail.jsonl");
  try {
    const server = await startServer({ logFile, testSessionRedisUrl: redis.url });
    const sessionCookies = [];
    for (let index = 0; index < 2; index += 1) {
      const signedIn = await post(server, "/api/login", { phone: server.phone, pin: "123456" });
      assert.equal(signedIn.status, 200);
      sessionCookies.push(cookie(signedIn));
    }
    const reset = await requestReset(server, logFile);
    const changed = await post(server, "/api/reset-pin", { email: server.email, code: reset.code, newPin: "654321" }, reset.cookie);
    assert.equal(changed.status, 200);
    for (const sessionCookie of sessionCookies) {
      const dashboard = await fetch(`${server.baseUrl}/api/dashboard`, { headers: { Cookie: sessionCookie } });
      assert.equal(dashboard.status, 401, "a pre-recovery Redis-backed session must no longer authenticate");
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("PIN recovery gives unknown accounts the same privacy-preserving response", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-private-"));
  const knownLog = path.join(directory, "known.jsonl");
  const unknownLog = path.join(directory, "unknown.jsonl");
  const known = await startServer({ logFile: knownLog });
  const unknown = await startServer({ logFile: unknownLog });
  const knownRequest = await requestReset(known, knownLog);
  const unknownRequest = await requestReset(unknown, unknownLog, "missing@example.test");
  assert.equal(knownRequest.response.status, 200);
  assert.equal(unknownRequest.response.status, 200);
  assert.deepEqual(unknownRequest.body, knownRequest.body);
  assert.equal(fs.existsSync(unknownLog), false);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("PIN recovery rejects invalid, expired, and too-short reset attempts", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-invalid-"));
  const logFile = path.join(directory, "mail.jsonl");
  const server = await startServer({ logFile, resetTtlMs: "1" });
  const reset = await requestReset(server, logFile);
  const invalid = await post(server, "/api/reset-pin", { email: server.email, code: "000000", newPin: "654321" }, reset.cookie);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).message, "Invalid or expired PIN reset code.");
  const tooShort = await post(server, "/api/reset-pin", { email: server.email, code: reset.code, newPin: "1234" }, reset.cookie);
  assert.equal(tooShort.status, 400);
  assert.equal((await tooShort.json()).message, "Choose a 6-12 digit PIN.");
  await new Promise(resolve => setTimeout(resolve, 10));
  const expired = await post(server, "/api/reset-pin", { email: server.email, code: reset.code, newPin: "654321" }, reset.cookie);
  assert.equal(expired.status, 400);
  assert.equal((await expired.json()).message, "Invalid or expired PIN reset code.");
  fs.rmSync(directory, { recursive: true, force: true });
});

test("PIN recovery rate-limits repeat code requests and handles unavailable mail", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-rate-"));
  const logFile = path.join(directory, "mail.jsonl");
  const server = await startServer({ logFile });
  await requestReset(server, logFile);
  const limited = await post(server, "/api/forgot-pin", { email: server.email });
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { message: "If an active account uses this email address, a PIN reset code may be sent." });
  const unavailable = await startServer({ emailEnabled: false });
  const request = await post(unavailable, "/api/forgot-pin", { email: unavailable.email });
  assert.equal(request.status, 200);
  assert.deepEqual(await request.json(), { message: "If an active account uses this email address, a PIN reset code may be sent." });
  const noDeliveryReset = await post(unavailable, "/api/reset-pin", { email: unavailable.email, code: "000000", newPin: "654321" }, cookie(request));
  assert.equal(noDeliveryReset.status, 400);
  const failedDelivery = await startServer({ mailFails: true });
  const failedRequest = await post(failedDelivery, "/api/forgot-pin", { email: failedDelivery.email });
  assert.equal(failedRequest.status, 200);
  assert.deepEqual(await failedRequest.json(), { message: "If an active account uses this email address, a PIN reset code may be sent." });
  const failedReset = await post(failedDelivery, "/api/reset-pin", { email: failedDelivery.email, code: "000000", newPin: "654321" }, cookie(failedRequest));
  assert.equal(failedReset.status, 400);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("PIN recovery does not replace sign-in OTP or invitation activation", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-pin-reset-isolation-"));
  const logFile = path.join(directory, "mail.jsonl");
  const server = await startServer({ logFile });
  await requestReset(server, logFile);
  const otpRequest = await post(server, "/api/otp/request", { phone: server.phone });
  assert.equal(otpRequest.status, 200);
  const otpCookie = cookie(otpRequest);
  const otpCode = latestCode(logFile, "Jirani Chama Sign-In Code");
  const otpVerify = await post(server, "/api/otp/verify", { phone: server.phone, code: otpCode, pin: "123456" }, otpCookie);
  assert.equal(otpVerify.status, 200);
  const pinLogin = await post(server, "/api/login", { phone: server.phone, pin: "123456" });
  assert.equal(pinLogin.status, 200);
  const authCookie = cookie(pinLogin);
  const invitation = await post(server, "/api/invitations", { name: "Invitee", phone: "0711222333", email: "invitee@example.test", role: "member" }, authCookie);
  assert.equal(invitation.status, 201);
  const activationCode = latestCode(logFile, "Jirani Chama Invitation");
  const activation = await post(server, "/api/invitations/activate", { phone: "0711222333", code: activationCode, pin: "654321", termsAccepted: true, privacyNoticeAcknowledged: true });
  assert.equal(activation.status, 201);
  fs.rmSync(directory, { recursive: true, force: true });
});
