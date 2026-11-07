"use strict";

const $ = selector => document.querySelector(selector);
const money = value => value === null || value === undefined ? "Private" : `KES ${Number(value).toLocaleString("en-KE")}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const t = key => window.jiraniI18n?.t(key) || key;
function updateLoanRequestAccess(subscription = state?.subscription) {
  const blocked = subscription?.status !== "active";
  const note = $("#loan-request-access-note");
  const submit = $("#loan-submit");
  const renewalLink = $("#loan-request-renewal-link");
  const contactLink = $("#subscription-renewal-link");
  if (note) note.hidden = !blocked;
  if (submit) submit.disabled = blocked;
  if (renewalLink && contactLink) {
    renewalLink.href = contactLink.href;
    renewalLink.hidden = !blocked || contactLink.hidden;
  }
}
function memberStatusPresentation(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const labels = { active: "activeStatus", inactive: "inactiveStatus", pending: "pendingActivationStatus", activated: "activatedStatus", expired: "expiredStatus", revoked: "revokedStatus" };
  const statusClass = normalized === "active" || normalized === "activated" ? "active" : normalized === "pending" ? "pending" : "inactive";
  const label = labels[normalized] ? t(labels[normalized]) : normalized ? normalized.replace(/\b[a-z]/g, char => char.toUpperCase()) : t("unknownStatus");
  return { normalized, statusClass, label };
}
const writeRequester = window.chamaWriteRequests.createWriteRequester();
let state;
let attendanceData;
let guarantorMembers = [];
let selectedAttendanceDate;
let eventStream;
let streamRetryTimer;
let pollingTimer;
let chatPollingTimer;
let activityTimer;
let authenticated = false;
let selectedDashboardView = "you";
let activeAppPage = "overview";
let auditEntries = [];
let auditPage = 0;
const auditPageSize = 25;
let lastActivity = Date.now();
let lastActivityPing = 0;
const idleLimitMs = 15 * 60 * 1000;
const menuToggle = $("#menu-toggle");
const menuBar = $("#menu-bar");

async function openPricingModal(button) {
  const dialog = $("#pricing-modal");
  if (!dialog || !button || button.disabled) return;
  const copy = $("#pricing-modal-copy");
  const referencePanel = $("#pricing-reference-panel");
  const referenceOutput = $("#pricing-modal-reference");
  const copyButton = $("#pricing-copy-reference");
  const copyStatus = $("#pricing-reference-copy-status");
  $("#pricing-modal-tier").textContent = button.dataset.pricingTier;
  $("#pricing-modal-cap").textContent = button.dataset.memberCap;
  $("#pricing-modal-billing").textContent = button.dataset.pricingBilling;
  $("#pricing-modal-total").textContent = button.dataset.pricingTotal;
  $("#pricing-modal-savings").textContent = button.dataset.pricingSavings;
  if (referencePanel) referencePanel.hidden = true;
  if (referenceOutput) referenceOutput.textContent = "";
  if (copyButton) copyButton.disabled = true;
  if (copyStatus) copyStatus.textContent = "";
  if (copy) copy.textContent = "Choose a plan to review it. A signed-in chairperson can request a pending reference for the chama. No payment request is sent, and choosing a plan does not activate access.";
  dialog.showModal();
  dialog.scrollTop = 0;
  $("#pricing-modal-title")?.focus({ preventScroll: true });

  const billing = String(button.dataset.pricingBilling || "").toLowerCase();
  if (billing === "custom") {
    if (copy) copy.textContent = "Enterprise / Investment plans use custom member limits and pricing. Contact our team to discuss your group; no payment request is sent and access is not activated by selecting this option.";
    return;
  }
  if (!authenticated || !state?.user) {
    if (copy) copy.textContent = "Sign in through Member Login as the chama chairperson to request a pending reference. You can also contact our team for next steps. No payment request is sent and plan selection does not activate access.";
    return;
  }
  if (state.user.role !== "chairperson") {
    if (copy) copy.textContent = "Only the chama chairperson can request a pending reference. Please contact your chairperson or our team. No payment request was sent and access was not activated.";
    return;
  }
  const tier = ({ Basic: "basic", "Growth Chama": "growth" })[button.dataset.pricingTier];
  if (!tier || !["monthly", "annual"].includes(billing)) {
    if (copy) copy.textContent = "This plan cannot be selected here. Contact our team for the next steps.";
    return;
  }

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  if (copy) copy.textContent = "Saving the plan selection and requesting a pending reference. This does not send a payment request.";
  try {
    const result = await api("/api/subscription/selection", {
      method: "POST",
      body: { tier, billing },
      write: button,
      validateResponse: data => typeof data?.plan?.reference === "string"
        && /^JC[A-F0-9]{12}$/.test(data.plan.reference)
        && data.plan.paymentEnabled === false
        && data.plan.paymentRequestStarted === false,
    });
    if (referenceOutput) referenceOutput.textContent = result.plan.reference;
    if (referencePanel) referencePanel.hidden = false;
    if (copyButton) copyButton.disabled = false;
    if (copy) copy.textContent = result.message || "Pending reference created. Contact our team for payment instructions. No payment request was sent; access activates only after a matching M-PESA C2B confirmation.";
    if (copyStatus && result.plan.expiresAt) {
      const expires = new Date(result.plan.expiresAt);
      const formatted = Number.isNaN(expires.getTime()) ? "" : new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(expires);
      copyStatus.textContent = formatted ? `Reference expires ${formatted} (Nairobi time).` : "Copy this reference when contacting our team.";
    } else if (copyStatus) copyStatus.textContent = "Copy this reference when contacting our team.";
  } catch (error) {
    if (error.status === 401) dialog.close();
    if (copy) {
      if (error.status === 503) copy.textContent = "Verified M-PESA references are not configured for this chama yet. No payment request was sent and no access was activated. Please contact our team for next steps.";
      else if (error.uncertain) copy.textContent = "We could not confirm the reference was saved. No payment request is sent by this flow. Please retry or contact our team if the issue continues.";
      else copy.textContent = error.message || "The plan could not be selected. No payment request was sent.";
    }
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

document.querySelectorAll("[data-pricing-tier]").forEach(button => {
  button.addEventListener("click", () => openPricingModal(button));
});
$("#pricing-modal-cancel")?.addEventListener("click", () => $("#pricing-modal")?.close());
$("#pricing-contact")?.addEventListener("click", () => $("#pricing-modal")?.close());
$("#pricing-copy-reference")?.addEventListener("click", async () => {
  const reference = $("#pricing-modal-reference")?.textContent?.trim();
  const status = $("#pricing-reference-copy-status");
  if (!reference || !status) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
    await navigator.clipboard.writeText(reference);
    status.textContent = "Reference copied.";
  } catch {
    status.textContent = "Copy is unavailable here. Select and copy the reference above.";
  }
});
const landingMenuToggle = $("#landing-menu-toggle");
const landingMobileNav = $("#landing-mobile-nav");
landingMenuToggle?.addEventListener("click", () => {
  const open = landingMenuToggle.getAttribute("aria-expanded") !== "true";
  landingMenuToggle.setAttribute("aria-expanded", String(open));
  landingMenuToggle.setAttribute("aria-label", t(open ? "landingNavClose" : "landingNavOpen"));
  landingMenuToggle.textContent = t(open ? "landingNavClose" : "landingNavMenu");
  landingMobileNav.hidden = !open;
});
landingMobileNav?.addEventListener("click", () => {
  landingMenuToggle?.setAttribute("aria-expanded", "false");
  landingMenuToggle?.setAttribute("aria-label", t("landingNavOpen"));
  if (landingMenuToggle) landingMenuToggle.textContent = t("landingNavMenu");
  landingMobileNav.hidden = true;
});

async function api(path, { method = "GET", body, write = false, validateResponse, silentForbidden = false } = {}) {
  if (write) {
    try {
      return await writeRequester.submit({ owner: write === true ? {} : write, path, method, body, validate: validateResponse });
    } catch (error) {
      if (error.status === 401 && path !== "/api/login") showLogin();
      if (error.status === 402) notice(error.message, true);
      if (error.status === 403 && !error.data?.mustChangePin) notice("You do not have permission to perform that action.", true);
      throw error;
    }
  }
  const headers = { "Content-Type": "application/json", "X-Requested-With": "chama" };
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") showLogin();
  if (response.status === 402) notice(data.message || "Subscription renewal is required to create records.", true);
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
      const setupForm = $("#setup-form");
      const loginForm = $("#login-form");
      const activationForm = $("#activation-form");
      if (setupForm) setupForm.hidden = !setup.requiresSetup;
      if (loginForm) loginForm.hidden = !!setup.requiresSetup;
      if (activationForm) activationForm.hidden = true;
    }
  } catch {
    setConnectionStatus("offline");
  }
}
function setLoginNotice(node, message) {
  if (!node) return;
  node.textContent = window.jiraniI18n?.translateText(message) || message;
  node.hidden = !message;
}
function notice(message, error = false) { const node = $("#notice"); node.textContent = window.jiraniI18n?.translateText(message) || message; node.classList.toggle("error", error); node.setAttribute("aria-live", error ? "assertive" : "polite"); node.setAttribute("role", error ? "alert" : "status"); }
function setButton(form, disabled) { form.querySelector("button[type=submit]").disabled = disabled; }
function roleName(role) { return window.jiraniI18n?.roleName(role) || (role ? role[0].toUpperCase() + role.slice(1) : ""); }
function loanStatusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (["pending", "requested", "waiting for decisions"].includes(normalized)) return "Pending";
  return ({ approved: "Approved", rejected: "Rejected", repaid: "Repaid", closed: "Closed" })[normalized] || status;
}
function chairpersonChecklistItems(members, invitations, overviewReviewed) {
  const hasRole = role => members.some(member => member.role === role && member.status === "active") ||
    invitations.some(invitation => invitation.requestedRole === role && !invitation.usedAt && !invitation.revocation && Date.parse(invitation.expiresAt) > Date.now());
  const hasMember = members.some(member => member.role === "member" && member.status === "active") ||
    invitations.some(invitation => invitation.requestedRole === "member" && !invitation.usedAt && !invitation.revocation && Date.parse(invitation.expiresAt) > Date.now());
  return [
    { key: "secretary", label: "setupInviteSecretary", complete: hasRole("secretary"), panel: "invite-panel" },
    { key: "treasurer", label: "setupInviteTreasurer", complete: hasRole("treasurer"), panel: "invite-panel" },
    { key: "members", label: "setupAddMembers", complete: hasMember, panel: "invite-panel" },
    { key: "overview", label: "setupReviewOverview", complete: overviewReviewed, panel: "dashboard" }
  ];
}
function setupChecklistStorageKey(userId) { return `jirani-setup-checklist:${userId}`; }
function readSetupChecklistState(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(setupChecklistStorageKey(userId)) || "{}");
    return { dismissed: saved.dismissed === true, overviewReviewed: saved.overviewReviewed === true, skipped: saved.skipped && typeof saved.skipped === "object" ? saved.skipped : {} };
  } catch { return { dismissed: false, overviewReviewed: false, skipped: {} }; }
}
function saveSetupChecklistState(userId, checklistState) {
  try { localStorage.setItem(setupChecklistStorageKey(userId), JSON.stringify(checklistState)); } catch { /* Checklist remains usable when browser storage is unavailable. */ }
}
function renderChairpersonSetupChecklist(user, members, invitations) {
  const openButton = $("#setup-checklist-open");
  const section = $("#chairperson-setup-checklist");
  if (!openButton || !section) return;
  const isChairperson = user.role === "chairperson";
  openButton.hidden = !isChairperson;
  section.hidden = !isChairperson;
  if (!isChairperson) return;
  const saved = readSetupChecklistState(user.id);
  section.hidden = saved.dismissed;
  openButton.textContent = t("setupChecklistShow");
  openButton.hidden = !saved.dismissed;
  const items = chairpersonChecklistItems(members, invitations, saved.overviewReviewed);
  $("#setup-checklist-items").innerHTML = items.map(item => {
    const skipped = saved.skipped[item.key] === true;
    const stateLabel = item.complete ? t("setupChecklistComplete") : skipped ? t("setupChecklistSkipped") : t("setupChecklistNeeded");
    const action = item.complete ? "" : `<div class="setup-checklist-item-actions"><a class="mini-btn" href="#${esc(item.panel)}" data-setup-panel="${esc(item.panel)}"${item.key === "overview" ? ' data-setup-review="true"' : ""}>${t(item.key === "overview" ? "setupChecklistReview" : "setupChecklistOpen")}</a>${skipped ? `<button class="mini-btn" type="button" data-setup-restore="${esc(item.key)}">${t("setupChecklistUndoSkip")}</button>` : `<button class="mini-btn" type="button" data-setup-skip="${esc(item.key)}">${t("setupChecklistSkip")}</button>`}</div>`;
    return `<li class="setup-checklist-item"><span class="setup-checklist-item-copy"><strong>${t(item.label)}</strong><span class="setup-checklist-item-state">${stateLabel}</span></span>${action}</li>`;
  }).join("");
}
function fmtDate(value) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(new Date(value)); }
function fmtTime(value) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(new Date(value)); }
function meetingDateToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Nairobi" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function render() {
  const { user, permissions, summary, members, invitations = [], transactions, loans, approvalQueue = [], pendingLoans, leadershipChanges, leadershipElections = [], notifications = [], subscription } = state;
  if (!authenticated) {
    authenticated = true;
    lastActivity = Date.now();
    lastActivityPing = 0;
    startActivityMonitor();
  }
  document.body.classList.remove("landing-mode");
  $(".topbar")?.classList.add("is-authenticated");
  setNavigationOpen(false);
  $("#identity").textContent = `${user.name} (${roleName(user.role)})`;
  $("#menu-identity").textContent = `${user.name} (${roleName(user.role)})`;
  $("#logout").hidden = false;
  $("#role-label").textContent = `${roleName(user.role)} ${t("dashboard")}`;
  $("#greeting").textContent = `${t("welcome")}, ${user.name}`;
  const subscriptionNotice = $("#subscription-notice");
  if (subscriptionNotice) {
    const renewalMessage = subscription?.renewalMessage || "";
    const subscriptionNoticeCopy = $("#subscription-notice-copy");
    const subscriptionRenewalLink = $("#subscription-renewal-link");
    if (subscriptionNoticeCopy) subscriptionNoticeCopy.textContent = renewalMessage;
    if (subscriptionRenewalLink) subscriptionRenewalLink.hidden = !renewalMessage;
    subscriptionNotice.hidden = !renewalMessage;
  }
  updateLoanRequestAccess(subscription);
  renderChairpersonSetupChecklist(user, members, invitations);
  const balance = $("#balance");
  const contributions = $("#contributions");
  const outstanding = $("#outstanding");
  if (balance) balance.textContent = money(summary.balance);
  if (contributions) contributions.textContent = money(summary.contributions);
  if (outstanding) outstanding.textContent = money(summary.outstanding);
  [$("#balance"), $("#contributions"), $("#outstanding")].forEach(node => node?.classList.remove("skeleton"));
  $("#transaction-copy").textContent = window.jiraniI18n.translateText(user.role === "member" ? "Only your confirmed entries are shown." : "All confirmed group entries.");
  $("#members-panel").hidden = user.role === "member";
  $("#payment-panel").hidden = !permissions.recordPayments;
  $("#simulated-payment-section").hidden = !permissions.simulatePayments;
  $("#invite-panel").hidden = !permissions.manageMembers;
  $("#leadership-panel").hidden = !permissions.manageLeadership;
  $("#audit-panel").hidden = !permissions.viewAuditLog;
  $("#penalty-panel").hidden = !permissions.assessPenalties;
  $("#dividend-panel").hidden = !permissions.manageDividends;
  $("#leadership-form").hidden = !permissions.bootstrapLeadership;
  $("#leadership-elections-panel").hidden = false;
  $("#election-proposal-form").hidden = !permissions.proposeLeadershipElection;
  $("#election-date").min = meetingDateToday();
  $("#election-candidates").innerHTML = members
    .filter(member => member.status === "active" && member.role === "member")
    .map(member => `<option value="${esc(member.id)}">${esc(member.name)}</option>`).join("");
  $("#pin-change").hidden = !user.mustChangePin;
  if (user.mustChangePin) notice("Change your temporary PIN before making any records.", true);
  renderMessages(state.messages || []);

  $("#transactions").innerHTML = transactions.map(item => `<tr><td data-label="Date">${esc(fmtDate(item.at))}</td><td data-label="Member">${esc(item.memberName)}<span class="schedule-sub">${esc(item.payer || item.recordedByName || "")}</span></td><td data-label="Amount">${money(item.amount)}</td><td data-label="Method">${esc(item.method)}${item.ref ? `<span class="schedule-sub">${esc(item.ref)}</span>` : ""}</td><td data-label="Type">${esc(item.paymentType)}</td></tr>`).join("") || '<tr><td colspan="5" class="empty-state">No transactions available.</td></tr>';
  const memberRow = member => {
    const status = memberStatusPresentation(member.status);
    const activeRoleChange = (leadershipChanges || []).slice().reverse().find(change =>
      change.status === "confirmed" && change.incomingUserId === member.id && change.role === member.role &&
      !(change.audit || []).some(item => item.action === "revoked"));
    const revokeButton = permissions.revokeLeadershipRoles && status.normalized === "active" && member.role !== "member" && activeRoleChange
      ? `<button class="mini-btn danger" type="button" data-revoke-role="${esc(activeRoleChange.id)}">Revoke this role</button>`
      : "";
    return `<tr><td data-label="${esc(t("memberNameColumn"))}">${esc(member.name)}</td><td data-label="${esc(t("memberPhoneColumn"))}">${esc(member.phone)}</td><td data-label="${esc(t("memberRoleColumn"))}">${esc(roleName(member.role))}</td><td data-label="${esc(t("memberStatusColumn"))}"><span class="status-pill ${status.statusClass}">${esc(status.label)}</span></td><td data-label="${esc(t("memberActionsColumn"))}">${revokeButton}</td></tr>`;
  };
  const activeMemberRows = members.filter(member => String(member.status || "").toLowerCase() === "active").map(memberRow);
  const inactiveMemberRows = members.filter(member => String(member.status || "").toLowerCase() !== "active").map(memberRow);
  const invitationRows = permissions.manageMembers ? invitations.map(invitation => {
    const revocation = invitation.revocation;
    const expired = Date.parse(invitation.expiresAt) <= Date.now();
    const age = Date.now() - Date.parse(invitation.invitedAt);
    const statusKey = revocation ? "revokedStatus" : invitation.usedAt ? "activatedStatus" : expired ? "expiredStatus" : "pendingActivationStatus";
    const statusClass = revocation || expired ? "inactive" : invitation.usedAt ? "active" : "pending";
    const history = revocation
      ? `<span class="schedule-sub">This invitation was revoked by ${esc(roleName(revocation.by?.role))} on ${esc(fmtDate(revocation.at))} at ${esc(fmtTime(revocation.at))} (reason: ${esc(revocation.reason)})</span>`
      : invitation.usedAt ? `<span class="schedule-sub">Activated on ${esc(fmtDate(invitation.usedAt))} at ${esc(fmtTime(invitation.usedAt))}</span>` : "";
    const undoButton = permissions.revokeInvitations && !revocation && !invitation.usedAt && age >= 0 && age <= 24 * 60 * 60 * 1000
      ? `<button class="mini-btn danger" type="button" data-revoke-invitation="${esc(invitation.id)}">Undo</button>`
      : "";
    return `<tr><td data-label="${esc(t("memberNameColumn"))}">${esc(invitation.name)}${history}</td><td data-label="${esc(t("memberPhoneColumn"))}">${esc(invitation.phone)}</td><td data-label="${esc(t("memberRoleColumn"))}">${esc(roleName(invitation.requestedRole))}</td><td data-label="${esc(t("memberStatusColumn"))}"><span class="status-pill ${statusClass}">${esc(t(statusKey))}</span></td><td data-label="${esc(t("memberActionsColumn"))}">${undoButton}</td></tr>`;
  }) : [];
  $("#members").innerHTML = activeMemberRows.join("") || `<tr><td colspan="5" class="empty-state" data-i18n="noActiveMembers">${esc(t("noActiveMembers"))}</td></tr>`;
  $("#member-invitation-history").innerHTML = [...inactiveMemberRows, ...invitationRows].join("") || `<tr><td colspan="5" class="empty-state" data-i18n="noMemberHistory">${esc(t("noMemberHistory"))}</td></tr>`;
  $("#loan-copy").textContent = window.jiraniI18n.translateText(user.role === "member" ? "Your requests and eligible independent approvals." : "Three roles review each request; the Secretary fills a Chairperson or Treasurer borrower’s approval seat.");
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
    return `<article class="loan-card"><div class="loan-card-heading"><div><h3>${esc(loan.memberName)} · ${money(loan.amount)}</h3><span class="schedule-sub">${loan.months} month${loan.months === 1 ? "" : "s"} · Requested ${esc(fmtDate(loan.createdAt))}</span></div><span class="status-pill ${statusClass}">${esc(loanStatusLabel(loan.status))}</span></div><p class="loan-progress">${esc(loan.progressMessage)}</p><ol class="loan-approval-trail" aria-label="Approval trail for ${esc(loan.memberName)}">${steps}</ol>${action}</article>`;
  }).join("") || '<div class="empty-state">No loans available.</div>';
  populateSelects(members, loans, guarantorMembers);
  if (permissions.manageLeadership) renderLeadership(leadershipChanges || [], members, user);
  renderElections(leadershipElections, user, notifications);
  renderAttendance(user);
  renderSimulatedPaymentInbox(state.simulatedPayments || []);
  $("#app").hidden = false; $("#login").hidden = true;
  updateNavigationVisibility();
  showAppPage(activeAppPage);
  window.jiraniI18n?.apply();
}

function renderMessages(messages) {
  const container = $("#chat-messages");
  if (!container) return;
  container.innerHTML = messages.length
    ? messages.filter(message => !message.recipientId || message.recipientId === state.user.id).slice(-100).map(message => `<article class="chat-message"><strong>${esc(message.authorName)}</strong><p>${esc(message.text)}</p><time>${esc(fmtTime(message.at))}</time></article>`).join("")
    : `<p class="empty-state">${esc(t("No messages yet."))}</p>`;
  container.scrollTop = container.scrollHeight;
}
function updateNavigationVisibility() {
  for (const link of menuBar.querySelectorAll("a[data-panel]")) {
    const target = link.dataset.panel === "dashboard" ? null : document.getElementById(link.dataset.panel);
    link.hidden = !!target?.hidden;
  }
  for (const dropdown of menuBar.querySelectorAll(".nav-dropdown")) {
    const links = [...dropdown.querySelectorAll("a[data-panel]")];
    dropdown.hidden = links.length > 0 && links.every(link => link.hidden);
  }
}
function renderSimulatedPaymentInbox(payments = []) {
  const body = $("#simulated-payment-rows");
  if (!body) return;
  body.innerHTML = payments.map(payment => {
    const payload = esc(JSON.stringify(payment.rawPayload || {}, null, 2));
    const status = window.jiraniI18n?.translateText(payment.status) || payment.status;
    const received = `${fmtDate(payment.receivedAt)} ${fmtTime(payment.receivedAt)}`;
    return `<tr><td data-label="${esc(t("simulatedTransactionId"))}">${esc(payment.transactionId)}</td><td data-label="${esc(t("fakePhoneIdentifier"))}">${esc(payment.phoneNumber)}</td><td data-label="${esc(t("amountKes"))}">${money(payment.amount)}</td><td data-label="${esc(t("simulatedReference"))}">${esc(payment.reference)}</td><td data-label="${esc(t("receivedAt"))}">${esc(received)}</td><td data-label="${esc(t("status"))}"><span class="status-pill pending">${esc(status)}</span></td><td data-label="${esc(t("rawTestPayload"))}"><details><summary>${esc(t("rawTestPayload"))}</summary><pre class="simulated-payment-payload">${payload}</pre></details></td></tr>`;
  }).join("") || `<tr><td colspan="7" class="empty-state" data-i18n="noSimulatedPayments">${esc(t("noSimulatedPayments"))}</td></tr>`;
}
function updateDashboardTabs() {
  for (const tab of document.querySelectorAll("[data-dashboard-tab]")) {
    const selected = tab.dataset.dashboardTab === selectedDashboardView;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}
function showAppPage(panelId, { scrollTarget } = {}) {
  const overview = panelId === "overview" || panelId === "dashboard";
  if (panelId === "dashboard") selectedDashboardView = "you";
  const financePanel = selectedDashboardView === "group" ? "dashboard" : "you-dashboard";
  const activeIds = overview ? new Set([financePanel]) : new Set([panelId]);
  activeAppPage = overview ? "overview" : panelId;
  const sectionIds = ["you-dashboard", "dashboard", "attendance-panel", "loans-panel"];
  for (const sectionId of sectionIds) {
    const section = document.getElementById(sectionId);
    if (!section) continue;
    if (sectionId === "you-dashboard" || sectionId === "dashboard") section.hidden = false;
    section.dataset.pageInactive = String(!activeIds.has(sectionId));
  }

  const mainGrid = $(".main-grid");
  let showGrid = false;
  for (const section of mainGrid.querySelectorAll(".panel[id]")) {
    const active = activeIds.has(section.id) && !section.hidden;
    section.dataset.pageInactive = String(!active);
    showGrid ||= active;
  }
  mainGrid.dataset.pageInactive = String(!showGrid);
  mainGrid.classList.toggle("is-single-view", !overview);

  for (const link of menuBar.querySelectorAll("a[data-panel]")) {
    const selected = link.dataset.panel === panelId || (overview && link.dataset.panel === "dashboard");
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  for (const dropdown of menuBar.querySelectorAll(".nav-dropdown")) {
    dropdown.classList.toggle("active", !!dropdown.querySelector("a[aria-current='page']"));
  }
  updateDashboardTabs();
  setNavigationOpen(false);
  if (scrollTarget) requestAnimationFrame(() => document.getElementById(scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  else window.scrollTo({ top: 0, behavior: "smooth" });
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
  const translate = value => window.jiraniI18n?.translateText(value) || value;
  $("#attendance-count").textContent = `${present} ${translate("present")} · ${choices.length - present} ${translate("absent")} · ${choices.length} ${translate("members")}`;
  choices.forEach(input => { input.closest(".attendance-row").querySelector("[data-attendance-status]").textContent = input.checked ? "Present" : "Absent"; });
}
function populateSelects(members, loans, guarantors = []) {
  $("#payment-member").innerHTML = members.filter(member => member.status === "active").map(member => `<option value="${esc(member.id)}">${esc(member.name)}</option>`).join("");
  $("#incoming-user").innerHTML = members.filter(member => member.status === "active").map(member => `<option value="${esc(member.id)}">${esc(member.name)} (${esc(roleName(member.role))})</option>`).join("");
  const selected = $("#payment-member").value;
  $("#payment-loan").innerHTML = `<option value="">Select a loan</option>${loans.filter(loan => loan.status === "approved" && loan.memberId === selected).map(loan => `<option value="${esc(loan.id)}">${esc(loan.memberName)} — ${money(loan.outstanding)}</option>`).join("")}`;
  const options = `<option value="">Select a guarantor</option>${guarantors.map(member => `<option value="${esc(member.id)}">${esc(member.name)}</option>`).join("")}`;
  $("#loan-guarantor-1").innerHTML = options;
  $("#loan-guarantor-2").innerHTML = options;
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
function renderElections(elections, user, notifications) {
  $("#election-notifications").innerHTML = notifications.slice().reverse().map(item =>
    `<article class="election-notice"><strong>${esc(fmtDate(item.at))} · Election update</strong><p>${esc(item.text)}</p></article>`
  ).join("") || '<p class="empty-state">No election notices yet.</p>';
  $("#leadership-elections").innerHTML = elections.slice().reverse().map(election => {
    const candidates = election.candidates.map(candidate => `<li>${esc(candidate.name)}${candidate.active ? "" : " · no longer eligible"}</li>`).join("");
    const labels = {
      proposed: "Awaiting Chairperson acceptance", scheduled: "Scheduled", voting: "Voting open", closed: "Closed · awaiting verification",
      verified: "Verified · role change scheduled", "verified-tie": "Tie verified · runoff open",
      "verified-no-winner": "No winner", "runoff-needed": "Tie · runoff date needed", completed: "Role updated", cancelled: "Election cancelled", declined: "Proposal declined",
    };
    const countSummary = election.result
      ? `<div class="election-counts"><strong>${election.result.votesCast} vote${election.result.votesCast === 1 ? "" : "s"}</strong><ul>${election.candidates.map(candidate => `<li>${esc(candidate.name)}: ${election.result.counts[candidate.id] || 0}</li>`).join("")}</ul></div>`
      : election.status === "scheduled" ? `<p>${esc(t("Ballots become available on the election date."))}</p>` : `<p>${election.votesCast} vote${election.votesCast === 1 ? "" : "s"} recorded · ${election.eligibleVoters} eligible members</p>`;
    const voteForm = election.canVote
      ? `<form class="election-ballot" data-election-ballot="${esc(election.id)}"><label class="field" for="election-choice-${esc(election.id)}">Choose one candidate<select id="election-choice-${esc(election.id)}" name="candidateId" required><option value="">Select a candidate</option>${election.candidates.filter(candidate => candidate.active).map(candidate => `<option value="${esc(candidate.id)}">${esc(candidate.name)}</option>`).join("")}</select></label><button class="button-primary" type="submit">Cast secret vote</button></form>`
      : election.hasVoted ? '<p class="election-action-note">Your secret vote is recorded.</p>' : "";
    const actions = [
      !election.scheduledDate && election.status === "proposed" && user.role === "chairperson" ? `<button class="mini-btn" data-election-action="accept" data-election-id="${esc(election.id)}">Accept candidates and open voting</button>` : "",
      !election.scheduledDate && election.status === "proposed" && user.role === "chairperson" ? `<button class="mini-btn danger" data-election-action="decline" data-election-id="${esc(election.id)}">Decline proposal</button>` : "",
      !election.scheduledDate && election.status === "voting" && user.role === "chairperson" ? `<button class="mini-btn danger" data-election-action="close" data-election-id="${esc(election.id)}">Close voting</button>` : "",
      !election.scheduledDate && election.status === "closed" && user.role === "chairperson" ? `<button class="mini-btn" data-election-action="verify" data-election-id="${esc(election.id)}">Verify result</button>` : "",
    ].filter(Boolean).join("");
    const winner = election.winnerName ? `<p class="election-result">Winner: <strong>${esc(election.winnerName)}</strong>. ${election.activationAt ? `Portal access changes ${esc(fmtDate(election.activationAt))} at ${esc(fmtTime(election.activationAt))}.` : ""}</p>` : "";
    const runoff = election.runoff ? '<p class="election-action-note">Runoff ballot for the tied candidates.</p>' : "";
    const schedule = election.scheduledDate ? `<p class="election-action-note">${esc(t(election.status === "scheduled" ? "Voting opens" : "Election date"))} ${esc(fmtDate(election.scheduledDate))}. ${esc(t("Voting is available from midnight to 11:59 p.m. Nairobi time on that date."))}</p>` : "";
    const runoffForm = election.canScheduleRunoff ? `<form class="election-runoff" data-election-runoff="${esc(election.id)}"><label class="field" for="runoff-date-${esc(election.id)}">${esc(t("Runoff date"))}<input id="runoff-date-${esc(election.id)}" name="scheduledDate" type="date" min="${meetingDateToday()}" required></label><button class="mini-btn" type="submit">${esc(t("Schedule runoff"))}</button></form>` : "";
    return `<article class="election-card"><div class="election-card-heading"><div><h4>${esc(roleName(election.role))} election${election.runoff ? " · runoff" : ""}</h4><span class="schedule-sub">${election.scheduledDate ? `Scheduled ${esc(fmtDate(election.proposedAt))}` : election.acceptedAt ? `Voting opened ${esc(fmtDate(election.acceptedAt))} at ${esc(fmtTime(election.acceptedAt))}` : `Proposed ${esc(fmtDate(election.proposedAt))} by the Secretary`}</span></div><span class="status-pill ${election.status === "completed" ? "active" : ["verified-no-winner", "cancelled", "declined"].includes(election.status) ? "inactive" : "pending"}">${esc(t(labels[election.status] || election.status))}</span></div><ul class="election-candidates">${candidates}</ul>${schedule}${countSummary}${winner}${runoff}${voteForm}${runoffForm}${actions}</article>`;
  }).join("") || '<p class="empty-state">No leadership elections are active.</p>';
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
    auditEntries = Array.isArray(data) ? data : [];
    renderAuditLogPage();
  } catch (error) {
    auditEntries = [];
    renderAuditLogPage();
    auditNotice.textContent = error.status === 403 ? "You do not have permission to view the audit log." : "The audit log could not load. Try again.";
    auditNotice.hidden = false;
  }
}
function renderAuditLogPage() {
  const query = $("#audit-search")?.value.trim().toLocaleLowerCase() || "";
  const matches = auditEntries.filter(entry => !query || [
    entry.by?.name,
    entry.by?.role,
    entry.type,
    auditDescription(entry),
    entry.at,
  ].some(value => String(value ?? "").toLocaleLowerCase().includes(query)));
  const pageCount = Math.max(1, Math.ceil(matches.length / auditPageSize));
  auditPage = Math.min(auditPage, pageCount - 1);
  const pageEntries = matches.slice(auditPage * auditPageSize, (auditPage + 1) * auditPageSize);
  $("#audit-list").innerHTML = pageEntries.map(entry => `<tr><td>${esc(fmtDate(entry.at))} ${esc(fmtTime(entry.at))}</td><td>${esc(entry.by?.name || "Unknown")}${entry.by?.role ? ` (${esc(roleName(entry.by.role))})` : ""}</td><td>${esc(auditDescription(entry))}</td></tr>`).join("") || '<tr><td colspan="3" class="empty-state">No audit entries match this filter.</td></tr>';
  const label = $("#audit-page-info");
  if (label) label.textContent = `${matches.length ? auditPage + 1 : 0} / ${matches.length ? pageCount : 0} · ${matches.length} entries`;
  $("#audit-previous").disabled = auditPage === 0;
  $("#audit-next").disabled = auditPage >= pageCount - 1;
}
function financeDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : esc(fmtDate(date));
}
function financeRows(selector, rows, columns, emptyMessage) {
  const body = $(selector);
  if (!body) return;
  body.innerHTML = rows.length
    ? rows.map(row => `<tr>${columns.map(([label], index) => `<td data-label="${esc(label)}">${row[index] ?? "—"}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length}" class="empty-state">${esc(emptyMessage)}</td></tr>`;
}
function renderFinancialTrend(selector, months, series) {
  const container = $(selector);
  if (!container) return;
  const width = 720, height = 270, left = 64, right = 20, top = 18, bottom = 50;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maxValue = Math.max(0, ...series.flatMap(item => item.values.map(Number)));
  const scaleMax = maxValue > 0 ? Math.ceil(maxValue / 1000) * 1000 : 1000;
  const x = index => left + (months.length < 2 ? plotWidth / 2 : index * plotWidth / (months.length - 1));
  const y = value => top + plotHeight - Number(value) / scaleMax * plotHeight;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = scaleMax * index / 4, py = y(value);
    return `<line x1="${left}" y1="${py}" x2="${width - right}" y2="${py}" class="trend-grid"/><text x="${left - 8}" y="${py + 4}" text-anchor="end" class="trend-axis-label">${esc(Math.round(value).toLocaleString("en-KE"))}</text>`;
  }).join("");
  const paths = series.map(item => {
    const points = item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
    const dots = item.values.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="${item.color}"><title>${esc(item.label)} · ${esc(months[index].label)}: ${esc(money(value))}</title></circle>`).join("");
    return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
  }).join("");
  const monthLabels = months.map((month, index) => `<text x="${x(index)}" y="${height - 20}" text-anchor="middle" class="trend-axis-label">${esc(month.label)}</text>`).join("");
  const legend = series.map(item => {
    const colorClass = item.color === "#bd7b35" ? "is-ochre" : "is-green";
    return `<span class="trend-legend-item"><i class="trend-legend-dot ${colorClass}"></i>${esc(item.label)}</span>`;
  }).join("");
  const table = `<table class="trend-data"><thead><tr><th>Month</th>${series.map(item => `<th>${esc(item.label)}</th>`).join("")}</tr></thead><tbody>${months.map((month, index) => `<tr><th scope="row">${esc(month.label)}</th>${series.map(item => `<td>${esc(money(item.values[index]))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  container.innerHTML = `<div class="financial-trend-legend">${legend}</div><svg class="financial-trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Monthly financial trends for the last six months">${grid}${paths}${monthLabels}</svg><div class="trend-data-wrap" role="region" aria-label="Monthly financial trend data. Scroll horizontally to view all series." tabindex="0">${table}</div>`;
}
function financialMonths(count = 6) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find(item => item.type === "year").value), month = Number(parts.find(item => item.type === "month").value);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key, label: date.toLocaleDateString("en-KE", { month: "short", year: "2-digit", timeZone: "UTC" }) };
  });
}
function monthlyTransactionSeries(transactions, months, label, paymentType, color) {
  const values = Object.fromEntries(months.map(month => [month.key, 0]));
  for (const item of transactions) {
    const date = item.date || item.at;
    const key = typeof date === "string" ? date.slice(0, 7) : "";
    if (item.paymentType === paymentType && item.status !== "pending-member" && Object.hasOwn(values, key)) values[key] += Number(item.amount) || 0;
  }
  return { label, color, values: months.map(month => values[month.key]) };
}
async function loadFinancialViews() {
  const personalNotice = $("#you-data-notice");
  const groupNotice = $("#group-data-notice");
  const results = await Promise.allSettled([api("/api/profile/summary"), api("/api/summary")]);
  const [personalResult, groupResult] = results;
  if (personalResult.status === "fulfilled") {
    const data = personalResult.value.data || {};
    const contributions = Array.isArray(data.contributions) ? data.contributions : [];
    const fines = Array.isArray(data.fines) ? data.fines : [];
    const loans = [...(data.loans?.ongoing || []), ...(data.loans?.fullyPaid || [])];
    const unpaidFines = fines.filter(item => item.status === "outstanding");
    const openLoans = loans.filter(item => item.status === "approved");
    const contributionTotal = contributions.filter(item => item.status !== "pending-member").reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const loanTotal = openLoans.reduce((sum, item) => sum + (Number(item.outstanding) || 0), 0);
    const finesTotal = unpaidFines.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    financeRows("#you-contributions", contributions.filter(item => item.status !== "pending-member").map(item => [financeDate(item.at), money(item.amount), esc(item.note || item.paymentType || "Monthly contribution")]), [[t("date")], [t("amountKes")], [t("note")]], "No contributions recorded.");
    financeRows("#you-fines", fines.map(item => [financeDate(item.at || item.date), esc(item.reason || "Fine"), `${money(item.amount)}${item.status === "outstanding" ? " · Unpaid" : " · Paid"}`]), [[t("date")], [t("reason")], [t("amountDue")]], "No fines recorded.");
    financeRows("#you-loans", loans.map(item => [financeDate(item.createdAt), esc(item.status), money(item.status === "approved" ? item.outstanding : 0)]), [[t("date")], [t("status")], [t("balanceDue")]], "No loans recorded.");
    const arrears = [];
    if (loanTotal > 0) arrears.push(["Outstanding loans", money(loanTotal)]);
    if (finesTotal > 0) arrears.push(["Unpaid fines", money(finesTotal)]);
    financeRows("#you-arrears", arrears, [[t("dueItem")], [t("amountKes")]], "No arrears recorded.");
    const months = financialMonths();
    const personalTransactions = state.transactions || [];
    renderFinancialTrend("#you-chart", months, [
      monthlyTransactionSeries(personalTransactions, months, "Contributions", "Monthly Contribution", "#347c62"),
      monthlyTransactionSeries(personalTransactions, months, "Loan repayments", "Loan Repayment", "#bd7b35"),
    ]);
    if (personalNotice) personalNotice.hidden = true;
  } else if (personalNotice) {
    personalNotice.textContent = "Your financial details could not load. Try refreshing the page.";
    personalNotice.hidden = false;
  }
  if (groupResult.status === "fulfilled") {
    const summary = groupResult.value.data || {};
    $("#group-contributions-total").textContent = money(summary.contributions);
    $("#group-loans-total").textContent = money(summary.outstanding);
    $("#group-balance-total").textContent = money(summary.balance);
    $("#group-members-total").textContent = Number(summary.memberCount || 0).toLocaleString("en-KE");
    const months = financialMonths();
    const trends = summary.financialTrends;
    const trendSeries = (key, label, color) => {
      const positions = new Map((trends?.months || []).map((month, index) => [month, index]));
      return {
        label, color,
        values: months.map(month => {
          const index = positions.get(month.key);
          return index === undefined ? 0 : Number(trends?.[key]?.[index]) || 0;
        }),
      };
    };
    renderFinancialTrend("#group-chart", months, [
      trendSeries("contributions", "Contributions", "#347c62"),
      trendSeries("loanRepayments", "Loan repayments", "#bd7b35"),
    ]);
    if (groupNotice) groupNotice.hidden = true;
  } else if (groupNotice) {
    groupNotice.textContent = "Group financial totals could not load. Try refreshing the page.";
    groupNotice.hidden = false;
  }
}
async function refresh() {
  try {
    state = await api("/api/dashboard");
    state.messages = (await api("/api/messages")).data || [];
    state.simulatedPayments = state.permissions.simulatePayments ? (await api("/api/payments/inbox")).data || [] : [];
    attendanceData = await api("/api/attendance");
    guarantorMembers = (await api("/api/loans/guarantors")).data || [];
    if (!selectedAttendanceDate) selectedAttendanceDate = meetingDateToday();
    $("#retry").hidden = true;
    render();
    await loadFinancialViews();
    if (state.permissions.viewAuditLog) await loadAuditLog();
    connectEventStream();
  }
  catch (error) {
    if (error.data?.mustChangePin) {
      authenticated = false; document.body.classList.remove("landing-mode"); $("#app").hidden = true; $("#login").hidden = true; $("#pin-change").hidden = false; $("#current-pin").focus();
    } else if (!/session has expired/i.test(error.message)) { notice(error.message || t("retryError"), true); $("#retry").hidden = false; }
  }
}
function setConnectionStatus(status) {
  const labels = { ready: t("checkingServer"), live: t("live"), reconnecting: t("reconnecting"), polling: t("polling"), offline: t("offline") };
  const node = $("#connection-status"); if (!node) return;
  const label = $("#connection-status-label");
  if (label) label.textContent = labels[status] || status;
  node.setAttribute("aria-label", labels[status] || status);
  node.dataset.status = status;
}
function startPollingFallback() {
  if (pollingTimer) return;
  setConnectionStatus(navigator.onLine ? "polling" : "offline");
  pollingTimer = setInterval(() => { if (navigator.onLine) refresh(); else setConnectionStatus("offline"); }, 30000);
  if (!chatPollingTimer) chatPollingTimer = setInterval(async () => {
    if (!navigator.onLine || !authenticated || !state) return;
    try { state.messages = (await api("/api/messages")).data || []; renderMessages(state.messages); } catch {}
  }, 5000);
}
function stopPollingFallback() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
  if (chatPollingTimer) { clearInterval(chatPollingTimer); chatPollingTimer = null; }
}
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
  eventStream.addEventListener("messages-updated", async () => {
    if (!authenticated || !state) return;
    try {
      state.messages = (await api("/api/messages")).data || [];
      renderMessages(state.messages);
    } catch { /* polling and reconnect paths will reload the chat */ }
  });
  eventStream.onerror = () => {
    eventStream.close(); eventStream = null; startPollingFallback(); setConnectionStatus(navigator.onLine ? "reconnecting" : "offline");
    streamRetryTimer = setTimeout(() => { streamRetryTimer = null; connectEventStream(); }, 5000);
  };
}
function clearAppData() {
  state = null;
  attendanceData = null;
  guarantorMembers = [];
  dividendDraft = null;
  for (const selector of ["#identity", "#greeting", "#role-label", "#balance", "#contributions", "#outstanding", "#transactions", "#members", "#loans", "#leadership-list", "#leadership-elections", "#election-notifications", "#audit-list", "#audit-notice", "#dividend-preview", "#penalty-result", "#invite-result-message", "#invite-code", "#notice", "#attendance-members", "#attendance-view-members", "#attendance-attribution", "#attendance-history", "#attendance-registers"]) {
    const node = $(selector); if (node) node.textContent = "";
  }
  $("#attendance-editor").hidden = true;
  $("#attendance-view").hidden = true;
  $("#attendance-readonly-label").hidden = true;
  $("#invite-result").hidden = true;
  $("#copy-invite-code").hidden = true;
  for (const selector of ["#payment-member", "#payment-loan", "#incoming-user"]) $(selector)?.replaceChildren();
  for (const selector of ["#payment-form", "#loan-form", "#invite-form", "#leadership-form", "#election-proposal-form", "#pin-form", "#setup-form"]) $(selector)?.reset();
  for (const key of Object.keys(sessionStorage)) if (key.startsWith("jirani:")) sessionStorage.removeItem(key);
}
function showLogin() { clearAppData(); if (eventStream) { eventStream.close(); eventStream = null; } stopPollingFallback(); clearTimeout(streamRetryTimer); streamRetryTimer = null; clearInterval(activityTimer); activityTimer = null; authenticated = false; document.body.classList.add("landing-mode"); setNavigationOpen(false); $(".topbar")?.classList.remove("is-authenticated"); $("#identity").textContent = ""; $("#menu-identity").textContent = ""; $("#logout").hidden = true; $("#app").hidden = true; $("#login").hidden = false; const setupForm = $("#setup-form"); const loginForm = $("#login-form"); const activationForm = $("#activation-form"); if (setupForm) setupForm.hidden = true; if (loginForm) loginForm.hidden = false; if (activationForm) activationForm.hidden = true; setLoginNotice($("#setup-notice"), ""); setLoginNotice($("#login-notice"), ""); setLoginNotice($("#activation-notice"), ""); }

