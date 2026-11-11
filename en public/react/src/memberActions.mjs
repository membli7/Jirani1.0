export function memberStatusPresentation(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const statusKey = {
    active: "activeStatus",
    inactive: "inactiveStatus",
    pending: "pendingActivationStatus",
    activated: "activatedStatus",
    expired: "expiredStatus",
    revoked: "revokedStatus",
  }[normalized] || null;
  const className = normalized === "active" || normalized === "activated"
    ? "active"
    : normalized === "pending" ? "pending" : "inactive";
  const label = statusKey ? null : normalized ? normalized.replace(/\b[a-z]/g, char => char.toUpperCase()) : "Unknown";
  return { normalized, statusKey, className, label };
}

export function invitationStatusPresentation(invitation, now = Date.now()) {
  const revoked = Boolean(invitation?.revocation);
  const expired = Date.parse(invitation?.expiresAt || "") <= now;
  const statusKey = revoked ? "revokedStatus"
    : invitation?.usedAt ? "activatedStatus"
      : expired ? "expiredStatus" : "pendingActivationStatus";
  const className = revoked || expired ? "inactive" : invitation?.usedAt ? "active" : "pending";
  return { statusKey, className };
}

export function canUndoInvitation(invitation, permissions, now = Date.now()) {
  const age = now - Date.parse(invitation?.invitedAt || "");
  return permissions?.revokeInvitations === true
    && !invitation?.revocation
    && !invitation?.usedAt
    && age >= 0
    && age <= 24 * 60 * 60 * 1000;
}

export function activeRoleChangeForMember(member, leadershipChanges = []) {
  return leadershipChanges.slice().reverse().find(change =>
    change.status === "confirmed"
    && change.incomingUserId === member?.id
    && change.role === member?.role
    && !(change.audit || []).some(item => item.action === "revoked"));
}

export function submitMemberRevocation(writeRequester, owner, path, reason) {
  const normalizedReason = String(reason ?? "").trim();
  if (!path || normalizedReason.length < 5 || normalizedReason.length > 500) {
    throw new TypeError("Enter a reason of 5-500 characters.");
  }
  return writeRequester.submit({
    owner,
    path,
    method: "POST",
    body: { reason: normalizedReason },
  });
}
