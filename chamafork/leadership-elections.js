"use strict";

const crypto = require("node:crypto");

function isElection(record) { return record?.type === "election"; }
function isReElectionApproval(record) { return record?.type === "re-election-approval"; }

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
  const verified = ["verified", "verified-tie", "verified-no-winner", "runoff-needed", "completed", "cancelled"].includes(election.status);
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
    reElection: Boolean(election.reElectionApprovalId),
    status: election.status,
    runoff: Boolean(election.parentElectionId),
    parentElectionId: election.parentElectionId || null,
    candidates,
    proposedAt: election.proposedAt,
    scheduledDate: election.scheduledDate || null,
    acceptedAt: election.acceptedAt || null,
    closedAt: election.closedAt || null,
    verifiedAt: election.verifiedAt || null,
    activationAt: election.activationAt || null,
    completedAt: election.completedAt || null,
    eligibleVoters: (election.eligibleVoterIds || []).length,
    votesCast: ballots.length,
    hasVoted: ballots.some(ballot => ballot.voterToken === voterToken),
    canVote: election.status === "voting" && eligible && !ballots.some(ballot => ballot.voterToken === voterToken),
    canScheduleRunoff: election.status === "runoff-needed" && ["chairperson", "secretary"].includes(viewer.role),
    result,
    winnerName: election.winnerId ? candidates.find(candidate => candidate.id === election.winnerId)?.name || null : null,
  };
}

function reElectionApprovalResult(approval, eligibleVoterTokens) {
  const rawEligibleIds = Array.isArray(approval?.eligibleVoterIds) ? approval.eligibleVoterIds : [];
  const eligibleMemberIds = [...new Set(rawEligibleIds.filter(id => typeof id === "string" && id.trim()))];
  const allowedTokens = eligibleVoterTokens == null ? null : new Set(eligibleVoterTokens);
  const voters = new Set();
  let yesVotes = 0;
  let noVotes = 0;
  for (const ballot of Array.isArray(approval?.ballots) ? approval.ballots : []) {
    if (!ballot || !["yes", "no"].includes(ballot.choice) || typeof ballot.voterToken !== "string" || !ballot.voterToken || voters.has(ballot.voterToken)) continue;
    if (allowedTokens !== null && !allowedTokens.has(ballot.voterToken)) continue;
    voters.add(ballot.voterToken);
    if (ballot.choice === "yes") yesVotes += 1;
    else noVotes += 1;
  }
  const eligibleMembers = eligibleMemberIds.length;
  const threshold = Math.ceil(2 * eligibleMembers / 3);
  return {
    eligibleMembers,
    yesVotes,
    noVotes,
    votesCast: voters.size,
    abstentions: Math.max(0, eligibleMembers - voters.size),
    threshold,
    passed: eligibleMembers > 0 && yesVotes >= threshold,
  };
}

function reElectionApprovalView(approval, viewer, users, voterToken, eligibleVoterTokens) {
  const tally = reElectionApprovalResult(approval, eligibleVoterTokens);
  const ballots = Array.isArray(approval.ballots) ? approval.ballots : [];
  const allowedTokens = eligibleVoterTokens == null ? null : new Set(eligibleVoterTokens);
  const hasVoted = typeof voterToken === "string" && ballots.some(ballot => ballot?.voterToken === voterToken &&
    ["yes", "no"].includes(ballot.choice) && (allowedTokens === null || allowedTokens.has(ballot.voterToken)));
  const eligible = Array.isArray(approval.eligibleVoterIds) && approval.eligibleVoterIds.includes(viewer.id) &&
    users.some(user => user.id === viewer.id && user.chamaId === approval.chamaId && user.status === "active");
  const completed = ["approved", "failed"].includes(approval.status);
  return {
    id: approval.id,
    role: approval.role,
    status: approval.status,
    openedAt: approval.openedAt,
    deadlineAt: approval.deadlineAt,
    closedAt: approval.closedAt || null,
    eligibleMembers: tally.eligibleMembers,
    threshold: tally.threshold,
    votesCast: tally.votesCast,
    yesVotes: tally.yesVotes,
    noVotes: tally.noVotes,
    unvoted: approval.status === "voting" ? tally.abstentions : 0,
    abstentions: completed ? tally.abstentions : null,
    eligible,
    hasVoted,
    canVote: approval.status === "voting" && eligible && !hasVoted,
    canSchedule: approval.status === "approved" && tally.passed && !approval.electionId && ["chairperson", "secretary"].includes(viewer.role),
    electionId: approval.electionId || null,
    scheduledDate: approval.electionScheduledDate || null,
    result: completed ? {
      yesVotes: tally.yesVotes,
      noVotes: tally.noVotes,
      votesCast: tally.votesCast,
      abstentions: tally.abstentions,
      threshold: tally.threshold,
      passed: approval.status === "approved" && tally.passed,
    } : null,
    privacyNotice: "Other members and officers see aggregate totals and only their own voted status. The application operator may be able to access stored ballot records; this ballot is not operator-anonymous.",
  };
}