$("#setup-form")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try {
    await api("/api/setup", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    form.reset(); setLoginNotice($("#setup-notice"), ""); await refresh();
  } catch (error) {
    setLoginNotice($("#setup-notice"), error instanceof TypeError ? "Cannot reach the server. Check that it is running, then try again." : error.message);
  } finally { setButton(form, false); }
});

$("#login-form")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try { await api("/api/login", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.reset(); setLoginNotice($("#login-notice"), ""); await refresh(); }
  catch (error) { if (error instanceof TypeError) { setConnectionStatus("offline"); setLoginNotice($("#login-notice"), "Cannot reach the server. Check that it is running, then try again."); } else setLoginNotice($("#login-notice"), error.message); } finally { setButton(form, false); }
});
$("#chat-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const text = new FormData(form).get("text").trim();
  if (!text) return;
  setButton(form, true);
  try {
    const result = await api("/api/messages", { method: "POST", body: { text }, write: form });
    state.messages = [...(state.messages || []), result.data].slice(-100);
    renderMessages(state.messages);
    form.reset();
    notice(result.message || "Message sent.");
  } catch (error) {
    notice(error.message || t("retryError"), true);
  } finally { setButton(form, false); }
});

$("#activation-form")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try { const result = await api("/api/invitations/activate", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.reset(); setLoginNotice($("#activation-notice"), ""); setLoginNotice($("#login-notice"), result.message); $("#activation-form").hidden = true; $("#login-form").hidden = false; }
  catch (error) { setLoginNotice($("#activation-notice"), error instanceof TypeError ? "Cannot reach the server. Check that it is running, then try again." : error.message); } finally { setButton(form, false); }
});
$("#show-activate")?.addEventListener("click", () => { $("#login-form").hidden = true; $("#activation-form").hidden = false; });
$("#show-login")?.addEventListener("click", () => { $("#activation-form").hidden = true; $("#login-form").hidden = false; });
async function signOut() { try { await api("/api/logout", { method: "POST" }); showLogin(); notice("Signed out."); } catch (error) { notice(error.message, true); } }
$("#logout").addEventListener("click", signOut);
$("#menu-logout").addEventListener("click", signOut);
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
$("#pin-form")?.addEventListener("submit", async event => {
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
$("#simulated-payment-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  setButton(form, true);
  try {
    const values = Object.fromEntries(new FormData(form));
    values.amount = Number(values.amount);
    values.timestamp = new Date(values.timestamp).toISOString();
    await api("/api/payments/simulate", {
      method: "POST",
      body: values,
      write: form,
      validateResponse: result => result?.data?.status === "Unverified" && result.data.transactionId === values.transactionId.toUpperCase() && result.data.rawPayload?.testOnly === true,
    });
    form.reset();
    state.simulatedPayments = (await api("/api/payments/inbox")).data || [];
    renderSimulatedPaymentInbox(state.simulatedPayments);
    window.jiraniI18n?.apply();
    notice("Simulated payment saved as Unverified; no balance was changed.");
  } catch (error) {
    notice(error.message, true);
  } finally {
    setButton(form, false);
  }
});
$("#loan-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (state?.subscription?.status !== "active") {
    updateLoanRequestAccess(state?.subscription);
    return;
  }
  setButton(form, true);
  try {
    const formData = new FormData(form);
    const values = Object.fromEntries(formData);
    values.amount = Number(values.amount);
    values.months = Number(values.months);
    values.guarantorIds = formData.getAll("guarantorIds");
    await api("/api/loans", { method: "POST", body: values, write: true });
    form.reset();
    notice("Loan request submitted.");
    await refresh();
  } catch (error) {
    notice(error.message, true);
    if (error.status === 402) {
      if (state?.subscription) state.subscription = { ...state.subscription, status: "expired" };
      updateLoanRequestAccess(state?.subscription);
      try { await refresh(); } catch {}
    }
  } finally {
    setButton(form, false);
    updateLoanRequestAccess();
  }
});
$("#invite-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  $("#invite-result").hidden = true; $("#invite-result").classList.remove("error"); $("#invite-code").textContent = ""; $("#copy-invite-code").hidden = true;
  try {
    const nameField = form.elements.namedItem("name");
    const phoneField = form.elements.namedItem("phone");
    const emailField = form.elements.namedItem("email");
    const roleField = form.elements.namedItem("role");
    if (!nameField || !phoneField || !emailField || !roleField) throw new Error("The member name, phone, email, or role field is missing. Hard-refresh the page and try again.");
    const values = { name: nameField.value.trim(), phone: phoneField.value.trim(), email: emailField.value.trim(), role: roleField.value };
    if (!values.name) throw new Error("Enter the member's name.");
    if (!values.phone) throw new Error("Enter the member's Kenyan phone number.");
    if (!values.email) throw new Error("Enter the member's email address.");
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
$("#election-proposal-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const formData = new FormData(form);
  const values = { role: formData.get("role"), candidateIds: formData.getAll("candidateIds"), scheduledDate: formData.get("scheduledDate") };
  if (values.candidateIds.length < 2) { notice("Choose at least two active Members as candidates.", true); return; }
  setButton(form, true);
  try { await api("/api/leadership-elections", { method: "POST", body: values, write: form }); form.reset(); notice("Election scheduled."); await refresh(); }
  catch (error) { notice(error.message, true); } finally { setButton(form, false); }
});
$("#leadership-elections").addEventListener("submit", async event => {
  const runoffForm = event.target.closest("form[data-election-runoff]");
  if (runoffForm) {
    event.preventDefault(); if (!runoffForm.reportValidity()) return;
    const electionId = runoffForm.dataset.electionRunoff;
    const scheduledDate = new FormData(runoffForm).get("scheduledDate");
    const button = runoffForm.querySelector("button[type=submit]"); if (button) button.disabled = true;
    try {
      await api(`/api/leadership-elections/${encodeURIComponent(electionId)}/runoff`, { method: "POST", body: { scheduledDate }, write: runoffForm });
      notice("Runoff scheduled."); await refresh();
    } catch (error) { notice(error.message, true); if (button) button.disabled = false; }
    return;
  }
  const form = event.target.closest("form[data-election-ballot]"); if (!form) return;
  event.preventDefault(); if (!form.reportValidity()) return; const electionId = form.dataset.electionBallot;
  const candidateId = new FormData(form).get("candidateId"); const button = form.querySelector("button[type=submit]"); if (button) button.disabled = true;
  try { await api("/api/leadership-elections/" + encodeURIComponent(electionId) + "/vote", { method: "POST", body: { candidateId }, write: form }); notice("Your secret vote has been recorded."); await refresh(); }
  catch (error) { notice(error.message, true); if (button) button.disabled = false; }
});
$("#leadership-elections").addEventListener("click", async event => {
  const button = event.target.closest("[data-election-action]"); if (!button) return;
  const action = button.dataset.electionAction; const electionId = button.dataset.electionId;
  const prompts = { accept: "Accept these candidates and open voting?", decline: "Decline this proposal? The Secretary can submit a new one.", close: "Close voting now? Members will no longer be able to vote.", verify: "Verify the displayed election result?" };
  if (prompts[action] && !window.confirm(prompts[action])) return;
  const path = "/api/leadership-elections/" + encodeURIComponent(electionId) + "/" + encodeURIComponent(action);
  button.disabled = true;
  try { const result = await api(path, { method: "POST", body: {}, write: true }); notice(result.message); await refresh(); }
  catch (error) { notice(error.message, true); button.disabled = false; }
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

async function restoreSession() {
  showLogin();
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      await refresh();
      return;
    }
  } catch {}
  await checkBackendConnection({ selectInitialScreen: true });
}
restoreSession();

function setNavigationOpen(open) {
  if (!menuToggle || !menuBar) return;
  if (!open) {
    for (const dropdown of menuBar.querySelectorAll(".nav-dropdown")) {
      dropdown.classList.remove("open");
      dropdown.querySelector(".nav-dropdown-toggle")?.setAttribute("aria-expanded", "false");
    }
  }
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  menuBar.classList.toggle("menu-open", open);
  menuBar.setAttribute("aria-hidden", String(!open));
}
menuToggle.addEventListener("click", () => setNavigationOpen(menuToggle.getAttribute("aria-expanded") !== "true"));
menuBar.addEventListener("click", event => {
  const dropdownToggle = event.target.closest(".nav-dropdown-toggle");
  if (dropdownToggle) {
    const dropdown = dropdownToggle.closest(".nav-dropdown");
    const expanded = dropdownToggle.getAttribute("aria-expanded") === "true";
    dropdownToggle.setAttribute("aria-expanded", String(!expanded));
    dropdown.classList.toggle("open", !expanded);
    return;
  }
  const contributionsLink = event.target.closest("a[data-contributions-link]");
  if (contributionsLink) {
    event.preventDefault();
    selectedDashboardView = state?.user?.role === "member" ? "you" : "group";
    const targetId = selectedDashboardView === "group" ? "group-contributions-title" : "you-contributions-title";
    showAppPage("overview", { scrollTarget: targetId });
    return;
  }
  const panelLink = event.target.closest("a[data-panel]");
  if (panelLink) {
    event.preventDefault();
    showAppPage(panelLink.dataset.panel);
  }
});
for (const tab of document.querySelectorAll("[data-dashboard-tab]")) {
  tab.addEventListener("click", () => {
    selectedDashboardView = tab.dataset.dashboardTab;
    showAppPage("overview");
  });
}
$("#notification-button").addEventListener("click", () => showAppPage("chat-panel"));
document.addEventListener("click", event => {
  if (!state?.user || state.user.role !== "chairperson") return;
  const saved = readSetupChecklistState(state.user.id);
  if (event.target.closest("#setup-checklist-open")) {
    saved.dismissed = false;
    saveSetupChecklistState(state.user.id, saved);
    renderChairpersonSetupChecklist(state.user, state.members, state.invitations || []);
    return;
  }
  if (event.target.closest("#setup-checklist-dismiss")) saved.dismissed = true;
  else {
    const skip = event.target.closest("[data-setup-skip]");
    const restore = event.target.closest("[data-setup-restore]");
    const panelLink = event.target.closest("a[data-setup-panel]");
    if (skip) saved.skipped[skip.dataset.setupSkip] = true;
    else if (restore) delete saved.skipped[restore.dataset.setupRestore];
    else if (panelLink) {
      event.preventDefault();
      if (panelLink.dataset.setupReview) saved.overviewReviewed = true;
      showAppPage(panelLink.dataset.setupPanel);
    } else return;
  }
  saveSetupChecklistState(state.user.id, saved);
  renderChairpersonSetupChecklist(state.user, state.members, state.invitations || []);
});
window.addEventListener("languagechange", () => {
  if (state?.user) renderChairpersonSetupChecklist(state.user, state.members, state.invitations || []);
});
document.addEventListener("click", event => {
  if (event.target.closest("#menu-bar, #menu-toggle")) return;
  setNavigationOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    setNavigationOpen(false);
    menuToggle.focus();
  }
});

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
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || profileMenu.hidden) return;
  profileMenu.hidden = true;
  profileMenuButton.setAttribute("aria-expanded", "false");
  profileMenuButton.focus();
});
$("#audit-search").addEventListener("input", () => { auditPage = 0; renderAuditLogPage(); });
$("#audit-previous").addEventListener("click", () => { auditPage = Math.max(0, auditPage - 1); renderAuditLogPage(); });
$("#audit-next").addEventListener("click", () => { auditPage += 1; renderAuditLogPage(); });
