"use strict";

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const express = require("express");
const session = require("express-session");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 8000);
const DATA_FILE = process.env.CHAMA_DATA_FILE || path.join(__dirname, "data.json");
const FRONTEND = path.join(__dirname, "..", "en public");
const ROLES = new Set(["chairperson", "secretary", "treasurer", "member"]);
const PAYMENT_TYPES = new Set(["Monthly Contribution", "Loan Repayment", "Fine"]);
const LOAN_APPROVAL_ROLES = new Set(["chairperson", "secretary", "treasurer", "member"]);
const REQUIRED_LOAN_APPROVALS = 3;
const WELFARE_MONTHLY_FEE = 500;
const LATE_CONTRIBUTION_PENALTY = 200;
const DEFAULT_DEADLINE_DAY = 5;
const LOAN_MONTHLY_RATE = 0.05;
const LOAN_LIMIT_MULTIPLE = 3;
const GUARANTORS_REQUIRED = 2;
const eventClients = new Set();
const SESSION_SECRET = process.env.SESSION_SECRET;
const codeLifetimeMs = 24 * 60 * 60 * 1000;
const idempotencyLifetimeMs = 24 * 60 * 60 * 1000;
const invitationAttemptLimit = 5;
const idleSessionMs = 15 * 60 * 1000;
const loginLockoutMs = Number(process.env.CHAMA_LOGIN_LOCKOUT_MS) || 15 * 60 * 1000;
const loginFailures = new Map();
const idempotencyRequests = new Map();

if (!SESSION_SECRET) throw new Error("SESSION_SECRET must be set in .env.");

function clean(value) { return String(value ?? "").trim(); }
function roleName(role) { return role ? role[0].toUpperCase() + role.slice(1) : "Officer"; }
function normalizePhone(value) {
  const raw = clean(value).replace(/[\s()-]/g, "");
  if (/^0[17]\d{8}$/.test(raw)) return `+254${raw.slice(1)}`;
  if (/^254[17]\d{8}$/.test(raw)) return `+${raw}`;
  if (/^\+254[17]\d{8}$/.test(raw)) return raw;
  return null;
}
function publishLoanUpdate(loan) {
  const payload = `event: loans-updated\ndata: ${JSON.stringify({ id: loan.id, at: now() })}\n\n`;
  for (const client of eventClients) { try { client.write(payload); } catch { eventClients.delete(client); } }
}
function validPin(pin) { return /^\d{4,12}$/.test(clean(pin)); }
function validNewPin(pin) { return /^\d{6,12}$/.test(clean(pin)); }
function pinHash(pin, salt = crypto.randomBytes(16).toString("hex")) { return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`; }
function verifyPin(pin, stored) {
  if (!validPin(pin) || typeof stored !== "string") return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(pin, salt, 64).toString("hex");
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
function loginThrottleEntry(key) {
  const entry = loginFailures.get(key);
  if (entry && entry.resetAt <= Date.now()) { loginFailures.delete(key); return null; }
  return entry || null;
}
function loginLocked(phoneKey, ipKey) {
  return [phoneKey, ipKey].some(key => (loginThrottleEntry(key)?.lockedUntil || 0) > Date.now());
}
function recordLoginFailure(phoneKey, ipKey) {
  const nowMs = Date.now();
  for (const [key, entry] of loginFailures) if (entry.resetAt <= nowMs) loginFailures.delete(key);
  for (const key of [phoneKey, ipKey]) {
    const previous = loginFailures.get(key);
    const failures = previous && previous.resetAt > nowMs ? previous.failures + 1 : 1;
    loginFailures.set(key, { failures, resetAt: nowMs + loginLockoutMs, lockedUntil: failures >= 5 ? nowMs + loginLockoutMs : 0 });
  }
  if (loginFailures.size > 10000) loginFailures.delete(loginFailures.keys().next().value);
}
function hashCode(code) { return crypto.createHash("sha256").update(code).digest("hex"); }
function newId() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function auditEntry(type, entityId, actor, details = {}) {
  return { id: newId(), type, entityId, at: now(), by: { id: actor.id, name: actor.name, role: actor.role }, ...details };
}
function displayPhone(phone, includeFull = false) {
  if (includeFull) return phone;
  const digits = String(phone || "").replace(/\D/g, "");
  if (!/^254[17]\d{8}$/.test(digits)) return "Private";
  const local = `0${digits.slice(3)}`;
  return `${local.slice(0, 4)} *** ${local.slice(-3)}`;
}
function safeUser(user, canViewPhone = ["chairperson", "secretary"].includes(user.role)) {
  return { id: user.id, name: user.name, phone: displayPhone(user.phone, canViewPhone), role: user.role, status: user.status, mustChangePin: !!user.mustChangePin };
}
function internationalPhone(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? normalized.replace(/\D/g, "") : null;
}
function emptyState() { return { version: 2, users: [], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {}, registers: [], auditLog: [], welfareReserve: 0, penalties: [], settings: { defaultDeadlineDay: DEFAULT_DEADLINE_DAY, meetingDates: {} }, dividendCycles: [] }; }
// A month's meeting date overrides the default deadline day, which applies to every other month.
function scheduledMeetingDate(month) {
  const custom = state.settings?.meetingDates?.[month];
  return custom || `${month}-${String(state.settings?.defaultDeadlineDay || DEFAULT_DEADLINE_DAY).padStart(2, "0")}`;
}
function nairobiDate(value) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(value)); }
function todayInNairobi() { return nairobiDate(new Date()); }
function transactionDate(item) { return item.date || nairobiDate(item.at); }
function addMonthsToDate(date, months) { const next = new Date(`${date}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + months); return next.toISOString().slice(0, 10); }
// Share capital pledged as guarantor on loans that are still pending or approved.
function heldPledgeTotal(memberId, source = state) {
  return source.loans.filter(loan => loanIsPending(loan) || loan.status === "approved").flatMap(loan => (loan.guarantors || []).filter(item => item.memberId === memberId).map(item => item.held)).reduce((sum, value) => sum + value, 0);
}
function unpledgedCapital(member, source = state) { return (member.shareCapital || 0) - heldPledgeTotal(member.id, source); }
// Pledges cover the principal, taken from each guarantor in the order given.
function allocateGuarantee(amount, candidates) {
  let remaining = amount; const allocations = [];
  for (const candidate of candidates) {
    const pledge = Math.min(Math.max(candidate.available, 0), remaining);
    allocations.push({ memberId: candidate.member.id, name: candidate.member.name, pledged: pledge, held: pledge });
    remaining -= pledge;
  }
  return remaining === 0 ? allocations : null;
}
// Reducing balance: equal installments, interest on the remaining principal each month.
// Flat rate: interest on the full principal each month, principal in equal parts.
function repaymentSchedule(principal, months, model, startDate) {
  const rows = []; let balance = principal;
  const installment = Math.round(principal * LOAN_MONTHLY_RATE / (1 - (1 + LOAN_MONTHLY_RATE) ** -months));
  const flatInterest = Math.round(principal * LOAN_MONTHLY_RATE);
  const flatPrincipal = Math.floor(principal / months);
  for (let number = 1; number <= months; number += 1) {
    const interest = model === "flat" ? flatInterest : Math.round(balance * LOAN_MONTHLY_RATE);
    const principalDue = number === months ? balance : model === "flat" ? flatPrincipal : installment - interest;
    rows.push({ no: number, dueDate: addMonthsToDate(startDate, number), openingBalance: balance, principal: principalDue, interest, installment: principalDue + interest, paidPrincipal: 0, paidInterest: 0 });
    balance -= principalDue;
  }
  return rows;
}
// One-time, idempotent: only transactions without a split are changed, so re-running on a saved file changes nothing.
function backfillContributionSplits(source) {
  const paidWelfare = new Set(source.transactions.filter(item => item.welfareAmount > 0).map(item => `${item.memberId}|${monthKey(item.at)}`));
  const legacy = source.transactions.filter(item => !("welfareAmount" in item) && item.paymentType === "Monthly Contribution" && item.status === "confirmed" && item.memberId).sort((left, right) => String(left.at).localeCompare(String(right.at)));
  for (const item of legacy) {
    const contributionMonth = monthKey(item.at);
    const key = `${item.memberId}|${contributionMonth}`;
    const welfare = paidWelfare.has(key) ? 0 : Math.min(WELFARE_MONTHLY_FEE, item.amount);
    paidWelfare.add(key);
    const shareCapital = item.amount - welfare;
    Object.assign(item, { contributionMonth, welfareAmount: welfare, shareCapitalAmount: shareCapital, penaltyAmount: 0, backfilled: true });
    const member = source.users.find(user => user.id === item.memberId);
    if (member) member.shareCapital = (member.shareCapital || 0) + shareCapital;
    source.welfareReserve = (source.welfareReserve || 0) + welfare;
    source.auditLog.push({ id: newId(), type: "contribution.backfilled", entityId: item.id, at: now(), by: { id: "system", name: "Migration", role: "system" }, memberId: item.memberId, amount: item.amount, welfareAmount: welfare, shareCapitalAmount: shareCapital });
  }
}
function migrate(raw) {
  if (raw?.version === 2 && Array.isArray(raw.users)) {
    raw.loans = (Array.isArray(raw.loans) ? raw.loans : []).map(loan => {
      if (Array.isArray(loan.approvals)) return { ...loan, approvalHistory: loan.approvalHistory || loan.approvals };
      const approvals = Object.entries(loan.decisions || {}).map(([role, item]) => ({ approverId: item.by || `${role}-legacy`, approverName: role, role, decision: item.decision, reason: item.reason || "Legacy decision recorded before reason tracking.", at: item.at || loan.createdAt || now() }));
      return { ...loan, approvals, approvalHistory: approvals };
    });
    if (!Array.isArray(raw.pendingMpesas)) raw.pendingMpesas = [];
    if (!Array.isArray(raw.registers)) raw.registers = [];
    if (!Array.isArray(raw.auditLog)) raw.auditLog = [];
    if (!Number.isSafeInteger(raw.welfareReserve)) raw.welfareReserve = 0;
    if (!Array.isArray(raw.penalties)) raw.penalties = [];
    if (!raw.settings) raw.settings = { defaultDeadlineDay: DEFAULT_DEADLINE_DAY, meetingDates: {} };
    if (!Array.isArray(raw.dividendCycles)) raw.dividendCycles = [];
    backfillContributionSplits(raw);
    return raw;
  }
  const next = emptyState();
  const legacyMembers = Array.isArray(raw?.members) ? raw.members : [];
  const membersByName = new Map();
  for (const member of legacyMembers) {
    const phone = normalizePhone(member.phone);
    if (!phone) continue;
    const user = { id: member.id || newId(), name: clean(member.name) || "Member", phone, role: "member", status: member.active === false ? "inactive" : "invited", pinHash: null, mustChangePin: true, createdAt: now() };
    next.users.push(user); membersByName.set(user.name.toLowerCase(), user);
  }
  for (const item of Array.isArray(raw?.transactions) ? raw.transactions : []) {
    const member = membersByName.get(clean(item.member || item.memberName).toLowerCase());
    next.transactions.push({ id: item.id || newId(), at: item.at || item.createdAt || now(), memberId: member?.id || null, memberName: member?.name || clean(item.member || item.memberName), amount: Number(item.amount) || 0, method: item.method || "Cash", paymentType: item.paymentType || "Monthly Contribution", ref: clean(item.ref), loanId: item.loanId || null, recordedBy: null });
  }
  for (const item of Array.isArray(raw?.loans) ? raw.loans : []) {
    const member = membersByName.get(clean(item.member || item.memberName).toLowerCase());
    next.loans.push({ id: item.id || newId(), memberId: member?.id || null, memberName: member?.name || clean(item.member || item.memberName), amount: Number(item.amount) || 0, months: Number(item.months) || 1, outstanding: Number(item.outstanding) || 0, status: item.status || "pending", createdAt: item.createdAt || now(), approvals: [], approvalHistory: [] });
  }
  next.payouts = Array.isArray(raw?.payouts) ? raw.payouts : [];
  next.pendingMpesas = [];
  backfillContributionSplits(next);
  return next;
}
function loadState() {
  try { return migrate(JSON.parse(fs.readFileSync(DATA_FILE, "utf8").replace(/^\uFEFF/, ""))); }
  catch (error) { if (error.code === "ENOENT") return emptyState(); throw error; }
}
let state = loadState();
function persist(next = state) {
  const temp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temp, DATA_FILE); state = next;
}
persist(state);

