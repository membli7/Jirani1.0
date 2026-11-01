"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { after, before, describe, test } = require("node:test");

const execFileAsync = promisify(execFile);
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
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
      NODE_ENV: "test",
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
  test("uses PostgreSQL by default when no storage backend is selected", () => {
    assert.match(serverSource, /const DATA_BACKEND = process\.env\.DATA_BACKEND \|\| "postgres";/);
  });

  test("reports health and requires first-time setup", async () => {
    const health = await request("/api/health");
    assert.equal(health.status, 200);
    assert.deepEqual(await json(health), { status: "ok" });

    const setupStatus = await request("/api/setup/status");
    assert.equal(setupStatus.status, 200);
    assert.deepEqual(await json(setupStatus), { requiresSetup: true });

    const registerPage = await request("/register.html");
    assert.equal(registerPage.status, 200);
    assert.match(await registerPage.text(), /id="register-chama-form"/);
    const registerScript = await request("/register.js");
    assert.equal(registerScript.status, 200);
    assert.match(await registerScript.text(), /fetch\("\/api\/setup"/);

    const loginPage = await request("/member-login.html");
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /method="post" action="\/api\/login"/);
    const authPagesScript = await request("/auth-pages.js");
    assert.equal(authPagesScript.status, 200);
    const authPagesSource = await authPagesScript.text();
    assert.match(authPagesSource, /postJson\("\/api\/login"/);
    assert.match(authPagesSource, /postJson\("\/api\/invitations\/activate"/);
  });

  test("creates a chairperson session and serves the dashboard", async () => {
    const invalidDeadline = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", deadlineDay: 29 }),
    });
    assert.equal(invalidDeadline.status, 400);
    const invalidRules = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", deadlineDay: 10, welfareMonthlyFee: "", lateContributionPenalty: 75, loanMonthlyRatePercent: 101 }),
    });
    assert.equal(invalidRules.status, 400);

    const setup = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", deadlineDay: 10, welfareMonthlyFee: 350, lateContributionPenalty: 75, loanMonthlyRatePercent: 7.5 }),
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
    assert.deepEqual(savedState.settings, { defaultDeadlineDay: 10, welfareMonthlyFee: 350, lateContributionPenalty: 75, loanMonthlyRatePercent: 7.5, meetingDates: {} });
    assert.equal(savedState.users[0].chamaId, savedState.chamas[0].id);
    cookie = setup.headers.getSetCookie?.()[0]?.split(";")[0] || setup.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "setup should establish a session cookie");

    const dashboard = await request("/api/dashboard");
    assert.equal(dashboard.status, 200);
    const dashboardBody = await json(dashboard);
    assert.equal(dashboardBody.user.name, "Test Chair");
    assert.equal(dashboardBody.summary.balance, 0);
    assert.equal(dashboardBody.permissions.manageMembers, true);

    const beforeRecovery = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8"));
    const forgotPin = await request("/api/forgot-pin", { method: "POST", body: JSON.stringify({ email: "chair@example.test" }) });
    const resetPin = await request("/api/reset-pin", { method: "POST", body: JSON.stringify({ email: "chair@example.test", otp: "123456", newPin: "654321" }) });
    const otpRequest = await request("/api/otp/request", { method: "POST", body: JSON.stringify({ phone: "0712345678" }) });
    assert.equal(forgotPin.status, 503);
    assert.equal(resetPin.status, 503);
    assert.equal(otpRequest.status, 503);
    const afterRecovery = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8"));
    assert.equal(afterRecovery.users[0].resetOtp, beforeRecovery.users[0].resetOtp);
    assert.equal(afterRecovery.users[0].pinHash, beforeRecovery.users[0].pinHash);
  });

  test("preserves distinct concurrent writes instead of replacing a newer snapshot", async () => {
    const responses = await Promise.all([
      request("/api/messages", { method: "POST", write: true, body: JSON.stringify({ text: "Concurrent message A" }) }),
      request("/api/messages", { method: "POST", write: true, body: JSON.stringify({ text: "Concurrent message B" }) }),
    ]);
    assert.deepEqual(responses.map(response => response.status), [201, 201]);

    const messages = await request("/api/messages");
    assert.equal(messages.status, 200);
    const texts = (await json(messages)).data.map(message => message.text);
    assert.ok(texts.includes("Concurrent message A"));
    assert.ok(texts.includes("Concurrent message B"));
  });

  test("profile page loads profile API data and securely saves profile details and photo icons", async () => {
    const page = await request("/profile.html");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/profile\.js\?v=20261101\.1"/);
    const script = await request("/profile.js?v=20261101.1");
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

  test("only permits direct officer assignment during initial setup", async () => {
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
    assert.equal(laterProposal.status, 409);
    assert.match((await json(laterProposal)).message, /member election/i);

    const secondInvitation = await request("/api/invitations", { method: "POST", write: true, body: JSON.stringify({ name: "Runoff Candidate", phone: "0712345681", email: "runoff@example.test", role: "member" }) });
    assert.equal(secondInvitation.status, 201);
    const secondInvitationBody = await json(secondInvitation);
    const secondActivation = await request("/api/invitations/activate", { method: "POST", body: JSON.stringify({ phone: "0712345681", code: secondInvitationBody.activationCode, pin: "678901" }) });
    assert.equal(secondActivation.status, 201);
    const secondCandidateId = (await json(secondActivation)).user.id;

    cookie = secretaryCookie;
    const declinedProposal = await request("/api/leadership-elections", { method: "POST", write: true, body: JSON.stringify({ role: "treasurer", candidateIds: [treasurerId, secondCandidateId] }) });
    assert.equal(declinedProposal.status, 201);
    const declinedId = (await json(declinedProposal)).data.id;
    cookie = chairCookie;
    assert.equal((await request(`/api/leadership-elections/${declinedId}/decline`, { method: "POST", write: true, body: JSON.stringify({}) })).status, 200);
    cookie = secretaryCookie;
    const electionProposal = await request("/api/leadership-elections", { method: "POST", write: true, body: JSON.stringify({ role: "treasurer", candidateIds: [treasurerId, secondCandidateId] }) });
    assert.equal(electionProposal.status, 201);
    const electionId = (await json(electionProposal)).data.id;
    cookie = chairCookie;
    assert.equal((await request(`/api/leadership-elections/${electionId}/accept`, { method: "POST", write: true, body: JSON.stringify({}) })).status, 200);

    const castVote = async (voterCookie, candidateId) => {
      cookie = voterCookie;
      return request(`/api/leadership-elections/${electionId}/vote`, { method: "POST", write: true, body: JSON.stringify({ candidateId }) });
    };
    await castVote(chairCookie, treasurerId);
    await castVote(secretaryCookie, secondCandidateId);
    const treasurerLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ phone: "0712345680", pin: "901234" }) });
    const treasurerCookie = treasurerLogin.headers.getSetCookie?.()[0]?.split(";")[0] || treasurerLogin.headers.get("set-cookie")?.split(";")[0];
    assert.equal(treasurerLogin.status, 200);
    await castVote(treasurerCookie, treasurerId);
    const secondLogin = await request("/api/login", { method: "POST", body: JSON.stringify({ phone: "0712345681", pin: "678901" }) });
    const secondCookie = secondLogin.headers.getSetCookie?.()[0]?.split(";")[0] || secondLogin.headers.get("set-cookie")?.split(";")[0];
    assert.equal(secondLogin.status, 200);
    assert.equal((await castVote(secondCookie, secondCandidateId)).status, 200);
    assert.equal((await castVote(secondCookie, treasurerId)).status, 409);

    cookie = secondCookie;
    const votingElection = (await json(await request("/api/dashboard"))).leadershipElections.find(item => item.id === electionId);
    assert.equal(votingElection.votesCast, 4);
    assert.equal(votingElection.result, null);
    cookie = chairCookie;
    const legacyLeadershipView = await json(await request("/api/leadership-changes"));
    assert.ok(legacyLeadershipView.data.every(item => item.type !== "election"), "the legacy leadership endpoint must not reveal raw secret ballots");
    cookie = secondCookie;
    assert.equal(JSON.stringify(votingElection).includes("voterToken"), false);
    cookie = chairCookie;
    const closed = await request(`/api/leadership-elections/${electionId}/close`, { method: "POST", write: true, body: JSON.stringify({}) });
    assert.equal(closed.status, 200);
    assert.deepEqual((await json(closed)).data.result.tiedCandidateIds.sort(), [treasurerId, secondCandidateId].sort());
    cookie = secondCookie;
    assert.equal((await json(await request("/api/leadership-elections"))).data.find(item => item.id === electionId).result, null);
    cookie = chairCookie;
    assert.equal((await request(`/api/leadership-elections/${electionId}/verify`, { method: "POST", write: true, body: JSON.stringify({}) })).status, 200);
    cookie = secondCookie;
    const electionList = await json(await request("/api/leadership-elections"));
    const runoff = electionList.data.find(item => item.runoff && item.parentElectionId === electionId);
    assert.ok(runoff, "a verified tie should open a runoff");
    assert.equal(runoff.status, "voting");
    assert.deepEqual(runoff.candidates.map(item => item.id).sort(), [treasurerId, secondCandidateId].sort());
    const privateMessages = await json(await request("/api/messages"));
    assert.ok(privateMessages.data.every(message => !message.recipientId || message.recipientId === secondCandidateId));
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
