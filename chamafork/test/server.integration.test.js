"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { after, before, describe, test } = require("node:test");

const execFileAsync = promisify(execFile);
let server;
let baseUrl;
let tempDir;
let cookie;
const testPort = 20000 + (process.pid % 10000);

function request(route, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("Cookie", cookie);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    headers.set("X-Requested-With", "chama");
  }
  if (options.write) headers.set("Idempotency-Key", `test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

async function json(response) {
  return response.json();
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-chama-test-"));
  const initialState = { version: 2, users: [], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {}, registers: [], auditLog: [] };
  fs.writeFileSync(path.join(tempDir, "data.json"), `\uFEFF${JSON.stringify(initialState)}`, "utf8");
  server = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      DATA_BACKEND: "json",
      PORT: String(testPort),
      SESSION_SECRET: "integration-test-session-secret",
      CHAMA_DATA_FILE: path.join(tempDir, "data.json"),
      CHAMA_PROFILE_ICON_DIR: path.join(tempDir, "profile-icons"),
      CHAMA_PROFILE_DETAILS_FILE: path.join(tempDir, "profile-details.json"),
      AFRICASTALKING_USERNAME: "",
      AFRICASTALKING_API_KEY: "",
    },
  });

  let output = "";
  baseUrl = `http://127.0.0.1:${testPort}`;
  server.stdout.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 5000);
    const onData = () => {
      if (output.includes(`localhost:${testPort}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.once("error", reject);
    server.once("exit", code => reject(new Error(`Server exited with code ${code}. Output: ${output}`)));
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not accept connections. Output: ${output}`);
});