function currentBalance(source = state) {
  const income = source.transactions.filter(transaction => transaction.status !== "pending-member").reduce((sum, transaction) => sum + transaction.amount, 0);
  const lent = source.loans.filter(loan => loan.status === "approved" || loan.status === "repaid").reduce((sum, loan) => sum + loan.amount, 0);
  return income - lent;
}
function requireAuth(req, res, next) {
  const lastActivityAt = Number(req.session?.lastActivityAt);
  if (!req.session?.userId || !Number.isFinite(lastActivityAt) || Date.now() - lastActivityAt >= idleSessionMs) {
    if (!req.session) return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    return req.session.destroy(() => res.clearCookie("chama.sid").status(401).json({ message: "Your session has expired. Please sign in again." }));
  }
  const user = state.users.find(item => item.id === req.session?.userId && item.status === "active");
  if (!user) return res.status(401).json({ message: "Your session has expired. Please sign in again." });
  req.user = user; return next();
}
function requireRole(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ message: "Your role is not allowed to perform this action." }); }
function requirePinChanged(req, res, next) { return req.user.mustChangePin ? res.status(403).json({ message: "Change your temporary PIN before making any records." }) : next(); }
function protectWriteRequest(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-Requested-With") !== "chama") return res.status(400).json({ message: "Missing required request header." });
  const origin = req.get("Origin");
  if (origin) {
    try { if (new URL(origin).host !== req.get("host")) return res.status(403).json({ message: "Cross-site request blocked." }); }
    catch { return res.status(403).json({ message: "Invalid request origin." }); }
  }
  return next();
}
function idempotent(handler) {
  return async (req, res, next) => {
    const key = clean(req.get("Idempotency-Key"));
    if (!/^[\w:.-]{16,128}$/.test(key)) return res.status(400).json({ message: "A valid Idempotency-Key header is required." });
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify([req.method, req.originalUrl, req.user.id, req.body])).digest("hex");
    const replay = () => {
      const previous = state.idempotency[key];
      if (!previous) return false;
      if (previous.fingerprint !== fingerprint) {
        res.status(409).json({ message: "This idempotency key was already used for a different request." });
        return true;
      }
      let savedAt = Number.NaN;
      if (req.originalUrl === "/api/invitations") savedAt = Date.parse(previous.body?.invitation?.invitedAt || "");
      if (["/api/payments", "/api/contributions", "/api/loan-repayment", "/api/loans/repay"].includes(req.originalUrl)) savedAt = Date.parse(previous.body?.data?.at || "");
      if (Number.isFinite(savedAt) && Date.now() - savedAt >= idempotencyLifetimeMs) return false;
      res.status(previous.status).json(previous.body);
      return true;
    };
    let release;
    let requestLock;
    while (true) {
      const inFlight = idempotencyRequests.get(key);
      if (inFlight) {
        await inFlight;
        continue;
      }
      if (replay()) return;
      requestLock = new Promise(resolve => { release = resolve; });
      idempotencyRequests.set(key, requestLock);
      break;
    }
    req.idempotency = { key, fingerprint };
    try { await handler(req, res, next); }
    catch (error) { next(error); }
    finally {
      release();
      if (idempotencyRequests.get(key) === requestLock) idempotencyRequests.delete(key);
    }
  };
}
function commit(req, res, next, updated, status, body, storedBody = body, afterPersist) {
  updated.idempotency[req.idempotency.key] = { fingerprint: req.idempotency.fingerprint, status, body: storedBody };
  try { persist(updated); afterPersist?.(); return res.status(status).json(body); } catch (error) { return next(error); }
}
function publishMemberUpdate() {
  const payload = `event: members-updated\ndata: ${JSON.stringify({ at: now() })}\n\n`;
  for (const client of eventClients) { try { client.write(payload); } catch { eventClients.delete(client); } }
}
function monthKey(iso) { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date(iso)); }
function loanIsPending(loan) { return ["pending", "Requested", "Waiting for decisions"].includes(loan.status); }
function invitationRevocation(invitation, source = state) {
  return source.auditLog.slice().reverse().find(item => item.type === "invitation.revoked" && item.entityId === invitation.id) || null;
}
function loanApprovalRoles(loan, source = state) {
  const requester = source.users.find(item => item.id === loan.memberId);
  if (requester?.role === "chairperson") return ["secretary", "treasurer", "member"];
  if (requester?.role === "treasurer") return ["chairperson", "secretary", "member"];
  return ["chairperson", "treasurer", "member"];
}
function loanApprovalView(loan, viewer, source = state) {
  const approvals = Array.isArray(loan.approvals) ? loan.approvals : [];
  const approvalsByRole = new Map(approvals.map(item => [item.role, item]));
  const approvalRoles = loanApprovalRoles(loan, source);
  const approvalCount = approvalRoles.filter(role => approvalsByRole.has(role)).length;
  const pending = loanIsPending(loan);
  const missingRole = approvalRoles.find(role => !approvalsByRole.has(role));
  const requiredRoleNames = approvalRoles.map(roleName);
  const requiredRoleSummary = `${requiredRoleNames.slice(0, -1).join(", ")}${requiredRoleNames.length > 1 ? " and " : ""}${requiredRoleNames.at(-1)}`;
  const status = loan.status === "pending" && !approvalCount ? "Requested" :
    loan.status === "pending" && approvalCount ? "Waiting for decisions" : loan.status;
  const progressMessage = status === "approved"
    ? "Loan approved. Any disbursement happens outside this app."
    : status === "rejected"
      ? `Loan rejected by ${roleName(approvals.find(item => item.decision === "reject")?.role || "officer")}.`
      : status === "repaid"
        ? "Loan repaid."
      : approvalCount
        ? `${approvalCount} of ${REQUIRED_LOAN_APPROVALS} required approvals complete — waiting for ${roleName(missingRole)}`
        : `Requested — awaiting ${requiredRoleSummary} decisions.`;
  const history = approvals.map(item => ({
    approverId: item.approverId,
    approverName: item.approverName,
    role: item.role,
    decision: item.decision,
    reason: viewer?.id === loan.memberId && item.decision === "approve" ? null : item.reason,
    at: item.at
  }));
  return {
    id: loan.id, memberId: loan.memberId, memberName: loan.memberName, amount: loan.amount, months: loan.months, outstanding: loan.outstanding, status, createdAt: loan.createdAt, resolvedAt: loan.resolvedAt || null,
    approvalCount, requiredApprovals: REQUIRED_LOAN_APPROVALS, progress: `${approvalCount} of ${REQUIRED_LOAN_APPROVALS} approvals`,
    progressMessage, approvalRoles: approvals.map(item => item.role), history,
    approvalSteps: approvalRoles.map(role => {
      const item = approvalsByRole.get(role);
      return {
        role,
        status: item?.decision || "awaiting",
        approverName: item?.approverName || null,
        at: item?.at || null,
        reason: item && !(viewer?.id === loan.memberId && item.decision === "approve") ? item.reason : null
      };
    }),
    canDecide: !!viewer && pending && viewer.id !== loan.memberId && approvalRoles.includes(viewer.role) && !approvalsByRole.has(viewer.role)
  };
}
function dashboardFor(user) {
  const officers = user.role !== "member";
  const transactions = officers ? state.transactions : state.transactions.filter(item => item.memberId === user.id);
  const loans = officers ? state.loans : state.loans.filter(item => item.memberId === user.id);
  const approvalQueue = state.loans.filter(item => loanIsPending(item) && item.memberId !== user.id && loanApprovalRoles(item).includes(user.role) && !(Array.isArray(item.approvals) ? item.approvals : []).some(approval => approval.role === user.role));
  const month = monthKey(now()); const activeUsers = state.users.filter(item => item.status === "active"); const currentMonth = transactions.filter(item => item.status !== "pending-member" && monthKey(item.at) === month); const approved = loans.filter(item => item.status === "approved");
  return {
    user: safeUser(user),
    permissions: { manageMembers: ["chairperson", "secretary"].includes(user.role), manageLeadership: ["chairperson", "secretary"].includes(user.role), proposeLeadership: user.role === "chairperson", revokeInvitations: user.role === "chairperson", revokeLeadershipRoles: user.role === "chairperson", recordPayments: user.role === "treasurer", viewAuditLog: ["chairperson", "treasurer"].includes(user.role), assessPenalties: ["chairperson", "secretary"].includes(user.role), manageDividends: ["chairperson", "treasurer"].includes(user.role), decideLoans: LOAN_APPROVAL_ROLES.has(user.role), requestLoans: true },
    summary: { balance: officers ? currentBalance() : null, contributions: currentMonth.filter(item => item.paymentType === "Monthly Contribution").reduce((sum, item) => sum + item.amount, 0), outstanding: approved.reduce((sum, item) => sum + item.outstanding, 0), memberCount: officers ? activeUsers.length : 1 },
    members: officers ? state.users.map(member => safeUser(member, ["chairperson", "secretary"].includes(user.role))) : [safeUser(user)], transactions: transactions.slice().sort((a, b) => b.at.localeCompare(a.at)), loans: loans.map(item => loanApprovalView(item, user)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), approvalQueue: approvalQueue.map(item => loanApprovalView(item, user)), payouts: state.payouts,
    pendingLoans: officers ? state.loans.filter(loanIsPending).map(item => loanApprovalView(item, user)) : [], invitations: ["chairperson", "secretary"].includes(user.role) ? state.invitations.map(invitation => {
      const { codeHash, usedCodeHash, ...item } = invitation;
      return { ...item, revocation: invitationRevocation(invitation) };
    }) : [], leadershipChanges: ["chairperson", "secretary"].includes(user.role) ? state.leadershipChanges : []
  };
}
function validMeetingDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function attendanceRegisterView(register, viewer) {
  const attendees = Array.isArray(register.attendees) ? register.attendees : [];
  const history = Array.isArray(register.history) ? register.history : [];
  return {
    ...register,
    memberCount: attendees.length,
    presentCount: attendees.filter(item => item.present).length,
    absentCount: attendees.filter(item => !item.present).length,
    attendees: viewer.role === "member" ? attendees.filter(item => item.userId === viewer.id) : attendees,
    history
  };
}
function providerRequest(url, headers, body, channel) {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const request = https.request(url, { method: "POST", headers }, response => {
      response.resume();
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve();
        const error = new Error(`${channel} provider rejected the message (${response.statusCode}).`);
        error.clearReject = response.statusCode >= 400 && response.statusCode < 500;
        reject(error);
      });
    });
    request.setTimeout(10000, () => { timedOut = true; request.destroy(new Error(`${channel} provider timed out; delivery is unknown.`)); });
    request.on("error", error => {
      error.ambiguous = true;
      if (timedOut) error.message = `${channel} provider timed out; delivery is unknown.`;
      reject(error);
    });
    request.write(body);
    request.end();
  });
}
function africaTalkingSmsConfigured() {
  const username = clean(process.env.AFRICASTALKING_USERNAME);
  const apiKey = clean(process.env.AFRICASTALKING_API_KEY);
  return !!username && !!apiKey && !/^(sandbox-or-production-username|replace-with-africas-talking-api-key)$/i.test(username) && !/^replace-with/i.test(apiKey);
}
function sendSms(phone, message) {
  const username = clean(process.env.AFRICASTALKING_USERNAME); const apiKey = clean(process.env.AFRICASTALKING_API_KEY); const from = clean(process.env.AFRICASTALKING_SENDER_ID);
  if (!africaTalkingSmsConfigured()) return Promise.reject(new Error("Africa's Talking is not configured."));
  const to = internationalPhone(phone);
  if (!to) return Promise.reject(new Error("Invalid Kenyan phone number."));
  const body = new URLSearchParams({ username, to: `+${to}`, message, ...(from ? { from } : {}) }).toString();
  return providerRequest(new URL("https://api.africastalking.com/version1/messaging"), { apiKey, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), Accept: "application/json" }, body, "SMS");
}
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'");
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  else if (["/", "/index.html", "/chama.js", "/chama.css", "/i18n.js"].includes(req.path)) res.setHeader("Cache-Control", "no-store");
  if (process.env.NODE_ENV === "production" && !req.secure) return res.redirect(301, `https://${req.get("host")}${req.originalUrl}`);
  return next();
});
app.use(express.json({ limit: "32kb" }));
app.use(session({ name: "chama.sid", secret: SESSION_SECRET, resave: false, saveUninitialized: false, rolling: true, cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: idleSessionMs } }));
app.use("/api", protectWriteRequest);
app.use(express.static(FRONTEND));
app.get("/", (req, res) => res.sendFile(path.join(FRONTEND, "index.html")));
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
function setupAvailable(source = state) {
  return ["users", "transactions", "loans", "payouts", "invitations", "leadershipChanges", "pendingMpesas"]
    .every(key => Array.isArray(source[key]) && source[key].length === 0);
}
app.get("/api/setup/status", (req, res) => res.json({ requiresSetup: setupAvailable() }));
app.post("/api/setup", (req, res, next) => {
  if (!setupAvailable()) return res.status(409).json({ message: "This chama already has accounts or records. First-time setup is closed." });
  const name = clean(req.body?.name);
  const phone = normalizePhone(req.body?.phone);
  const pin = clean(req.body?.pin);
  if (!name || name.length > 100 || !phone || !validNewPin(pin)) return res.status(400).json({ message: "Enter your name, a valid Kenyan phone number, and a 6-12 digit PIN." });
  const updated = structuredClone(state);
  const user = { id: newId(), name, phone, role: "chairperson", status: "active", pinHash: pinHash(pin), mustChangePin: false, createdAt: now() };
  updated.users.push(user);
  try { persist(updated); } catch (error) { return next(error); }
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.userId = user.id;
    req.session.lastActivityAt = Date.now();
    req.session.save(saveError => saveError ? next(saveError) : res.status(201).json({ message: "Your chairperson account is ready.", user: safeUser(user) }));
  });
});