function createScheduledReElection(state, approval, { id, candidateIds, candidateNames, scheduledDate, scheduledBy, at }) {
  const eligibleIds = Array.isArray(approval?.eligibleVoterIds) ? approval.eligibleVoterIds : [];
  const eligibleIdsAreValid = eligibleIds.length > 0 && eligibleIds.every(memberId => typeof memberId === "string" && memberId.trim()) &&
    new Set(eligibleIds).size === eligibleIds.length;
  const threshold = Math.ceil(2 * eligibleIds.length / 3);
  const tally = approval?.result;
  const validPassedTally = eligibleIdsAreValid && tally?.passed === true && tally.eligibleMembers === eligibleIds.length &&
    tally.threshold === threshold && Number.isInteger(tally.yesVotes) && tally.yesVotes >= threshold;
  if (!isReElectionApproval(approval) || approval.status !== "approved" || approval.electionId ||
    !["chairperson", "secretary", "treasurer"].includes(approval.role) || !validPassedTally) {
    throw new TypeError("Only a passed, unscheduled re-election approval can create an election.");
  }
  const election = {
    id,
    type: "election",
    role: approval.role,
    reElectionApprovalId: approval.id,
    candidateIds: [...candidateIds],
    candidateNames: candidateNames.map(item => ({ id: item.id, name: item.name })),
    status: "scheduled",
    scheduledDate,
    proposedBy: scheduledBy,
    proposedAt: at,
    ballots: [],
    chamaId: approval.chamaId,
  };
  approval.electionId = election.id;
  approval.electionScheduledAt = at;
  approval.electionScheduledDate = scheduledDate;
  approval.electionScheduledBy = scheduledBy;
  state.leadershipChanges.push(election);
  return election;
}

