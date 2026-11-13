"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const servers = [];
function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}
function user(id, name, phone, role) {
  return { id, name, phone, role, status: "active", pinHash: pinHash("654321"), mustChangePin: false, createdAt: new Date().toISOString() };
}
async function startProcess(server) {
  server.child = execFile(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, NODE_ENV: "test", DATA_BACKEND: "json", PORT: String(server.port), SESSION_SECRET: "invitation-test-secret", CHAMA_DATA_FILE: server.dataFile, CHAMA_SCHEDULER_MS: "60000", AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" } });
  let output = "";
  server.child.stdout.on("data", chunk => { output += chunk; });
  server.child.stderr.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 8000);
    const check = setInterval(() => { if (output.includes(`localhost:${server.port}`)) { clearTimeout(timer); clearInterval(check); resolve(); } }, 20);
    server.child.once("exit", code => { clearTimeout(timer); clearInterval(check); reject(new Error(`Server exited (${code}): ${output}`)); });
  });
}
async function stopProcess(server) {
  if (server.child && server.child.exitCode === null) {
    const child = server.child;
    child.kill();
    await new Promise(resolve => child.once("exit", resolve));
  }
  server.child = null;
}
async function startServer() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-invitation-test-"));
  const dataFile = path.join(directory, "data.json");
  fs.writeFileSync(dataFile, JSON.stringify({ version: 2, chamas: [{ id: "test-chama", name: "Test Chama", subscription: require("./active-subscription-fixture").activeSubscription() }], users: [user("chair", "Test Chair", "+254711000001", "chairperson"), user("secretary", "Test Secretary", "+254711000002", "secretary")], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {} }));
  const server = { directory, dataFile, port: 32000 + (process.pid % 15000) + servers.length, baseUrl: "", child: null };
  server.baseUrl = `http://127.0.0.1:${server.port}`;
  server.start = () => startProcess(server);
  server.stop = async () => { await stopProcess(server); fs.rmSync(directory, { recursive: true, force: true }); };
  servers.push(server);
  await server.start();
  return server;
}
async function login(server, phone) {
  const response = await fetch(`${server.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ phone, pin: "654321" }) });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie()[0].split(";")[0];
}
async function createInvitation(server, cookie, phone, role = "member") {
  const email = `invitee-${String(phone).replace(/\D/g, "")}@example.test`;
  const response = await fetch(`${server.baseUrl}/api/invitations`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ name: "Test Invitee", phone, email, role }) });
  return { response, body: await response.json() };
}
function postAction(server, cookie, route, body) {
  return fetch(`${server.baseUrl}${route}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) });
}
function activate(server, phone, code, pin = "123456") {
  return fetch(`${server.baseUrl}/api/invitations/activate`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ phone, code, pin, termsAccepted: true, privacyNoticeAcknowledged: true }) });
}
function persisted(server) { return JSON.parse(fs.readFileSync(server.dataFile, "utf8")); }
after(async () => { for (const server of servers) await server.stop(); });

test("Chairperson can invite both Secretary and Treasurer directly during initial setup", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-bootstrap-test-"));
  const dataFile = path.join(directory, "data.json");
  fs.writeFileSync(dataFile, JSON.stringify({ version: 2, chamas: [{ id: "test-chama", name: "Test Chama", subscription: require("./active-subscription-fixture").activeSubscription() }], users: [user("chair", "Chair Only", "+254711000090", "chairperson")], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {} }));
  const server = { directory, dataFile, port: 32000 + (process.pid % 15000) + servers.length, baseUrl: "", child: null };
  server.baseUrl = `http://127.0.0.1:${server.port}`;
  server.start = () => startProcess(server);
  server.stop = async () => { await stopProcess(server); fs.rmSync(directory, { recursive: true, force: true }); };
  servers.push(server);
  await server.start();

  const chairCookie = await login(server, "+254711000090");

  // Invite secretary directly (pending invite)
  const { response: r1, body: b1 } = await createInvitation(server, chairCookie, "0799000001", "secretary");
  assert.equal(r1.status, 201, `Secretary invite failed: ${JSON.stringify(b1)}`);

  // Secretary activates — they are now an active officer
  const activateSecretaryResponse = await activate(server, "0799000001", b1.activationCode);
  assert.equal(activateSecretaryResponse.status, 201, "Secretary activation failed");
  const activateSecretary = await activateSecretaryResponse.json();
  assert.equal(activateSecretary.user.role, "secretary", "first setup invite should activate the Secretary role");
  const afterSecretaryDashboard = await fetch(`${server.baseUrl}/api/dashboard`, { headers: { Cookie: chairCookie } });
  assert.equal((await afterSecretaryDashboard.json()).permissions.directInviteLeader, true, "Chairperson should retain access to invite the remaining officer role");

  // Chair must still be able to invite treasurer even though secretary is now active
  const { response: r2, body: b2 } = await createInvitation(server, chairCookie, "0799000002", "treasurer");
  assert.equal(r2.status, 201, `Treasurer invite failed after secretary activated: ${JSON.stringify(b2)}`);

  // A second secretary invite must be blocked (role already active)
  const { response: r3, body: b3 } = await createInvitation(server, chairCookie, "0799000003", "secretary");
  assert.equal(r3.status, 409, `Duplicate secretary invite should be rejected: ${JSON.stringify(b3)}`);

  // Treasurer activates — both officers now active; further leader invites must be blocked
  const activateTreasurerResponse = await activate(server, "0799000002", b2.activationCode);
  assert.equal(activateTreasurerResponse.status, 201, "Treasurer activation failed");
  const activateTreasurer = await activateTreasurerResponse.json();
  assert.equal(activateTreasurer.user.role, "treasurer", "Chairperson must be able to fill the remaining Treasurer role during setup");
  const afterTreasurerDashboard = await fetch(`${server.baseUrl}/api/dashboard`, { headers: { Cookie: chairCookie } });
  assert.equal((await afterTreasurerDashboard.json()).permissions.directInviteLeader, false, "Direct officer invitations should close after both roles are filled");

  const { response: r4, body: b4 } = await createInvitation(server, chairCookie, "0799000004", "treasurer");
  assert.equal(r4.status, 409, `Treasurer re-invite after setup should be rejected: ${JSON.stringify(b4)}`);
});