app.post("/api/login", (req, res, next) => {
  const phoneInput = clean(req.body?.phone); const phone = normalizePhone(phoneInput); const phoneKey = `phone:${phone || phoneInput}`; const ipKey = `ip:${req.ip}`;
  if (loginLocked(phoneKey, ipKey)) return res.status(429).json({ message: "Too many login attempts. Try again in 15 minutes." });
  const pin = clean(req.body?.pin); const user = phone && state.users.find(item => item.phone === phone && item.status === "active");
  if (!user || !verifyPin(pin, user.pinHash)) { recordLoginFailure(phoneKey, ipKey); return res.status(401).json({ message: "Incorrect phone number or PIN." }); }
  loginFailures.delete(phoneKey); loginFailures.delete(ipKey);
  if (pin.length < 6 && !user.mustChangePin) {
    const updated = structuredClone(state);
    updated.users.find(item => item.id === user.id).mustChangePin = true;
    persist(updated);
    user.mustChangePin = true;
  }
  req.session.regenerate(error => { if (error) return next(error); req.session.userId = user.id; req.session.lastActivityAt = Date.now(); req.session.save(saveError => saveError ? next(saveError) : res.json({ message: "Signed in successfully.", user: safeUser(user) })); });
});
app.post("/api/logout", requireAuth, (req, res, next) => req.session.destroy(error => error ? next(error) : res.clearCookie("chama.sid").json({ message: "Signed out." })));
app.get("/api/dashboard", requireAuth, (req, res) => req.user.mustChangePin ? res.status(403).json({ message: "Change your PIN before viewing the dashboard.", mustChangePin: true }) : res.json(dashboardFor(req.user)));
app.get("/api/attendance", requireAuth, requirePinChanged, (req, res) => {
  const members = req.user.role === "secretary"
    ? state.users.filter(user => user.status === "active").map(user => ({ id: user.id, name: user.name }))
    : [];
  const registers = state.registers
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))
    .map(register => attendanceRegisterView(register, req.user));
  return res.json({ members, registers, readOnly: req.user.role !== "secretary" });
});
app.post("/api/attendance", requireAuth, requirePinChanged, requireRole("secretary"), idempotent((req, res, next) => {
  const date = clean(req.body?.date);
  const expectedRevision = req.body?.expectedRevision;
  const submitted = req.body?.attendees;
  if (!validMeetingDate(date) || !Array.isArray(submitted) || submitted.length > 1000 ||
      (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1))) {
    return res.status(400).json({ message: "Provide a valid meeting date, register revision, and attendance list." });
  }
  const existing = state.registers.find(register => register.date === date);
  if ((!existing && expectedRevision !== null) || (existing && existing.revision !== expectedRevision)) {
    return res.status(409).json({ message: "This attendance register was already updated. Refresh the meeting register before saving your changes." });
  }
  const activeUsers = state.users.filter(user => user.status === "active");
  const eligibleIds = new Set(activeUsers.map(user => user.id));
  if (existing) for (const attendee of existing.attendees || []) eligibleIds.add(attendee.userId);
  const submittedIds = new Set();
  for (const item of submitted) {
    if (!item || typeof item.userId !== "string" || typeof item.present !== "boolean" ||
        submittedIds.has(item.userId) || !eligibleIds.has(item.userId)) {
      return res.status(400).json({ message: "Attendance must contain one present or absent choice for each current member." });
    }
    submittedIds.add(item.userId);
  }
  if (submittedIds.size !== eligibleIds.size || [...eligibleIds].some(id => !submittedIds.has(id))) {
    return res.status(400).json({ message: "Attendance must contain one present or absent choice for each current member." });
  }
  const previousById = new Map((existing?.attendees || []).map(item => [item.userId, item]));
  const usersById = new Map(state.users.map(user => [user.id, user]));
  const attendees = submitted.map(item => {
    const user = usersById.get(item.userId);
    return { userId: item.userId, name: user?.name || previousById.get(item.userId).name, present: item.present };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const recordedAt = now();
  const actor = { id: req.user.id, name: req.user.name, role: req.user.role };
  const updated = structuredClone(state);
  let register;
  if (existing) {
    register = updated.registers.find(item => item.id === existing.id);
    const oldById = new Map(register.attendees.map(item => [item.userId, item]));
    const changes = attendees
      .filter(item => oldById.has(item.userId) && oldById.get(item.userId).present !== item.present)
      .map(item => ({ userId: item.userId, name: item.name, from: oldById.get(item.userId).present ? "present" : "absent", to: item.present ? "present" : "absent" }));
    for (const item of attendees) {
      if (!oldById.has(item.userId)) changes.push({ userId: item.userId, name: item.name, from: null, to: item.present ? "present" : "absent" });
    }
    register.attendees = attendees;
    register.revision += 1;
    register.editedAt = recordedAt;
    register.editedBy = actor;
    register.history.push({ at: recordedAt, by: actor, changes });
    updated.auditLog.push({ id: newId(), type: "attendance.edited", entityId: register.id, date, at: recordedAt, by: actor, changes });
  } else {
    register = {
      id: newId(), date, attendees, revision: 1, createdAt: recordedAt, createdBy: actor,
      editedAt: null, editedBy: null, history: []
    };
    updated.registers.push(register);
    updated.auditLog.push({ id: newId(), type: "attendance.created", entityId: register.id, date, at: recordedAt, by: actor, changes: [] });
  }
  return commit(req, res, next, updated, existing ? 200 : 201, {
    message: existing ? "Attendance register updated." : "Attendance register saved.",
    data: attendanceRegisterView(register, req.user)
  });
}));
app.post("/api/session/activity", requireAuth, (req, res) => {
  req.session.lastActivityAt = Date.now();
  req.session.touch();
  return res.json({ message: "Session activity recorded.", expiresInMs: idleSessionMs });
});
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
app.get("/api/export.csv", requireAuth, (req, res) => {
  const transactions = req.user.role === "member" ? state.transactions.filter(item => item.memberId === req.user.id) : state.transactions;
  const rows = [["Date", "Member", "Amount (KES)", "Method", "Type", "Reference"], ...transactions.map(item => [item.at, item.memberName, item.amount, item.method, item.paymentType, item.ref])];
  const attendance = req.user.role === "member"
    ? state.registers.map(register => ({ ...register, attendees: (register.attendees || []).filter(item => item.userId === req.user.id) }))
    : state.registers;
  if (attendance.some(register => register.attendees.length)) {
    rows.push([]);
    rows.push(["Meeting date", "Member", "Attendance", "Recorded by", "Recorded at", "Edited by", "Edited at", "Edit history"]);
    for (const register of attendance) {
      for (const attendee of register.attendees) {
        const editHistory = (register.history || []).map(item => {
          const changes = (item.changes || []).filter(change => req.user.role !== "member" || change.userId === req.user.id)
            .map(change => `${change.name}: ${change.from || "not recorded"} to ${change.to}`).join("; ");
          return `${item.at} by ${item.by?.name || "Unknown"}${changes ? ` (${changes})` : ""}`;
        }).join(" | ");
        rows.push([
          register.date, attendee.name, attendee.present ? "Present" : "Absent",
          register.createdBy?.name || "", register.createdAt, register.editedBy?.name || "", register.editedAt || "", editHistory
        ]);
      }
    }
  }
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"jirani-register.csv\"", "Cache-Control": "no-store" });
  return res.send(csv);
});
app.get("/api/events/stream", requireAuth, (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write(`retry: 5000\nevent: ready\ndata: ${JSON.stringify({ at: now() })}\n\n`); eventClients.add(res);
  const keepAlive = setInterval(() => { try { res.write(": keep-alive\n\n"); } catch { clearInterval(keepAlive); eventClients.delete(res); } }, 25000);
  req.on("close", () => { clearInterval(keepAlive); eventClients.delete(res); });
});

