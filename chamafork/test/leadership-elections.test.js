"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { applyDueElections, applyDueReElectionApprovals, applyScheduledElections, createScheduledReElection, electionView, electionWindow, reElectionApprovalResult, reElectionApprovalView, resultFor } = require("../leadership-elections");

function election(ballots) {
  return { type: "election", id: "e1", chamaId: "g1", role: "chairperson", candidateIds: ["a", "b", "c"], ballots };
}

test("highest vote total wins without a quorum gate", () => {
  const result = resultFor(election([
    { voterToken: "v1", candidateId: "a" },
    { voterToken: "v2", candidateId: "a" },
    { voterToken: "v3", candidateId: "b" },
  ]));
  assert.equal(result.winnerId, "a");
  assert.deepEqual(result.tiedCandidateIds, []);
  assert.equal(result.counts.a, 2);
  assert.equal(result.votesCast, 3);
});

test("a tie among the top candidates returns only those candidates for a rematch", () => {
  const result = resultFor(election([
    { voterToken: "v1", candidateId: "a" },
    { voterToken: "v2", candidateId: "b" },
    { voterToken: "v3", candidateId: "a" },
    { voterToken: "v4", candidateId: "b" },
    { voterToken: "v5", candidateId: "c" },
  ]));
  assert.equal(result.winnerId, null);
  assert.deepEqual(result.tiedCandidateIds, ["a", "b"]);
});

test("secret ballots omit choices and voter tokens from every election view", () => {
  const item = { ...election([{ voterToken: "secret-token", candidateId: "a" }]), status: "voting", eligibleVoterIds: ["v1"] };
  const view = electionView(item, { id: "v1", role: "member" }, [{ id: "v1", chamaId: "g1", status: "active", name: "Voter" }], "secret-token");
  assert.equal(view.hasVoted, true);
  assert.equal(view.canVote, false);
  assert.equal(JSON.stringify(view).includes("secret-token"), false);
  assert.equal(JSON.stringify(view).includes('"candidateId"'), false);
  assert.equal(JSON.stringify(view).includes('"ballots"'), false);
});

test("verified role changes remain pending until 24 hours and activate at the scheduled time", () => {
  const verifiedAt = Date.parse("2026-10-20T08:00:00.000Z");
  const activationAt = new Date(verifiedAt + 24 * 60 * 60 * 1000).toISOString();
  const state = {
    users: [
      { id: "old", name: "Old Chair", chamaId: "g1", status: "active", role: "chairperson" },
      { id: "new", name: "New Chair", chamaId: "g1", status: "active", role: "member" },
    ],
    leadershipChanges: [{ type: "election", id: "e1", chamaId: "g1", role: "chairperson", status: "verified", winnerId: "new", activationAt }],
    auditLog: [], messages: [],
  };
  assert.equal(applyDueElections(state, verifiedAt + 23 * 60 * 60 * 1000).length, 0);
  assert.equal(state.users[1].role, "member");
  assert.equal(applyDueElections(state, verifiedAt + 24 * 60 * 60 * 1000).length, 1);
  assert.equal(state.users[0].role, "member");
  assert.equal(state.users[1].role, "chairperson");
  assert.equal(state.leadershipChanges[0].status, "completed");
  assert.equal(state.messages.filter(message => message.recipientId).length, 2);
});

function scheduledState(ballots = []) {
  return {
    users: [
      { id: "old", name: "Old Chair", chamaId: "g1", status: "active", role: "chairperson" },
      { id: "a", name: "Candidate A", chamaId: "g1", status: "active", role: "member" },
      { id: "b", name: "Candidate B", chamaId: "g1", status: "active", role: "member" },
      { id: "voter", name: "Voter", chamaId: "g1", status: "active", role: "member" },
    ],
    leadershipChanges: [{ type: "election", id: "scheduled-1", chamaId: "g1", role: "chairperson", status: "scheduled", scheduledDate: "2026-11-05", candidateIds: ["a", "b"], candidateNames: [{ id: "a", name: "Candidate A" }, { id: "b", name: "Candidate B" }], ballots }],
    auditLog: [], messages: [],
  };
}

