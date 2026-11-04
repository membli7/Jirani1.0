"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { applyDueElections, applyScheduledElections, electionView, electionWindow, resultFor } = require("../leadership-elections");

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