app.post("/api/invitations", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), idempotent(async (req, res, next) => {
  const name = clean(req.body?.name); const phone = normalizePhone(req.body?.phone); const role = clean(req.body?.role);
  if (!name || name.length > 100) return res.status(400).json({ message: "Enter the member's name (up to 100 characters)." });
  if (!phone) return res.status(400).json({ message: "Enter a valid Kenyan mobile phone number." });
  if (!ROLES.has(role)) return res.status(400).json({ message: "Choose a valid member role." });
  if (state.users.some(item => item.phone === phone) || state.invitations.some(item => item.phone === phone && !item.usedAt && !invitationRevocation(item) && item.expiresAt > now())) return res.status(409).json({ message: "That phone number already has an account or active invitation." });
  const code = String(crypto.randomInt(100000, 1000000)); const invitation = { id: newId(), name, phone, requestedRole: role, idempotencyKey: req.idempotency.key, codeHash: hashCode(code), attemptsRemaining: invitationAttemptLimit, usedCodeHash: null, invitedBy: req.user.id, invitedAt: now(), expiresAt: new Date(Date.now() + codeLifetimeMs).toISOString(), usedAt: null };
  let deliveryChannel = "sms";
  try { await sendSms(phone, `Jirani Chama invitation: your activation code is ${code}. It expires in 24 hours. Do not share it.`); }
  catch (error) { if (error.message !== "Africa's Talking is not configured.") return res.status(502).json({ message: `Invitation was not created: ${error.message}` }); deliveryChannel = "manual"; }
  const updated = structuredClone(state); updated.invitations.push(invitation);
  const { codeHash, usedCodeHash, ...savedInvitation } = invitation;
  const message = deliveryChannel === "manual"
    ? "Invitation created. SMS is not configured. Share this activation code privately; it expires in 24 hours."
    : "Invitation sent by SMS.";
  const body = { message, deliveryChannel, invitation: savedInvitation, ...(deliveryChannel === "manual" ? { activationCode: code } : {}) };
  const replayBody = deliveryChannel === "manual"
    ? { message: "Invitation exists. The activation code is only shown once.", deliveryChannel, invitation: savedInvitation }
    : body;
  return commit(req, res, next, updated, 201, body, replayBody);
}));
app.post("/api/invitations/:id/revoke", requireAuth, requirePinChanged, requireRole("chairperson"), idempotent((req, res, next) => {
  const reason = clean(req.body?.reason);
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: "Enter a reason of 5-500 characters." });
  const invitation = state.invitations.find(item => item.id === req.params.id);
  if (!invitation) return res.status(404).json({ message: "Invitation not found." });
  const age = Date.now() - Date.parse(invitation.invitedAt);
  if (invitation.usedAt || invitationRevocation(invitation) || !Number.isFinite(age) || age < 0 || age > codeLifetimeMs) {
    return res.status(409).json({ message: "Only unused invitations from the last 24 hours can be revoked." });
  }
  const updated = structuredClone(state);
  const revocation = {
    id: newId(),
    type: "invitation.revoked",
    entityId: invitation.id,
    at: now(),
    by: { id: req.user.id, name: req.user.name, role: req.user.role },
    reason
  };
  updated.auditLog.push(revocation);
  return commit(req, res, next, updated, 200, { message: "Invitation revoked.", data: revocation });
}));
app.post("/api/invitations/activate", (req, res, next) => {
  const phone = normalizePhone(req.body?.phone); const code = clean(req.body?.code); const codeDigest = hashCode(code); const pin = clean(req.body?.pin);
  const matchingCode = state.invitations.find(item => item.codeHash === codeDigest || item.usedCodeHash === codeDigest);
  if (matchingCode?.usedAt || matchingCode?.usedCodeHash === codeDigest) return res.status(400).json({ message: "Code already used" });
  if (matchingCode && invitationRevocation(matchingCode)) return res.status(400).json({ message: "Invitation revoked" });
  if (matchingCode && Date.parse(matchingCode.expiresAt) <= Date.now()) return res.status(400).json({ message: "Code expired" });
  if (matchingCode && matchingCode.phone !== phone) return res.status(400).json({ message: "Phone number does not match the invitation" });
  const invitation = matchingCode || (phone && state.invitations.find(item => item.phone === phone && !item.usedAt && !invitationRevocation(item) && Date.parse(item.expiresAt) > Date.now()));
  if (!matchingCode) {
    if (!invitation) return res.status(400).json({ message: "Incorrect activation code." });
    const remaining = Number.isInteger(invitation.attemptsRemaining) ? invitation.attemptsRemaining : invitationAttemptLimit;
    if (remaining <= 0) return res.status(400).json({ message: "Too many attempts. Request a new code." });
    const updated = structuredClone(state); const saved = updated.invitations.find(item => item.id === invitation.id); saved.attemptsRemaining = remaining - 1; persist(updated);
    if (saved.attemptsRemaining === 0) return res.status(400).json({ message: "Too many attempts. Request a new code." });
    return res.status(400).json({ message: "Incorrect activation code." });
  }
  if (!validNewPin(pin)) return res.status(400).json({ message: "Enter a valid activation code and 6-12 digit PIN." });
  const updated = structuredClone(state); const saved = updated.invitations.find(item => item.id === matchingCode.id); saved.usedAt = now(); saved.usedCodeHash = codeDigest; const user = { id: newId(), name: saved.name, phone: saved.phone, role: "member", status: "active", pinHash: pinHash(pin), mustChangePin: false, createdAt: now() };
  updated.users.push(user); persist(updated); publishMemberUpdate(); return res.status(201).json({ message: "Account activated. Please sign in.", user: safeUser(user) });
});
app.post("/api/pin/change", requireAuth, (req, res, next) => {
  const currentPin = clean(req.body?.currentPin); const newPin = clean(req.body?.newPin);
  if (!verifyPin(currentPin, req.user.pinHash) || !validNewPin(newPin)) return res.status(400).json({ message: "Enter your current PIN and a new 6-12 digit PIN." });
  const updated = structuredClone(state); const user = updated.users.find(item => item.id === req.user.id); user.pinHash = pinHash(newPin); user.mustChangePin = false; persist(updated); return res.json({ message: "PIN changed successfully.", user: safeUser(user) });
});

