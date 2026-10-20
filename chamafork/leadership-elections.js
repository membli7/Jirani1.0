"use strict";

const crypto = require("node:crypto");

function isElection(record) { return record?.type === "election"; }

function resultFor(election) {
  const counts = Object.fromEntries((election.candidateIds || []).map(id => [id, 0]));
  const voters = new Set();
  for (const ballot of election.ballots || []) {
    if (!Object.hasOwn(counts, ballot.candidateId) || !ballot.voterToken || voters.has(ballot.voterToken)) continue;
    counts[ballot.candidateId] += 1;
    voters.add(ballot.voterToken);
  }
  const highest = Math.max(0, ...Object.values(counts));
  const topCandidateIds = highest ? Object.keys(counts).filter(id => counts[id] === highest) : [];
  return {
    counts,
    votesCast: voters.size,
    winnerId: topCandidateIds.length === 1 ? topCandidateIds[0] : null,
    tiedCandidateIds: topCandidateIds.length > 1 ? topCandidateIds : [],
  };
}

function electionView(election, viewer, users, voterToken) {
  const ballots = Array.isArray(election.ballots) ? election.ballots : [];
  const candidateIds = Array.isArray(election.candidateIds) ? election.candidateIds : [];
  const candidates = candidateIds.map(id => {
    const member = users.find(user => user.id === id && user.status === "active" && user.chamaId === election.chamaId);
    const original = (election.candidateNames || []).find(item => item.id === id);
    return { id, name: member?.name || original?.name || "No longer eligible", active: Boolean(member) };
  });
  const isChair = viewer.role === "chairperson";
  const verified = ["verified", "verified-tie", "verified-no-winner", "completed", "cancelled"].includes(election.status);
  const revealCounts = verified || (isChair && election.status === "closed");
  const eligible = (election.eligibleVoterIds || []).includes(viewer.id) &&
    users.some(user => user.id === viewer.id && user.chamaId === election.chamaId && user.status === "active");
  const result = election.result && revealCounts ? {
    votesCast: election.result.votesCast,
    counts: { ...election.result.counts },
    winnerId: election.result.winnerId || null,
    tiedCandidateIds: [...(election.result.tiedCandidateIds || [])],
  } : null;
  return {
    id: election.id,
    role: election.role,
    status: election.status,
    runoff: Boolean(election.parentElectionId),
    parentElectionId: election.parentElectionId || null,
    candidates,
    proposedAt: election.proposedAt,
    acceptedAt: election.acceptedAt || null,
    closedAt: election.closedAt || null,
    verifiedAt: election.verifiedAt || null,
    activationAt: election.activationAt || null,
    completedAt: election.completedAt || null,
    eligibleVoters: (election.eligibleVoterIds || []).length,
    votesCast: ballots.length,
    hasVoted: ballots.some(ballot => ballot.voterToken === voterToken),
    canVote: election.status === "voting" && eligible && !ballots.some(ballot => ballot.voterToken === voterToken),
    result,
    winnerName: election.winnerId ? candidates.find(candidate => candidate.id === election.winnerId)?.name || null : null,
  };
}

function addNotifications(state, election, text, at = new Date().toISOString()) {
  if (!Array.isArray(state.messages)) state.messages = [];
  const recipients = state.users.filter(user => user.chamaId === election.chamaId && user.status === "active");
  for (const user of recipients) {
    state.messages.push({
      id: crypto.randomUUID(),
      type: "notification",
      recipientId: user.id,
      at,
      authorId: null,
      authorName: "Jirani Chama",
      authorRole: "system",
      text,
      chamaId: election.chamaId,
    });
  }
  return recipients.length;
}

function applyDueElections(state, timestamp = Date.now()) {
  const completed = [];
  for (const election of state.leadershipChanges || []) {
    if (!isElection(election) || election.status !== "verified" || !Number.isFinite(Date.parse(election.activationAt)) || Date.parse(election.activationAt) > timestamp) continue;
    const members = state.users.filter(user => user.chamaId === election.chamaId && user.status === "active");
    const winner = members.find(user => user.id === election.winnerId);
    if (!winner) {
      election.status = "cancelled";
      election.completedAt = new Date(timestamp).toISOString();
      election.cancellationReason = "The verified candidate is no longer an active member of this chama.";
      state.auditLog.push({ id: crypto.randomUUID(), type: "leadership.election.cancelled", entityId: election.id, at: election.completedAt, by: { id: "system", name: "System", role: "system" }, chamaId: election.chamaId, role: election.role });
      addNotifications(state, election, `The verified ${election.role} election was cancelled because the selected candidate is no longer an active member.`, election.completedAt);
      completed.push(election);
      continue;
    }
    const outgoing = members.find(user => user.id !== winner.id && user.role === election.role);
    if (outgoing) outgoing.role = "member";
    winner.role = election.role;
    election.status = "completed";
    election.completedAt = new Date(timestamp).toISOString();
    election.outgoingUserId = outgoing?.id || null;
    election.audit = Array.isArray(election.audit) ? election.audit : [];
    election.audit.push({ action: "activated", by: "system", at: election.completedAt, incomingUserId: winner.id, outgoingUserId: outgoing?.id || null });
    state.auditLog.push({ id: crypto.randomUUID(), type: "leadership.election.activated", entityId: election.id, at: election.completedAt, by: { id: "system", name: "System", role: "system" }, memberId: winner.id, memberName: winner.name, role: election.role, chamaId: election.chamaId });
    addNotifications(state, election, `${winner.name} is now the ${election.role}. The group portals have been updated.`, election.completedAt);
    completed.push(election);
  }
  return completed;
}

module.exports = { addNotifications, applyDueElections, electionView, isElection, resultFor };