after(async () => {
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await new Promise(resolve => server.once("exit", resolve));
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("Jirani Chama server", () => {
  test("reports health and requires first-time setup", async () => {
    const health = await request("/api/health");
    assert.equal(health.status, 200);
    assert.deepEqual(await json(health), { status: "ok" });

    const setupStatus = await request("/api/setup/status");
    assert.equal(setupStatus.status, 200);
    assert.deepEqual(await json(setupStatus), { requiresSetup: true });
  });

  test("creates a chairperson session and serves the dashboard", async () => {
    const setup = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456" }),
    });
    assert.equal(setup.status, 201);
    const duplicateSetup = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Another Chama", name: "Second Chair", phone: "0712345688", email: "second@example.test", pin: "654321" }),
    });
    assert.equal(duplicateSetup.status, 409);
    const setupBody = await json(setup);
    assert.equal(setupBody.user.role, "chairperson");
    assert.match(setupBody.user.phone, /^\+254/);
    const savedState = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8"));
    assert.equal(savedState.chamas.length, 1);
    assert.equal(savedState.chamas[0].name, "Test Chama");
    assert.equal(savedState.users[0].chamaId, savedState.chamas[0].id);
    cookie = setup.headers.getSetCookie?.()[0]?.split(";")[0] || setup.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "setup should establish a session cookie");

    const dashboard = await request("/api/dashboard");
    assert.equal(dashboard.status, 200);
    const dashboardBody = await json(dashboard);
    assert.equal(dashboardBody.user.name, "Test Chair");
    assert.equal(dashboardBody.summary.balance, 0);
    assert.equal(dashboardBody.permissions.manageMembers, true);
  });

  test("profile page loads profile API data and securely saves profile details and photo icons", async () => {
    const page = await request("/profile.html");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/profile\.js"/);
    const script = await request("/profile.js");
    assert.equal(script.status, 200);
    assert.match(await script.text(), /\/api\/profile\/photo\/\$\{size\}/);

    const profile = await request("/api/profile");
    assert.equal(profile.status, 200);
    assert.deepEqual((await json(profile)).data, {
      firstName: "Test", lastName: "Chair", nickname: "", phone: "+254712345678", email: "chair@example.test",
    });

    const save = await request("/api/profile", {
      method: "PUT",
      write: true,
      body: JSON.stringify({ firstName: "New", lastName: "Chair", nickname: "N", phone: "0712345678", email: "new@example.test" }),
    });
    assert.equal(save.status, 200);
    assert.equal((await json(save)).data.nickname, "N");

    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(180, 16);
    png.writeUInt32BE(180, 20);
    const photo = await fetch(`${baseUrl}/api/profile/photo/180`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "image/png", "X-Requested-With": "chama", "Idempotency-Key": `photo-${Date.now()}-integration` },
      body: png,
    });
    assert.equal(photo.status, 201);
    const savedPhoto = await request("/api/profile/photo/180");
    assert.equal(savedPhoto.status, 200);
    assert.equal(savedPhoto.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await savedPhoto.arrayBuffer()), png);
  });

  test("proposes and confirms a leadership change", async () => {
    const chairCookie = cookie;
    const invitation = await request("/api/invitations", {
      method: "POST",
      write: true,
      body: JSON.stringify({ name: "Test Secretary", phone: "0712345679", email: "secretary@example.test", role: "member" }),
    });
    assert.equal(invitation.status, 201);
    const invitationBody = await json(invitation);
    assert.match(invitationBody.activationCode, /^\d{6}$/);

    const activation = await request("/api/invitations/activate", {
      method: "POST",
      body: JSON.stringify({ phone: "0712345679", code: invitationBody.activationCode, pin: "567890" }),
    });
    assert.equal(activation.status, 201);
    const secretaryId = (await json(activation)).user.id;

    cookie = null;
    const login = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ phone: "0712345679", pin: "567890" }),
    });
    assert.equal(login.status, 200);
    const secretaryUserId = (await json(login)).user.id;
    cookie = login.headers.getSetCookie?.()[0]?.split(";")[0] || login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "secretary login should establish a session cookie");
    const secretaryCookie = cookie;

    const secretaryProposalAttempt = await request("/api/leadership-changes", {
      method: "POST",
      write: true,
      body: JSON.stringify({ role: "treasurer", incomingUserId: secretaryId, effectiveDate: "2030-01-01" }),
    });
    assert.equal(secretaryProposalAttempt.status, 403);

    cookie = chairCookie;
    const chairUserId = (await json(await request("/api/dashboard"))).user.id;
    const proposal = await request("/api/leadership-changes", {
      method: "POST",
      write: true,
      body: JSON.stringify({
        role: "secretary",
        incomingUserId: secretaryId,
        effectiveDate: "2030-01-01",
      }),
    });
    assert.equal(proposal.status, 201);
    const proposalBody = await json(proposal);
    assert.equal(proposalBody.data.status, "confirmed");
    assert.equal(proposalBody.data.type, "appointment");
    assert.equal(proposalBody.data.vote, null);
    assert.equal(proposalBody.data.confirmedBy, chairUserId);

    cookie = chairCookie;
    const treasurerInvitation = await request("/api/invitations", {
      method: "POST",
      write: true,
      body: JSON.stringify({ name: "Test Treasurer", phone: "0712345680", email: "treasurer@example.test", role: "member" }),
    });
    assert.equal(treasurerInvitation.status, 201);
    const treasurerInvitationBody = await json(treasurerInvitation);
    const treasurerActivation = await request("/api/invitations/activate", {
      method: "POST",
      body: JSON.stringify({ phone: "0712345680", code: treasurerInvitationBody.activationCode, pin: "901234" }),
    });
    assert.equal(treasurerActivation.status, 201);
    const treasurerId = (await json(treasurerActivation)).user.id;

    const laterProposal = await request("/api/leadership-changes", {
      method: "POST",
      write: true,
      body: JSON.stringify({ role: "treasurer", incomingUserId: treasurerId, effectiveDate: "2030-02-01" }),
    });
    assert.equal(laterProposal.status, 201);
    const laterProposalBody = await json(laterProposal);
    assert.equal(laterProposalBody.data.status, "pending");

    cookie = secretaryCookie;
    const confirmation = await request(`/api/leadership-changes/${laterProposalBody.data.id}/confirm`, {
      method: "POST",
      write: true,
      body: JSON.stringify({}),
    });
    assert.equal(confirmation.status, 200);
    assert.equal((await json(confirmation)).data.status, "confirmed");

    cookie = secretaryCookie;
    const deniedRevocation = await request(`/api/leadership-changes/${laterProposalBody.data.id}/revoke`, {
      method: "POST",
      write: true,
      body: JSON.stringify({ reason: "Incorrect office assignment" }),
    });
    assert.equal(deniedRevocation.status, 403);

    cookie = chairCookie;
    const revocationResponse = await request(`/api/leadership-changes/${laterProposalBody.data.id}/revoke`, {
      method: "POST",
      write: true,
      body: JSON.stringify({ reason: "Incorrect office assignment" }),
    });
    assert.equal(revocationResponse.status, 200);
    const revocationBody = await json(revocationResponse);
    assert.equal(revocationBody.history.type, "leadership.role.revoked");
    assert.equal(revocationBody.history.reason, "Incorrect office assignment");
    assert.equal(revocationBody.history.by.role, "chairperson");
    assert.equal(revocationBody.data.audit.at(-1).action, "revoked");
    const dashboardAfterRevocation = await request("/api/dashboard");
    assert.equal((await json(dashboardAfterRevocation)).members.find(member => member.id === treasurerId).role, "member");

    const leadershipHistory = await request("/api/leadership-changes");
    const savedRevocation = (await json(leadershipHistory)).data.find(change => change.id === laterProposalBody.data.id);
    assert.equal(savedRevocation.audit.at(-1).reason, "Incorrect office assignment");
  });

  test("exports transactions and expires the session after logout", async () => {
    const csv = await request("/api/export.csv");
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(csv.headers.get("content-disposition"), /jirani-register\.csv/);
    assert.match(await csv.text(), /"Date","Member","Amount \(KES\)","Method","Type","Reference"/);

    assert.equal((await request("/api/messages", { method: "POST", body: JSON.stringify({ type: "meeting", message: "Test" }) })).status, 400);
    assert.equal((await request("/api/payments/mpesa/callback", { method: "POST", body: JSON.stringify({}) })).status, 404);
    const beforeCallback = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8")).pendingMpesas.length;
    const callback = await request("/api/mpesa/callback", { method: "POST", body: JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: "unmatched", ResultCode: 0, CallbackMetadata: { Item: [{ Name: "Amount", Value: 900 }] } } } }) });
    assert.equal(callback.status, 503);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8")).pendingMpesas.length, beforeCallback);

    const logout = await request("/api/logout", { method: "POST", body: JSON.stringify({}) });
    assert.equal(logout.status, 200);

    const dashboard = await request("/api/dashboard");
    assert.equal(dashboard.status, 401);
  });
});

test("malformed JSON gets a 400 and the server keeps running", async () => {
  const malformed = await request("/api/loans", { method: "POST", body: "{bad json", write: true });
  assert.equal(malformed.status, 400);
  assert.match((await json(malformed)).message, /could not be read/);
  assert.equal((await request("/api/health")).status, 200);
});