function recordManualPayment(forcedPaymentType = null) {
  return idempotent((req, res, next) => {
  const member = state.users.find(item => item.id === clean(req.body?.memberId) && item.status === "active"); const amount = Number(req.body?.amount); const paymentType = forcedPaymentType || clean(req.body?.paymentType); const method = clean(req.body?.method); const note = clean(req.body?.note);
  if (!member || !Number.isSafeInteger(amount) || amount < 1 || !PAYMENT_TYPES.has(paymentType) || method !== "Cash" || note.length < 3 || note.length > 500) return res.status(400).json({ message: "Manual entries are cash-only and require a 3-500 character note." });
  if (paymentType === "Loan Repayment") return res.status(400).json({ message: "Record loan repayments with the loan repayment form." });
  const updated = structuredClone(state);
  const transaction = { id: newId(), at: now(), memberId: member.id, memberName: member.name, amount, method, paymentType, note, loanId: null, recordedBy: req.user.id, recordedByName: req.user.name, source: "manual-cash", status: "confirmed", idempotencyKey: req.idempotency.key }; updated.transactions.push(transaction);
  updated.auditLog.push(auditEntry("payment.recorded", transaction.id, req.user, { memberId: member.id, memberName: member.name, amount, paymentType }));
  return commit(req, res, next, updated, 201, { message: "Payment recorded successfully.", data: transaction });
  });
}
app.post("/api/payments", requireAuth, requirePinChanged, requireRole("treasurer"), recordManualPayment());
app.post("/api/contributions", requireAuth, requirePinChanged, requireRole("treasurer"), idempotent((req, res, next) => {
  const member = state.users.find(item => item.id === clean(req.body?.memberId) && item.status === "active"); const amount = Number(req.body?.amount); const note = clean(req.body?.note); const referenceNumber = clean(req.body?.referenceNumber); const date = clean(req.body?.date);
  if (!member || !Number.isSafeInteger(amount) || amount < 1 || clean(req.body?.method) !== "Cash" || note.length < 3 || note.length > 500 || !/^[A-Za-z0-9/._-]{3,40}$/.test(referenceNumber) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return res.status(400).json({ message: "Contributions are cash-only and require a member, amount, 3-40 character reference number, date, and a 3-500 character note." });
  const contributionMonth = date.slice(0, 7);
  const welfarePaid = state.transactions.some(item => item.memberId === member.id && item.contributionMonth === contributionMonth && item.welfareAmount > 0);
  const meetingDate = scheduledMeetingDate(contributionMonth);
  const newPenalty = date > meetingDate ? LATE_CONTRIBUTION_PENALTY : 0;
  const outstandingPenalties = state.penalties.filter(item => item.memberId === member.id && item.status === "outstanding");
  const penaltyDue = outstandingPenalties.reduce((sum, item) => sum + item.amount, 0) + newPenalty;
  const welfare = welfarePaid ? 0 : WELFARE_MONTHLY_FEE;
  if (amount < penaltyDue + welfare) return res.status(400).json({ message: `This payment must cover ${penaltyDue ? `KES ${penaltyDue} in penalties and ` : ""}the KES ${welfare} welfare fee.` });
  const shareCapital = amount - penaltyDue - welfare;
  const updated = structuredClone(state); const savedMember = updated.users.find(item => item.id === member.id);
  const transaction = { id: newId(), at: now(), memberId: member.id, memberName: member.name, amount, method: "Cash", paymentType: "Monthly Contribution", note, referenceNumber, date, contributionMonth, welfareAmount: welfare, shareCapitalAmount: shareCapital, penaltyAmount: penaltyDue, loanId: null, recordedBy: req.user.id, recordedByName: req.user.name, source: "manual-cash", status: "confirmed", idempotencyKey: req.idempotency.key };
  updated.transactions.push(transaction);
  savedMember.shareCapital = (savedMember.shareCapital || 0) + shareCapital;
  updated.welfareReserve = (updated.welfareReserve || 0) + welfare;
  updated.auditLog.push(auditEntry("contribution.recorded", transaction.id, req.user, { memberId: member.id, memberName: member.name, amount, welfareAmount: welfare, shareCapitalAmount: shareCapital, penaltyAmount: penaltyDue, referenceNumber, date }));
  if (newPenalty) {
    const charge = { id: newId(), memberId: member.id, memberName: member.name, amount: newPenalty, reason: "Late contribution", status: "outstanding", transactionId: null, paidTransactionId: null, date, at: transaction.at };
    updated.penalties.push(charge);
    updated.auditLog.push(auditEntry("penalty.charged", charge.id, req.user, { memberId: member.id, memberName: member.name, amount: newPenalty, transactionId: transaction.id }));
  }
  // Outstanding penalties are settled from this payment before the welfare fee and share capital.
  for (const charge of updated.penalties.filter(item => item.memberId === member.id && item.status === "outstanding")) {
    charge.status = "paid"; charge.paidTransactionId = transaction.id; charge.paidAt = transaction.at;
    updated.auditLog.push(auditEntry("penalty.paid", charge.id, req.user, { memberId: member.id, memberName: member.name, amount: charge.amount, transactionId: transaction.id }));
  }
  return commit(req, res, next, updated, 201, { message: "Contribution recorded successfully.", data: transaction });
}));
app.post("/api/settings/meeting-date", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), idempotent((req, res, next) => {
  const month = clean(req.body?.month); const date = clean(req.body?.date);
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month || Number.isNaN(Date.parse(date))) return res.status(400).json({ message: "Enter a month (YYYY-MM) and a meeting date inside that month." });
  const updated = structuredClone(state);
  updated.settings.meetingDates[month] = date;
  updated.auditLog.push(auditEntry("meeting-date.set", month, req.user, { month, date }));
  return commit(req, res, next, updated, 200, { message: "Meeting date saved.", data: { month, date } });
}));
// Cash repayment: interest on each installment is paid before its principal, earliest installment first.
// Guarantor pledges shrink in step with the principal still owed.
function repayLoan() {
  return idempotent((req, res, next) => {
    const loan = state.loans.find(item => item.id === clean(req.body?.loanId) && item.status === "approved");
    const amount = Number(req.body?.amount); const note = clean(req.body?.note); const referenceNumber = clean(req.body?.referenceNumber); const date = clean(req.body?.date);
    if (!loan || !Number.isSafeInteger(amount) || amount < 1 || amount > loan.outstanding || clean(req.body?.method) !== "Cash" || note.length < 3 || note.length > 500 || !/^[A-Za-z0-9/._-]{3,40}$/.test(referenceNumber) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return res.status(400).json({ message: "Select an approved loan and enter a cash amount no larger than its outstanding balance, with a reference number, date, and note." });
    const updated = structuredClone(state); const saved = updated.loans.find(item => item.id === loan.id);
    let remaining = amount; let principalAmount = amount; let interestAmount = 0;
    if (saved.schedule) {
      principalAmount = 0;
      for (const row of saved.schedule) {
        const payInterest = Math.min(remaining, row.interest - row.paidInterest); row.paidInterest += payInterest; interestAmount += payInterest; remaining -= payInterest;
        const payPrincipal = Math.min(remaining, row.principal - row.paidPrincipal); row.paidPrincipal += payPrincipal; principalAmount += payPrincipal; remaining -= payPrincipal;
      }
    }
    saved.outstanding -= amount;
    const principalRemaining = saved.schedule ? saved.amount - saved.schedule.reduce((sum, row) => sum + row.paidPrincipal, 0) : saved.outstanding;
    const pledgesReleased = [];
    for (const guarantor of saved.guarantors || []) {
      const target = Math.round(guarantor.pledged * principalRemaining / saved.amount);
      if (guarantor.held > target) { pledgesReleased.push({ memberId: guarantor.memberId, amount: guarantor.held - target }); guarantor.held = target; }
    }
    if (saved.outstanding === 0) saved.status = "repaid";
    const transaction = { id: newId(), at: now(), memberId: saved.memberId, memberName: saved.memberName, amount, method: "Cash", paymentType: "Loan Repayment", note, referenceNumber, date, loanId: saved.id, principalAmount, interestAmount, recordedBy: req.user.id, recordedByName: req.user.name, source: "manual-cash", status: "confirmed", idempotencyKey: req.idempotency.key };
    updated.transactions.push(transaction);
    updated.auditLog.push(auditEntry("loan.repaid", saved.id, req.user, { memberId: saved.memberId, memberName: saved.memberName, transactionId: transaction.id, amount, principalAmount, interestAmount, outstanding: saved.outstanding, status: saved.status }));
    for (const release of pledgesReleased) updated.auditLog.push(auditEntry("pledge.released", saved.id, req.user, { loanId: saved.id, ...release }));
    return commit(req, res, next, updated, 201, { message: "Loan repayment recorded successfully.", data: transaction });
  });
}
app.post("/api/loans/repay", requireAuth, requirePinChanged, requireRole("treasurer"), repayLoan());
// Once a month's deadline has passed, every active member who paid less than the welfare fee by then gets one outstanding penalty.
app.post("/api/penalties/assess", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), idempotent((req, res, next) => {
  const month = clean(req.body?.month) || todayInNairobi().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ message: "Enter the month as YYYY-MM." });
  const deadline = scheduledMeetingDate(month);
  if (todayInNairobi() <= deadline) return res.status(409).json({ message: `The deadline for ${month} is ${deadline}. Assess penalties after it has passed.` });
  const updated = structuredClone(state); const assessed = [];
  for (const member of updated.users.filter(item => item.status === "active")) {
    const paidByDeadline = updated.transactions.filter(item => item.memberId === member.id && item.paymentType === "Monthly Contribution" && (item.contributionMonth || nairobiDate(item.at).slice(0, 7)) === month && transactionDate(item) <= deadline).reduce((sum, item) => sum + item.amount, 0);
    if (paidByDeadline >= WELFARE_MONTHLY_FEE) continue;
    // A late-payment penalty for this month already covers the miss.
    if (updated.penalties.some(item => item.memberId === member.id && (item.month === month || String(item.date || "").startsWith(month)))) continue;
    const charge = { id: newId(), memberId: member.id, memberName: member.name, amount: LATE_CONTRIBUTION_PENALTY, reason: "Missed monthly contribution", month, status: "outstanding", transactionId: null, paidTransactionId: null, date: todayInNairobi(), at: now() };
    updated.penalties.push(charge);
    updated.auditLog.push(auditEntry("penalty.assessed", charge.id, req.user, { memberId: member.id, memberName: member.name, amount: charge.amount, month, deadline, paidByDeadline }));
    assessed.push({ memberId: member.id, memberName: member.name, amount: charge.amount });
  }
  return commit(req, res, next, updated, 201, { message: assessed.length ? `${assessed.length} member(s) penalised for ${month}.` : `No members to penalise for ${month}.`, data: { month, deadline, assessed } });
}));
// Pro-rata by share capital, rounded to whole shillings. Leftover shillings go to the largest remainders, ties by member ID,
// so the payouts always add up to the pool exactly.
function dividendCycleInput(body) {
  const start = clean(body?.cycleStartDate); const end = clean(body?.cycleEndDate); const adminExpenses = Number(body?.adminExpenses);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || start > end || !Number.isSafeInteger(adminExpenses) || adminExpenses < 0) return null;
  return { start, end, adminExpenses };
}
function dividendPreview({ start, end, adminExpenses }, source = state) {
  const inCycle = date => date >= start && date <= end;
  const interestIncome = source.transactions.filter(item => item.interestAmount > 0 && inCycle(transactionDate(item))).reduce((sum, item) => sum + item.interestAmount, 0);
  const penaltyIncome = source.penalties.filter(item => item.status === "paid" && item.paidAt && inCycle(nairobiDate(item.paidAt))).reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = interestIncome + penaltyIncome;
  const distributablePool = totalIncome - adminExpenses;
  const members = source.users.filter(item => item.status === "active").map(item => ({ memberId: item.id, name: item.name, shareCapital: item.shareCapital || 0 }));
  const totalShareCapital = members.reduce((sum, item) => sum + item.shareCapital, 0);
  const overlapsCommitted = (source.dividendCycles || []).some(cycle => start <= cycle.cycleEndDate && end >= cycle.cycleStartDate);
  const payouts = members.map(item => ({ ...item, dividend: totalShareCapital > 0 && distributablePool > 0 ? Math.floor(distributablePool * item.shareCapital / totalShareCapital) : 0 }));
  if (totalShareCapital > 0 && distributablePool > 0) {
    const leftover = distributablePool - payouts.reduce((sum, item) => sum + item.dividend, 0);
    const byRemainder = payouts.map((item, index) => ({ index, remainder: (distributablePool * item.shareCapital) % totalShareCapital, memberId: item.memberId })).sort((left, right) => right.remainder - left.remainder || left.memberId.localeCompare(right.memberId));
    for (let count = 0; count < leftover; count += 1) payouts[byRemainder[count].index].dividend += 1;
  }
  return { cycleStartDate: start, cycleEndDate: end, adminExpenses, interestIncome, penaltyIncome, totalIncome, distributablePool, totalShareCapital, overlapsCommitted, payouts };
}
app.post("/api/dividends/calculate", requireAuth, requirePinChanged, requireRole("chairperson", "treasurer"), (req, res) => {
  const input = dividendCycleInput(req.body);
  if (!input) return res.status(400).json({ message: "Enter a cycle start and end date (YYYY-MM-DD, start on or before end) and admin expenses as whole KES." });
  const preview = dividendPreview(input);
  if (preview.distributablePool < 0) return res.status(400).json({ message: `Admin expenses of KES ${input.adminExpenses} exceed the KES ${preview.totalIncome} income in this cycle.` });
  if (preview.totalShareCapital <= 0) return res.status(409).json({ message: "No share capital to distribute against." });
  return res.json({ message: "Dividend preview. Nothing has been paid out yet.", data: preview });
});
app.post("/api/dividends/commit", requireAuth, requirePinChanged, requireRole("chairperson", "treasurer"), idempotent((req, res, next) => {
  const input = dividendCycleInput(req.body);
  if (!input || !Array.isArray(req.body?.payouts)) return res.status(400).json({ message: "Send the cycle dates, admin expenses, and the payouts from the preview." });
  const preview = dividendPreview(input);
  if (preview.distributablePool < 0) return res.status(400).json({ message: `Admin expenses of KES ${input.adminExpenses} exceed the KES ${preview.totalIncome} income in this cycle.` });
  if (preview.totalShareCapital <= 0) return res.status(409).json({ message: "No share capital to distribute against." });
  if (preview.overlapsCommitted) return res.status(409).json({ message: "This cycle overlaps a dividend that was already paid out." });
  const byMember = (left, right) => left.memberId.localeCompare(right.memberId);
  const submitted = req.body.payouts.map(item => ({ memberId: clean(item?.memberId), dividend: Number(item?.dividend) })).sort(byMember);
  const expected = preview.payouts.map(item => ({ memberId: item.memberId, dividend: item.dividend })).sort(byMember);
  if (JSON.stringify(submitted) !== JSON.stringify(expected)) return res.status(409).json({ message: "The payouts no longer match the current figures. Calculate again before committing." });
  const updated = structuredClone(state);
  for (const payout of preview.payouts) {
    if (payout.dividend <= 0) continue;
    const member = updated.users.find(item => item.id === payout.memberId);
    member.shareCapital = (member.shareCapital || 0) + payout.dividend;
  }
  const distributed = preview.payouts.reduce((sum, item) => sum + item.dividend, 0);
  const cycle = { id: newId(), cycleStartDate: input.start, cycleEndDate: input.end, adminExpenses: input.adminExpenses, interestIncome: preview.interestIncome, penaltyIncome: preview.penaltyIncome, totalIncome: preview.totalIncome, distributablePool: preview.distributablePool, distributed, payouts: expected, committedBy: req.user.id, committedAt: now() };
  updated.dividendCycles.push(cycle);
  updated.auditLog.push(auditEntry("dividend.distributed", cycle.id, req.user, { cycleStartDate: input.start, cycleEndDate: input.end, adminExpenses: input.adminExpenses, distributablePool: preview.distributablePool, distributed, members: expected.length }));
  return commit(req, res, next, updated, 201, { message: "Dividends added to share capital.", data: cycle });
}));
app.post("/api/loan-repayment", requireAuth, requirePinChanged, requireRole("treasurer"), repayLoan());
app.post("/api/loans", requireAuth, requirePinChanged, idempotent((req, res, next) => {
  const amount = Number(req.body?.amount); const months = Number(req.body?.months); const interestModel = clean(req.body?.interestModel) || "reducing";
  const guarantorIds = Array.isArray(req.body?.guarantorIds) ? [...new Set(req.body.guarantorIds.map(clean))] : [];
  if (!Number.isSafeInteger(amount) || amount < 1 || ![1, 2, 3, 6].includes(months) || !["reducing", "flat"].includes(interestModel)) return res.status(400).json({ message: "Enter a whole amount, a repayment period of 1, 2, 3, or 6 months, and an interest model of reducing or flat." });
  const shareCapital = req.user.shareCapital || 0; const limit = LOAN_LIMIT_MULTIPLE * shareCapital;
  if (amount > limit) return res.status(400).json({ message: `The most you can borrow is KES ${limit}, three times your share capital of KES ${shareCapital}.` });
  if (guarantorIds.length !== GUARANTORS_REQUIRED || guarantorIds.includes(req.user.id)) return res.status(400).json({ message: "Choose two different members as guarantors, other than yourself." });
  const guarantors = guarantorIds.map(id => state.users.find(item => item.id === id && item.status === "active"));
  if (guarantors.some(item => !item)) return res.status(400).json({ message: "Choose two different active members as guarantors." });
  const allocations = allocateGuarantee(amount, guarantors.map(member => ({ member, available: unpledgedCapital(member) })));
  if (!allocations) return res.status(409).json({ message: "The guarantors' unpledged share capital does not cover this loan." });
  const updated = structuredClone(state); const loan = { id: newId(), memberId: req.user.id, memberName: req.user.name, amount, months, interestModel, outstanding: 0, status: "Requested", createdAt: now(), approvals: [], approvalHistory: [], guarantors: allocations }; updated.loans.push(loan);
  updated.auditLog.push(auditEntry("loan.requested", loan.id, req.user, { amount, months, interestModel, guarantors: allocations.map(item => ({ memberId: item.memberId, name: item.name, pledged: item.pledged })) }));
  return commit(req, res, next, updated, 201, { message: "Loan request submitted. Your request is waiting for approval.", data: loan }, undefined, () => publishLoanUpdate(loan));
}));
app.post("/api/loans/:id/decisions", requireAuth, requirePinChanged, requireRole("chairperson", "secretary", "treasurer", "member"), idempotent((req, res, next) => {
  const decision = clean(req.body?.decision); const reason = clean(req.body?.reason);
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ message: "Decision must be approve or reject." });
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: "Enter a reason between 5 and 500 characters." });
  const updated = structuredClone(state); const loan = updated.loans.find(item => item.id === req.params.id && loanIsPending(item)); if (!loan) return res.status(404).json({ message: "Pending loan request not found." });
  if (loan.memberId === req.user.id) return res.status(403).json({ message: "A requester cannot approve or reject their own loan." });
  const requiredRoles = loanApprovalRoles(loan, updated);
  if (!requiredRoles.includes(req.user.role)) return res.status(403).json({ message: "Your role is not required to decide this loan." });
  if (!Array.isArray(loan.approvals)) loan.approvals = [];
  if (loan.approvals.some(item => item.approverId === req.user.id)) return res.status(409).json({ message: "You have already recorded a decision for this loan." });
  if (loan.approvals.some(item => item.role === req.user.role)) return res.status(409).json({ message: `The ${roleName(req.user.role)} decision has already been recorded for this loan.` });
  if (decision === "approve" && currentBalance() < loan.amount) return res.status(409).json({ message: "There is not enough group balance to approve this loan." });
  const approval = { approverId: req.user.id, approverName: req.user.name, role: req.user.role, decision, reason, at: now() };
  loan.approvals.push(approval); loan.approvalHistory = loan.approvals;
  const pledgesReleased = [];
  if (decision === "reject") {
    loan.status = "rejected";
    loan.outstanding = 0;
    loan.resolvedAt = now();
    for (const guarantor of loan.guarantors || []) { pledgesReleased.push({ memberId: guarantor.memberId, amount: guarantor.held }); guarantor.held = 0; }
  } else if (requiredRoles.every(role => loan.approvals.some(item => item.role === role && item.decision === "approve"))) {
    const approvedOn = todayInNairobi();
    loan.status = "approved";
    loan.approvedOn = approvedOn;
    loan.schedule = repaymentSchedule(loan.amount, loan.months, loan.interestModel || "reducing", approvedOn);
    loan.totalPayable = loan.schedule.reduce((sum, row) => sum + row.installment, 0);
    loan.outstanding = loan.totalPayable;
    loan.resolvedAt = now();
  } else {
    loan.status = "Waiting for decisions";
  }
  updated.auditLog.push(auditEntry("loan.decided", loan.id, req.user, { decision, reason, status: loan.status, totalPayable: loan.totalPayable || null, pledgesReleased }));
  const view = loanApprovalView(loan, req.user, updated);
  const message = loan.status === "approved" ? "Loan approved. Any disbursement happens outside this app." :
    loan.status === "rejected" ? `Loan rejected by ${roleName(req.user.role)}.` : view.progressMessage;
  return commit(req, res, next, updated, 200, { message, data: view, approvals: view.approvalCount, requiredApprovals: view.requiredApprovals, progress: view.progress, history: view.history }, undefined, () => publishLoanUpdate(loan));
}));

