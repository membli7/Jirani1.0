"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, describe, test } = require("node:test");

let server;
let baseUrl;
let tempDir;
const dataFile = () => path.join(tempDir, "data.json");
const testPort = 30000 + (process.pid % 10000);

function request(route, options = {}) {
  const { cookie, write, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers || {});
  if (cookie) headers.set("Cookie", cookie);
  if (requestOptions.body !== undefined) {
    headers.set("Content-Type", "application/json");
    headers.set("X-Requested-With", "chama");
  }
  if (write) headers.set("Idempotency-Key", `attendance-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return fetch(`${baseUrl}${route}`, { ...requestOptions, headers });
}

async function body(response) {
  return response.json();
}

async function nextSseEvent(reader, eventName) {
  const decoder = new TextDecoder();
  let buffered = "";
  while (!buffered.includes(`event: ${eventName}\n`)) {
    let timeout;
    const timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}.`)), 5000);
    });
    let result;
    try {
      result = await Promise.race([reader.read(), timeoutPromise]);
    } finally {
      clearTimeout(timeout);
    }
    if (result.done) throw new Error("The event stream closed unexpectedly.");
    buffered += decoder.decode(result.value, { stream: true });
  }
  return buffered;
}

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

function sessionCookie(response) {
  const value = response.headers.getSetCookie?.()[0] || response.headers.get("set-cookie");
  assert.ok(value, "successful sign-in should establish a session cookie");
  return value.split(";")[0];
}

async function createAccount(chairCookie, name, phone, pin) {
  const invitationResponse = await request("/api/invitations", {
    cookie: chairCookie,
    method: "POST",
    write: true,
    body: JSON.stringify({ name, phone, email: `member-${phone.replace(/\D/g, "")}@example.test`, role: "member" })
  });
  assert.equal(invitationResponse.status, 201);
  const invitation = await body(invitationResponse);
  const activation = await request("/api/invitations/activate", {
    method: "POST",
    body: JSON.stringify({ phone, code: invitation.activationCode, pin, termsAccepted: true })
  });
  assert.equal(activation.status, 201);
  return (await body(activation)).user.id;
}

async function login(phone, pin) {
  const response = await request("/api/login", {
    method: "POST",
    body: JSON.stringify({ phone, pin })
  });
  assert.equal(response.status, 200);
  return sessionCookie(response);
}