test("Secretary can invite a Member directly without Chairperson approval", async () => {
  const server = await startServer();
  const secretaryCookie = await login(server, "+254711000002");
  const { response, body } = await createInvitation(server, secretaryCookie, "0712000001");
  assert.equal(response.status, 201);
  assert.equal(body.deliveryChannel, "manual");
  assert.equal((await activate(server, "0712000001", body.activationCode)).status, 201);
});

test("invitation codes are random six-digit values, hashed at rest, and single-use", async () => {
  const server = await startServer();
  const cookie = await login(server, "+254711000001");
  const { response, body } = await createInvitation(server, cookie, "0712000003");
  assert.equal(response.status, 201);
  assert.match(body.activationCode, /^\d{6}$/);
  const record = persisted(server).invitations[0];
  assert.equal(record.attemptsRemaining, 5);
  assert.equal(record.usedCodeHash, null);
  assert.notEqual(record.codeHash, body.activationCode);
  assert.notEqual(record.codeHash, crypto.createHash("sha256").update(body.activationCode).digest("hex"));
  assert.equal(JSON.stringify(persisted(server)).includes(body.activationCode), false);
  const lifetime = Date.parse(record.expiresAt) - Date.parse(record.invitedAt);
  assert.ok(lifetime >= 24 * 60 * 60 * 1000 - 2000 && lifetime <= 24 * 60 * 60 * 1000);
  const activated = await activate(server, "0712000003", body.activationCode);
  assert.equal(activated.status, 201);
  const used = persisted(server).invitations[0];
  assert.ok(used.usedAt);
  assert.equal(used.usedCodeHash, used.codeHash);
  const reused = await activate(server, "0712000003", body.activationCode);
  assert.equal(reused.status, 400);
  assert.equal((await reused.json()).message, "Code already used");
});

test("existing SHA-256 invitation verifiers remain usable through their existing expiry", async () => {
  const server = await startServer();
  const cookie = await login(server, "+254711000001");
  const { body } = await createInvitation(server, cookie, "0712000007");
  const legacyDigest = crypto.createHash("sha256").update(body.activationCode).digest("hex");
  const state = persisted(server);
  state.invitations[0].codeHash = legacyDigest;
  fs.writeFileSync(server.dataFile, JSON.stringify(state));

  const activated = await activate(server, "0712000007", body.activationCode);
  assert.equal(activated.status, 201);
  const used = persisted(server).invitations[0];
  assert.equal(used.codeHash, legacyDigest, "the existing record remains unchanged");
  assert.notEqual(used.usedCodeHash, legacyDigest, "newly stored use-verifiers use HMAC");
  assert.notEqual(used.usedCodeHash, body.activationCode);
  const replay = await activate(server, "0712000007", body.activationCode);
  assert.equal((await replay.json()).message, "Code already used");
});

test("wrong activation codes decrement the persistent invitation limit and lock after five failures", async () => {
  const server = await startServer();
  const cookie = await login(server, "+254711000001");
  await createInvitation(server, cookie, "0712000004");
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await activate(server, "0712000004", "000000");
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, attempt === 5 ? "Invitation locked after too many incorrect activation codes." : "Incorrect activation code.");
  }
  const saved = persisted(server).invitations[0];
  assert.equal(saved.attemptsRemaining, 0);
  assert.ok(saved.lockedAt);
  const sixth = await activate(server, "0712000004", "000000");
  assert.equal((await sixth.json()).message, "Invitation locked after too many incorrect activation codes.");
});

