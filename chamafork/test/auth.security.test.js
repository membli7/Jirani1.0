"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const servers = [];
function hashedPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}
async function startAuthServer({ lockoutMs = 900000, production = false, empty = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-auth-test-"));
  const dataFile = path.join(directory, "data.json");
  const phone = "+254711000001";
  const legacyPhone = "+254711000002";
  fs.writeFileSync(dataFile, JSON.stringify({ version: 2, users: empty ? [] : [
    { id: "current", name: "Test Chair", phone, role: "chairperson", status: "active", pinHash: hashedPin("123456"), mustChangePin: false },
    { id: "legacy", name: "Legacy Member", phone: legacyPhone, role: "member", status: "active", pinHash: hashedPin("1234"), mustChangePin: false },
  ], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {} }));
  const port = 30000 + (process.pid % 20000) + servers.length;
  const child = execFile(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, NODE_ENV: "test", FORCE_HTTPS_REDIRECT: production ? "1" : "0", FORCE_SECURE_COOKIE: production ? "1" : "0", FORCE_METRICS_AUTH: production ? "1" : "0", DATA_BACKEND: "json", TRUST_PROXY: production ? "1" : "0", PORT: String(port), SESSION_SECRET: "auth-test-secret", METRICS_BEARER_TOKEN: "test-metrics-bearer-token-long-enough-123456", APP_ALLOWED_ORIGINS: production ? "https://chama.example.test" : "", CHAMA_DATA_FILE: dataFile, CHAMA_LOGIN_LOCKOUT_MS: String(lockoutMs), APP_CANONICAL_ORIGIN: production ? "https://chama.example.test" : "", AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" } });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 8000);
    const check = setInterval(() => { if (output.includes(`localhost:${port}`)) { clearTimeout(timer); clearInterval(check); resolve(); } }, 20);
    child.once("exit", code => { clearTimeout(timer); clearInterval(check); reject(new Error(`Server exited (${code}): ${output}`)); });
  });
  const server = { baseUrl: `http://127.0.0.1:${port}`, phone, legacyPhone, stop: async () => { if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); } fs.rmSync(directory, { recursive: true, force: true }); } };
  servers.push(server);
  return server;
}
async function login(server, phone, pin, forwardedFor) {
  return fetch(`${server.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama", ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}) }, body: JSON.stringify({ phone, pin }) });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(response) { return response.json(); }
after(async () => { for (const server of servers) await server.stop(); });

test("signup rejects a four-digit PIN", async () => {
  const server = await startAuthServer({ empty: true });
  const signup = pin => fetch(`${server.baseUrl}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0711000001", email: "chair@example.test", pin }) });
  assert.equal((await signup("1234")).status, 400);
  assert.equal((await signup("123456")).status, 201);
});

test("invitation activation rejects a four-digit PIN", async () => {
  const server = await startAuthServer({ empty: true });
  const setup = await fetch(`${server.baseUrl}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0711000001", email: "chair@example.test", pin: "123456" }) });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.getSetCookie()[0].split(";")[0];
  const invite = await fetch(`${server.baseUrl}/api/invitations`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": "auth-invite-test" }, body: JSON.stringify({ name: "Test Member", phone: "0711000002", email: "member@example.test", role: "member" }) });
  assert.equal(invite.status, 201);
  const { activationCode } = await json(invite);
  const activate = pin => fetch(`${server.baseUrl}/api/invitations/activate`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ phone: "0711000002", code: activationCode, pin }) });
  assert.equal((await activate("5678")).status, 400);
  assert.equal((await activate("567890")).status, 201);
});

test("legacy four-digit PIN login requires a six-digit change before dashboard access", async () => {
  const server = await startAuthServer();
  const response = await login(server, server.legacyPhone, "1234");
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie()[0].split(";")[0];
  const dashboardUrl = `${server.baseUrl}/api/dashboard`;
  assert.equal((await fetch(dashboardUrl, { headers: { Cookie: cookie } })).status, 403);
  for (const route of ["/api/export.csv", "/api/leadership-changes", "/api/events/stream"]) {
    const gated = await fetch(`${server.baseUrl}${route}`, { headers: { Cookie: cookie } });
    assert.equal(gated.status, 403, `${route} must stay closed until the PIN changes`);
    assert.equal((await gated.json()).mustChangePin, true);
  }
  const change = newPin => fetch(`${server.baseUrl}/api/pin/change`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ currentPin: "1234", newPin }) });
  assert.equal((await change("5678")).status, 400);
  assert.equal((await change("567890")).status, 200);
  assert.equal((await fetch(dashboardUrl, { headers: { Cookie: cookie } })).status, 200);
});

test("five failures lock a phone and the sixth attempt receives the generic lockout message", async () => {
  const server = await startAuthServer();
  for (let index = 1; index <= 5; index += 1) assert.equal((await login(server, "0712000001", "wrong", `198.51.100.${index}`)).status, 401);
  const locked = await login(server, "0712000001", "wrong", "198.51.100.20");
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).message, "Too many login attempts. Try again in 15 minutes.");
});

test("five failures from one IP lock that IP independently of phone counters", async () => {
  const server = await startAuthServer();
  for (let index = 1; index <= 5; index += 1) assert.equal((await login(server, `071200000${index}`, "wrong", "198.51.100.30")).status, 401);
  const locked = await login(server, "0712000009", "wrong", "198.51.100.30");
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).message, "Too many login attempts. Try again in 15 minutes.");
});

test("login lockout expires after the 15-minute interval", async () => {
  const server = await startAuthServer({ lockoutMs: 120 });
  for (let index = 0; index < 5; index += 1) assert.equal((await login(server, server.phone, "wrong", "198.51.100.40")).status, 401);
  assert.equal((await login(server, server.phone, "123456", "198.51.100.40")).status, 429);
  await sleep(150);
  assert.equal((await login(server, server.phone, "123456", "198.51.100.40")).status, 200);
});

test("production redirects HTTP to HTTPS and marks session cookies Secure", async () => {
  const server = await startAuthServer({ production: true });
  const redirect = await fetch(`${server.baseUrl}/api/health`, { redirect: "manual", headers: { Host: "attacker.example" } });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "https://chama.example.test/api/health");
  const response = await fetch(`${server.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama", "X-Forwarded-Proto": "https" }, body: JSON.stringify({ phone: server.phone, pin: "123456" }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /; secure/i);
  const metrics = await fetch(`${server.baseUrl}/metrics`);
  assert.equal(metrics.status, 404);
  const metricsAuthorized = await fetch(`${server.baseUrl}/metrics`, { headers: { Authorization: "Bearer test-metrics-bearer-token-long-enough-123456" } });
  assert.equal(metricsAuthorized.status, 200);
});