function addNotifications(state, election, text, at = new Date().toISOString()) {
  if (!Array.isArray(state.messages)) state.messages = [];
  const recipients = (Array.isArray(state.users) ? state.users : []).filter(user => user.chamaId === election.chamaId && user.status === "active");
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

function electionWindow(scheduledDate) {
  if (typeof scheduledDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return null;
  const [year, month, day] = scheduledDate.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day) - 3 * 60 * 60 * 1000;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.toISOString().slice(0, 10) !== scheduledDate) return null;
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function activateWinner(state, election, winner, timestamp) {
  const members = state.users.filter(user => user.chamaId === election.chamaId && user.status === "active");
  const outgoing = members.find(user => user.id !== winner.id && user.role === election.role);
  if (outgoing) outgoing.role = "member";
  winner.role = election.role;
  election.status = "completed";
  election.winnerId = winner.id;
  election.completedAt = new Date(timestamp).toISOString();
  election.outgoingUserId = outgoing?.id || null;
  election.audit = Array.isArray(election.audit) ? election.audit : [];
  election.audit.push({ action: "activated", by: "system", at: election.completedAt, incomingUserId: winner.id, outgoingUserId: outgoing?.id || null });
  state.auditLog.push({ id: crypto.randomUUID(), type: "leadership.election.activated", entityId: election.id, at: election.completedAt, by: { id: "system", name: "System", role: "system" }, memberId: winner.id, memberName: winner.name, role: election.role, chamaId: election.chamaId });
  addNotifications(state, election, `${winner.name} is now the ${election.role}. The group portals have been updated.`, election.completedAt);
  let parentId = election.parentElectionId;
  while (parentId) {
    const parent = (state.leadershipChanges || []).find(item => item.id === parentId && item.chamaId === election.chamaId);
    if (!parent) break;
    parent.status = "completed";
    parent.completedAt = election.completedAt;
    parentId = parent.parentElectionId;
  }
}

function closeScheduledElection(state, election, timestamp) {
  election.status = "closed";
  election.closedAt = new Date(timestamp).toISOString();
  election.result = resultFor(election);
  const winnerId = election.result.winnerId;
  const winner = winnerId && state.users.find(user => user.id === winnerId && user.chamaId === election.chamaId && user.status === "active" && user.role === "member");
  if (election.result.tiedCandidateIds.length > 1) {
    election.status = "runoff-needed";
    addNotifications(state, election, `The ${election.role} election ended in a tie. The Chairperson or Secretary can schedule a runoff between the tied candidates.`, election.closedAt);
  } else if (winner) {
    activateWinner(state, election, winner, timestamp);
  } else {
    election.status = "verified-no-winner";
    election.result.reason = election.result.votesCast ? "The leading candidate is no longer eligible." : "No votes were cast.";
    addNotifications(state, election, `The ${election.role} election ended without an eligible winner. The Chairperson or Secretary can schedule another election.`, election.closedAt);
  }
  state.auditLog.push({ id: crypto.randomUUID(), type: "leadership.election.closed", entityId: election.id, at: election.closedAt, by: { id: "system", name: "System", role: "system" }, chamaId: election.chamaId, role: election.role, votesCast: election.result.votesCast });
}

function applyScheduledElections(state, timestamp = Date.now()) {
  const changed = [];
  for (const election of state.leadershipChanges || []) {
    if (!isElection(election) || !["scheduled", "voting"].includes(election.status)) continue;
    const window = electionWindow(election.scheduledDate);
    if (!window || timestamp < window.start) continue;
    if (timestamp >= window.end) {
      if (election.status === "scheduled") {
        election.openedAt = new Date(window.start).toISOString();
        election.eligibleVoterIds = [];
        election.ballots = [];
      }
      closeScheduledElection(state, election, window.end);
      changed.push(election);
      continue;
    }
    if (election.status === "scheduled") {
      const candidates = (election.candidateIds || []).map(id => state.users.find(user => user.id === id && user.chamaId === election.chamaId && user.status === "active" && user.role === "member"));
      if (candidates.length < 2 || candidates.some(candidate => !candidate)) {
        election.status = "cancelled";
        election.completedAt = new Date(timestamp).toISOString();
        election.cancellationReason = "A scheduled candidate is no longer an active Member of this chama.";
        state.auditLog.push({ id: crypto.randomUUID(), type: "leadership.election.cancelled", entityId: election.id, at: election.completedAt, by: { id: "system", name: "System", role: "system" }, chamaId: election.chamaId, role: election.role, reason: election.cancellationReason });
        addNotifications(state, election, `The ${election.role} election was cancelled because a candidate is no longer eligible.`, election.completedAt);
      } else {
        election.status = "voting";
        election.openedAt = new Date(window.start).toISOString();
        election.eligibleVoterIds = state.users.filter(user => user.chamaId === election.chamaId && user.status === "active").map(user => user.id);
        election.ballots = Array.isArray(election.ballots) ? election.ballots : [];
        addNotifications(state, election, `Voting for the ${election.role} election is now open for today.`, election.openedAt);
      }
      changed.push(election);
    }
  }
  return changed;
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

function validReElectionApprovalState(approval) {
  const eligibleIds = approval?.eligibleVoterIds;
  const openedAt = Date.parse(approval?.openedAt);
  const deadlineAt = Date.parse(approval?.deadlineAt);
  return typeof approval?.id === "string" && Boolean(approval.id) && typeof approval.chamaId === "string" && Boolean(approval.chamaId) &&
    ["chairperson", "secretary", "treasurer"].includes(approval.role) && Array.isArray(eligibleIds) && eligibleIds.length > 0 &&
    eligibleIds.every(memberId => typeof memberId === "string" && memberId.trim()) && new Set(eligibleIds).size === eligibleIds.length &&
    Number.isFinite(openedAt) && Number.isFinite(deadlineAt) && deadlineAt === openedAt + 7 * 24 * 60 * 60 * 1000;
}

function applyDueReElectionApprovals(state, timestamp = Date.now(), voterTokenForUser = () => null) {
  const completed = [];
  const currentTime = Number.isFinite(timestamp) ? timestamp : Date.now();
  const changes = Array.isArray(state?.leadershipChanges) ? state.leadershipChanges : [];
  for (const approval of changes) {
    if (!isReElectionApproval(approval) || approval.status !== "voting") continue;
    const deadline = Date.parse(approval.deadlineAt);
    const validState = validReElectionApprovalState(approval);
    if (validState && currentTime < deadline) continue;
    const eligibleIds = Array.isArray(approval.eligibleVoterIds) ? approval.eligibleVoterIds : [];
    const eligibleTokens = new Set(eligibleIds.filter(id => typeof id === "string" && id.trim())
      .map(id => voterTokenForUser(approval, id)).filter(token => typeof token === "string" && token));
    const result = reElectionApprovalResult(approval, eligibleTokens);
    const passed = validState && result.passed;
    approval.status = passed ? "approved" : "failed";
    approval.closedAt = validState ? new Date(deadline).toISOString() : new Date(currentTime).toISOString();
    approval.resolutionReason = validState ? null : "invalid-approval-state";
    approval.result = {
      yesVotes: result.yesVotes,
      noVotes: result.noVotes,
      votesCast: result.votesCast,
      abstentions: result.abstentions,
      eligibleMembers: result.eligibleMembers,
      threshold: result.threshold,
      passed,
    };
    if (!Array.isArray(state.auditLog)) state.auditLog = [];
    state.auditLog.push({
      id: crypto.randomUUID(),
      type: "leadership.re-election-approval.closed",
      entityId: approval.id,
      at: approval.closedAt,
      by: { id: "system", name: "System", role: "system" },
      chamaId: approval.chamaId,
      role: approval.role,
      yesVotes: result.yesVotes,
      noVotes: result.noVotes,
      threshold: result.threshold,
      passed,
      ...(validState ? {} : { reason: "invalid-approval-state" }),
    });
    addNotifications(state, approval, !validState
      ? "A re-election approval ballot could not be completed because its saved request data was invalid. No election was scheduled."
      : passed
        ? `The ${approval.role} re-election approval ballot passed. The Chairperson or Secretary can schedule a role-specific election.`
        : `The ${approval.role} re-election approval ballot did not reach its approval threshold.`, approval.closedAt);
    completed.push(approval);
  }
  return completed;
}

module.exports = { addNotifications, applyDueElections, applyDueReElectionApprovals, applyScheduledElections, createScheduledReElection, electionWindow, electionView, isElection, isReElectionApproval, reElectionApprovalResult, reElectionApprovalView, resultFor };