app.post("/api/leadership-changes", requireAuth, requirePinChanged, requireRole("chairperson"), idempotent((req, res, next) => {
  const role = clean(req.body?.role); const incoming = state.users.find(item => item.id === clean(req.body?.incomingUserId) && item.status === "active"); const effectiveDate = clean(req.body?.effectiveDate);
  if (!["chairperson", "secretary", "treasurer"].includes(role) || !incoming || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return res.status(400).json({ message: "Provide an active member, an office, and an effective date." });
  const outgoing = state.users.find(item => item.role === role && item.status === "active"); const hasOtherOfficer = state.users.some(item => item.status === "active" && item.id !== req.user.id && ["chairperson", "secretary", "treasurer"].includes(item.role)); const confirmedImmediately = !hasOtherOfficer;
  const proposedAt = now(); const record = { id: newId(), type: "appointment", role, outgoingUserId: outgoing?.id || null, incomingUserId: incoming.id, effectiveDate, vote: null, emergencyReason: null, status: confirmedImmediately ? "confirmed" : "pending", proposedBy: req.user.id, proposedAt, confirmedBy: confirmedImmediately ? req.user.id : null, confirmedAt: confirmedImmediately ? proposedAt : null, audit: [{ action: "proposed", by: req.user.id, at: proposedAt }] };
  if (confirmedImmediately) record.audit.push({ action: "confirmed", by: req.user.id, at: proposedAt });
  const updated = structuredClone(state); if (confirmedImmediately) { const savedOutgoing = record.outgoingUserId && updated.users.find(item => item.id === record.outgoingUserId); const savedIncoming = updated.users.find(item => item.id === record.incomingUserId); if (savedOutgoing) savedOutgoing.role = "member"; savedIncoming.role = record.role; } updated.leadershipChanges.push(record); updated.auditLog.push(auditEntry(confirmedImmediately ? "leadership.confirmed" : "leadership.proposed", record.id, req.user, { role, incomingUserId: incoming.id, outgoingUserId: outgoing?.id || null })); return commit(req, res, next, updated, 201, { message: confirmedImmediately ? "Officer assignment approved by the Chairperson." : "Officer assignment proposed and awaiting another officer.", data: record });
}));
app.post("/api/leadership-changes/:id/confirm", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), idempotent((req, res, next) => {
  const updated = structuredClone(state); const record = updated.leadershipChanges.find(item => item.id === req.params.id && item.status === "pending"); if (!record) return res.status(404).json({ message: "Pending leadership change not found." });
  if (record.proposedBy === req.user.id) return res.status(409).json({ message: "A different officer must confirm this leadership change." });
  const oldOfficial = record.outgoingUserId && updated.users.find(item => item.id === record.outgoingUserId); const incoming = updated.users.find(item => item.id === record.incomingUserId); if (oldOfficial) oldOfficial.role = "member"; incoming.role = record.role; record.status = "confirmed"; record.confirmedBy = req.user.id; record.confirmedAt = now(); record.audit.push({ action: "confirmed", by: req.user.id, at: record.confirmedAt });
  updated.auditLog.push(auditEntry("leadership.confirmed", record.id, req.user, { role: record.role, incomingUserId: record.incomingUserId, outgoingUserId: record.outgoingUserId }));
  return commit(req, res, next, updated, 200, { message: "Officer assignment confirmed.", data: record });
}));
app.post("/api/leadership-changes/:id/revoke", requireAuth, requirePinChanged, requireRole("chairperson"), idempotent((req, res, next) => {
  const reason = clean(req.body?.reason);
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: "Enter a reason of 5-500 characters." });
  const updated = structuredClone(state);
  const record = updated.leadershipChanges.find(item => item.id === req.params.id);
  if (!record) return res.status(404).json({ message: "Leadership change not found." });
  const member = updated.users.find(item => item.id === record.incomingUserId);
  if (record.status !== "confirmed" || !member || member.role !== record.role || (record.audit || []).some(item => item.action === "revoked")) {
    return res.status(409).json({ message: "This leadership role is no longer active and cannot be revoked." });
  }
  const at = now();
  const revocation = { id: newId(), type: "leadership.role.revoked", entityId: record.id, at, by: { id: req.user.id, name: req.user.name, role: req.user.role }, memberId: member.id, memberName: member.name, role: record.role, reason };
  member.role = "member";
  if (!Array.isArray(record.audit)) record.audit = [];
  record.audit.push({ action: "revoked", by: req.user.id, byRole: req.user.role, at, reason });
  updated.auditLog.push(revocation);
  return commit(req, res, next, updated, 200, { message: "Leadership role revoked.", data: record, history: revocation });
}));
app.get("/api/leadership-changes", requireAuth, requireRole("chairperson", "secretary"), (req, res) => res.json({ data: state.leadershipChanges }));
app.get("/api/audit-log", requireAuth, requirePinChanged, requireRole("chairperson", "treasurer"), (req, res) => res.json({ data: state.auditLog.slice().reverse() }));

app.use((error, req, res, next) => { console.error("Request failed:", error); if (res.headersSent) return next(error); return res.status(500).json({ message: "The server could not save this change. Check the dashboard before retrying." }); });
app.listen(PORT, () => console.log(`Jirani Chama backend running at http://localhost:${PORT}`));