test("scheduled election opens and closes at Nairobi calendar-day boundaries and activates winner immediately", () => {
  const start = Date.parse("2026-11-05T00:00:00+03:00");
  const end = Date.parse("2026-11-06T00:00:00+03:00");
  const state = scheduledState([{ voterToken: "private-voter-token", candidateId: "a", at: new Date(start + 1).toISOString() }]);
  assert.deepEqual(electionWindow("2026-11-05"), { start, end });
  assert.equal(electionWindow("2026-02-30"), null);
  assert.equal(applyScheduledElections(state, start - 1).length, 0);
  assert.equal(state.leadershipChanges[0].status, "scheduled");
  assert.equal(applyScheduledElections(state, start).length, 1);
  assert.equal(state.leadershipChanges[0].status, "voting");
  assert.deepEqual(state.leadershipChanges[0].eligibleVoterIds, ["old", "a", "b", "voter"]);
  assert.equal(applyScheduledElections(state, end - 1).length, 0);
  assert.equal(state.leadershipChanges[0].status, "voting");
  assert.equal(applyScheduledElections(state, end).length, 1);
  assert.equal(state.leadershipChanges[0].status, "completed");
  assert.equal(state.users.find(user => user.id === "a").role, "chairperson");
  assert.equal(state.users.find(user => user.id === "old").role, "member");
  assert.equal(state.leadershipChanges[0].result.winnerId, "a");
  assert.equal(state.messages.length, state.users.length * 2);
});

test("scheduled election tie does not change portal roles and requires a tied-candidate runoff", () => {
  const end = Date.parse("2026-11-06T00:00:00+03:00");
  const state = scheduledState([
    { voterToken: "v1", candidateId: "a" },
    { voterToken: "v2", candidateId: "b" },
  ]);
  applyScheduledElections(state, Date.parse("2026-11-05T00:00:00+03:00"));
  applyScheduledElections(state, end);
  assert.equal(state.leadershipChanges[0].status, "runoff-needed");
  assert.deepEqual(state.leadershipChanges[0].result.tiedCandidateIds, ["a", "b"]);
  assert.equal(state.users.find(user => user.id === "old").role, "chairperson");
});

function approvalRecord(overrides = {}) {
  return {
    type: "re-election-approval",
    id: "approval-1",
    chamaId: "g1",
    role: "chairperson",
    status: "voting",
    openedAt: "2026-11-01T12:00:00.000Z",
    deadlineAt: "2026-11-08T12:00:00.000Z",
    eligibleVoterIds: ["v1", "v2", "v3", "v4"],
    ballots: [],
    ...overrides,
  };
}

test("approval threshold uses the frozen eligible-member denominator and counts only unique valid Yes/No ballots", () => {
  const approval = approvalRecord({
    eligibleVoterIds: ["v1", "v2", "v3", "v4"],
    ballots: [
      { voterToken: "t1", choice: "yes" },
      { voterToken: "t2", choice: "no" },
      { voterToken: "t3", choice: "yes" },
      { voterToken: "t3", choice: "no" },
      { voterToken: "outside", choice: "yes" },
      { voterToken: "t4", choice: "abstain" },
    ],
  });
  const result = reElectionApprovalResult(approval, new Set(["t1", "t2", "t3", "t4"]));
  assert.equal(result.eligibleMembers, 4);
  assert.equal(result.threshold, 3);
  assert.equal(result.yesVotes, 2);
  assert.equal(result.noVotes, 1);
  assert.equal(result.votesCast, 3);
  assert.equal(result.abstentions, 1);
  assert.equal(result.passed, false);
});

