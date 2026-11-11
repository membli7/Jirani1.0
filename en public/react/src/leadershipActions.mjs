const roles = new Set(["chairperson", "secretary", "treasurer"]);

export function leadershipProposalFromForm(formData) {
  const role = String(formData.get("role") || "").trim();
  const incomingUserId = String(formData.get("incomingUserId") || "").trim();
  const effectiveDate = String(formData.get("effectiveDate") || "").trim();
  if (!roles.has(role)) throw new TypeError("Choose a valid officer role.");
  if (!incomingUserId) throw new TypeError("Choose an active incoming official.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new TypeError("Choose a valid effective date.");
  return { role, incomingUserId, effectiveDate };
}

export function submitLeadershipProposal(writeRequester, owner, payload) {
  if (!payload || !roles.has(payload.role) || !payload.incomingUserId || !/^\d{4}-\d{2}-\d{2}$/.test(payload.effectiveDate || "")) {
    throw new TypeError("Provide an officer role, member, and effective date.");
  }
  return writeRequester.submit({
    owner,
    path: "/api/leadership-changes",
    method: "POST",
    body: payload,
    validate: response => response?.data?.type === "appointment"
      && response.data.bootstrap === true
      && response.data.role === payload.role
      && response.data.incomingUserId === payload.incomingUserId
      && response.data.effectiveDate === payload.effectiveDate
      && typeof response.data.id === "string",
  });
}

export function confirmLeadershipProposal(writeRequester, owner, changeId) {
  if (!changeId) throw new TypeError("Choose a pending officer assignment.");
  return writeRequester.submit({
    owner,
    path: `/api/leadership-changes/${encodeURIComponent(changeId)}/confirm`,
    method: "POST",
    body: {},
    validate: response => response?.data?.id === changeId && response.data.status === "confirmed",
  });
}
