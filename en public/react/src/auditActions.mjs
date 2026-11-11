export async function fetchAuditLog(fetcher = globalThis.fetch, signal) {
  const response = await fetcher("/api/audit-log", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", "X-Requested-With": "chama" },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  if (!Array.isArray(payload?.data)) throw new Error("The audit log response could not be confirmed.");
  return payload.data;
}

export function auditDescription(entry, formatRole = role => role ? `${role[0].toUpperCase()}${role.slice(1)}` : "") {
  switch (entry?.type) {
    case "payment.recorded": return `KES ${entry.amount} cash payment recorded for ${entry.memberName}`;
    case "loan.requested": return `Loan requested: KES ${entry.amount} over ${entry.months} month${entry.months === 1 ? "" : "s"}`;
    case "loan.decided": return `Loan ${entry.decision === "approve" ? "approved" : "rejected"}`;
    case "leadership.proposed": return `${formatRole(entry.role)} assignment proposed`;
    case "leadership.confirmed": return `${formatRole(entry.role)} assignment confirmed`;
    case "leadership.role.revoked": return `${entry.memberName} removed as ${formatRole(entry.role)}: ${entry.reason}`;
    case "attendance.created": return `Attendance register created for ${entry.date}`;
    case "attendance.edited": return `Attendance register edited for ${entry.date}`;
    case "invitation.revoked": return `Invitation revoked: ${entry.reason}`;
    default: return String(entry?.type || "");
  }
}

export function filterAuditEntries(entries, query, formatRole) {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  return entries.filter(entry => !normalized || [
    entry.by?.name,
    entry.by?.role,
    entry.type,
    auditDescription(entry, formatRole),
    entry.at,
  ].some(value => String(value ?? "").toLocaleLowerCase().includes(normalized)));
}

export function paginateAuditEntries(entries, page, pageSize = 25) {
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(Math.max(0, Number(page) || 0), pageCount - 1);
  return {
    pageCount,
    currentPage,
    items: entries.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
  };
}
