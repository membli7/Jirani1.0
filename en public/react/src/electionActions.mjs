const offices = new Set(["chairperson", "secretary", "treasurer"]);
const decisions = new Set(["accept", "decline", "close", "verify"]);

export function scheduleElection(writeRequester, owner, proposal) {
  const candidateIds = Array.isArray(proposal?.candidateIds) ? proposal.candidateIds.map(String) : [];
  if (!offices.has(proposal?.role) || !/^\d{4}-\d{2}-\d{2}$/.test(String(proposal?.scheduledDate || ""))
    || candidateIds.length < 2 || candidateIds.length > 20
    || candidateIds.some(id => !id) || new Set(candidateIds).size !== candidateIds.length) {
    throw new TypeError("Choose an office, election date, and 2 to 20 different active Member candidates.");
  }
  const body = { role: proposal.role, candidateIds, scheduledDate: proposal.scheduledDate };
  return writeRequester.submit({
    owner,
    path: "/api/leadership-elections",
    method: "POST",
    body,
    validate: response => typeof response?.data?.id === "string" && response.data.role === body.role,
  });
}

export function castElectionVote(writeRequester, owner, electionId, candidateId) {
  if (!electionId || !candidateId) throw new TypeError("Choose one active candidate.");
  return writeRequester.submit({
    owner,
    path: `/api/leadership-elections/${encodeURIComponent(electionId)}/vote`,
    method: "POST",
    body: { candidateId },
    validate: response => response?.data?.id === electionId,
  });
}

export function submitElectionDecision(writeRequester, owner, electionId, decision) {
  if (!electionId || !decisions.has(decision)) throw new TypeError("Choose a valid election action.");
  return writeRequester.submit({
    owner,
    path: `/api/leadership-elections/${encodeURIComponent(electionId)}/${encodeURIComponent(decision)}`,
    method: "POST",
    body: {},
    validate: response => response?.data?.id === electionId,
  });
}

export function scheduleElectionRunoff(writeRequester, owner, electionId, scheduledDate) {
  if (!electionId || !/^\d{4}-\d{2}-\d{2}$/.test(String(scheduledDate || ""))) {
    throw new TypeError("Choose a valid runoff date.");
  }
  return writeRequester.submit({
    owner,
    path: `/api/leadership-elections/${encodeURIComponent(electionId)}/runoff`,
    method: "POST",
    body: { scheduledDate },
    validate: response => typeof response?.data?.id === "string" && response.data.scheduledDate === scheduledDate,
  });
}