test("correct code works after three wrong guesses", async () => {
  const server = await startServer();
  const cookie = await login(server, "+254711000001");
  const { body } = await createInvitation(server, cookie, "0712000005");
  for (let attempt = 0; attempt < 3; attempt += 1) assert.equal((await activate(server, "0712000005", "000000")).status, 400);
  assert.equal(persisted(server).invitations[0].attemptsRemaining, 2);
  assert.equal((await activate(server, "0712000005", body.activationCode)).status, 201);
});

test("concurrent failed activation attempts cannot exceed the invitation limit", async () => {
  const server = await startServer();
  const cookie = await login(server, "+254711000001");
  const { body } = await createInvitation(server, cookie, "0712000006");
  const responses = await Promise.all(Array.from({ length: 10 }, () => activate(server, "0712000006", "000000")));
  const messages = await Promise.all(responses.map(response => response.json().then(body => body.message)));
  assert.equal(messages.filter(message => message === "Incorrect activation code.").length, 4);
  assert.equal(messages.filter(message => message === "Invitation locked after too many incorrect activation codes.").length, 6);
  assert.equal(persisted(server).invitations[0].attemptsRemaining, 0);
  const locked = await activate(server, "0712000006", body.activationCode);
  assert.equal(locked.status, 400);
  assert.equal((await locked.json()).message, "Invitation locked after too many incorrect activation codes.");
});

test("Chairperson can revoke a recent invitation with an audited reason and timestamp", async () => {
  const server = await startServer();
  const chairCookie = await login(server, "+254711000001");
  const secretaryCookie = await login(server, "+254711000002");
  const { body: invitation } = await createInvitation(server, chairCookie, "0712000010");
  const secretaryDashboard = await fetch(`${server.baseUrl}/api/dashboard`, { headers: { Cookie: secretaryCookie } });
  assert.equal((await secretaryDashboard.json()).permissions.revokeInvitations, false);
  const chairDashboard = await fetch(`${server.baseUrl}/api/dashboard`, { headers: { Cookie: chairCookie } });
  assert.equal((await chairDashboard.json()).permissions.revokeInvitations, true);

  const denied = await postAction(server, secretaryCookie, `/api/invitations/${invitation.invitation.id}/revoke`, { reason: "Sent to wrong number" });
  assert.equal(denied.status, 403);

  const revoked = await postAction(server, chairCookie, `/api/invitations/${invitation.invitation.id}/revoke`, { reason: "Sent to wrong number" });
  assert.equal(revoked.status, 200);
  const revocation = (await revoked.json()).data;
  assert.equal(revocation.type, "invitation.revoked");
  assert.equal(revocation.entityId, invitation.invitation.id);
  assert.equal(revocation.by.role, "chairperson");
  assert.equal(revocation.reason, "Sent to wrong number");
  assert.ok(Number.isFinite(Date.parse(revocation.at)));

  const saved = persisted(server);
  assert.equal(saved.invitations.length, 1);
  assert.deepEqual(saved.auditLog, [revocation]);
  const dashboard = await fetch(`${server.baseUrl}/api/dashboard`, { headers: { Cookie: chairCookie } });
  const dashboardInvitation = (await dashboard.json()).invitations.find(item => item.id === invitation.invitation.id);
  assert.equal(dashboardInvitation.revocation.reason, "Sent to wrong number");
  assert.equal(dashboardInvitation.revocation.at, revocation.at);

  const activation = await activate(server, "0712000010", invitation.activationCode);
  assert.equal(activation.status, 400);
  assert.equal((await activation.json()).message, "Invitation revoked");
});

test("Chairperson cannot revoke an invitation older than 24 hours", async () => {
  const server = await startServer();
  const chairCookie = await login(server, "+254711000001");
  const { body: invitation } = await createInvitation(server, chairCookie, "0712000011");
  const state = persisted(server);
  state.invitations[0].invitedAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString();
  fs.writeFileSync(server.dataFile, JSON.stringify(state));
  await stopProcess(server);
  await server.start();

  const reauthenticatedCookie = await login(server, "+254711000001");
  const response = await postAction(server, reauthenticatedCookie, `/api/invitations/${invitation.invitation.id}/revoke`, { reason: "Sent to wrong number" });
  assert.equal(response.status, 409);
  assert.equal(persisted(server).auditLog.length, 0);
});

test("expired codes cannot activate and valid codes cannot be used from another phone", async () => {
  const server = await startServer();
  const cookie = await login(server, "+254711000001");
  const { body: expiredInvite } = await createInvitation(server, cookie, "0712000007");
  const { body: activeInvite } = await createInvitation(server, cookie, "0712000008");
  await stopProcess(server);
  const state = persisted(server);
  state.invitations[0].expiresAt = new Date(Date.now() - 1).toISOString();
  fs.writeFileSync(server.dataFile, JSON.stringify(state));
  await server.start();
  const expired = await activate(server, "0712000007", expiredInvite.activationCode);
  assert.equal(expired.status, 400);
  assert.equal((await expired.json()).message, "Code expired");

  const mismatch = await activate(server, "0712000009", activeInvite.activationCode);
  assert.equal(mismatch.status, 400);
  assert.equal((await mismatch.json()).message, "Phone number does not match the invitation");
});