test("approval ballot never closes early and closes exactly at seven-day deadline with ceil two-thirds pass/fail rules", () => {
  const deadline = Date.parse("2026-11-08T12:00:00.000Z");
  const passed = approvalRecord({
    deadlineAt: new Date(deadline).toISOString(),
    ballots: [
      { voterToken: "token:v1", choice: "yes" },
      { voterToken: "token:v2", choice: "yes" },
      { voterToken: "token:v3", choice: "yes" },
      { voterToken: "token:v4", choice: "no" },
    ],
  });
  const failed = approvalRecord({
    id: "approval-fail",
    deadlineAt: new Date(deadline).toISOString(),
    ballots: [
      { voterToken: "token:v1", choice: "yes" },
      { voterToken: "token:v2", choice: "yes" },
      { voterToken: "token:v3", choice: "no" },
    ],
  });
  const makeState = approval => ({
    users: ["v1", "v2", "v3", "v4"].map(id => ({ id, name: id, chamaId: "g1", status: "active", role: "member" })),
    leadershipChanges: [approval],
    auditLog: [],
    messages: [],
  });
  const passedState = makeState(passed);
  const failedState = makeState(failed);
  const tokenFor = (_approval, id) => `token:${id}`;
  assert.equal(applyDueReElectionApprovals(passedState, deadline - 1, tokenFor).length, 0);
  assert.equal(passed.status, "voting", "meeting the threshold early must not close voting");
  assert.equal(applyDueReElectionApprovals(passedState, deadline, tokenFor).length, 1);
  assert.equal(passed.status, "approved");
  assert.equal(passed.closedAt, passed.deadlineAt);
  assert.deepEqual(passed.result, { yesVotes: 3, noVotes: 1, votesCast: 4, abstentions: 0, eligibleMembers: 4, threshold: 3, passed: true });
  assert.equal(applyDueReElectionApprovals(failedState, deadline, tokenFor).length, 1);
  assert.equal(failed.status, "failed");
  assert.equal(failed.closedAt, failed.deadlineAt);
  assert.equal(failed.result.yesVotes, 2);
  assert.equal(failed.result.threshold, 3);
  assert.equal(failed.result.abstentions, 1);
  assert.equal(failed.result.passed, false);
});

test("approval views reveal only the viewer's own status and aggregate result, never a voter-choice list", () => {
  const approval = approvalRecord({
    ballots: [
      { voterToken: "private-v1", choice: "yes" },
      { voterToken: "private-v2", choice: "no" },
    ],
  });
  const users = ["v1", "v2", "v3", "v4"].map(id => ({ id, name: id, chamaId: "g1", status: "active", role: "member" }));
  const view = reElectionApprovalView(approval, { id: "v1", role: "member" }, users, "private-v1", new Set(["private-v1", "private-v2", "private-v3", "private-v4"]));
  assert.equal(view.hasVoted, true);
  assert.equal(view.canVote, false);
  assert.equal(view.eligible, true);
  assert.equal(view.eligibleMembers, 4);
  assert.equal(view.yesVotes, 1);
  assert.equal(view.noVotes, 1);
  assert.equal(view.unvoted, 2);
  assert.equal(JSON.stringify(view).includes("private-v1"), false);
  assert.equal(JSON.stringify(view).includes('"ballots"'), false);
  assert.equal(JSON.stringify(view).includes('"eligibleVoterIds"'), false);
  assert.equal(JSON.stringify(view).includes('"voterToken"'), false);
  assert.equal(JSON.stringify(view).includes('"choice"'), false);
  assert.match(view.privacyNotice, /application operator may be able to access/);
});

