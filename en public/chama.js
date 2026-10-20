"use strict";

const $ = selector => document.querySelector(selector);
const money = value => value === null || value === undefined ? "Private" : `KES ${Number(value).toLocaleString("en-KE")}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const t = key => window.jiraniI18n?.t(key) || key;
const writeRequester = window.chamaWriteRequests.createWriteRequester();
let state;
let attendanceData;
let selectedAttendanceDate;
let eventStream;
let streamRetryTimer;
let pollingTimer;
let activityTimer;
let authenticated = false;
let lastActivity = Date.now();
let lastActivityPing = 0;
const idleLimitMs = 15 * 60 * 1000;

async function api(path, { method = "GET", body, write = false, validateResponse, silentForbidden = false } = {}) {
  if (write) {
    try {
      return await writeRequester.submit({ owner: write === true ? {} : write, path, method, body, validate: validateResponse });
    } catch (error) {
      if (error.status === 401 && path !== "/api/login") showLogin();
      if (error.status === 403 && !error.data?.mustChangePin) notice("You do not have permission to perform that action.", true);
      throw error;
    }
  }
  const headers = { "Content-Type": "application/json", "X-Requested-With": "chama" };
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") showLogin();
  if (response.status === 403 && !data.mustChangePin && !silentForbidden) notice("You do not have permission to perform that action.", true);
  if (!response.ok) { const error = new Error(data.message || `Request failed (${response.status}).`); error.status = response.status; error.data = data; throw error; }
  return data;
}
async function checkBackendConnection({ selectInitialScreen = false } = {}) {
  try {
    const response = await fetch("/api/health", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) { setConnectionStatus("offline"); return; }
    setConnectionStatus("ready");
    const setupResponse = await fetch("/api/setup/status", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    if (selectInitialScreen && setupResponse.ok && !authenticated) {
      const setup = await setupResponse.json();
      $("#setup-form").hidden = !setup.requiresSetup;
      $("#login-form").hidden = !!setup.requiresSetup;
      $("#activation-form").hidden = true;
    }
  } catch {
    setConnectionStatus("offline");
  }
}
function setLoginNotice(node, message) {
  node.textContent = message;
  node.hidden = !message;
}
function notice(message, error = false) { const node = $("#notice"); node.textContent = message; node.classList.toggle("error", error); node.setAttribute("aria-live", error ? "assertive" : "polite"); node.setAttribute("role", error ? "alert" : "status"); }
function setButton(form, disabled) { form.querySelector("button[type=submit]").disabled = disabled; }
function roleName(role) { return role ? role[0].toUpperCase() + role.slice(1) : ""; }
function fmtDate(value) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(new Date(value)); }
function fmtTime(value) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(new Date(value)); }
function meetingDateToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Nairobi" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function render() {
  const { user, permissions, summary, members, invitations = [], transactions, loans, approvalQueue = [], pendingLoans, leadershipChanges } = state;
  if (!authenticated) {
    authenticated = true;
    lastActivity = Date.now();
    lastActivityPing = 0;
    startActivityMonitor();
  }
  $("#identity").textContent = `${user.name} (${roleName(user.role)})`;
  $("#logout").hidden = false;
  $("#role-label").textContent = `${roleName(user.role)} dashboard`;
  $("#greeting").textContent = `Welcome, ${user.name}`;
  $("#balance").textContent = money(summary.balance);
  $("#contributions").textContent = money(summary.contributions);
  $("#outstanding").textContent = money(summary.outstanding);
  [$("#balance"), $("#contributions"), $("#outstanding")].forEach(node => node?.classList.remove("skeleton"));
  $("#transaction-copy").textContent = user.role === "member" ? "Only your confirmed entries are shown." : "All confirmed group entries.";
  $("#members-panel").hidden = user.role === "member";
  $("#payment-panel").hidden = !permissions.recordPayments;
  $("#invite-panel").hidden = !permissions.manageMembers;
  $("#leadership-panel").hidden = !permissions.manageLeadership;
  $("#audit-panel").hidden = !permissions.viewAuditLog;
  $("#penalty-panel").hidden = !permissions.assessPenalties;
  $("#dividend-panel").hidden = !permissions.manageDividends;
  $("#leadership-form").hidden = !permissions.proposeLeadership;
  $("#pin-change").hidden = !user.mustChangePin;
  if (user.mustChangePin) notice("Change your temporary PIN before making any records.", true);

  $("#transactions").innerHTML = transactions.map(item => `<tr><td data-label="Date">${esc(fmtDate(item.at))}</td><td data-label="Member">${esc(item.memberName)}<span class="schedule-sub">${esc(item.payer || item.recordedByName || "")}</span></td><td data-label="Amount">${money(item.amount)}</td><td data-label="Method">${esc(item.method)}${item.ref ? `<span class="schedule-sub">${esc(item.ref)}</span>` : ""}</td><td data-label="Type">${esc(item.paymentType)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty-state">No transactions available.</td></tr>';
  const memberRows = members.map(member => {
    const activeRoleChange = (leadershipChanges || []).slice().reverse().find(change =>
      change.status === "confirmed" && change.incomingUserId === member.id && change.role === member.role &&
      !(change.audit || []).some(item => item.action === "revoked"));
    const revokeButton = permissions.revokeLeadershipRoles && member.status === "active" && member.role !== "member" && activeRoleChange
      ? `<button class="mini-btn danger" type="button" data-revoke-role="${esc(activeRoleChange.id)}">Revoke this role</button>`
      : "";
    return `<tr><td data-label="Name">${esc(member.name)}</td><td data-label="Phone">${esc(member.phone)}</td><td data-label="Role">${esc(roleName(member.role))}</td><td data-label="Status">${esc(member.status)}</td><td data-label="Actions">${revokeButton}</td></tr>`;
  });
  const invitationRows = permissions.manageMembers ? invitations.map(invitation => {
    const revocation = invitation.revocation;
    const expired = Date.parse(invitation.expiresAt) <= Date.now();
    const age = Date.now() - Date.parse(invitation.invitedAt);
    const status = revocation ? "Revoked by Chairperson" : invitation.usedAt ? "Activated" : expired ? "Invitation expired" : "Awaiting activation";
    const statusClass = revocation || expired ? "inactive" : invitation.usedAt ? "active" : "pending";
    const history = revocation
      ? `<span class="schedule-sub">This invitation was revoked by ${esc(roleName(revocation.by?.role))} on ${esc(fmtDate(revocation.at))} at ${esc(fmtTime(revocation.at))} (reason: ${esc(revocation.reason)})</span>`
      : invitation.usedAt ? `<span class="schedule-sub">Activated on ${esc(fmtDate(invitation.usedAt))} at ${esc(fmtTime(invitation.usedAt))}</span>` : "";
    const undoButton = permissions.revokeInvitations && !revocation && !invitation.usedAt && age >= 0 && age <= 24 * 60 * 60 * 1000
      ? `<button class="mini-btn danger" type="button" data-revoke-invitation="${esc(invitation.id)}">Undo</button>`
      : "";
    return `<tr><td data-label="Name">${esc(invitation.name)}${history}</td><td data-label="Phone">${esc(invitation.phone)}</td><td data-label="Role">${esc(roleName(invitation.requestedRole))}</td><td data-label="Status"><span class="status-pill ${statusClass}">${status}</span></td><td data-label="Actions">${undoButton}</td></tr>`;
  }) : [];
  $("#members").innerHTML = [...memberRows, ...invitationRows].join("") || '<tr><td colspan="5" class="empty-state">No members or invitations available.</td></tr>';
  $("#loan-copy").textContent = user.role === "member" ? "Your requests and eligible independent approvals." : "Three roles review each request; the Secretary fills a Chairperson or Treasurer borrower’s approval seat.";
  const visibleLoans = [...new Map([...loans, ...approvalQueue].map(loan => [loan.id, loan])).values()];
  $("#loans").innerHTML = visibleLoans.map(loan => {
    const steps = loan.approvalSteps.map(step => {
      const completed = step.status === "approve" || step.status === "reject";
      const icon = step.status === "approve" ? "✓" : step.status === "reject" ? "✕" : "Awaiting";
      const reason = step.reason ? `<span class="loan-step-reason">Reason: ${esc(step.reason)}</span>` : "";
      const attribution = completed
        ? `<span class="loan-step-meta">${esc(step.approverName)} · ${esc(fmtDate(step.at))} at ${esc(fmtTime(step.at))}</span>`
        : '<span class="loan-step-meta">Decision not yet recorded</span>';
      return `<li class="loan-step ${completed ? `is-${esc(step.status)}` : "is-awaiting"}"><strong>${esc(roleName(step.role))} <span aria-label="${step.status === "approve" ? "Approved" : step.status === "reject" ? "Rejected" : "Awaiting"}">${icon}</span></strong>${attribution}${reason}</li>`;
    }).join("");
    const action = permissions.decideLoans && loan.canDecide
      ? `<div class="loan-decision"><label for="loan-reason-${esc(loan.id)}">Decision reason</label><textarea id="loan-reason-${esc(loan.id)}" aria-label="Reason for loan decision" data-reason-for="${esc(loan.id)}" minlength="5" maxlength="500" placeholder="Reason (required)"></textarea><div class="loan-decision-actions"><button class="mini-btn" data-loan="${esc(loan.id)}" data-decision="approve">Approve</button><button class="mini-btn danger" data-loan="${esc(loan.id)}" data-decision="reject">Reject</button></div></div>`
      : "";
    const statusClass = loan.status === "approved" ? "success" : loan.status === "rejected" ? "inactive" : "pending";
    return `<article class="loan-card"><div class="loan-card-heading"><div><h3>${esc(loan.memberName)} · ${money(loan.amount)}</h3><span class="schedule-sub">${loan.months} month${loan.months === 1 ? "" : "s"} · Requested ${esc(fmtDate(loan.createdAt))}</span></div><span class="status-pill ${statusClass}">${esc(loan.status)}</span></div><p class="loan-progress">${esc(loan.progressMessage)}</p><ol class="loan-approval-trail" aria-label="Approval trail for ${esc(loan.memberName)}">${steps}</ol>${action}</article>`;
  }).join("") || '<div class="empty-state">No loans available.</div>';
  populateSelects(members, loans);
  if (permissions.manageLeadership) renderLeadership(leadershipChanges || [], members, user);
  renderAttendance(user);
  $("#app").hidden = false; $("#login").hidden = true;
}
function renderAttendance(user) {
  if (!attendanceData) return;
  const isSecretary = user.role === "secretary";
  const date = $("#attendance-date").value || selectedAttendanceDate || meetingDateToday();
  selectedAttendanceDate = date;
  $("#attendance-date").value = date;
  $("#attendance-readonly-label").hidden = isSecretary;
  $("#attendance-editor").hidden = !isSecretary;
  $("#attendance-view").hidden = isSecretary;
  const register = attendanceData.registers.find(item => item.date === date);
  const current = new Map((register?.attendees || []).map(item => [item.userId, item]));
  const editHistory = register?.history || [];

  if (isSecretary) {
    const visibleMembers = new Map(attendanceData.members.map(member => [member.id, {
      userId: member.id,
      name: member.name,
      present: current.get(member.id)?.present ?? false
    }]));
    for (const attendee of register?.attendees || []) {
      if (!visibleMembers.has(attendee.userId)) visibleMembers.set(attendee.userId, attendee);
    }
    const attendees = [...visibleMembers.values()].sort((left, right) => left.name.localeCompare(right.name));
    $("#attendance-members").innerHTML = attendees.map(attendee => `<label class="attendance-row"><span>${esc(attendee.name)}</span><input type="checkbox" data-attendance-member="${esc(attendee.userId)}" ${attendee.present ? "checked" : ""}><span data-attendance-status>${attendee.present ? "Present" : "Absent"}</span></label>`).join("") || '<p class="empty-state">No active members to record.</p>';
    updateAttendanceCount();
    $("#attendance-save").textContent = register ? "Save changes" : "Save register";
  } else {
    $("#attendance-personal-label").hidden = user.role !== "member";
    if (user.role === "member") {
      const self = register?.attendees.find(item => item.userId === user.id);
      $("#attendance-personal-label").textContent = self ? `Your attendance: ${self.present ? "Present" : "Absent"}` : "Your attendance is not listed in this register.";
    }
    $("#attendance-view-members").innerHTML = register
      ? register.attendees.map(attendee => `<div class="attendance-row"><span>${esc(attendee.name)}</span><strong>${attendee.present ? "Present" : "Absent"}</strong></div>`).join("") || '<p class="empty-state">No attendance details recorded.</p>'
      : '<p class="empty-state">No attendance register for this date.</p>';
  }
  const latestEdit = editHistory.at(-1);
  const latestChanges = latestEdit?.changes.map(change => change.from
    ? `changed ${change.name} from ${change.from} to ${change.to}${change.from === "present" && change.to === "absent" ? " (removed from present)" : ""}`
    : `recorded ${change.name} as ${change.to}`).join("; ");
  const editAttribution = latestEdit
    ? ` Last edited by ${roleName(latestEdit.by.role)} at ${fmtDate(latestEdit.at)} ${fmtTime(latestEdit.at)} (${latestChanges || "edit recorded"}).`
    : "";
  $("#attendance-attribution").textContent = register
    ? `Created by ${roleName(register.createdBy.role)} on ${fmtDate(register.createdAt)} at ${fmtTime(register.createdAt)}.${editAttribution}`
    : "";
  $("#attendance-edit-history").hidden = !register || editHistory.length === 0;
  $("#attendance-history").innerHTML = editHistory.map(item => {
    const changes = item.changes.length
      ? item.changes.map(change => change.from
        ? `changed ${esc(change.name)} from ${esc(change.from)} to ${esc(change.to)}${change.from === "present" && change.to === "absent" ? " (removed from present)" : ""}`
        : `recorded ${esc(change.name)} as ${esc(change.to)}`).join("; ")
      : "No attendance changes.";
    return `<div class="schedule-item"><div><strong>Edited by ${esc(roleName(item.by.role))} ${esc(item.by.name)}</strong><span class="schedule-sub">${fmtDate(item.at)} at ${fmtTime(item.at)} · ${changes}</span></div></div>`;
  }).join("") || "";
  $("#attendance-registers").innerHTML = attendanceData.registers.map(item => {
    return `<div class="schedule-item"><div><strong>${esc(fmtDate(`${item.date}T12:00:00`))}</strong><span class="schedule-sub">${item.presentCount} present · ${item.absentCount} absent · ${item.memberCount} members</span></div><button class="panel-link" type="button" data-attendance-date="${esc(item.date)}">Open register</button></div>`;
  }).join("") || '<div class="empty-state">No meeting attendance recorded yet.</div>';
}
function updateAttendanceCount() {
  const choices = [...$("#attendance-members").querySelectorAll("[data-attendance-member]")];
  const present = choices.filter(input => input.checked).length;
  $("#attendance-count").textContent = `${present} present · ${choices.length - present} absent · ${choices.length} members`;
  choices.forEach(input => { input.closest(".attendance-row").querySelector("[data-attendance-status]").textContent = input.checked ? "Present" : "Absent"; });
}
function populateSelects(members, loans) {
  $("#payment-member").innerHTML = members.filter(member => member.status === "active").map(member => `<option value="${esc(member.id)}">${esc(member.name)}</option>`).join("");
  $("#incoming-user").innerHTML = members.filter(member => member.status === "active").map(member => `<option value="${esc(member.id)}">${esc(member.name)} (${esc(roleName(member.role))})</option>`).join("");
  const guarantorOptions = members.filter(member => member.status === "active" && member.id !== state?.user?.id).map(member => `<option value="${esc(member.id)}">${esc(member.name)}</option>`).join("");
  for (const id of ["#loan-guarantor-1", "#loan-guarantor-2"]) $(id).innerHTML = guarantorOptions;
  const selected = $("#payment-member").value;
  $("#payment-loan").innerHTML = `<option value="">Select a loan</option>${loans.filter(loan => loan.status === "approved" && loan.memberId === selected).map(loan => `<option value="${esc(loan.id)}">${esc(loan.memberName)} — ${money(loan.outstanding)}</option>`).join("")}`;
}
function renderLeadership(changes, members, user) {
  $("#leadership-list").innerHTML = changes.map(change => {
    const incoming = members.find(member => member.id === change.incomingUserId)?.name || "Unknown member";
    const proposer = members.find(member => member.id === change.proposedBy)?.name || "Officer";
    const revocation = (change.audit || []).find(item => item.action === "revoked");
    const canConfirm = change.status === "pending" && change.proposedBy !== user.id;
    const details = revocation
      ? `<span class="schedule-sub">${esc(incoming)} was ${esc(roleName(change.role))} (${esc(fmtDate(`${change.effectiveDate}T12:00:00Z`))}), revoked (${esc(fmtDate(revocation.at))} ${esc(fmtTime(revocation.at))} by ${esc(roleName(revocation.byRole || "chairperson"))}; reason: ${esc(revocation.reason)})</span>`
      : `<span class="schedule-sub">Officer assignment proposed by ${esc(proposer)} · ${esc(change.status)}</span>`;
    return `<div class="schedule-item"><div><strong>${esc(revocation ? `${incoming} — role revoked` : `${roleName(change.role)}: ${incoming}`)}</strong>${details}</div>${canConfirm ? `<button class="mini-btn" data-confirm="${esc(change.id)}">Confirm</button>` : ""}</div>`;
  }).join("") || '<div class="empty-state">No officer assignments recorded.</div>';
}
function auditDescription(entry) {
  switch (entry.type) {
    case "payment.recorded": return `KES ${entry.amount} cash payment recorded for ${entry.memberName}`;
    case "loan.requested": return `Loan requested: KES ${entry.amount} over ${entry.months} month${entry.months === 1 ? "" : "s"}`;
    case "loan.decided": return `Loan ${entry.decision === "approve" ? "approved" : "rejected"}`;
    case "leadership.proposed": return `${roleName(entry.role)} assignment proposed`;
    case "leadership.confirmed": return `${roleName(entry.role)} assignment confirmed`;
    case "leadership.role.revoked": return `${entry.memberName} removed as ${roleName(entry.role)}: ${entry.reason}`;
    case "attendance.created": return `Attendance register created for ${entry.date}`;
    case "attendance.edited": return `Attendance register edited for ${entry.date}`;
    case "invitation.revoked": return `Invitation revoked: ${entry.reason}`;
    default: return entry.type;
  }
}
let dividendDraft = null;
function clearDividendDraft() { dividendDraft = null; $("#dividend-preview").innerHTML = ""; $("#dividend-commit").hidden = true; }
function renderDividendPreview(data) {
  const rows = data.payouts.map(item => `<tr><td>${esc(item.name)}</td><td>${money(item.shareCapital)}</td><td>${money(item.dividend)}</td></tr>`).join("");
  $("#dividend-preview").innerHTML = `<p class="form-note">Interest ${money(data.interestIncome)} and penalties ${money(data.penaltyIncome)}, less admin expenses ${money(data.adminExpenses)}, leave a pool of <strong>${money(data.distributablePool)}</strong>. Total share capital: ${money(data.totalShareCapital)}.${data.overlapsCommitted ? " This cycle overlaps a dividend already paid out, so it cannot be committed." : ""}</p><div class="table-wrap"><table><thead><tr><th>Member</th><th>Share capital</th><th>Dividend</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
$("#dividend-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; clearDividendDraft();
  const values = Object.fromEntries(new FormData(form));
  const input = { cycleStartDate: values.cycleStartDate, cycleEndDate: values.cycleEndDate, adminExpenses: Number(values.adminExpenses) };
  try {
    const { data } = await api("/api/dividends/calculate", { method: "POST", body: input });
    dividendDraft = { input, data }; renderDividendPreview(data);
    $("#dividend-commit").hidden = data.overlapsCommitted;
    notice("Dividend preview ready. Nothing has been paid out yet.");
  } catch (error) { notice(error.message, true); }
});
$("#dividend-form").addEventListener("input", clearDividendDraft);
$("#dividend-commit").addEventListener("click", async event => {
  if (!dividendDraft) return; const { input, data } = dividendDraft; const button = event.currentTarget; button.disabled = true;
  try {
    await api("/api/dividends/commit", { method: "POST", body: { ...input, payouts: data.payouts.map(item => ({ memberId: item.memberId, dividend: item.dividend })) }, write: true });
    clearDividendDraft(); $("#dividend-form").reset(); notice("Dividends added to share capital."); await refresh();
  } catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
});
$("#penalty-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try {
    const { data, message } = await api("/api/penalties/assess", { method: "POST", body: { month: new FormData(form).get("month") }, write: true });
    const names = data.assessed.map(item => item.memberName);
    $("#penalty-result").textContent = names.length ? `Penalised for ${data.month}: ${names.join(", ")}.` : `No members to penalise for ${data.month}.`;
    notice(message); await refresh();
  } catch (error) { notice(error.message, true); }
  finally { setButton(form, false); }
});
async function loadAuditLog() {
  const auditNotice = $("#audit-notice");
  try {
    const { data = [] } = await api("/api/audit-log", { silentForbidden: true });
    auditNotice.hidden = true;
    $("#audit-list").innerHTML = data.slice(0, 50).map(entry => `<tr><td>${esc(fmtDate(entry.at))} ${esc(fmtTime(entry.at))}</td><td>${esc(entry.by?.name || "Unknown")}${entry.by?.role ? ` (${esc(roleName(entry.by.role))})` : ""}</td><td>${esc(auditDescription(entry))}</td></tr>`).join("") || '<tr><td colspan="3" class="empty-state">No audit entries yet.</td></tr>';
  } catch (error) {
    $("#audit-list").innerHTML = "";
    auditNotice.textContent = error.status === 403 ? "You do not have permission to view the audit log." : "The audit log could not load. Try again.";
    auditNotice.hidden = false;
  }
}
async function refresh() {
  try {
    state = await api("/api/dashboard");
    attendanceData = await api("/api/attendance");
    if (!selectedAttendanceDate) selectedAttendanceDate = meetingDateToday();
    $("#retry").hidden = true;
    render();
    if (state.permissions.viewAuditLog) await loadAuditLog();
    connectEventStream();
  }
  catch (error) {
    if (error.data?.mustChangePin) {
      authenticated = false; $("#app").hidden = true; $("#login").hidden = true; $("#pin-change").hidden = false; $("#current-pin").focus();
    } else if (!/session has expired/i.test(error.message)) { notice(error.message || t("retryError"), true); $("#retry").hidden = false; }
  }
}
function setConnectionStatus(status) {
  const labels = { live: t("live"), reconnecting: t("reconnecting"), polling: t("polling"), offline: t("offline") };
  const node = $("#connection-status"); if (!node) return; node.textContent = labels[status] || status; node.dataset.status = status;
}
function startPollingFallback() {
  if (pollingTimer) return;
  setConnectionStatus(navigator.onLine ? "polling" : "offline");
  pollingTimer = setInterval(() => { if (navigator.onLine) refresh(); else setConnectionStatus("offline"); }, 30000);
}
function stopPollingFallback() { if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; } }
function startActivityMonitor() {
  if (activityTimer) return;
  const checkActivity = () => {
    if (!authenticated) return;
    const idleFor = Date.now() - lastActivity;
    if (idleFor >= idleLimitMs) { endSessionForInactivity(); return; }
    if (navigator.onLine && Date.now() - lastActivityPing >= 4 * 60 * 1000) {
      lastActivityPing = Date.now();
      api("/api/session/activity", { method: "POST" }).catch(() => {});
    }
  };
  activityTimer = setInterval(checkActivity, 60 * 1000);
}
async function endSessionForInactivity() {
  authenticated = false;
  try { if (navigator.onLine) await api("/api/logout", { method: "POST" }); } catch {}
  showLogin();
  notice("You were signed out after 15 minutes of inactivity.");
}
function noteActivity() { if (authenticated) lastActivity = Date.now(); }
for (const eventName of ["pointerdown", "keydown", "touchstart", "scroll"]) document.addEventListener(eventName, noteActivity, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && authenticated && Date.now() - lastActivity >= idleLimitMs) endSessionForInactivity();
});
function connectEventStream() {
  if (eventStream || streamRetryTimer) return;
  if (!window.EventSource) { startPollingFallback(); return; }
  setConnectionStatus("reconnecting");
  eventStream = new EventSource("/api/events/stream");
  eventStream.onopen = () => { setConnectionStatus("live"); stopPollingFallback(); };
  eventStream.addEventListener("members-updated", () => { refresh(); });
  eventStream.addEventListener("loans-updated", () => { refresh(); });
  eventStream.onerror = () => {
    eventStream.close(); eventStream = null; startPollingFallback(); setConnectionStatus(navigator.onLine ? "reconnecting" : "offline");
    streamRetryTimer = setTimeout(() => { streamRetryTimer = null; connectEventStream(); }, 5000);
  };
}
function clearAppData() {
  state = null;
  attendanceData = null;
  dividendDraft = null;
  for (const selector of ["#identity", "#greeting", "#role-label", "#balance", "#contributions", "#outstanding", "#transactions", "#members", "#loans", "#leadership-list", "#audit-list", "#audit-notice", "#dividend-preview", "#penalty-result", "#invite-result-message", "#invite-code", "#notice", "#attendance-members", "#attendance-view-members", "#attendance-attribution", "#attendance-history", "#attendance-registers"]) {
    const node = $(selector); if (node) node.textContent = "";
  }
  $("#attendance-editor").hidden = true;
  $("#attendance-view").hidden = true;
  $("#attendance-readonly-label").hidden = true;
  $("#invite-result").hidden = true;
  $("#copy-invite-code").hidden = true;
  for (const selector of ["#payment-member", "#payment-loan", "#incoming-user"]) $(selector)?.replaceChildren();
  for (const selector of ["#payment-form", "#loan-form", "#invite-form", "#leadership-form", "#pin-form", "#setup-form"]) $(selector)?.reset();
  for (const key of Object.keys(sessionStorage)) if (key.startsWith("jirani:")) sessionStorage.removeItem(key);
}
function showLogin() { clearAppData(); if (eventStream) { eventStream.close(); eventStream = null; } stopPollingFallback(); clearTimeout(streamRetryTimer); streamRetryTimer = null; clearInterval(activityTimer); activityTimer = null; authenticated = false; $("#logout").hidden = true; $("#app").hidden = true; $("#login").hidden = false; $("#setup-form").hidden = true; $("#login-form").hidden = false; $("#activation-form").hidden = true; setLoginNotice($("#setup-notice"), ""); setLoginNotice($("#login-notice"), ""); setLoginNotice($("#activation-notice"), ""); }

$("#setup-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try {
    await api("/api/setup", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    form.reset(); setLoginNotice($("#setup-notice"), ""); await refresh();
  } catch (error) {
    setLoginNotice($("#setup-notice"), error instanceof TypeError ? "Cannot reach the server. Check that it is running, then try again." : error.message);
  } finally { setButton(form, false); }
});

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try { await api("/api/login", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.reset(); setLoginNotice($("#login-notice"), ""); await refresh(); }
  catch (error) { if (error instanceof TypeError) { setConnectionStatus("offline"); setLoginNotice($("#login-notice"), "Cannot reach the server. Check that it is running, then try again."); } else setLoginNotice($("#login-notice"), error.message); } finally { setButton(form, false); }
});
$("#activation-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try { const result = await api("/api/invitations/activate", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.reset(); setLoginNotice($("#activation-notice"), ""); setLoginNotice($("#login-notice"), result.message); $("#activation-form").hidden = true; $("#login-form").hidden = false; }
  catch (error) { setLoginNotice($("#activation-notice"), error instanceof TypeError ? "Cannot reach the server. Check that it is running, then try again." : error.message); } finally { setButton(form, false); }
});
$("#show-activate").addEventListener("click", () => { $("#login-form").hidden = true; $("#activation-form").hidden = false; });
$("#show-login").addEventListener("click", () => { $("#activation-form").hidden = true; $("#login-form").hidden = false; });
$("#logout").addEventListener("click", async () => { try { await api("/api/logout", { method: "POST" }); showLogin(); notice("Signed out."); } catch (error) { notice(error.message, true); } });
$("#export-csv").addEventListener("click", () => { window.location.assign("/api/export.csv"); });
$("#attendance-date").value = meetingDateToday();
selectedAttendanceDate = $("#attendance-date").value;
$("#attendance-date").addEventListener("change", () => renderAttendance(state.user));
$("#attendance-registers").addEventListener("click", event => {
  const button = event.target.closest("[data-attendance-date]");
  if (!button) return;
  $("#attendance-date").value = button.dataset.attendanceDate;
  renderAttendance(state.user);
});
$("#attendance-members").addEventListener("change", event => {
  if (event.target.matches("[data-attendance-member]")) updateAttendanceCount();
});
$("#attendance-all-present").addEventListener("click", () => {
  $("#attendance-members").querySelectorAll("[data-attendance-member]").forEach(input => { input.checked = true; });
  updateAttendanceCount();
});
$("#attendance-all-absent").addEventListener("click", () => {
  $("#attendance-members").querySelectorAll("[data-attendance-member]").forEach(input => { input.checked = false; });
  updateAttendanceCount();
});
function confirmAttendanceOverwrite() {
  const dialog = $("#attendance-overwrite-dialog");
  return new Promise(resolve => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
    dialog.showModal();
  });
}
$("#attendance-save").addEventListener("click", async event => {
  const button = event.currentTarget;
  const date = $("#attendance-date").value;
  const existing = attendanceData.registers.find(item => item.date === date);
  if (existing && !(await confirmAttendanceOverwrite())) return;
  button.disabled = true;
  try {
    const attendees = [...$("#attendance-members").querySelectorAll("[data-attendance-member]")].map(input => ({
      userId: input.dataset.attendanceMember,
      present: input.checked
    }));
    await api("/api/attendance", {
      method: "POST",
      body: { date, expectedRevision: existing?.revision ?? null, attendees },
      write: true
    });
    attendanceData = await api("/api/attendance");
    renderAttendance(state.user);
    notice("Attendance register saved.");
  } catch (error) {
    notice(error.message, true);
  } finally {
    button.disabled = false;
  }
});
$("#retry").addEventListener("click", () => { $("#retry").disabled = true; refresh().finally(() => { $("#retry").disabled = false; }); });
window.addEventListener("online", () => { setConnectionStatus("reconnecting"); if (authenticated) refresh(); else checkBackendConnection(); });
window.addEventListener("offline", () => { if (eventStream) { eventStream.close(); eventStream = null; } setConnectionStatus("offline"); startPollingFallback(); });

document.body.insertAdjacentHTML("beforeend", '<section class="login-overlay" id="pin-change" hidden><form id="pin-form" class="login-card"><h2>Change your PIN</h2><p>Choose a private 6–12 digit PIN before using the dashboard.</p><label class="field" for="current-pin">Current PIN<input id="current-pin" name="currentPin" type="password" inputmode="numeric" required></label><label class="field" for="new-pin">New PIN<input id="new-pin" name="newPin" type="password" inputmode="numeric" minlength="6" maxlength="12" pattern="[0-9]{6,12}" required></label><button class="button-primary">Save PIN</button></form></section>');
$("#pin-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try { await api("/api/pin/change", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.reset(); notice("PIN changed successfully."); await refresh(); }
  catch (error) { notice(error.message, true); } finally { setButton(form, false); }
});

$("#payment-member").addEventListener("change", () => populateSelects(state.members, state.loans));
$("#payment-type").addEventListener("change", event => { $("#repayment-field").hidden = event.target.value !== "Loan Repayment"; });
function confirmCashPayment(values) {
  const dialog = $("#cash-confirm-dialog"); $("#cash-confirm-summary").textContent = `${values.memberName} · ${money(values.amount)} · ${values.paymentType}. Note: ${values.note}`;
  return new Promise(resolve => { dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }); dialog.showModal(); });
}
$("#payment-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const values = Object.fromEntries(new FormData(form)); values.amount = Number(values.amount); values.memberName = $("#payment-member option:checked")?.textContent || "Selected member"; if (!(await confirmCashPayment(values))) return; setButton(form, true);
  try {
    delete values.memberName;
    const route = values.paymentType === "Loan Repayment" ? "/api/loans/repay" : values.paymentType === "Fine" ? "/api/payments" : "/api/contributions";
    await api(route, {
      method: "POST",
      body: values,
      write: form,
      validateResponse: (result, key) => {
        const transaction = result?.data;
        const fields = ["id", "at", "memberId", "memberName", "amount", "method", "paymentType", "note", "loanId", "recordedBy", "recordedByName", "source", "status", "idempotencyKey"];
        return !!transaction && fields.every(field => Object.hasOwn(transaction, field)) &&
          typeof transaction.id === "string" && typeof transaction.at === "string" && transaction.idempotencyKey === key &&
          transaction.memberId === values.memberId && transaction.amount === values.amount &&
          transaction.paymentType === values.paymentType && transaction.method === "Cash" &&
          transaction.note === values.note && transaction.status === "confirmed";
      },
    });
    form.reset(); notice("Cash payment recorded."); await refresh();
  } catch (error) {
    notice(error.uncertain ? writeRequests.unconfirmedMessage("Transactions") : error.message, true);
  } finally { setButton(form, false); }
});
$("#loan-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try { const values = Object.fromEntries(new FormData(form)); values.amount = Number(values.amount); values.months = Number(values.months); values.guarantorIds = [...form.querySelectorAll('select[name="guarantorIds"]')].map(select => select.value); await api("/api/loans", { method: "POST", body: values, write: true }); form.reset(); notice("Loan request submitted."); await refresh(); }
  catch (error) { notice(error.message, true); } finally { setButton(form, false); }
});
$("#invite-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  $("#invite-result").hidden = true; $("#invite-result").classList.remove("error"); $("#invite-code").textContent = ""; $("#copy-invite-code").hidden = true;
  try {
    const nameField = form.elements.namedItem("name");
    const phoneField = form.elements.namedItem("phone");
    const roleField = form.elements.namedItem("role");
    if (!nameField || !phoneField || !roleField) throw new Error("The member name, phone, or role field is missing. Hard-refresh the page and try again.");
    const values = { name: nameField.value.trim(), phone: phoneField.value.trim(), role: roleField.value };
    if (!values.name) throw new Error("Enter the member's name.");
    if (!values.phone) throw new Error("Enter the member's Kenyan phone number.");
    if (!values.role) throw new Error("Choose a member role.");
    const result = await api("/api/invitations", {
      method: "POST",
      body: values,
      write: form,
      validateResponse: (response, key) => {
        const invitation = response?.invitation;
        const fields = ["id", "name", "phone", "requestedRole", "idempotencyKey", "attemptsRemaining", "invitedBy", "invitedAt", "expiresAt", "usedAt"];
        return !!invitation && fields.every(field => Object.hasOwn(invitation, field)) &&
          typeof invitation.id === "string" && typeof invitation.invitedAt === "string" &&
          typeof invitation.expiresAt === "string" && invitation.idempotencyKey === key &&
          invitation.name === values.name && typeof invitation.phone === "string" &&
          invitation.requestedRole === values.role;
      },
    });
    form.reset();
    $("#invite-result-message").textContent = result.activationCode ? `${result.message} Share the code privately with the member.` : result.message;
    if (result.activationCode) { $("#invite-code").textContent = result.activationCode; $("#copy-invite-code").hidden = false; }
    $("#invite-result").hidden = false;
    notice(result.message);
    await refresh();
  }
  catch (error) {
    $("#invite-result-message").textContent = error.uncertain
      ? writeRequests.unconfirmedMessage("Invitations")
      : error.message;
    $("#invite-result").classList.add("error"); $("#invite-result").hidden = false;
    notice($("#invite-result-message").textContent, true);
  } finally { setButton(form, false); }
});
$("#copy-invite-code").addEventListener("click", async () => {
  const code = $("#invite-code").textContent;
  try { await navigator.clipboard.writeText(code); notice("Activation code copied. Share it privately."); }
  catch { notice("Copy failed. Select the activation code and copy it manually.", true); }
});
$("#members").addEventListener("click", async event => {
  const invitationButton = event.target.closest("[data-revoke-invitation]");
  const roleButton = event.target.closest("[data-revoke-role]");
  const button = invitationButton || roleButton;
  if (!button) return;
  const reason = window.prompt(invitationButton ? "Why are you revoking this invitation?" : "Why are you revoking this role?");
  if (reason === null) return;
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 5 || trimmedReason.length > 500) {
    notice("Enter a reason of 5-500 characters.", true);
    return;
  }
  button.disabled = true;
  const path = invitationButton
    ? `/api/invitations/${encodeURIComponent(button.dataset.revokeInvitation)}/revoke`
    : `/api/leadership-changes/${encodeURIComponent(button.dataset.revokeRole)}/revoke`;
  try {
    await api(path, { method: "POST", body: { reason: trimmedReason }, write: true });
    notice(invitationButton ? "Invitation revoked and recorded in history." : "Role revoked and recorded in history.");
    await refresh();
  } catch (error) {
    notice(error.message, true);
    button.disabled = false;
  }
});
$("#leadership-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const values = Object.fromEntries(new FormData(form)); setButton(form, true);
  try { await api("/api/leadership-changes", { method: "POST", body: values, write: true }); form.reset(); notice("Officer assignment proposed."); await refresh(); }
  catch (error) { notice(error.message, true); } finally { setButton(form, false); }
});
$("#loans").addEventListener("click", async event => {
  const button = event.target.closest("[data-loan]"); if (!button) return; const reason = $("[data-reason-for='" + CSS.escape(button.dataset.loan) + "']")?.value.trim() || ""; if (reason.length < 5) { notice("Enter a reason of at least 5 characters.", true); return; } button.disabled = true;
  try { await api(`/api/loans/${encodeURIComponent(button.dataset.loan)}/decisions`, { method: "POST", body: { decision: button.dataset.decision, reason }, write: true }); notice("Decision recorded."); await refresh(); }
  catch (error) { notice(error.message, true); button.disabled = false; }
});
$("#leadership-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-confirm]"); if (!button) return; button.disabled = true;
  try { await api(`/api/leadership-changes/${encodeURIComponent(button.dataset.confirm)}/confirm`, { method: "POST", body: {}, write: true }); notice("Officer assignment confirmed."); await refresh(); }
  catch (error) { notice(error.message, true); button.disabled = false; }
});

showLogin();
checkBackendConnection({ selectInitialScreen: true });

const profileMenuButton = $("#profile-icon");
const profileMenu = $("#profile-menu");
profileMenuButton.addEventListener("click", () => {
  const expanded = profileMenuButton.getAttribute("aria-expanded") === "true";
  profileMenuButton.setAttribute("aria-expanded", String(!expanded));
  profileMenu.hidden = expanded;
});
document.addEventListener("click", event => {
  if (event.target.closest(".profile-menu-wrap")) return;
  profileMenu.hidden = true;
  profileMenuButton.setAttribute("aria-expanded", "false");
});
for (const action of ["#edit-profile", "#view-profile"]) {
  $(action).addEventListener("click", () => window.location.assign("/profile.html"));
}