async function promote(chairCookie, secretaryCookie, userId, role) {
  const proposal = await request("/api/leadership-changes", {
    cookie: chairCookie,
    method: "POST",
    write: true,
    body: JSON.stringify({
      role,
      incomingUserId: userId,
      effectiveDate: "2030-01-01"
    })
  });
  assert.equal(proposal.status, 201);
  const record = (await body(proposal)).data;
  if (record.status === "pending") {
    const confirmation = await request(`/api/leadership-changes/${record.id}/confirm`, {
      cookie: secretaryCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({})
    });
    assert.equal(confirmation.status, 200);
  }
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-attendance-test-"));
  const chamaId = "attendance-test-chama";
  const users = [
    ["chair", "Test Chair", "0700000001", "chairperson", "123456"],
    ["secretary", "Test Secretary", "0700000002", "secretary", "234567"],
    ["treasurer", "Test Treasurer", "0700000003", "treasurer", "345678"],
    ["member", "Test Member", "0700000004", "member", "456789"],
  ].map(([id, name, phone, role, pin]) => ({ id, name, phone: `+254${phone.slice(1)}`, email: `${id}@example.test`, role, status: "active", chamaId, pinHash: pinHash(pin), mustChangePin: false, shareCapital: 0, createdAt: new Date(Date.now() - 90 * 86400000).toISOString() }));
  fs.writeFileSync(dataFile(), JSON.stringify({ version: 2, chamas: [{ id: chamaId, name: "Test Chama", createdAt: new Date().toISOString(), subscription: require("./active-subscription-fixture").activeSubscription() }], users, transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {}, registers: [], auditLog: [], welfareReserve: 0, penalties: [], settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 5, meetingDates: {} }, dividendCycles: [], messages: [] }));
  server = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_BACKEND: "json",
      PORT: String(testPort),
      SESSION_SECRET: "attendance-integration-test-session-secret",
      CHAMA_DATA_FILE: dataFile(),
      AFRICASTALKING_USERNAME: "",
      AFRICASTALKING_API_KEY: ""
    }
  });
  let output = "";
  baseUrl = `http://127.0.0.1:${testPort}`;
  server.stdout.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 5000);
    server.stdout.on("data", () => {
      if (output.includes(`localhost:${testPort}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
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

describe("attendance registers", () => {
  test("audits attendance edits and verifies automatic loan decisions and scoped record access", async () => {
    const chairCookie = await login("0700000001", "123456");
    const secretaryCookie = await login("0700000002", "234567");
    const treasurerCookie = await login("0700000003", "345678");
    const memberCookie = await login("0700000004", "456789");
    const secretaryId = "secretary";
    const treasurerId = "treasurer";
    const memberId = "member";    const date = "2026-10-10";
    const initialList = await body(await request("/api/attendance", { cookie: secretaryCookie }));
    assert.equal(initialList.readOnly, false);
    assert.equal(initialList.registers.length, 0);
    const attendees = initialList.members.map(member => ({ userId: member.id, present: true }));

    const created = await request("/api/attendance", {
      cookie: secretaryCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ date, expectedRevision: null, attendees })
    });
    assert.equal(created.status, 201);
    const createdBody = await body(created);
    assert.equal(createdBody.data.date, date);
    assert.equal(createdBody.data.revision, 1);
    assert.equal(createdBody.data.createdBy.role, "secretary");
    assert.equal(createdBody.data.createdBy.name, "Test Secretary");
    assert.ok(createdBody.data.createdAt);
    assert.equal(createdBody.data.presentCount, attendees.length);

    const retrieved = await body(await request("/api/attendance", { cookie: secretaryCookie }));
    const savedRegister = retrieved.registers.find(register => register.date === date);
    assert.equal(savedRegister.id, createdBody.data.id);
    assert.equal(savedRegister.attendees.length, attendees.length);
    assert.equal(savedRegister.revision, 1);

    const editedAttendees = attendees.map(attendee => ({ ...attendee, present: attendee.userId !== memberId }));
    const edited = await request("/api/attendance", {
      cookie: secretaryCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ date, expectedRevision: 1, attendees: editedAttendees })
    });
    assert.equal(edited.status, 200);
    const editedBody = await body(edited);
    assert.equal(editedBody.data.revision, 2);
    assert.equal(editedBody.data.editedBy.name, "Test Secretary");
    assert.ok(editedBody.data.editedAt);
    assert.deepEqual(editedBody.data.history[0].changes, [{
      userId: memberId,
      name: "Test Member",
      from: "present",
      to: "absent"
    }]);

    const treasurerView = await body(await request("/api/attendance", { cookie: treasurerCookie }));
    assert.equal(treasurerView.readOnly, true);
    assert.equal(treasurerView.registers[0].editedBy.name, "Test Secretary");
    assert.equal(treasurerView.registers[0].attendees.find(item => item.userId === memberId).present, false);
    assert.equal(treasurerView.registers[0].history[0].changes[0].to, "absent");
    const chairView = await body(await request("/api/attendance", { cookie: chairCookie }));
    assert.equal(chairView.readOnly, true);
    assert.equal(chairView.registers[0].attendees.find(item => item.userId === memberId).present, false);
    const forbiddenEdit = await request("/api/attendance", {
      cookie: treasurerCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ date, expectedRevision: 2, attendees: editedAttendees })
    });
    assert.equal(forbiddenEdit.status, 403);

    const memberView = await body(await request("/api/attendance", { cookie: memberCookie }));
    assert.equal(memberView.readOnly, true);
    assert.equal(memberView.registers[0].attendees.length, 1);
    assert.equal(memberView.registers[0].attendees[0].userId, memberId);
    assert.equal(memberView.registers[0].attendees[0].present, false);
    assert.equal(memberView.registers[0].editedBy.role, "secretary");
    assert.ok(memberView.registers[0].history[0].changes.some(change => change.name === "Test Member" && change.from === "present" && change.to === "absent"));
    const servedPage = await request("/");
    assert.equal(servedPage.status, 200);
    const page = await servedPage.text();
    assert.match(page, /<div id="root"><\/div>/);
    assert.match(page, /src="\/assets\/main-[^\"]+\.js"/);
    const bundlePath = page.match(/src="([^\"]+\.js)"/)?.[1];
    assert.ok(bundlePath, "served dashboard must include the production React bundle");
    const bundleResponse = await request(bundlePath);
    assert.equal(bundleResponse.status, 200);
    const bundle = await bundleResponse.text();
    const dashboardTemplate = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "index.html"), "utf8");
    assert.match(dashboardTemplate, /id="react-attendance-root"/);
    assert.doesNotMatch(dashboardTemplate, /id="attendance-date"|id="attendance-members"|id="attendance-save"/);
    assert.match(bundle, /Meetings · attendance register/);
    assert.match(bundle, /Mark all present/);
    assert.match(bundle, /Mark all absent/);
    assert.match(bundle, /View-only for non-Secretary/);
    const attendanceSource = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "react", "src", "components", "AttendancePanel.jsx"), "utf8");
    assert.match(attendanceSource, /const secretary = user\?\.role === "secretary"/);
    assert.match(attendanceSource, /expectedRevision: register\?\.revision \?\? null/);
    assert.doesNotMatch(attendanceSource, /dangerouslySetInnerHTML|innerHTML/);
    assert.match(dashboardTemplate, /id="react-loans-root"/);
    assert.match(bundle, /Loan records/);
    assert.match(bundle, /Automatic eligibility/);
    const loansSource = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "react", "src", "components", "LoansPanel.jsx"), "utf8");
    assert.match(loansSource, /loan-approval-trail/);
    assert.match(loansSource, /they do not vote on new applications/i);
    assert.match(loansSource, /does not transfer or disburse loan funds/i);
    const clientSource = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "chama.js"), "utf8");
    assert.doesNotMatch(clientSource, /loan-approval-trail|loanStatusLabel|updateLoanRequestAccess|\$\("#loan-form"\)|\$\("#loans"\)/);
    assert.doesNotMatch(clientSource, /renderAttendance|updateAttendanceCount|attendance-date|attendance-save/);
    assert.match(attendanceSource, /Last edited by/);
    assert.match(attendanceSource, /removed from present/);
    assert.match(`${dashboardTemplate}\n${loansSource}`, /they do not vote on new applications/i);
    assert.match(`${dashboardTemplate}\n${loansSource}`, /does not transfer or disburse loan funds/);
    assert.doesNotMatch(`${dashboardTemplate}\n${clientSource}`, /broadcast-panel|vote-fields|M-Pesa Paybill payments appear automatically/);
    assert.doesNotMatch(clientSource, /leadership-type|payments\/mpesa|M-Pesa payment received/);

    const secondSecretarySession = await login("0700000002", "234567");
    const raceAttendeesA = editedAttendees.map(attendee => ({ ...attendee, present: attendee.present && attendee.userId !== secretaryId }));
    const raceAttendeesB = editedAttendees.map(attendee => ({ ...attendee, present: attendee.present && attendee.userId !== treasurerId }));
    const competing = await Promise.all([
      request("/api/attendance", {
        cookie: secretaryCookie,
        method: "POST",
        write: true,
        body: JSON.stringify({ date, expectedRevision: 2, attendees: raceAttendeesA })
      }),
      request("/api/attendance", {
        cookie: secondSecretarySession,
        method: "POST",
        write: true,
        body: JSON.stringify({ date, expectedRevision: 2, attendees: raceAttendeesB })
      })
    ]);
    assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
    const stale = competing.find(response => response.status === 409);
    assert.match((await body(stale)).message, /already updated.*refresh/i);
    const memberHistory = await body(await request("/api/attendance", { cookie: memberCookie }));
    assert.ok(memberHistory.registers[0].history[1].changes.some(change => ["Test Secretary", "Test Treasurer"].includes(change.name)));

    const csv = await request("/api/export.csv", { cookie: secretaryCookie });
    assert.equal(csv.status, 200);
    const csvText = await csv.text();
    assert.match(csvText, /"Date","Member","Amount \(KES\)","Method","Type","Reference"/);
    assert.match(csvText, /"Meeting date","Member","Attendance","Recorded by","Recorded at","Edited by","Edited at","Edit history"/);
    assert.match(csvText, /"2026-10-10","Test Member","Absent","Test Secretary"/);
    assert.match(csvText, /Test Member: present to absent/);

    const independentId = await createAccount(chairCookie, "Independent Member", "0700000005", "567890");
    const independentCookie = await login("0700000005", "567890");
    const contribution = await request("/api/contributions", {
      cookie: treasurerCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ memberId, amount: 50000, method: "Cash", note: "Opening group contribution", referenceNumber: "RCPT-0001", date: "2026-10-05" })
    });
    assert.equal(contribution.status, 201);
    const chairId = (await body(await request("/api/dashboard", { cookie: chairCookie }))).user.id;
    for (const [creditId, reference] of [[chairId, "RCPT-0101"], [secretaryId, "RCPT-0102"], [treasurerId, "RCPT-0103"], [independentId, "RCPT-0104"]]) {
      const credit = await request("/api/contributions", { cookie: treasurerCookie, method: "POST", write: true, body: JSON.stringify({ memberId: creditId, amount: 5000, method: "Cash", note: "Share capital for loan tests", referenceNumber: reference, date: "2026-10-05" }) });
      assert.equal(credit.status, 201);
    }
    const policyResponse = await request("/api/loans/policy", { cookie: chairCookie, method: "POST", write: true, body: JSON.stringify({ maxGroupCashPercent: 100, maxMemberContributionPercent: 100, tiers: [{ maxAmountKsh: 1000, minActiveDays: 0, minShareContributionKsh: 0 }, { maxAmountKsh: 50000, minActiveDays: 0, minShareContributionKsh: 1000 }] }) });
    assert.equal(policyResponse.status, 200);
    const anotherMemberId = await createAccount(chairCookie, "Another Member", "0700000006", "678901");
    const anotherMemberCookie = await login("0700000006", "678901");

    const streamResponse = await request("/api/events/stream", { cookie: memberCookie });
    assert.equal(streamResponse.status, 200);
    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let initialEvent = "";
    while (!initialEvent.includes("event: ready\n")) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      initialEvent += decoder.decode(chunk.value, { stream: true });
    }

    const rejectedRequestEvent = nextSseEvent(reader, "loans-updated");
    const rejectedRequest = await request("/api/loans", {
      cookie: anotherMemberCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ amount: 1200, months: 2, guarantorIds: [treasurerId, independentId] })
    });
    assert.equal(rejectedRequest.status, 201);
    const rejectedRequestBody = await body(rejectedRequest);
    const rejectedLoanId = rejectedRequestBody.data.id;
    assert.equal(rejectedRequestBody.data.status, "rejected");
    assert.equal(rejectedRequestBody.data.memberId, anotherMemberId);
    assert.equal(rejectedRequestBody.data.amount, 1200);
    assert.equal(rejectedRequestBody.data.months, 2);
    assert.ok(rejectedRequestBody.data.createdAt);
    assert.equal(rejectedRequestBody.data.approvalCount, 0);
    assert.match(rejectedRequestBody.data.automatedDecision.reason, /requires KES 1000 in recorded share-capital contributions/);
    assert.match(rejectedRequestBody.message, /not approved automatically/i);
    assert.match(await rejectedRequestEvent, new RegExp(`"id":"${rejectedLoanId}"`));

    const chairDashboard = await body(await request("/api/dashboard", { cookie: chairCookie }));
    const treasurerDashboard = await body(await request("/api/dashboard", { cookie: treasurerCookie }));
    const borrowerDashboard = await body(await request("/api/dashboard", { cookie: anotherMemberCookie }));
    const independentDashboard = await body(await request("/api/dashboard", { cookie: independentCookie }));
    assert.ok(chairDashboard.loans.some(loan => loan.id === rejectedLoanId));
    assert.ok(treasurerDashboard.loans.some(loan => loan.id === rejectedLoanId));
    assert.ok(borrowerDashboard.loans.some(loan => loan.id === rejectedLoanId));
    assert.equal(independentDashboard.loans.some(loan => loan.id === rejectedLoanId), false, "an unrelated member cannot read another borrower’s decision record");
    assert.equal(independentDashboard.approvalQueue.length, 0, "new applications are not waiting for member votes");
    assert.deepEqual(chairDashboard.loanPolicy.tiers.map(tier => tier.maxAmountKsh), [1000, 50000]);

    const obsoleteVote = await request(`/api/loans/${rejectedLoanId}/decisions`, {
      cookie: chairCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "This role vote is obsolete" })
    });
    assert.equal(obsoleteVote.status, 409);

    const reviewRequestEvent = nextSseEvent(reader, "loans-updated");
    const humanReviewRequest = await request(`/api/loans/${rejectedLoanId}/review-requests`, {
      cookie: anotherMemberCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ reason: "Please check my share-capital records for this tier." })
    });
    assert.equal(humanReviewRequest.status, 201);
    assert.match(await reviewRequestEvent, new RegExp(`"id":"${rejectedLoanId}"`));
    const reviewableLoan = (await body(await request("/api/dashboard", { cookie: chairCookie }))).loans.find(loan => loan.id === rejectedLoanId);
    assert.equal(reviewableLoan.canReview, true);

    const reviewCompletionEvent = nextSseEvent(reader, "loans-updated");
    const confirmedReview = await request(`/api/loans/${rejectedLoanId}/reviews`, {
      cookie: chairCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "confirm", reason: "Checked the available records; the configured tier is not met." })
    });
    assert.equal(confirmedReview.status, 200);
    assert.match(await reviewCompletionEvent, new RegExp(`"id":"${rejectedLoanId}"`));
    const confirmedReviewBody = await body(confirmedReview);
    assert.equal(confirmedReviewBody.data.status, "rejected");
    assert.equal(confirmedReviewBody.data.humanReview.response.reviewerRole, "chairperson");
    assert.equal(confirmedReviewBody.data.humanReview.response.decision, "confirm");
    const borrowerRejected = await body(await request("/api/dashboard", { cookie: anotherMemberCookie }));
    const borrowerRejectedLoan = borrowerRejected.loans.find(loan => loan.id === rejectedLoanId);
    assert.equal(borrowerRejectedLoan.history[0].role, "automated");
    assert.equal(borrowerRejectedLoan.humanReview.response.reason, "Checked the available records; the configured tier is not met.");

    const approvedRequestEvent = nextSseEvent(reader, "loans-updated");
    const approvedRequest = await request("/api/loans", {
      cookie: memberCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ amount: 2000, months: 6, guarantorIds: [treasurerId, independentId] })
    });
    assert.equal(approvedRequest.status, 201);
    const approvedRequestBody = await body(approvedRequest);
    const approvedLoanId = approvedRequestBody.data.id;
    assert.equal(approvedRequestBody.data.status, "approved");
    assert.equal(approvedRequestBody.data.approvalCount, 0);
    assert.equal(approvedRequestBody.data.requiredApprovals, 0);
    assert.equal(approvedRequestBody.data.automatedDecision.decision, "approve");
    assert.equal(approvedRequestBody.data.approvalSteps.length, 0);
    assert.match(approvedRequestBody.message, /approved automatically/i);
    assert.match(await approvedRequestEvent, new RegExp(`"id":"${approvedLoanId}"`));
    const officerRecords = await body(await request("/api/dashboard", { cookie: treasurerCookie }));
    assert.ok(officerRecords.loans.some(loan => loan.id === approvedLoanId));

    const repayment = await request("/api/loan-repayment", {
      cookie: treasurerCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({
        memberId,
        amount: JSON.parse(fs.readFileSync(dataFile(), "utf8")).loans.find(item => item.id === approvedLoanId).outstanding,
        method: "Cash",
        note: "Full loan repayment",
        referenceNumber: "RCPT-0200",
        date: "2026-10-12",
        loanId: approvedLoanId
      })
    });
    assert.equal(repayment.status, 201);
    const borrowerRepaid = await body(await request("/api/dashboard", { cookie: memberCookie }));
    const repaidLoan = borrowerRepaid.loans.find(loan => loan.id === approvedLoanId);
    assert.equal(repaidLoan.status, "repaid");
    assert.equal(repaidLoan.progressMessage, "Loan repaid.");

    const secondMemberContribution = await request("/api/contributions", {
      cookie: treasurerCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ memberId: anotherMemberId, amount: 800, method: "Cash", note: "Second member contribution", referenceNumber: "RCPT-0002", date: "2026-10-05" })
    });
    assert.equal(secondMemberContribution.status, 201);
    const exports = await Promise.all([
      request("/api/export.csv", { cookie: chairCookie }),
      request("/api/export.csv", { cookie: secretaryCookie }),
      request("/api/export.csv", { cookie: treasurerCookie }),
      request("/api/export.csv", { cookie: memberCookie }),
      request("/api/export.csv", { cookie: anotherMemberCookie })
    ]);
    for (const response of exports) {
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/csv/);
      assert.match(response.headers.get("content-disposition"), /jirani-register\.csv/);
    }
    const [chairCsv, secretaryCsv, treasurerCsv, memberCsv, otherMemberCsv] = await Promise.all(exports.map(response => response.text()));
    for (const csvText of [chairCsv, secretaryCsv, treasurerCsv]) {
      assert.match(csvText, /"Date","Member","Amount \(KES\)","Method","Type","Reference"/);
      assert.match(csvText, /"Test Member","50000"/);
      assert.match(csvText, /"Another Member","800"/);
      assert.match(csvText, /"Meeting date","Member","Attendance"/);
    }
    assert.match(memberCsv, /"Test Member","50000"/);
    assert.doesNotMatch(memberCsv, /"Another Member","800"/);
    assert.match(memberCsv, /"2026-10-10","Test Member","Absent"/);
    assert.doesNotMatch(otherMemberCsv, /"Test Member","50000"/);
    assert.match(otherMemberCsv, /"Another Member","800"/);
    assert.doesNotMatch(otherMemberCsv, /"2026-10-10","Test Member"/);
    await reader.cancel();

    const persisted = JSON.parse(fs.readFileSync(dataFile(), "utf8"));
    assert.equal(persisted.registers[0].revision, 3);
    assert.deepEqual(persisted.auditLog.filter(item => item.type.startsWith("attendance.")).map(item => item.type), ["attendance.created", "attendance.edited", "attendance.edited"]);
    const savedRejectedLoan = persisted.loans.find(loan => loan.id === rejectedLoanId);
    assert.equal(savedRejectedLoan.memberId, anotherMemberId);
    assert.equal(savedRejectedLoan.status, "rejected");
    assert.deepEqual(savedRejectedLoan.approvals.map(item => [item.role, item.decision]), [["automated", "reject"]]);
    assert.ok(savedRejectedLoan.approvals.every(item => item.approverId && item.approverName && item.at));
    assert.equal(persisted.auditLog.find(item => item.type === "loan.review.completed" && item.entityId === rejectedLoanId).by.id, "chair");
    const savedApprovedLoan = persisted.loans.find(loan => loan.id === approvedLoanId);
    assert.equal(savedApprovedLoan.status, "repaid");
    assert.deepEqual(savedApprovedLoan.approvals.map(item => item.role), ["automated"]);
    assert.ok(savedApprovedLoan.approvals.every(item => item.decision === "approve" && item.reason && item.approverId && item.at));
  });
});