test("approved re-election schedules only its requested role and leaves incumbents in place until the winner activates", () => {
  const start = Date.parse("2026-11-05T00:00:00+03:00");
  const end = Date.parse("2026-11-06T00:00:00+03:00");
  const approval = approvalRecord({ status: "approved", role: "chairperson", result: { yesVotes: 3, noVotes: 1, votesCast: 4, abstentions: 0, eligibleMembers: 4, threshold: 3, passed: true } });
  const state = {
    users: [
      { id: "old-chair", name: "Old Chair", chamaId: "g1", status: "active", role: "chairperson" },
      { id: "old-secretary", name: "Secretary", chamaId: "g1", status: "active", role: "secretary" },
      { id: "old-treasurer", name: "Treasurer", chamaId: "g1", status: "active", role: "treasurer" },
      { id: "candidate-a", name: "Candidate A", chamaId: "g1", status: "active", role: "member" },
      { id: "candidate-b", name: "Candidate B", chamaId: "g1", status: "active", role: "member" },
    ],
    leadershipChanges: [approval],
    auditLog: [],
    messages: [],
  };
  const election = createScheduledReElection(state, approval, {
    id: "reelection-1",
    candidateIds: ["candidate-a", "candidate-b"],
    candidateNames: [{ id: "candidate-a", name: "Candidate A" }, { id: "candidate-b", name: "Candidate B" }],
    scheduledDate: "2026-11-05",
    scheduledBy: "secretary-user",
    at: new Date(start - 1000).toISOString(),
  });
  election.ballots.push({ voterToken: "anonymous-voter", candidateId: "candidate-a", at: new Date(start + 1).toISOString() });
  assert.equal(election.role, "chairperson");
  assert.equal(election.reElectionApprovalId, approval.id);
  assert.equal(state.users.find(user => user.id === "old-chair").role, "chairperson");
  assert.equal(state.users.find(user => user.id === "old-secretary").role, "secretary");
  assert.equal(state.users.find(user => user.id === "old-treasurer").role, "treasurer");
  assert.equal(applyScheduledElections(state, start).length, 1);
  assert.equal(state.users.find(user => user.id === "old-chair").role, "chairperson");
  assert.equal(applyScheduledElections(state, end).length, 1);
  assert.equal(state.users.find(user => user.id === "candidate-a").role, "chairperson");
  assert.equal(state.users.find(user => user.id === "old-chair").role, "member");
  assert.equal(state.users.find(user => user.id === "old-secretary").role, "secretary");
  assert.equal(state.users.find(user => user.id === "old-treasurer").role, "treasurer");
  assert.throws(() => createScheduledReElection(state, { ...approval, status: "failed", electionId: null }, {
    id: "failed-reelection", candidateIds: ["candidate-a", "candidate-b"],
    candidateNames: [{ id: "candidate-a", name: "Candidate A" }, { id: "candidate-b", name: "Candidate B" }],
    scheduledDate: "2026-11-05", scheduledBy: "secretary-user", at: new Date(start).toISOString(),
  }), /Only a passed, unscheduled re-election approval/);
  assert.throws(() => createScheduledReElection(state, { ...approval, result: undefined, electionId: null }, {
    id: "corrupt-reelection", candidateIds: ["candidate-a", "candidate-b"],
    candidateNames: [{ id: "candidate-a", name: "Candidate A" }, { id: "candidate-b", name: "Candidate B" }],
    scheduledDate: "2026-11-05", scheduledBy: "secretary-user", at: new Date(start).toISOString(),
  }), /Only a passed, unscheduled re-election approval/);
});

test("missing or corrupt approval request state fails closed instead of auto-passing or staying open", () => {
  const timestamp = Date.parse("2026-11-01T12:00:00.000Z");
  const invalidApprovals = [
    approvalRecord({ id: "missing-eligible", eligibleVoterIds: undefined }),
    approvalRecord({ id: "empty-eligible", eligibleVoterIds: [] }),
    approvalRecord({ id: "bad-deadline", deadlineAt: "not-a-date" }),
    approvalRecord({ id: "bad-window", deadlineAt: "2026-11-07T12:00:00.000Z" }),
  ];
  for (const approval of invalidApprovals) {
    const state = { leadershipChanges: [approval], auditLog: [], messages: [] };
    assert.doesNotThrow(() => applyDueReElectionApprovals(state, timestamp, () => "eligible-token"));
    assert.equal(approval.status, "failed");
    assert.equal(approval.closedAt, new Date(timestamp).toISOString());
    assert.equal(approval.result.passed, false);
    assert.equal(approval.resolutionReason, "invalid-approval-state");
  }
  assert.equal(reElectionApprovalResult(approvalRecord({ eligibleVoterIds: [], ballots: [] }), new Set()).passed, false);
});
