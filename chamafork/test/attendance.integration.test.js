"use strict";

const assert = require("node:assert/strict");
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
    body: JSON.stringify({ phone, code: invitation.activationCode, pin })
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
  server = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
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
  test("audits attendance edits and verifies three-party loan approval workflows", async () => {
    const setup = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0700000001", email: "chair@example.test", pin: "123456" })
    });
    assert.equal(setup.status, 201);
    const chairCookie = sessionCookie(setup);

    const secretaryId = await createAccount(chairCookie, "Test Secretary", "0700000002", "234567");
    await promote(chairCookie, null, secretaryId, "secretary");
    const secretaryCookie = await login("0700000002", "234567");

    const treasurerId = await createAccount(chairCookie, "Test Treasurer", "0700000003", "345678");
    await promote(chairCookie, secretaryCookie, treasurerId, "treasurer");
    const treasurerCookie = await login("0700000003", "345678");

    const memberId = await createAccount(chairCookie, "Test Member", "0700000004", "456789");
    const memberCookie = await login("0700000004", "456789");
    const date = "2026-10-10";
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
    assert.match(page, /Meetings · attendance register/);
    assert.match(page, /Mark all present/);
    assert.match(page, /Mark all absent/);
    assert.match(page, /attendance-readonly-label[^>]*hidden/);
    assert.match(page, /View-only for non-Secretary/);
    assert.match(page, /Loan requests/);
    const clientSource = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "chama.js"), "utf8");
    assert.match(clientSource, /loan-approval-trail/);
    assert.match(clientSource, /Last edited by/);
    assert.match(clientSource, /removed from present/);
    assert.match(page, /borrowers cannot decide their own requests/i);
    assert.match(page, /does not transfer loan funds/);
    assert.doesNotMatch(page, /broadcast-panel|vote-fields|M-Pesa Paybill payments appear automatically/);
    assert.doesNotMatch(clientSource, /api\/messages|leadership-type|payments\/mpesa|M-Pesa payment received/);

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

    const rejectionRequestEvent = nextSseEvent(reader, "loans-updated");
    const rejectionRequest = await request("/api/loans", {
      cookie: memberCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ amount: 1200, months: 2, guarantorIds: [treasurerId, independentId] })
    });
    assert.equal(rejectionRequest.status, 201);
    const rejectionRequestBody = await body(rejectionRequest);
    const rejectedLoanId = rejectionRequestBody.data.id;
    assert.equal(rejectionRequestBody.data.status, "Requested");
    assert.equal(rejectionRequestBody.data.memberId, memberId);
    assert.equal(rejectionRequestBody.data.amount, 1200);
    assert.equal(rejectionRequestBody.data.months, 2);
    assert.ok(rejectionRequestBody.data.createdAt);
    assert.match(rejectionRequestBody.message, /waiting for approval/i);
    assert.match(await rejectionRequestEvent, new RegExp(`"id":"${rejectedLoanId}"`));

    const chairDashboard = await body(await request("/api/dashboard", { cookie: chairCookie }));
    const treasurerDashboard = await body(await request("/api/dashboard", { cookie: treasurerCookie }));
    const independentDashboard = await body(await request("/api/dashboard", { cookie: independentCookie }));
    assert.ok(chairDashboard.loans.some(loan => loan.id === rejectedLoanId));
    assert.ok(treasurerDashboard.loans.some(loan => loan.id === rejectedLoanId));
    assert.ok(independentDashboard.approvalQueue.some(loan => loan.id === rejectedLoanId));

    const selfDecision = await request(`/api/loans/${rejectedLoanId}/decisions`, {
      cookie: memberCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "I approve my own request" })
    });
    assert.equal(selfDecision.status, 403);

    const chairDecisionEvent = nextSseEvent(reader, "loans-updated");
    const chairDecision = await request(`/api/loans/${rejectedLoanId}/decisions`, {
      cookie: chairCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "Private chair approval note" })
    });
    assert.equal(chairDecision.status, 200);
    assert.match(await chairDecisionEvent, new RegExp(`"id":"${rejectedLoanId}"`));
    const chairDecisionBody = await body(chairDecision);
    assert.equal(chairDecisionBody.data.approvalCount, 1);
    assert.equal(chairDecisionBody.data.approvalSteps[0].status, "approve");
    assert.equal(chairDecisionBody.data.approvalSteps[1].status, "awaiting");
    assert.ok(chairDecisionBody.data.approvalSteps[0].at);
    assert.equal(chairDecisionBody.data.approvalSteps[0].reason, "Private chair approval note");
    const borrowerPending = await body(await request("/api/dashboard", { cookie: memberCookie }));
    const borrowerPendingLoan = borrowerPending.loans.find(loan => loan.id === rejectedLoanId);
    assert.match(borrowerPendingLoan.progressMessage, /1 of 3 required approvals complete — waiting for Treasurer/);
    assert.equal(borrowerPendingLoan.history[0].reason, null);
    assert.doesNotMatch(JSON.stringify(borrowerPendingLoan), /Private chair approval note/);

    const rejectEvent = nextSseEvent(reader, "loans-updated");
    const treasurerDecision = await request(`/api/loans/${rejectedLoanId}/decisions`, {
      cookie: treasurerCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "reject", reason: "Treasurer declines after review" })
    });
    assert.equal(treasurerDecision.status, 200);
    assert.match(await rejectEvent, new RegExp(`"id":"${rejectedLoanId}"`));
    const rejected = await body(treasurerDecision);
    assert.equal(rejected.data.status, "rejected");
    assert.equal(rejected.data.approvalCount, 2);
    assert.equal(rejected.data.approvalSteps[1].status, "reject");
    assert.ok(rejected.data.approvalSteps[1].at);
    const borrowerRejected = await body(await request("/api/dashboard", { cookie: memberCookie }));
    const borrowerRejectedLoan = borrowerRejected.loans.find(loan => loan.id === rejectedLoanId);
    assert.equal(borrowerRejectedLoan.history[0].reason, null);
    assert.equal(borrowerRejectedLoan.history[1].reason, "Treasurer declines after review");
    assert.doesNotMatch(JSON.stringify(borrowerRejectedLoan), /Private chair approval note/);
    assert.match(borrowerRejectedLoan.progressMessage, /Loan rejected/);

    const approvedRequest = await request("/api/loans", {
      cookie: memberCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ amount: 2000, months: 6, guarantorIds: [treasurerId, independentId] })
    });
    assert.equal(approvedRequest.status, 201);
    const approvedLoanId = (await body(approvedRequest)).data.id;
    const chairApproval = await request(`/api/loans/${approvedLoanId}/decisions`, {
      cookie: chairCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "Purpose and repayment plan reviewed" })
    });
    assert.equal(chairApproval.status, 200);
    const treasurerApproval = await request(`/api/loans/${approvedLoanId}/decisions`, {
      cookie: treasurerCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "Group funds are available" })
    });
    assert.equal(treasurerApproval.status, 200);
    const twoApprovals = await body(await request("/api/dashboard", { cookie: independentCookie }));
    const pendingApproval = twoApprovals.approvalQueue.find(loan => loan.id === approvedLoanId);
    assert.equal(pendingApproval.approvalCount, 2);
    assert.match(pendingApproval.progressMessage, /2 of 3 required approvals complete — waiting for Member/);
    assert.deepEqual(pendingApproval.approvalSteps.map(step => step.status), ["approve", "approve", "awaiting"]);
    const anotherMemberId = await createAccount(chairCookie, "Another Member", "0700000006", "678901");
    const anotherMemberCookie = await login("0700000006", "678901");
    assert.ok(anotherMemberId);
    const independentDecision = await request(`/api/loans/${approvedLoanId}/decisions`, {
      cookie: independentCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "Independent review supports approval" })
    });
    assert.equal(independentDecision.status, 200);
    const approved = await body(independentDecision);
    assert.equal(approved.data.status, "approved");
    assert.equal(approved.data.approvalCount, 3);
    assert.equal(approved.data.outstanding, 2365, "principal plus six months of 5% reducing-balance interest");
    assert.equal(approved.message, "Loan approved. Any disbursement happens outside this app.");
    assert.ok(approved.data.approvalSteps.every(step => step.at && step.approverName && step.reason));
    const borrowerApproved = await body(await request("/api/dashboard", { cookie: memberCookie }));
    const borrowerApprovedLoan = borrowerApproved.loans.find(loan => loan.id === approvedLoanId);
    assert.equal(borrowerApprovedLoan.approvalCount, 3);
    assert.equal(borrowerApprovedLoan.progressMessage, "Loan approved. Any disbursement happens outside this app.");
    assert.equal(borrowerApprovedLoan.history[0].reason, null);
    assert.equal(borrowerApprovedLoan.history[1].reason, null);
    assert.equal(borrowerApprovedLoan.history[2].reason, null);

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

    const duplicateSlotRequest = await request("/api/loans", {
      cookie: memberCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ amount: 1500, months: 1, guarantorIds: [treasurerId, independentId] })
    });
    assert.equal(duplicateSlotRequest.status, 201);
    const duplicateSlotLoanId = (await body(duplicateSlotRequest)).data.id;
    const slotChairApproval = await request(`/api/loans/${duplicateSlotLoanId}/decisions`, {
      cookie: chairCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "Reviewed by the chairperson" })
    });
    assert.equal(slotChairApproval.status, 200);
    const slotMemberApproval = await request(`/api/loans/${duplicateSlotLoanId}/decisions`, {
      cookie: independentCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "Independent member review completed" })
    });
    assert.equal(slotMemberApproval.status, 200);
    const duplicateRoleDecision = await request(`/api/loans/${duplicateSlotLoanId}/decisions`, {
      cookie: anotherMemberCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "Second Member decision" })
    });
    assert.equal(duplicateRoleDecision.status, 409);

    const secretaryLoanRequest = await request("/api/loans", {
      cookie: secretaryCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ amount: 1000, months: 3, guarantorIds: [treasurerId, independentId] })
    });
    assert.equal(secretaryLoanRequest.status, 201);
    const secretaryLoanId = (await body(secretaryLoanRequest)).data.id;
    const secretarySelfDecision = await request(`/api/loans/${secretaryLoanId}/decisions`, {
      cookie: secretaryCookie,
      method: "POST",
      write: true,
      body: JSON.stringify({ decision: "approve", reason: "Secretary requests own loan" })
    });
    assert.equal(secretarySelfDecision.status, 403);
    for (const [cookie, reason] of [
      [chairCookie, "Chairperson reviewed secretary request"],
      [treasurerCookie, "Treasurer reviewed secretary request"],
      [independentCookie, "Independent member reviewed secretary request"]
    ]) {
      const decision = await request(`/api/loans/${secretaryLoanId}/decisions`, {
        cookie,
        method: "POST",
        write: true,
        body: JSON.stringify({ decision: "approve", reason })
      });
      assert.equal(decision.status, 200);
    }
    const secretaryDashboard = await body(await request("/api/dashboard", { cookie: secretaryCookie }));
    assert.equal(secretaryDashboard.loans.find(loan => loan.id === secretaryLoanId).status, "approved");

    const officerLoanCases = [
      {
        cookie: chairCookie,
        expectedRoles: ["secretary", "treasurer", "member"],
        reviewers: [
          [secretaryCookie, "Secretary replaces the Chairperson borrower"],
          [treasurerCookie, "Treasurer reviewed the Chairperson loan"],
          [independentCookie, "Member reviewed the Chairperson loan"]
        ]
      },
      {
        cookie: treasurerCookie,
        expectedRoles: ["chairperson", "secretary", "member"],
        reviewers: [
          [chairCookie, "Chairperson reviewed the Treasurer loan"],
          [secretaryCookie, "Secretary replaces the Treasurer borrower"],
          [independentCookie, "Member reviewed the Treasurer loan"]
        ]
      }
    ];
    for (const loanCase of officerLoanCases) {
      const requester = (await body(await request("/api/dashboard", { cookie: loanCase.cookie }))).user;
      const requestResponse = await request("/api/loans", {
        cookie: loanCase.cookie,
        method: "POST",
        write: true,
        body: JSON.stringify({ amount: 1000, months: 1, guarantorIds: [treasurerId, independentId, secretaryId].filter(id => id !== requester.id).slice(0, 2) })
      });
      assert.equal(requestResponse.status, 201);
      const loanId = (await body(requestResponse)).data.id;
      const secretaryQueue = await body(await request("/api/dashboard", { cookie: secretaryCookie }));
      assert.ok(secretaryQueue.approvalQueue.some(loan => loan.id === loanId));
      const borrowerDecision = await request(`/api/loans/${loanId}/decisions`, {
        cookie: loanCase.cookie,
        method: "POST",
        write: true,
        body: JSON.stringify({ decision: "approve", reason: "Borrower self-approval attempt" })
      });
      assert.equal(borrowerDecision.status, 403);
      for (const [cookie, reason] of loanCase.reviewers) {
        const decision = await request(`/api/loans/${loanId}/decisions`, {
          cookie,
          method: "POST",
          write: true,
          body: JSON.stringify({ decision: "approve", reason })
        });
        assert.equal(decision.status, 200);
      }
      const borrowerDashboard = await body(await request("/api/dashboard", { cookie: loanCase.cookie }));
      const approvedLoan = borrowerDashboard.loans.find(loan => loan.id === loanId);
      assert.equal(approvedLoan.memberId, requester.id);
      assert.equal(approvedLoan.status, "approved");
      assert.deepEqual(approvedLoan.approvalSteps.map(step => step.role), loanCase.expectedRoles);
      assert.ok(approvedLoan.approvalSteps.every(step => step.status === "approve"));
    }

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
    assert.equal(savedRejectedLoan.memberId, memberId);
    assert.equal(savedRejectedLoan.status, "rejected");
    assert.deepEqual(savedRejectedLoan.approvals.map(item => [item.role, item.decision, item.reason]), [
      ["chairperson", "approve", "Private chair approval note"],
      ["treasurer", "reject", "Treasurer declines after review"]
    ]);
    assert.ok(savedRejectedLoan.approvals.every(item => item.approverId && item.approverName && item.at));
    const savedApprovedLoan = persisted.loans.find(loan => loan.id === approvedLoanId);
    assert.equal(savedApprovedLoan.status, "repaid");
    assert.deepEqual(savedApprovedLoan.approvals.map(item => item.role), ["chairperson", "treasurer", "member"]);
    assert.ok(savedApprovedLoan.approvals.every(item => item.decision === "approve" && item.reason && item.approverId && item.at));
  });
});
