"use strict";

const crypto = require("crypto");
const fs = require("fs");
const fsPromises = require("fs/promises");
const https = require("https");
const path = require("path");
const express = require("express");
const compression = require("compression");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { parseCanonicalHttpsOrigin, httpsRedirectLocation } = require("./security/https-origin");
const { createSessionBackend } = require("./session-store");
const { resetPinAfterRevokingSessions } = require("./security/pin-recovery");
const { makeRedisClient } = require("./redis-client");
const nodemailer = require("nodemailer");
const { createWriteQueue } = require("./storage/write-queue");
const { RedisRateLimitStore } = require("./storage/redis-rate-limit-store");
const { createRenderTrustedProxyPredicate, createTrustedProxyPredicate, parseAllowedOrigins, resolveAppBindHost, validateProductionConfig } = require("./security/production-config");
const { getC2bSubscriptionConfig, isTrustedCallbackIp, parseC2bPayment } = require("./security/mpesa-c2b-subscriptions");
const { createOneTimeCodeVerifier } = require("./security/one-time-code");
const { appendJsonEmailCapture } = require("./security/email-log");
const { hasReceiptReferenceConflict, parseReceiptReference } = require("./security/receipt-references");
const { addNotifications, applyDueElections, applyScheduledElections, electionWindow, electionView, isElection, resultFor } = require("./leadership-elections");
const { connectEventClients, createEventDelivery } = require("./event-delivery");
const { loadAppEnv } = require("./config/env");
if (process.env.NODE_ENV === "test") {
  // Tests use explicit disposable storage and must not connect to services in the local .env.
  process.env.REDIS_URL = "";
  process.env.SESSION_STORE = "memory";
} else {
  loadAppEnv();
}
const {
  logger,
  latencyMiddleware,
  requestIdMiddleware,
  activeSessionsGauge,
  openSseGauge,
  wrapPgPool,
  metricsHandler,
  redisCacheHitsTotal,
  redisCacheMissesTotal,
  redisCacheHitRate,
  setOperationalMetricsProvider,
} = require("./observability");
const { acquireRuntimeLock, assertLeastPrivilegeRuntimeRole, createPostgresPool } = require("./db/postgres");
const postgresState = require("./repo/postgres-state");

// ---------------------------------------------------------------------------
// Redis pub/sub + summary cache (Phase 2)
// Two extra clients: publisher (any command) and subscriber (subscribe-only).
// A third client is used for summary cache reads/writes.
// All three are no-ops when REDIS_URL is not set (development).
// ---------------------------------------------------------------------------
const TEST_SESSION_REDIS_URL = process.env.NODE_ENV === "test" ? process.env.PIN_RECOVERY_TEST_REDIS_URL || "" : "";
if (TEST_SESSION_REDIS_URL) {
  const testRedisUrl = new URL(TEST_SESSION_REDIS_URL);
  if (testRedisUrl.protocol !== "redis:" || !["127.0.0.1", "localhost", "[::1]"].includes(testRedisUrl.hostname)) {
    throw new Error("PIN_RECOVERY_TEST_REDIS_URL must use a loopback Redis server.");
  }
}
const REDIS_URL = process.env.REDIS_URL || "";
let redisPub = null;   // publishes chama event messages
let redisSub = null;   // subscribed to chama event messages, feeds local SSE clients
let redisCache = null; // general-purpose cache (summary totals)
let redisEventsReady = false;

if (REDIS_URL) {
  redisPub   = makeRedisClient(REDIS_URL, "pub");
  redisSub   = makeRedisClient(REDIS_URL, "sub");
  redisCache = makeRedisClient(REDIS_URL, "cache");
}

const SUMMARY_CACHE_TTL_SECONDS = 10;
let summaryCacheHits = 0;
let summaryCacheMisses = 0;

function recordSummaryCacheHit() {
  summaryCacheHits += 1;
  redisCacheHitsTotal.inc();
  redisCacheHitRate.set(summaryCacheHits / (summaryCacheHits + summaryCacheMisses));
}

function recordSummaryCacheMiss() {
  summaryCacheMisses += 1;
  redisCacheMissesTotal.inc();
  redisCacheHitRate.set(summaryCacheHits / (summaryCacheHits + summaryCacheMisses));
}


function sharedRateLimit(name, options) {
  const store = redisCache && (process.env.NODE_ENV === "production" || process.env.RATE_LIMIT_STORE === "redis")
    ? new RedisRateLimitStore({ client: redisCache, prefix: `jirani:ratelimit:${name}:`, windowMs: options.windowMs })
    : undefined;
  return rateLimit({ ...options, ...(store ? { store } : {}) });
}
const setupLimiter = sharedRateLimit("setup", { windowMs: 15 * 60 * 1000, max: 10, message: { message: "Too many registrations. Please try again later." } });
const activationLimiter = sharedRateLimit("activation", { windowMs: 15 * 60 * 1000, max: 20, message: { message: "Too many activation attempts. Please try again later." } });
const pinRecoveryLimiter = sharedRateLimit("pin-recovery", { windowMs: 15 * 60 * 1000, max: 10, message: { message: "Too many PIN recovery attempts. Please try again later." } });
const loginLimiter = sharedRateLimit("login", { windowMs: 15 * 60 * 1000, max: 100, message: { message: "Too many login attempts. Please try again later." } });

const app = express();
const trustedProxyTrust = process.env.NODE_ENV === "production"
  ? process.env.TRUST_PROXY === "render"
    ? createRenderTrustedProxyPredicate()
    : createTrustedProxyPredicate(process.env.TRUSTED_PROXY_IPS)
  : null;
app.set("trust proxy", trustedProxyTrust
  ? trustedProxyTrust
  : process.env.TRUST_PROXY === "1" ? 1 : false);
const PORT = Number(process.env.PORT || 8001);
const APP_BIND_HOST = resolveAppBindHost(process.env);
const SIMULATED_PAYMENTS_ENABLED = process.env.NODE_ENV !== "production" && ["127.0.0.1", "::1", "localhost"].includes(APP_BIND_HOST);
const APP_CANONICAL_ORIGIN = parseCanonicalHttpsOrigin(process.env.APP_CANONICAL_ORIGIN);
const APP_ALLOWED_ORIGINS = new Set(parseAllowedOrigins(process.env.APP_ALLOWED_ORIGINS));
const DATA_BACKEND = process.env.DATA_BACKEND || "postgres";
if (!["json", "postgres"].includes(DATA_BACKEND)) throw new Error("DATA_BACKEND must be json or postgres.");
const postgresPool = DATA_BACKEND === "postgres" ? createPostgresPool() : null;
let postgresRuntimeLock;
const DATA_FILE = process.env.CHAMA_DATA_FILE || path.join(__dirname, "data.json");
const FRONTEND = path.join(__dirname, "..", "en public");
const PROFILE_ICON_DIR = process.env.CHAMA_PROFILE_ICON_DIR || path.join(__dirname, "uploads", "profile-icons");
const PROFILE_DETAILS_FILE = process.env.CHAMA_PROFILE_DETAILS_FILE || path.join(__dirname, "uploads", "profile-details.json");
const PROFILE_ICON_SIZES = new Set([32, 180, 192, 512]);
const ROLES = new Set(["chairperson", "secretary", "treasurer", "member"]);
const PAYMENT_TYPES = new Set(["Monthly Contribution", "Loan Repayment", "Fine"]);
const SIMULATED_PAYMENT_STATUSES = new Set(["Unverified", "Suggested", "Approved", "Unmatched", "Duplicate", "Reversed", "Rejected"]);
const LOAN_APPROVAL_ROLES = new Set(["chairperson", "secretary", "treasurer"]);
const REQUIRED_LOAN_APPROVALS = 3;
const WELFARE_MONTHLY_FEE = 500;
const LATE_CONTRIBUTION_PENALTY = 200;
const DEFAULT_DEADLINE_DAY = 5;
const LOAN_MONTHLY_RATE = 0.05;
const LOAN_LIMIT_MULTIPLE = 3;
const SUBSCRIPTION_PLANS = Object.freeze({
  basic: { label: "Basic", maxMembers: 10, monthlyAmount: 300, annualAmount: 2880, annualSavings: 720 },
  growth: { label: "Growth Chama", maxMembers: 30, monthlyAmount: 600, annualAmount: 5760, annualSavings: 1440 },
});
const SUBSCRIPTION_PAYMENTS_ENABLED = false;
const SUBSCRIPTION_PAYMENTS_PAUSED_MESSAGE = "Online subscription payments are temporarily paused. No checkout, payment request, or subscription change will be processed; existing access remains unchanged.";
const monthDateFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Africa/Nairobi" });
const eventClients = new Set();
let leadershipElectionTimer = null;
const SESSION_SECRET = process.env.SESSION_SECRET;
const sessionBackend = createSessionBackend(TEST_SESSION_REDIS_URL
  ? { redisUrl: TEST_SESSION_REDIS_URL, sessionStore: "redis" }
  : undefined);
validateProductionConfig(process.env);
const oneTimeCodeSecret = process.env.ONE_TIME_CODE_HMAC_SECRET || (process.env.NODE_ENV === "test" ? "test-only-one-time-code-hmac-key-0123456789" : "");
if (Buffer.byteLength(oneTimeCodeSecret, "utf8") < 32) throw new Error("ONE_TIME_CODE_HMAC_SECRET must be set to a dedicated value of at least 32 bytes.");
if (oneTimeCodeSecret === SESSION_SECRET) throw new Error("ONE_TIME_CODE_HMAC_SECRET must be different from SESSION_SECRET.");
const { hashCode, verifyCodeHash } = createOneTimeCodeVerifier(oneTimeCodeSecret);
const codeLifetimeMs = 24 * 60 * 60 * 1000;
const idempotencyLifetimeMs = 24 * 60 * 60 * 1000;
const idleSessionMs = 15 * 60 * 1000;
const loginLockoutMs = Number(process.env.CHAMA_LOGIN_LOCKOUT_MS) || 15 * 60 * 1000;
const loginFailureCap = Number(process.env.CHAMA_LOGIN_FAILURE_CAP) || 10000;
const loginFailures = new Map();
const idempotencyRequests = new Map();
const writeQueue = createWriteQueue();

if (!SESSION_SECRET) throw new Error("SESSION_SECRET must be set in .env.");

function clean(value) { return String(value ?? "").trim(); }
function roleName(role) { return role ? role[0].toUpperCase() + role.slice(1) : "Officer"; }
function findChamaName(chamaId) { return state.chamas.find(chama => chama.id === chamaId)?.name || "Unknown Chama"; }
function normalizePhone(value) {
  const raw = clean(value).replace(/[\s()-]/g, "");
  if (/^0[17]\d{8}$/.test(raw)) return `+254${raw.slice(1)}`;
  if (/^254[17]\d{8}$/.test(raw)) return `+${raw}`;
  if (/^\+254[17]\d{8}$/.test(raw)) return raw;
  return null;
}
function normalizeEmail(value) { return clean(value).toLowerCase(); }
function validEmail(value) { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
// ---------------------------------------------------------------------------
// Phase 2 helpers: Redis pub/sub broadcast + summary cache invalidation
// ---------------------------------------------------------------------------

// Write an SSE payload to every local client connected to this chama.
function removeSseClient(client) {
  if (!client || client.closed) return;
  client.closed = true;
  if (client.keepAlive) clearInterval(client.keepAlive);
  eventClients.delete(client);
  openSseGauge.dec();
}

function broadcastLocalSse(chamaId, ssePayload) {
  for (const client of eventClients) {
    if (client.chamaId !== chamaId) continue;
    if (client.res.destroyed || client.res.writableEnded) { removeSseClient(client); continue; }
    try { client.res.write(ssePayload); } catch { removeSseClient(client); }
  }
}

// Publish to Redis so all app instances can deliver events. Local SSE remains
// available when pub/sub is not ready or a publish fails; clients reconcile by polling.
const deliverChamaEvent = createEventDelivery({
  getPublisher: () => redisPub,
  isReady: () => redisEventsReady,
  broadcastLocal: broadcastLocalSse,
  onError: err => logger.error("Redis publish error; used local SSE fallback", { err: err.message }),
});
function broadcastToChama(chamaId, ssePayload) { deliverChamaEvent(chamaId, ssePayload); }

// Invalidate the cached dashboard summary after any write that changes totals.
function invalidateSummaryCache(chamaId) {
  if (!chamaId || !redisCache) return;
  redisCache.del(`summary:${chamaId}`)
    .catch(err => logger.error('Redis summary cache invalidation error', { err: err.message }));
}

function publishLoanUpdate(loan, chamaId = loan?.chamaId) {
  if (!chamaId) return;
  const payload = `event: loans-updated\ndata: ${JSON.stringify({ id: loan.id, at: now() })}\n\n`;
  invalidateSummaryCache(chamaId);
  broadcastToChama(chamaId, payload);
}
function validPin(pin) { return /^\d{4,12}$/.test(clean(pin)); }
function validNewPin(pin) { return /^\d{6,12}$/.test(clean(pin)); }
const invitationAttemptLimit = 5;
let activationAttemptTail = Promise.resolve();
function serializeActivationAttempt(work) {
  const previous = activationAttemptTail;
  let release;
  activationAttemptTail = new Promise(resolve => { release = resolve; });
  return previous.then(work, work).finally(release);
}
async function withActivationFileLock(work) {
  const lockFile = `${DATA_FILE}.activation.lock`;
  let handle;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    try {
      handle = await fsPromises.open(lockFile, "wx", 0o600);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  if (!handle) throw new Error("Activation verification is temporarily unavailable.");
  try { return await work(); }
  finally {
    await handle.close().catch(() => {});
    await fsPromises.unlink(lockFile).catch(() => {});
  }
}
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
function sharedLoginThrottleEnabled() { return process.env.NODE_ENV === "production"; }
function hashedThrottleKey(key) { return crypto.createHmac("sha256", SESSION_SECRET).update(key).digest("hex"); }
async function loginLocked(phoneKey, ipKey) {
  if (sharedLoginThrottleEnabled()) {
    if (!redisCache?.isOpen) throw new Error("Shared login protection is unavailable.");
    const result = await redisCache.sendCommand(["MGET", `jirani:login-failures:${hashedThrottleKey(phoneKey)}`, `jirani:login-failures:${hashedThrottleKey(ipKey)}`]);
    return result.some(value => Number(value) >= 5);
  }
  return [phoneKey, ipKey].some(key => (loginThrottleEntry(key)?.lockedUntil || 0) > Date.now());
}
async function recordLoginFailure(phoneKey, ipKey) {
  if (sharedLoginThrottleEnabled()) {
    if (!redisCache?.isOpen) throw new Error("Shared login protection is unavailable.");
    const incrementScript = "for i=1,#KEYS do local n=redis.call('INCR',KEYS[i]); if n==1 then redis.call('PEXPIRE',KEYS[i],ARGV[1]); end; end; return 1";
    await redisCache.sendCommand(["EVAL", incrementScript, "2", `jirani:login-failures:${hashedThrottleKey(phoneKey)}`, `jirani:login-failures:${hashedThrottleKey(ipKey)}`, String(loginLockoutMs)]);
    return;
  }
  const nowMs = Date.now();
  for (const [key, entry] of loginFailures) if (entry.resetAt <= nowMs) loginFailures.delete(key);
  for (const key of [phoneKey, ipKey]) {
    const previous = loginFailures.get(key);
    const failures = previous && previous.resetAt > nowMs ? previous.failures + 1 : 1;
    loginFailures.set(key, { failures, resetAt: nowMs + loginLockoutMs, lockedUntil: failures >= 5 ? nowMs + loginLockoutMs : 0 });
  }
  if (loginFailures.size > loginFailureCap) {
    const victim = [...loginFailures].find(([, entry]) => entry.lockedUntil <= nowMs);
    if (victim) {
      loginFailures.delete(victim[0]);
    } else {
      console.warn("login failure map at capacity with all entries locked", { size: loginFailures.size, cap: loginFailureCap });
    }
  }
}
async function clearLoginFailures(phoneKey, ipKey) {
  if (sharedLoginThrottleEnabled()) {
    if (!redisCache?.isOpen) throw new Error("Shared login protection is unavailable.");
    await redisCache.sendCommand(["DEL", `jirani:login-failures:${hashedThrottleKey(phoneKey)}`, `jirani:login-failures:${hashedThrottleKey(ipKey)}`]);
    return;
  }
  loginFailures.delete(phoneKey); loginFailures.delete(ipKey);
}
function newId() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function bootstrapSecretMatches(candidate, expected) {
  if (typeof expected !== "string" || !expected) return false;
  const expectedDigest = crypto.createHash("sha256").update(expected, "utf8").digest();
  const candidateDigest = crypto.createHash("sha256").update(typeof candidate === "string" ? candidate : "", "utf8").digest();
  return crypto.timingSafeEqual(expectedDigest, candidateDigest);
}
function auditEntry(type, entityId, actor, details = {}) {
  return { id: newId(), type, entityId, at: now(), by: { id: actor.id, name: actor.name, role: actor.role }, ...details };
}
function electionVoterToken(election, user) {
  return crypto.createHmac("sha256", SESSION_SECRET)
    .update(`leadership-election:${election.chamaId}:${election.id}:${user.id}`)
    .digest("hex");
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
function emptyState() { return { version: 2, chamas: [], users: [], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {}, registers: [], auditLog: [], welfareReserve: 0, penalties: [], settings: { defaultDeadlineDay: DEFAULT_DEADLINE_DAY, welfareMonthlyFee: WELFARE_MONTHLY_FEE, lateContributionPenalty: LATE_CONTRIBUTION_PENALTY, loanMonthlyRatePercent: LOAN_MONTHLY_RATE * 100, meetingDates: {} }, dividendCycles: [], messages: [] }; }
function unpaidSubscription(startedAt = now(), previous = null) {
  const starts = new Date(startedAt);
  const safeStart = Number.isNaN(starts.getTime()) ? new Date() : starts;
  const history = Array.isArray(previous?.history)
    ? previous.history.filter(item => !String(item?.type || "").startsWith("trial."))
    : [];
  if (!history.some(item => item?.type === "subscription.unpaid")) history.push({ type: "subscription.unpaid", at: safeStart.toISOString() });
  return {
    ...(previous && typeof previous === "object" ? previous : {}),
    id: previous?.id || newId(), status: "unpaid", tier: null, billing: null,
    currency: "KES", expectedAmount: null, maxMembers: null, startedAt: safeStart.toISOString(),
    endsAt: null, reference: null, verifiedAt: null, provider: null, history
  };
}
function ensureSubscriptionRecords(source) {
  for (const chama of Array.isArray(source.chamas) ? source.chamas : []) {
    if (!chama.subscription || typeof chama.subscription !== "object" || Array.isArray(chama.subscription)) {
      chama.subscription = unpaidSubscription();
    } else if (chama.subscription.status === "trial") {
      chama.subscription = unpaidSubscription(chama.subscription.startedAt || now(), chama.subscription);
    }
  }
}
function subscriptionFor(source, chamaId) {
  const chama = (source.chamas || []).find(item => item.id === chamaId);
  return chama?.subscription || null;
}
function subscriptionIsActive(subscription, at = Date.now()) {
  return !!subscription && subscription.status === "active" && Number.isFinite(Date.parse(subscription.endsAt)) && Date.parse(subscription.endsAt) > at;
}
function subscriptionView(subscription) {
  const active = subscriptionIsActive(subscription);
  const status = active ? "active" : subscription?.status === "active" ? "expired" : ["pending", "unpaid", "expired"].includes(subscription?.status) ? subscription.status : "unpaid";
  return {
    status,
    tier: subscription?.tier || null, billing: subscription?.billing || null,
    maxMembers: Number.isSafeInteger(subscription?.maxMembers) ? subscription.maxMembers : null,
    currency: subscription?.currency || "KES", expectedAmount: subscription?.expectedAmount ?? null,
    annualSavings: subscription?.annualSavings ?? null, endsAt: subscription?.endsAt || null,
    pendingPayment: subscription?.pendingPayment ? {
      reference: String(subscription.pendingPayment.reference || ""),
      tier: String(subscription.pendingPayment.tier || ""),
      billing: String(subscription.pendingPayment.billing || ""),
      amount: Number.isSafeInteger(subscription.pendingPayment.amount) ? subscription.pendingPayment.amount : null,
      currency: "KES", status: String(subscription.pendingPayment.status || "pending"),
      expiresAt: subscription.pendingPayment.expiresAt || null,
    } : null,
    paymentEnabled: false,
    renewalMessage: active ? null : "Your group is in view-only access because its subscription is unpaid or expired. Financial history remains available to view and export. Online payments are not enabled yet; contact us about a plan or renewal."
  };
}
function addSubscriptionPeriod(startAt, billing) {
  const months = billing === "annual" ? 12 : billing === "monthly" ? 1 : 0;
  const next = new Date(startAt);
  if (!months || !Number.isFinite(next.getTime())) return null;
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}
function pendingSubscriptionForPayment(source, payment, config, at = Date.now()) {
  const chamaId = config.shortcodeToChama.get(payment.shortcode);
  const chama = (source.chamas || []).find(item => item.id === chamaId);
  const subscription = chama?.subscription;
  const pending = subscription?.pendingPayment;
  const planKey = String(pending?.planKey || "").toLowerCase();
  const plan = SUBSCRIPTION_PLANS[planKey];
  const billing = pending?.billing;
  const expectedAmount = plan && billing === "annual" ? plan.annualAmount
    : plan && billing === "monthly" ? plan.monthlyAmount : null;
  if (!chama || !pending || pending.status !== "pending" || !plan
    || !Number.isFinite(Date.parse(pending.expiresAt)) || Date.parse(pending.expiresAt) <= at
    || String(pending.reference || "").toUpperCase() !== payment.reference
    || pending.currency !== "KES" || pending.tier !== plan.label
    || pending.amount !== expectedAmount || payment.amountCents !== expectedAmount * 100
    || pending.maxMembers !== plan.maxMembers) return null;
  return { chama, subscription, pending, plan };
}
function memberCapFor(source, chamaId) {
  const cap = subscriptionFor(source, chamaId)?.maxMembers;
  return Number.isSafeInteger(cap) && cap > 0 ? cap : null;
}
function settingAmount(key, fallback) {
  const raw = state.settings?.[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}
function configuredWelfareFee() { return settingAmount("welfareMonthlyFee", WELFARE_MONTHLY_FEE); }
function configuredLatePenalty() { return settingAmount("lateContributionPenalty", LATE_CONTRIBUTION_PENALTY); }
function configuredLoanMonthlyRate() {
  const raw = state.settings?.loanMonthlyRatePercent;
  if (raw === undefined || raw === null || raw === "") return LOAN_MONTHLY_RATE;
  const percent = Number(raw);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent / 100 : LOAN_MONTHLY_RATE;
}
// A month's meeting date overrides the default deadline day, which applies to every other month.
function scheduledMeetingDate(month) {
  const custom = state.settings?.meetingDates?.[month];
  return custom || `${month}-${String(state.settings?.defaultDeadlineDay || DEFAULT_DEADLINE_DAY).padStart(2, "0")}`;
}
function nairobiDate(value) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(value)); }
function todayInNairobi() { return nairobiDate(new Date()); }
function isValidCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}
function isValidContributionDate(value) { return isValidCalendarDate(value) && value <= todayInNairobi(); }
function transactionDate(item) { return item.date || nairobiDate(item.at); }
function addMonthsToDate(date, months) { const next = new Date(`${date}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + months); return next.toISOString().slice(0, 10); }
function scopeToChama(collection, chamaId, getChamaId = item => item?.chamaId) {
  if (!chamaId || !Array.isArray(collection)) return [];
  return collection.filter(item => getChamaId(item) === chamaId);
}
// Reducing balance: equal installments, interest on the remaining principal each month.
// Flat rate: interest on the full principal each month, principal in equal parts.
function repaymentSchedule(principal, months, model, startDate, monthlyRate) {
  const rows = []; let balance = principal;
  const installment = monthlyRate === 0 ? Math.round(principal / months) : Math.round(principal * monthlyRate / (1 - (1 + monthlyRate) ** -months));
  const flatInterest = Math.round(principal * monthlyRate);
  const flatPrincipal = Math.floor(principal / months);
  for (let number = 1; number <= months; number += 1) {
    const interest = model === "flat" ? flatInterest : Math.round(balance * monthlyRate);
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
    if (!Array.isArray(raw.messages)) raw.messages = [];
    if (!Array.isArray(raw.transactions)) raw.transactions = [];
    if (!Array.isArray(raw.chamas)) raw.chamas = [];
    const tenantCollections = ["users", "transactions", "loans", "payouts", "invitations", "leadershipChanges", "registers", "dividendCycles", "messages", "penalties"];
    for (const key of tenantCollections) if (!Array.isArray(raw[key])) raw[key] = [];
    const hasLegacyRecords = tenantCollections.some(key => raw[key].length > 0);
    let legacyChama = raw.chamas.find(chama => chama?.id);
    if (!legacyChama && hasLegacyRecords) {
      legacyChama = { id: newId(), name: "Jirani Chama", createdAt: now() };
      raw.chamas.push(legacyChama);
    }
    if (legacyChama) {
      for (const key of tenantCollections) {
        for (const record of raw[key]) if (!record.chamaId) record.chamaId = legacyChama.id;
      }
    }
    ensureSubscriptionRecords(raw);
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
let state = DATA_BACKEND === "json" ? loadState() : emptyState();
setOperationalMetricsProvider(() => {
  let callbackQueueDepth = 0;
  let oldestReceivedAt = null;
  for (const callback of Array.isArray(state.pendingMpesas) ? state.pendingMpesas : []) {
    if (!callback || callback.processed === true || callback.simulated === true) continue;
    callbackQueueDepth += 1;
    const receivedAt = Date.parse(callback.receivedAt);
    if (Number.isFinite(receivedAt) && (oldestReceivedAt === null || receivedAt < oldestReceivedAt)) {
      oldestReceivedAt = receivedAt;
    }
  }
  return {
    mpesaCallbackQueueDepth: callbackQueueDepth,
    mpesaCallbackOldestUnprocessedSeconds: oldestReceivedAt === null ? 0 : Math.max(0, (Date.now() - oldestReceivedAt) / 1000),
    writeQueueLength: writeQueue.getLength(),
  };
});
fs.mkdirSync(PROFILE_ICON_DIR, { recursive: true, mode: 0o700 });
function loadProfileDetails() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PROFILE_DETAILS_FILE, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}
let profileDetails = loadProfileDetails();
function persistProfileDetails(next) {
  return writeQueue.writeFile(PROFILE_DETAILS_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
    .then(() => { profileDetails = next; });
}
async function persist(next = state) {
  if (DATA_BACKEND === "postgres") {
    if (!postgresPool) throw new Error("DATABASE_URL must be set for DATA_BACKEND=postgres.");
    postgresRuntimeLock?.assertHeld();
    await postgresState.saveState(postgresPool, next);
    if (process.env.NODE_ENV === "test" && Object.hasOwn(process.env, "CHAMA_DATA_FILE")) {
      await writeQueue.writeFile(DATA_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    }
    state = next;
    return;
  }
  await writeQueue.writeFile(DATA_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  state = next;
}
let startupPersistence;
function initializeStorage() {
  if (!startupPersistence) {
    startupPersistence = (async () => {
      if (!fs.existsSync(PROFILE_DETAILS_FILE)) await persistProfileDetails(profileDetails);
      if (DATA_BACKEND === "postgres") {
        if (!postgresPool) throw new Error("DATABASE_URL must be set for DATA_BACKEND=postgres.");
        await assertLeastPrivilegeRuntimeRole(postgresPool);
        postgresRuntimeLock = await acquireRuntimeLock(postgresPool);
        if (process.env.NODE_ENV === "test" && Object.hasOwn(process.env, "CHAMA_DATA_FILE")) {
          state = loadState();
          await postgresState.saveState(postgresPool, state);
          await writeQueue.writeFile(DATA_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
        } else {
          state = migrate(await postgresState.loadState(postgresPool));
        }
        return;
      }
      await persist(state);
    })();
  }
  return startupPersistence;
}

function currentBalance(source = state, chamaId) {
  const transactions = scopeToChama(source.transactions, chamaId);
  const loans = scopeToChama(source.loans, chamaId);
  const income = transactions.filter(transaction => transaction.status !== "pending-member").reduce((sum, transaction) => sum + transaction.amount, 0);
  const lent = loans.filter(loan => loan.status === "approved" || loan.status === "repaid").reduce((sum, loan) => sum + loan.amount, 0);
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
function requirePinChanged(req, res, next) { return req.user.mustChangePin ? res.status(403).json({ message: "Change your temporary PIN before making any records.", mustChangePin: true }) : next(); }
function requireActiveSubscription(req, res, next) {
  const subscription = subscriptionFor(state, req.user.chamaId);
  if (subscriptionIsActive(subscription)) return next();
  return res.status(402).json({
    message: "This chama is in view-only access because its subscription is unpaid or expired. Renew to create new records.",
    subscription: subscriptionView(subscription)
  });
}
function protectWriteRequest(req, res, next) {
  const callbackPath = req.originalUrl.split("?")[0];
  if (req.method === "POST" && ["/api/mpesa/c2b/validation", "/api/mpesa/c2b/confirmation"].includes(callbackPath)) return next();
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-Requested-With") !== "chama") return res.status(400).json({ message: "Missing required request header." });
  const origin = req.get("Origin");
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      const strictOrigin = process.env.NODE_ENV === "production" || process.env.FORCE_HTTPS_REDIRECT === "1";
      if (strictOrigin ? parsedOrigin.protocol !== "https:" || !APP_ALLOWED_ORIGINS.has(parsedOrigin.origin) : parsedOrigin.host !== req.get("host")) return res.status(403).json({ message: "Cross-site request blocked." });
    }
    catch { return res.status(403).json({ message: "Invalid request origin." }); }
  }
  return next();
}
let writeRequestTail = Promise.resolve();
async function withSerializedWrite(task) {
  const previous = writeRequestTail;
  let release;
  writeRequestTail = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await task(); }
  finally { release(); }
}
function serializeWriteRequests(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const previous = writeRequestTail;
  let release;
  writeRequestTail = new Promise(resolve => { release = resolve; });
  previous.then(() => {
    let released = false;
    const unlock = () => {
      if (released) return;
      released = true;
      release();
    };
    const end = res.end;
    res.end = function (...args) {
      this.end = end;
      try { return end.apply(this, args); }
      finally { unlock(); }
    };
    res.once("finish", unlock);
    res.once("close", () => { if (res.writableEnded) unlock(); });
    next();
  }).catch(next);
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
async function commit(req, res, next, updated, status, body, storedBody = body, afterPersist) {
  updated.idempotency[req.idempotency.key] = { fingerprint: req.idempotency.fingerprint, status, body: storedBody };
  try { await persist(updated); afterPersist?.(); return res.status(status).json(body); }
  catch (error) {
    const isReceiptReferenceConflict = error?.code === "23505" && [
      "financial_reference_reservations_pkey",
      "tenant_mpesa_callbacks_receipt_number_unique",
    ].includes(error?.constraint);
    if (isReceiptReferenceConflict) {
      return res.status(409).json({ message: "That receipt reference has already been used in this chama." });
    }
    return next(error);
  }
}
async function processDueLeadershipElections() {
  return withSerializedWrite(async () => {
    const updated = structuredClone(state);
    const completed = [...applyDueElections(updated), ...applyScheduledElections(updated)];
    if (!completed.length) return 0;
    await persist(updated);
    for (const chamaId of new Set(completed.map(item => item.chamaId))) publishMemberUpdate(chamaId);
    return completed.length;
  });
}
function scheduleLeadershipElectionCheck(retryDelayMs) {
  if (leadershipElectionTimer) clearTimeout(leadershipElectionTimer);
  const nextAt = Math.min(...state.leadershipChanges.filter(isElection).flatMap(item => {
    if (item.status === "verified" && Number.isFinite(Date.parse(item.activationAt))) return [Date.parse(item.activationAt)];
    const window = electionWindow(item.scheduledDate);
    if (!window) return [];
    if (item.status === "scheduled") return [window.start, window.end];
    if (item.status === "voting") return [window.end];
    return [];
  }));
  if (!Number.isFinite(nextAt)) { leadershipElectionTimer = null; return; }
  const delay = Number.isFinite(retryDelayMs) ? retryDelayMs : Math.max(0, Math.min(2147483647, nextAt - Date.now()));
  leadershipElectionTimer = setTimeout(async () => {
    leadershipElectionTimer = null;
    try {
      await processDueLeadershipElections();
      scheduleLeadershipElectionCheck();
    } catch (error) {
      logger.warn("Leadership election scheduler failed", { err: error.message });
      scheduleLeadershipElectionCheck(5000);
    }
  }, delay);
  leadershipElectionTimer.unref?.();
}
function publishMessageUpdate(message, chamaId = message?.chamaId) {
  if (!chamaId) return;
  const payload = `event: messages-updated\ndata: ${JSON.stringify({ id: message.id, at: message.at })}\n\n`;
  broadcastToChama(chamaId, payload);
}
function publishMemberUpdate(chamaId) {
  if (!chamaId) return;
  invalidateSummaryCache(chamaId);
  const payload = `event: members-updated\ndata: ${JSON.stringify({ at: now() })}\n\n`;
  broadcastToChama(chamaId, payload);
}
function publishFinancialUpdate(chamaId) {
  if (!chamaId) return;
  const payload = `event: profile-updated\ndata: ${JSON.stringify({ at: now() })}\n\n`;
  invalidateSummaryCache(chamaId);
  broadcastToChama(chamaId, payload);
}
function monthKey(iso) { return monthDateFormatter.format(new Date(iso)); }
function financialTrendMonths(timestamp = now(), count = 6) {
  const [year, month] = monthKey(timestamp).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
function loanIsPending(loan) { return ["pending", "Requested", "Waiting for decisions"].includes(loan.status); }
function invitationRevocation(invitation, source = state) {
  return source.auditLog.slice().reverse().find(item => item.type === "invitation.revoked" && item.entityId === invitation.id) || null;
}
function loanApprovalRoles(loan, source = state) {
  const requester = scopeToChama(source.users, loan.chamaId).find(item => item.id === loan.memberId);
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
function permissionsFor(user, usersInChama = scopeToChama(state.users, user.chamaId)) {
  const chamaId = user.chamaId;
  const anotherOfficer = usersInChama.some(item => item.status === "active" && item.id !== user.id && ["chairperson", "secretary", "treasurer"].includes(item.role));
  const pendingLeaderRoles = new Set(scopeToChama(state.invitations, chamaId).filter(item => ["secretary", "treasurer"].includes(item.requestedRole) && !item.usedAt && !invitationRevocation(item) && Date.parse(item.expiresAt) > Date.now()).map(item => item.requestedRole));
  const activeLeaderRoles = new Set(usersInChama.filter(item => item.status === "active" && item.id !== user.id && ["secretary", "treasurer"].includes(item.role)).map(item => item.role));
  const priorLeadershipRoles = new Set(scopeToChama(state.leadershipChanges, chamaId).filter(item => item.type === "appointment").map(item => item.role));
  const priorLeadershipChange = priorLeadershipRoles.size > 0;
  const directInviteLeader = user.role === "chairperson" && ["secretary", "treasurer"].some(role => !pendingLeaderRoles.has(role) && !activeLeaderRoles.has(role) && !priorLeadershipRoles.has(role));
  return {
    manageMembers: ["chairperson", "secretary"].includes(user.role),
    manageLeadership: ["chairperson", "secretary"].includes(user.role),
    proposeLeadership: user.role === "chairperson",
    bootstrapLeadership: user.role === "chairperson" && !anotherOfficer && !priorLeadershipChange,
    proposeLeadershipElection: ["chairperson", "secretary"].includes(user.role),
    acceptLeadershipElection: user.role === "chairperson",
    closeLeadershipElection: user.role === "chairperson",
    verifyLeadershipElection: user.role === "chairperson",
    revokeInvitations: user.role === "chairperson",
    revokeLeadershipRoles: user.role === "chairperson",
    recordPayments: user.role === "treasurer",
    viewAuditLog: ["chairperson", "treasurer"].includes(user.role),
    assessPenalties: ["chairperson", "secretary"].includes(user.role),
    manageDividends: ["chairperson", "treasurer"].includes(user.role),
    directInviteLeader,
    simulatePayments: user.role === "treasurer" && SIMULATED_PAYMENTS_ENABLED,
    decideLoans: LOAN_APPROVAL_ROLES.has(user.role),
    requestLoans: true,
  };
}
function dashboardFor(user) {
  const chamaId = user.chamaId;
  const officers = user.role !== "member";
  const usersInChama = scopeToChama(state.users, chamaId);
  const transactions = officers
    ? scopeToChama(state.transactions, chamaId)
    : scopeToChama(state.transactions, chamaId).filter(t => t.memberId === user.id);
  const loans = officers
    ? scopeToChama(state.loans, chamaId)
    : scopeToChama(state.loans, chamaId).filter(l => l.memberId === user.id);
  const approvalQueue = scopeToChama(state.loans, chamaId).filter(
    item =>
      loanIsPending(item) &&
      item.memberId !== user.id &&
      loanApprovalRoles(item).includes(user.role) &&
      !(Array.isArray(item.approvals) ? item.approvals : []).some(a => a.role === user.role)
  );
  const month = monthKey(now());
  const activeUsers = usersInChama.filter(i => i.status === "active");
  const currentMonth = transactions.filter(
    i => i.status !== "pending-member" && monthKey(i.at) === month
  );
  const approved = loans.filter(i => i.status === "approved");

  return {
    user: safeUser(user),
    subscription: subscriptionView(subscriptionFor(state, chamaId)),
    permissions: permissionsFor(user, usersInChama),
    summary: {
      balance: officers ? currentBalance(state, chamaId) : null,
      contributions: currentMonth
        .filter(i => i.paymentType === "Monthly Contribution")
        .reduce((s, i) => s + i.amount, 0),
      outstanding: approved.reduce((s, i) => s + i.outstanding, 0),
      memberCount: officers ? activeUsers.length : 1,
    },
    members: officers
      ? usersInChama.map(m => safeUser(m, ["chairperson", "secretary"].includes(user.role)))
      : [safeUser(user)],
    transactions: transactions.slice().sort((a, b) => b.at.localeCompare(a.at)),
    loans: loans.map(l => loanApprovalView(l, user)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    approvalQueue: approvalQueue.map(l => loanApprovalView(l, user)),
    payouts: scopeToChama(state.payouts, chamaId),
    pendingLoans: officers
      ? scopeToChama(state.loans, chamaId)
          .filter(loanIsPending)
          .map(l => loanApprovalView(l, user))
      : [],
    invitations: ["chairperson", "secretary"].includes(user.role)
      ? scopeToChama(state.invitations, chamaId)
          .map(invitation => {
            const { codeHash, usedCodeHash, ...item } = invitation;
            return { ...item, revocation: invitationRevocation(invitation) };
          })
      : [],
    leadershipChanges: ["chairperson", "secretary"].includes(user.role)
      ? scopeToChama(state.leadershipChanges, chamaId).filter(change => !isElection(change))
      : [],
    leadershipElections: scopeToChama(state.leadershipChanges, chamaId)
      .filter(isElection)
      .map(election => electionView(election, user, usersInChama, electionVoterToken(election, user))),
    notifications: scopeToChama(state.messages, chamaId, item => item.recipientId ? item.chamaId : null)
      .filter(item => item.type === "notification" && item.recipientId === user.id)
      .slice(-50)
      .map(item => ({ id: item.id, at: item.at, text: item.text })),
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
const CONTACT_RECIPIENT = "09elim3@gmail.com";
function emailConfigured() {
  if (process.env.SMTP_TRANSPORT === "json") return process.env.NODE_ENV === "test" || process.env.NODE_ENV !== "production" && !!clean(process.env.SMTP_LOG_FILE);
  const host = clean(process.env.SMTP_HOST);
  const user = clean(process.env.SMTP_USER);
  const pass = clean(process.env.SMTP_PASS);
  return !!host && !!user && !!pass;
}
let _emailTransporter = null;
function getEmailTransporter() {
  if (_emailTransporter) return _emailTransporter;
  if (process.env.SMTP_TRANSPORT === "json") {
    _emailTransporter = nodemailer.createTransport({ jsonTransport: true });
    return _emailTransporter;
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  _emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _emailTransporter;
}
async function sendEmail(to, subject, text, options = {}) {
  if (!emailConfigured()) throw new Error("Email delivery is not configured.");
  if (!to || !validEmail(to)) throw new Error("Invalid recipient email address.");
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const replyTo = options.replyTo;
  if (replyTo && !validEmail(replyTo)) throw new Error("Invalid reply-to email address.");
  return getEmailTransporter().sendMail({ from, to, subject, text, ...(replyTo ? { replyTo } : {}) });
}
app.disable("x-powered-by");
app.use(requestIdMiddleware);
app.use(compression());
// A HEAD request has no body to compress, but report the same selected encoding as GET.
app.use((req, res, next) => {
  if (req.method === "HEAD" && ["/", "/index.html"].includes(req.path) && req.acceptsEncodings("gzip") === "gzip") {
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      this.setHeader("Content-Encoding", "gzip");
      this.removeHeader("Content-Length");
      this.vary("Accept-Encoding");
      this.writeHead = writeHead;
      return writeHead.apply(this, args);
    };
  }
  return next();
});
// Observability: record request latency + errors for every request.
app.use(latencyMiddleware);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  return next();
});
// Prometheus metrics endpoint (scrape with: prometheus.io/scrape: "true").
// Restrict to localhost in production via nginx or a firewall rule.
function metricsAuthorized(req) {
  if (process.env.NODE_ENV !== "production" && process.env.FORCE_METRICS_AUTH !== "1") return true;
  const expected = Buffer.from(process.env.METRICS_BEARER_TOKEN || "");
  const supplied = Buffer.from((req.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  return expected.length >= 32 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
app.get("/metrics", (req, res) => metricsAuthorized(req) ? metricsHandler(req, res) : res.status(404).end());
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'");
  if (req.secure && (process.env.NODE_ENV === "production" || process.env.FORCE_HTTPS_REDIRECT === "1")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  else if (["/", "/index.html", "/chama.js", "/chama.css", "/i18n.js", "/write-requests.js"].includes(req.path) || /^\/profile[^/]*\.(?:js|html)$/.test(req.path)) {
    const version = req.query.v;
    const hasVersion = typeof version === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(version);
    res.setHeader("Cache-Control", hasVersion ? "public, max-age=31536000, immutable" : "no-store");
  }
  if ((process.env.NODE_ENV === "production" || process.env.FORCE_HTTPS_REDIRECT === "1") && !req.secure) {
    const location = httpsRedirectLocation(APP_CANONICAL_ORIGIN, req.originalUrl);
    if (!location) return res.status(400).send("HTTPS is required. Configure APP_CANONICAL_ORIGIN to enable redirects.");
    return res.redirect(301, location);
  }
  return next();
});
app.use(express.json({ limit: "32kb" }));
const sessionOptions = { name: "chama.sid", secret: SESSION_SECRET, resave: false, saveUninitialized: false, rolling: true, cookie: { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" || process.env.FORCE_SECURE_COOKIE === "1", maxAge: idleSessionMs } };
if (sessionBackend.store) sessionOptions.store = sessionBackend.store;
app.use(session(sessionOptions));
app.use("/api", protectWriteRequest);
app.use("/api", serializeWriteRequests);
app.post("/api/contact", sharedRateLimit("contact", {
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many messages were sent. Please try again later." },
}), async (req, res) => {
  const raw = req.body || {};
  if ([raw.name, raw.email, raw.subject, raw.message].some(value => typeof value !== "string")) {
    return res.status(400).json({ message: "Please review the required fields and try again." });
  }
  const name = clean(raw.name);
  const email = normalizeEmail(raw.email);
  const subject = clean(raw.subject);
  const message = clean(raw.message).replace(/\r\n?/g, "\n");
  const headerControl = /[\u0000-\u001f\u007f]/;
  const messageControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
  if (!name || name.length > 100 || headerControl.test(name)
    || !validEmail(email) || email.length > 254 || /[\r\n]/.test(email)
    || !subject || subject.length > 120 || headerControl.test(subject)
    || message.length < 10 || message.length > 3000 || messageControl.test(message)) {
    return res.status(400).json({ message: "Please review the required fields and try again." });
  }
  if (!emailConfigured() || (process.env.SMTP_TRANSPORT === "json" && process.env.NODE_ENV !== "test")) {
    return res.status(503).json({ message: "Email delivery is temporarily unavailable. Please try again later or email us directly." });
  }
  const text = `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`;
  try {
    const info = await sendEmail(CONTACT_RECIPIENT, `Website contact: ${subject}`, text, { replyTo: email });
    if (process.env.NODE_ENV === "test" && process.env.SMTP_TRANSPORT === "json" && info?.message && process.env.SMTP_LOG_FILE) {
      appendJsonEmailCapture(process.env.SMTP_LOG_FILE, info.message);
    }
    return res.json({ message: "Your message has been sent." });
  } catch (error) {
    // Log protocol error identifiers only; never log SMTP responses or credentials.
    const details = {};
    if (typeof error?.code === "string" && /^[A-Z][A-Z0-9_]{0,31}$/i.test(error.code)) details.code = error.code;
    if (Number.isInteger(error?.responseCode)) details.responseCode = error.responseCode;
    if (typeof error?.command === "string" && /^[A-Z ]{1,20}$/i.test(error.command)) details.command = error.command;
    logger.warn("Contact email delivery failed.", details);
    return res.status(502).json({ message: "Email delivery is temporarily unavailable. Please try again later or email us directly." });
  }
});
function profileIconPath(userId, size) { return path.join(PROFILE_ICON_DIR, `${userId}-${size}.png`); }
function profileNameParts(name) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}
function profileView(user) {
  const saved = profileDetails[user.id] || {};
  const fallback = profileNameParts(user.name);
  return { firstName: saved.firstName || fallback.firstName, lastName: saved.lastName || fallback.lastName, nickname: saved.nickname || "", phone: user.phone, email: user.email };
}
function chatDisplayName(user) {
  return clean(profileDetails[user.id]?.nickname) || user.name;
}
function profileSummaryFor(user) {
  const transactions = scopeToChama(state.transactions, user.chamaId)
    .filter(item => item.memberId === user.id)
    .sort((left, right) => String(right.at).localeCompare(String(left.at)));
  const fines = scopeToChama(state.penalties, user.chamaId)
    .filter(item => item.memberId === user.id)
    .sort((left, right) => String(right.at).localeCompare(String(left.at)));
  const loans = scopeToChama(state.loans, user.chamaId)
    .filter(item => item.memberId === user.id)
    .map(item => loanApprovalView(item, user))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  return {
    contributions: transactions.filter(item => item.paymentType === "Monthly Contribution"),
    fines,
    loans: {
      ongoing: loans.filter(item => !["repaid", "rejected"].includes(item.status)),
      fullyPaid: loans.filter(item => item.status === "repaid"),
    },
  };
}
app.get("/api/profile", requireAuth, requirePinChanged, (req, res) => res.json({ data: profileView(req.user) }));
app.get("/api/profile/summary", requireAuth, requirePinChanged, (req, res) => res.json({ data: profileSummaryFor(req.user) }));
app.put("/api/profile", requireAuth, requirePinChanged, idempotent(async (req, res, next) => {
  const firstName = clean(req.body?.firstName); const lastName = clean(req.body?.lastName); const nickname = clean(req.body?.nickname);
  const phone = normalizePhone(req.body?.phone); const email = normalizeEmail(req.body?.email);
  if (!firstName || firstName.length > 50 || !lastName || lastName.length > 50 || nickname.length > 50 || !phone || !validEmail(email)) {
    return res.status(400).json({ message: "Enter a first name, last name, valid Kenyan phone number, and valid email address. Nickname is optional." });
  }
  const sameChamaUsers = scopeToChama(state.users, req.user.chamaId).filter(user => user.id !== req.user.id && user.status === "active");
  if (sameChamaUsers.some(user => user.phone === phone)) return res.status(409).json({ message: "That phone number is already used by another member in this chama." });
  if (sameChamaUsers.some(user => normalizeEmail(user.email) === email)) return res.status(409).json({ message: "That email address is already used by another member in this chama." });
  const updated = structuredClone(state); const user = updated.users.find(item => item.id === req.user.id);
  user.name = `${firstName} ${lastName}`; user.phone = phone; user.email = email;
  const updatedProfiles = structuredClone(profileDetails); updatedProfiles[user.id] = { firstName, lastName, nickname };
  try { await persistProfileDetails(updatedProfiles); } catch (error) { return next(error); }
  return commit(req, res, next, updated, 200, { message: "Profile details saved.", data: profileView(user) });
}));
function validPng(buffer, expectedSize) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false;
  return buffer.readUInt32BE(12) === 0x49484452 && buffer.readUInt32BE(16) === expectedSize && buffer.readUInt32BE(20) === expectedSize;
}
app.get("/api/profile/photo/:size", requireAuth, requirePinChanged, async (req, res, next) => {
  const size = Number(req.params.size);
  if (!PROFILE_ICON_SIZES.has(size)) return res.status(400).json({ message: "Choose a supported icon size." });
  const file = profileIconPath(req.user.id, size);
  try { await fs.promises.access(file); }
  catch (error) {
    if (["ENOENT", "EACCES", "EPERM"].includes(error.code)) return res.status(404).json({ message: "No profile photo has been uploaded yet." });
    return next(error);
  }
  return res.sendFile(file, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
});
app.post("/api/profile/photo/:size", requireAuth, requirePinChanged, express.raw({ type: "image/png", limit: "2mb" }), async (req, res) => {
  const size = Number(req.params.size);
  if (!PROFILE_ICON_SIZES.has(size)) return res.status(400).json({ message: "Choose a supported icon size." });
  if (!validPng(req.body, size)) return res.status(400).json({ message: `Upload a valid ${size}×${size} PNG icon.` });
  const file = profileIconPath(req.user.id, size);
  try {
    await writeQueue.writeFile(file, req.body, { mode: 0o600 });
  } catch {
    return res.status(500).json({ message: "The profile photo could not be saved." });
  }
  return res.status(201).json({ message: "Profile photo saved.", size, path: `/api/profile/photo/${size}` });
});
app.get("/manifest.webmanifest", (req, res) => {
  res.type("application/manifest+json").json({
    name: "Jirani Chama", short_name: "Jirani Chama", start_url: "/", display: "standalone",
    icons: [{ src: "/brand-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
  });
});
app.use(express.static(FRONTEND));
app.get("/", (req, res) => res.sendFile(path.join(FRONTEND, "index.html")));
app.get("/api/health/live", (_req, res) => res.json({ status: "ok" }));
app.get(["/api/health", "/api/health/ready"], async (req, res) => {
  const dependencies = { postgres: DATA_BACKEND === "postgres" ? "unavailable" : "not_required", redis: sessionBackend.usingRedis ? "unavailable" : "not_required" };
  try {
    if (DATA_BACKEND === "postgres") {
      if (!postgresPool || !postgresRuntimeLock) throw new Error("PostgreSQL is not initialized.");
      postgresRuntimeLock.assertHeld();
      await postgresPool.query("SELECT 1");
      dependencies.postgres = "ready";
    }
    if (sessionBackend.usingRedis) {
      await sessionBackend.ping();
    }
    const redisClients = [redisPub, redisSub, redisCache].filter(Boolean);
    for (const client of redisClients) {
      if (!client.isOpen) throw new Error("Redis application client is disconnected.");
      await client.ping();
    }
    if (sessionBackend.usingRedis || redisClients.length) dependencies.redis = "ready";
  } catch {
    return res.status(503).json({ status: "unavailable", dependencies });
  }
  return res.json({ status: "ok" });
});
app.get("/api/setup/status", (req, res) => res.json({ requiresSetup: state.users.length === 0 }));
app.get("/api/session", (req, res) => {
  const user = req.session?.userId && state.users.find(item => item.id === req.session.userId && item.status === "active");
  res.json({ authenticated: !!user });
});
app.get("/api/bootstrap", async (req, res, next) => {
  const lastActivityAt = Number(req.session?.lastActivityAt);
  const sessionIsActive = req.session?.userId && Number.isFinite(lastActivityAt) && Date.now() - lastActivityAt < idleSessionMs;
  const user = sessionIsActive && state.users.find(item => item.id === req.session.userId && item.status === "active");
  const sessionData = { authenticated: !!user };
  let summary = null;
  if (user) {
    sessionData.user = safeUser(user);
    sessionData.permissions = permissionsFor(user);
    if (!user.mustChangePin) {
      try { summary = await summaryFor(user); }
      catch (error) { return next(error); }
    }
  }
  return res.json({ session: sessionData, health: { status: "ok" }, summary });
});
app.get("/api/setup", (req, res) => { res.json({ open: state.users.length === 0 && state.chamas.length === 0 }); });
app.post("/api/setup", setupLimiter, async (req, res, next) => {
  if (state.users.length > 0 || state.chamas.length > 0) return res.status(409).json({ message: "Initial setup has already been completed." });
  const bootstrapSecret = process.env.SETUP_BOOTSTRAP_SECRET;
  if (bootstrapSecret && !bootstrapSecretMatches(req.get("X-Setup-Bootstrap-Secret"), bootstrapSecret)) return res.status(403).json({ message: "An operator bootstrap code is required for initial setup." });
  const chamaName = clean(req.body?.chamaName);
  const name = clean(req.body?.name);
  const phone = normalizePhone(req.body?.phone);
  const email = normalizeEmail(req.body?.email);
  const pin = clean(req.body?.pin);
  const parseSetting = (key, fallback) => {
    const value = req.body?.[key];
    if (value === undefined) return fallback;
    if (typeof value !== "number" && typeof value !== "string") return Number.NaN;
    if (typeof value === "string" && !value.trim()) return Number.NaN;
    return Number(value);
  };
  const deadlineDay = parseSetting("deadlineDay", DEFAULT_DEADLINE_DAY);
  const welfareMonthlyFee = parseSetting("welfareMonthlyFee", WELFARE_MONTHLY_FEE);
  const lateContributionPenalty = parseSetting("lateContributionPenalty", LATE_CONTRIBUTION_PENALTY);
  const loanMonthlyRatePercent = parseSetting("loanMonthlyRatePercent", LOAN_MONTHLY_RATE * 100);
  if (!chamaName || chamaName.length > 100 || !name || name.length > 100 || !phone || !validEmail(email) || !validNewPin(pin)) return res.status(400).json({ message: "Enter the chama name, your name, a valid email address, a valid Kenyan phone number, and a 6-12 digit PIN." });
  if (!Number.isInteger(deadlineDay) || deadlineDay < 1 || deadlineDay > 28) return res.status(400).json({ message: "Choose a monthly contribution deadline from day 1 to day 28." });
  if (!Number.isSafeInteger(welfareMonthlyFee) || welfareMonthlyFee < 0 || !Number.isSafeInteger(lateContributionPenalty) || lateContributionPenalty < 0 || !Number.isFinite(loanMonthlyRatePercent) || loanMonthlyRatePercent < 0 || loanMonthlyRatePercent > 100) return res.status(400).json({ message: "Enter whole non-negative KES amounts and a monthly loan rate from 0% to 100%." });
  const updated = structuredClone(state);
  const chamaId = newId();
  if (!Array.isArray(updated.chamas)) updated.chamas = [];
  if (!updated.settings || typeof updated.settings !== "object") updated.settings = { defaultDeadlineDay: DEFAULT_DEADLINE_DAY, meetingDates: {} };
  updated.settings.defaultDeadlineDay = deadlineDay;
  updated.settings.welfareMonthlyFee = welfareMonthlyFee;
  updated.settings.lateContributionPenalty = lateContributionPenalty;
  updated.settings.loanMonthlyRatePercent = loanMonthlyRatePercent;
  updated.chamas.push({ id: chamaId, name: chamaName, createdAt: now(), subscription: unpaidSubscription(now()) });
  const user = { id: newId(), name, phone, email, role: "chairperson", status: "active", pinHash: pinHash(pin), mustChangePin: false, createdAt: now(), chamaId };
  updated.users.push(user);
  try { await persist(updated); } catch (error) { return next(error); }
  req.session.regenerate(error => {
    if (error) return next(error);
    req.session.userId = user.id;
    req.session.lastActivityAt = Date.now();
    req.session.save(saveError => saveError ? next(saveError) : res.status(201).json({ message: "Your chairperson account is ready.", user: safeUser(user) }));
  });
});

app.post("/api/login", loginLimiter, async (req, res, next) => {
  const phoneInput = clean(req.body?.phone); const phone = normalizePhone(phoneInput); const phoneKey = `phone:${phone || phoneInput}`; const ipKey = `ip:${req.ip}`;
  if (await loginLocked(phoneKey, ipKey)) return res.status(429).json({ message: "Too many login attempts. Try again in 15 minutes." });
  const pin = clean(req.body?.pin); const requestedChamaId = clean(req.body?.chamaId);
  const user = phone && state.users.find(item => item.phone === phone && item.status === "active" && (!requestedChamaId || item.chamaId === requestedChamaId));
  if (!user || !verifyPin(pin, user.pinHash)) { await recordLoginFailure(phoneKey, ipKey); return res.status(401).json({ message: "Incorrect phone number or PIN." }); }
  await clearLoginFailures(phoneKey, ipKey);
  const userChamaAccounts = state.users.filter(item => item.phone === phone && item.status === "active");
  if (userChamaAccounts.length > 1 && !requestedChamaId) {
    return res.status(200).json({ message: "Pick a chama to enter.", chooseChamaId: userChamaAccounts.map(account => ({ chamaId: account.chamaId, name: findChamaName(account.chamaId) })) });
  }
  await markLegacyPinForChange(user, pin);
  req.session.regenerate(error => { if (error) return next(error); req.session.userId = user.id; req.session.lastActivityAt = Date.now(); req.session.save(saveError => { if (saveError) return next(saveError); activeSessionsGauge.inc(); return res.json({ message: "Signed in successfully.", user: safeUser(user) }); }); });
});
const PIN_RESET_TTL_MS = process.env.NODE_ENV === "test" && Number.isSafeInteger(Number(process.env.PIN_RESET_TTL_MS)) && Number(process.env.PIN_RESET_TTL_MS) > 0
  ? Number(process.env.PIN_RESET_TTL_MS)
  : 10 * 60 * 1000;
const PIN_RESET_RESPONSE = { message: "If an active account uses this email address, a PIN reset code may be sent." };
function pinResetDestinationKey(req) {
  const email = normalizeEmail(req.body?.email);
  if (!validEmail(email)) return `ip:${ipKeyGenerator(req.ip)}`;
  return `email:${crypto.createHmac("sha256", SESSION_SECRET).update(email).digest("hex")}`;
}
const pinResetSendCooldown = sharedRateLimit("pin-reset-send-cooldown", {
  windowMs: 60 * 1000,
  max: 1,
  keyGenerator: pinResetDestinationKey,
  message: PIN_RESET_RESPONSE,
});
const pinResetSendDailyLimit = sharedRateLimit("pin-reset-send-daily", {
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  keyGenerator: pinResetDestinationKey,
  message: PIN_RESET_RESPONSE,
});
const pinResetVerifyLimiter = sharedRateLimit("pin-reset-verify", {
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many PIN reset attempts. Please try again later." },
});
function saveSession(session) {
  return new Promise((resolve, reject) => session.save(error => error ? reject(error) : resolve()));
}
async function markLegacyPinForChange(user, pin) {
  if (pin.length >= 6 || user.mustChangePin) return;
  const updated = structuredClone(state);
  const saved = updated.users.find(item => item.id === user.id && item.status === "active");
  if (!saved) throw new Error("The account is no longer active.");
  saved.mustChangePin = true;
  await persist(updated);
  user.mustChangePin = true;
}
app.post("/api/forgot-pin", pinRecoveryLimiter, pinResetSendCooldown, pinResetSendDailyLimit, async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const account = validEmail(email) && state.users.find(item => item.status === "active" && normalizeEmail(item.email) === email);
  if (!account || !emailConfigured()) return res.json(PIN_RESET_RESPONSE);
  const code = String(crypto.randomInt(100000, 1000000));
  req.session.pinResetHash = hashCode(code);
  req.session.pinResetAccountId = account.id;
  req.session.pinResetExpiresAt = Date.now() + PIN_RESET_TTL_MS;
  try {
    await saveSession(req.session);
    const info = await sendEmail(account.email, "Jirani Chama PIN Reset Code", `Your Jirani Chama PIN reset code is ${code}. It expires in 10 minutes. Do not share it.`);
    if (process.env.SMTP_TRANSPORT === "json" && info?.message && process.env.SMTP_LOG_FILE) {
      appendJsonEmailCapture(process.env.SMTP_LOG_FILE, info.message);
    }
  } catch (error) {
    delete req.session.pinResetHash;
    delete req.session.pinResetAccountId;
    delete req.session.pinResetExpiresAt;
    try { await saveSession(req.session); } catch (saveError) { return next(saveError); }
  }
  return res.json(PIN_RESET_RESPONSE);
});
app.post("/api/reset-pin", pinRecoveryLimiter, pinResetVerifyLimiter, async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const code = clean(req.body?.code || req.body?.otp);
  const newPin = clean(req.body?.newPin);
  if (!validNewPin(newPin)) return res.status(400).json({ message: "Choose a 6-12 digit PIN." });
  const valid = validEmail(email) && /^\d{6}$/.test(code) &&
    typeof req.session.pinResetHash === "string" &&
    typeof req.session.pinResetExpiresAt === "number" &&
    Date.now() < req.session.pinResetExpiresAt &&
    verifyCodeHash(code, req.session.pinResetHash);
  const account = valid && state.users.find(item => item.id === req.session.pinResetAccountId && item.status === "active" && normalizeEmail(item.email) === email);
  if (!account) return res.status(400).json({ message: "Invalid or expired PIN reset code." });
  try {
    if (req.session.userId === account.id) {
      delete req.session.userId;
      delete req.session.lastActivityAt;
      await saveSession(req.session);
    }
    await resetPinAfterRevokingSessions({
      sessionStore: req.sessionStore,
      userId: account.id,
      consumeChallenge: async () => {
        delete req.session.pinResetHash;
        delete req.session.pinResetAccountId;
        delete req.session.pinResetExpiresAt;
        await saveSession(req.session);
      },
      persistPin: async () => {
        const updated = structuredClone(state);
        const saved = updated.users.find(item => item.id === account.id);
        saved.pinHash = pinHash(newPin);
        saved.mustChangePin = false;
        await persist(updated);
      },
    });
    return res.json({ message: "PIN reset. Please sign in with your new PIN." });
  } catch (error) { return next(error); }
});
app.post("/api/logout", requireAuth, (req, res, next) => req.session.destroy(error => { if (error) return next(error); activeSessionsGauge.dec(); return res.clearCookie("chama.sid").json({ message: "Signed out." }); }));
app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  if (req.user.mustChangePin) return res.status(403).json({ message: "Change your PIN before viewing the dashboard.", mustChangePin: true });
  try {
    await processDueLeadershipElections();
    const currentUser = state.users.find(item => item.id === req.user.id && item.status === "active");
    if (!currentUser) return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    return res.json(dashboardFor(currentUser));
  }
  catch (error) { return next(error); }
});
app.get("/api/attendance", requireAuth, requirePinChanged, (req, res) => {
  const members = req.user.role === "secretary"
    ? scopeToChama(state.users, req.user.chamaId).filter(user => user.status === "active").map(user => ({ id: user.id, name: user.name }))
    : [];
  const registers = scopeToChama(state.registers, req.user.chamaId)
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))
    .map(register => attendanceRegisterView(register, req.user));
  return res.json({ members, registers, readOnly: req.user.role !== "secretary" });
});
app.post("/api/attendance", requireAuth, requirePinChanged, requireRole("secretary"), requireActiveSubscription, idempotent((req, res, next) => {
  const date = clean(req.body?.date);
  const expectedRevision = req.body?.expectedRevision;
  const submitted = req.body?.attendees;
  if (!validMeetingDate(date) || !Array.isArray(submitted) || submitted.length > 1000 ||
      (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1))) {
    return res.status(400).json({ message: "Provide a valid meeting date, register revision, and attendance list." });
  }
  const existing = scopeToChama(state.registers, req.user.chamaId).find(register => register.date === date);
  if ((!existing && expectedRevision !== null) || (existing && existing.revision !== expectedRevision)) {
    return res.status(409).json({ message: "This attendance register was already updated. Refresh the meeting register before saving your changes." });
  }
  const activeUsers = scopeToChama(state.users, req.user.chamaId).filter(user => user.status === "active");
  const eligibleIds = new Set(activeUsers.map(user => user.id));
  if (existing) for (const attendee of existing.attendees || []) eligibleIds.add(attendee.userId);
  const submittedIds = new Set();
  for (const item of submitted) {
    const submittedUser = state.users.find(user => user.id === item?.userId);
    if (submittedUser && submittedUser.chamaId !== req.user.chamaId) return res.status(404).json({ message: "Member not found." });
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
  const usersById = new Map(scopeToChama(state.users, req.user.chamaId).map(user => [user.id, user]));
  const attendees = submitted.map(item => {
    const user = usersById.get(item.userId);
    return { userId: item.userId, name: user?.name || previousById.get(item.userId).name, present: item.present };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const recordedAt = now();
  const actor = { id: req.user.id, name: req.user.name, role: req.user.role };
  const updated = structuredClone(state);
  let register;
  if (existing) {
    register = scopeToChama(updated.registers, req.user.chamaId).find(item => item.id === existing.id);
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
      id: newId(), date, attendees, revision: 1, createdAt: recordedAt, createdBy: actor, chamaId: req.user.chamaId,
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
app.get("/api/subscription", requireAuth, (req, res) => {
  return res.json({ data: subscriptionView(subscriptionFor(state, req.user.chamaId)) });
});
app.post("/api/subscription/selection", requireAuth, requirePinChanged, requireRole("chairperson"), idempotent(async (req, res, next) => {
  const tier = clean(req.body?.tier).toLowerCase();
  const billing = clean(req.body?.billing).toLowerCase();
  if (tier === "enterprise") return res.status(400).json({ message: "Enterprise / Investment plans use custom member caps and pricing. Contact sales to discuss your group." });
  const plan = SUBSCRIPTION_PLANS[tier];
  if (!plan || !["monthly", "annual"].includes(billing)) return res.status(400).json({ message: "Choose a Basic or Growth Chama monthly or annual plan." });
  const amount = billing === "annual" ? plan.annualAmount : plan.monthlyAmount;
  const planView = { tier: plan.label, memberCap: plan.maxMembers, currency: "KES", amount, billing, annualSavings: billing === "annual" ? plan.annualSavings : 0, paymentEnabled: false, paymentRequestStarted: false };
  const activeOrInvited = scopeToChama(state.users, req.user.chamaId).filter(user => user.status === "active" || user.status === "invited").length;
  if (activeOrInvited > plan.maxMembers) return res.status(409).json({ message: `This group currently has ${activeOrInvited} active or invited members and cannot select the ${plan.maxMembers}-member plan.`, plan: planView });
  if (!SUBSCRIPTION_PAYMENTS_ENABLED) return res.status(503).json({ message: SUBSCRIPTION_PAYMENTS_PAUSED_MESSAGE, plan: planView });
  const config = getC2bSubscriptionConfig(process.env);
  if (!config.enabled || ![...config.shortcodeToChama.values()].includes(req.user.chamaId)) return res.status(503).json({
    message: "Sandbox C2B verification is not configured for this group. Register the HTTPS validation and confirmation URLs and configure a valid shortcode-to-group mapping. No payment request was sent or access activated.",
    plan: planView
  });
  const createdAt = now();
  const pendingPayment = {
    reference: `JC${crypto.randomBytes(6).toString("hex").toUpperCase()}`,
    planKey: tier, tier: plan.label, billing, amount, currency: "KES", maxMembers: plan.maxMembers,
    annualSavings: billing === "annual" ? plan.annualSavings : 0,
    status: "pending", createdAt, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  const updated = structuredClone(state);
  const chama = updated.chamas.find(item => item.id === req.user.chamaId);
  if (!chama) return res.status(404).json({ message: "This group could not be found." });
  chama.subscription = { ...(chama.subscription || unpaidSubscription()), pendingPayment };
  updated.auditLog.push(auditEntry("subscription.selection.created", pendingPayment.reference, req.user, {
    chamaId: chama.id, tier: plan.label, billing, amount, currency: "KES",
  }));
  return commit(req, res, next, updated, 201, {
    message: "Plan selection saved. No payment request was sent. Contact your team for payment instructions; access activates only after a matching M-PESA C2B confirmation.",
    plan: { ...planView, reference: pendingPayment.reference, expiresAt: pendingPayment.expiresAt },
  });
}));
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
app.get("/api/export.csv", requireAuth, requirePinChanged, (req, res) => {
  const chamaTransactions = scopeToChama(state.transactions, req.user.chamaId);
  const transactions = req.user.role === "member" ? chamaTransactions.filter(item => item.memberId === req.user.id) : chamaTransactions;
  const rows = [["Date", "Member", "Amount (KES)", "Method", "Type", "Reference"], ...transactions.map(item => [item.at, item.memberName, item.amount, item.method, item.paymentType, item.ref])];
  const chamaRegisters = scopeToChama(state.registers, req.user.chamaId);
  const attendance = req.user.role === "member"
    ? chamaRegisters.map(register => ({ ...register, attendees: (register.attendees || []).filter(item => item.userId === req.user.id) }))
    : chamaRegisters;
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
// Group chat: every active member can read and post. Messages cannot be edited or deleted, and each post is audited without its text.
const MESSAGE_MAX_LENGTH = 500;
const MESSAGES_SHOWN = 100;
app.get("/api/messages", requireAuth, requirePinChanged, (req, res) => {
  const authors = new Map(scopeToChama(state.users, req.user.chamaId).map(user => [user.id, user]));
  const data = scopeToChama(state.messages, req.user.chamaId)
    .filter(item => !item.recipientId || item.recipientId === req.user.id)
    .slice(-MESSAGES_SHOWN)
    .map(item => ({ ...item, authorName: item.authorId && authors.has(item.authorId) ? chatDisplayName(authors.get(item.authorId)) : item.authorName }));
  return res.json({ data });
});
app.post("/api/messages", requireAuth, requirePinChanged, idempotent((req, res, next) => {
  const text = clean(req.body?.text);
  if (text.length < 1 || text.length > MESSAGE_MAX_LENGTH) return res.status(400).json({ message: "Enter a message of 1 to 500 characters." });
  const updated = structuredClone(state);
  const message = { id: newId(), at: now(), authorId: req.user.id, authorName: chatDisplayName(req.user), authorRole: req.user.role, text, chamaId: req.user.chamaId };
  updated.messages.push(message);
  updated.auditLog.push(auditEntry("message.posted", message.id, req.user, { length: text.length }));
  return commit(req, res, next, updated, 201, { message: "Message sent.", data: message }, undefined, () => publishMessageUpdate(message, req.user.chamaId));
}));
async function summaryFor(user) {
  const chamaId = user.chamaId;
  const officers = user.role !== "member";
  const cacheKey = `summary:${chamaId}`;

  if (redisCache) {
    try {
      const cached = await redisCache.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.financialTrends?.months)) {
          recordSummaryCacheHit();
          // Members only see their own outstanding, not the group balance.
          if (!officers) parsed.balance = null;
          return { data: parsed, cached: true };
        }
      }
      recordSummaryCacheMiss();
    } catch (err) {
      recordSummaryCacheMiss();
      logger.error("Redis summary cache read error", { err: err.message });
    }
  }

  const month = monthKey(now());
  const trendMonths = financialTrendMonths();
  const trendContributions = Object.fromEntries(trendMonths.map(key => [key, 0]));
  const trendRepayments = Object.fromEntries(trendMonths.map(key => [key, 0]));
  let memberCount = 0;
  let income = 0;
  let contributions = 0;
  let lent = 0;
  let outstanding = 0;
  for (const user of state.users) {
    if (user.chamaId === chamaId && user.status === "active") memberCount += 1;
  }
  for (const transaction of state.transactions) {
    if (transaction.chamaId !== chamaId) continue;
    if (transaction.status !== "pending-member") {
      income += transaction.amount;
      if (monthKey(transaction.at) === month && transaction.paymentType === "Monthly Contribution") contributions += transaction.amount;
      const transactionMonth = transactionDate(transaction).slice(0, 7);
      if (Object.hasOwn(trendContributions, transactionMonth)) {
        if (transaction.paymentType === "Monthly Contribution") trendContributions[transactionMonth] += Number(transaction.amount) || 0;
        if (transaction.paymentType === "Loan Repayment") trendRepayments[transactionMonth] += Number(transaction.amount) || 0;
      }
    }
  }
  for (const loan of state.loans) {
    if (loan.chamaId !== chamaId) continue;
    if (loan.status === "approved" || loan.status === "repaid") lent += loan.amount;
    if (loan.status === "approved") outstanding += loan.outstanding;
  }

  const summary = {
    balance: income - lent,
    contributions,
    outstanding,
    memberCount,
    financialTrends: {
      months: trendMonths,
      contributions: trendMonths.map(key => trendContributions[key]),
      loanRepayments: trendMonths.map(key => trendRepayments[key]),
    },
  };

  if (redisCache) {
    redisCache.setEx(cacheKey, SUMMARY_CACHE_TTL_SECONDS, JSON.stringify(summary))
      .catch(err => logger.error("Redis summary cache write error", { err: err.message }));
  }

  const response = { ...summary };
  if (!officers) response.balance = null;
  return { data: response, cached: false };
}

// ---------------------------------------------------------------------------
// Phase 2: lean /api/summary endpoint with Redis cache (10-second TTL)
// ---------------------------------------------------------------------------
app.get("/api/summary", requireAuth, requirePinChanged, async (req, res, next) => {
  try { return res.json(await summaryFor(req.user)); }
  catch (error) { return next(error); }
});

function monthlyCloseForChama(chamaId, month) {
  const recordDate = item => {
    if (isValidCalendarDate(item.date)) return item.date;
    const timestamp = Date.parse(item.at || "");
    return Number.isFinite(timestamp) ? nairobiDate(timestamp) : "";
  };
  const monthEntries = scopeToChama(state.transactions, chamaId)
    .filter(item => recordDate(item).slice(0, 7) === month && item.method === "Cash" &&
      ["Monthly Contribution", "Loan Repayment"].includes(item.paymentType) &&
      !["pending-member", "unverified", "pending"].includes(String(item.status || "").toLowerCase()));
  const contributions = monthEntries.filter(item => item.paymentType === "Monthly Contribution");
  const repayments = monthEntries.filter(item => item.paymentType === "Loan Repayment");
  const sum = (items, field = "amount") => items.reduce((total, item) => total + (Number(item[field]) || 0), 0);
  const contributedMembers = new Set(contributions.map(item => item.memberId));
  const membersWithoutContribution = scopeToChama(state.users, chamaId)
    .filter(item => item.status === "active" && !contributedMembers.has(item.id))
    .map(item => ({ id: item.id, name: item.name }));
  const pendingLoanRequests = scopeToChama(state.loans, chamaId)
    .filter(item => item.status === "pending")
    .map(item => ({ id: item.id, memberName: item.memberName, amount: Number(item.amount) || 0 }));
  const outstandingPenalties = scopeToChama(state.penalties, chamaId)
    .filter(item => item.status === "outstanding")
    .map(item => ({ id: item.id, memberName: item.memberName, amount: Number(item.amount) || 0, reason: item.reason || "" }));
  const incompleteReferences = monthEntries
    .filter(item => !clean(item.referenceNumber) || !clean(item.recordedBy))
    .map(item => ({ id: item.id, memberName: item.memberName, amount: Number(item.amount) || 0, paymentType: item.paymentType }));
  const sortedEntries = monthEntries.slice().sort((left, right) =>
    recordDate(right).localeCompare(recordDate(left)) || String(right.at || "").localeCompare(String(left.at || "")));
  const approvedLoans = scopeToChama(state.loans, chamaId).filter(item => item.status === "approved");

  return {
    month,
    generatedAt: now(),
    totals: {
      contributionCount: contributions.length,
      contributionTotal: sum(contributions),
      welfareAmount: sum(contributions, "welfareAmount"),
      shareCapitalAmount: sum(contributions, "shareCapitalAmount"),
      repaymentCount: repayments.length,
      repaymentTotal: sum(repayments),
      openLoanBalance: sum(approvedLoans, "outstanding"),
    },
    exceptions: { membersWithoutContribution, pendingLoanRequests, outstandingPenalties, incompleteReferences },
    entries: sortedEntries.slice(0, 100).map(item => ({
      date: recordDate(item), type: item.paymentType, memberName: item.memberName,
      amount: Number(item.amount) || 0, referenceNumber: item.referenceNumber || "",
      recordedByName: item.recordedByName || "",
    })),
    entriesOmittedCount: Math.max(0, sortedEntries.length - 100),
  };
}

app.get("/api/monthly-close", requireAuth, requirePinChanged, requireRole("chairperson", "secretary", "treasurer"), (req, res) => {
  const month = typeof req.query?.month === "string" ? req.query.month.trim() : "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900 || month > todayInNairobi().slice(0, 7)) {
    return res.status(400).json({ message: "Choose a valid current or past month (YYYY-MM)." });
  }
  return res.json({ data: monthlyCloseForChama(req.user.chamaId, month) });
});

// ---------------------------------------------------------------------------
// Phase 2: paginated list endpoints
// Supports ?limit=N&offset=N (offset-based) and ?limit=N&before=<id> (cursor).
// Default limit 50, max 200.
// ---------------------------------------------------------------------------
function parsePagination(query) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const before = typeof query.before === "string" ? query.before.trim() : null;
  return { limit, offset, before };
}

app.get("/api/members", requireAuth, requirePinChanged, (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const officers = ["chairperson", "secretary"].includes(req.user.role);
  const all = scopeToChama(state.users, req.user.chamaId)
    .map(u => safeUser(u, officers));
  const page = all.slice(offset, offset + limit);
  return res.json({ data: page, total: all.length, limit, offset });
});

app.get("/api/transactions", requireAuth, requirePinChanged, (req, res) => {
  const { limit, offset, before } = parsePagination(req.query);
  const officers = req.user.role !== "member";
  let all = scopeToChama(state.transactions, req.user.chamaId)
    .sort((a, b) => b.at.localeCompare(a.at));
  if (!officers) all = all.filter(t => t.memberId === req.user.id);
  // Cursor: return items before (older than) the given id
  if (before) {
    const idx = all.findIndex(t => t.id === before);
    all = idx >= 0 ? all.slice(idx + 1) : [];
  }
  const page = all.slice(0, limit);
  const nextCursor = page.length === limit ? page[page.length - 1]?.id : null;
  return res.json({ data: page, limit, nextCursor, offset: before ? null : (parsePagination(req.query).offset + page.length) });
});

app.get("/api/loans", requireAuth, requirePinChanged, (req, res) => {
  const { limit, offset, before } = parsePagination(req.query);
  const officers = req.user.role !== "member";
  let all = scopeToChama(state.loans, req.user.chamaId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!officers) all = all.filter(l => l.memberId === req.user.id);
  if (before) {
    const idx = all.findIndex(l => l.id === before);
    all = idx >= 0 ? all.slice(idx + 1) : [];
  }
  const page = all.slice(0, limit).map(l => loanApprovalView(l, req.user));
  const nextCursor = all.length > limit ? all[limit - 1]?.id : null;
  return res.json({ data: page, limit, nextCursor });
});

app.get("/api/loans/guarantors", requireAuth, requirePinChanged, (req, res) => {
  const data = scopeToChama(state.users, req.user.chamaId)
    .filter(member => member.status === "active" && member.id !== req.user.id)
    .map(member => ({ id: member.id, name: member.name }));
  return res.json({ data });
});

app.get("/api/attendance/list", requireAuth, requirePinChanged, (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const all = scopeToChama(state.registers, req.user.chamaId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(r => attendanceRegisterView(r, req.user));
  const page = all.slice(offset, offset + limit);
  return res.json({ data: page, total: all.length, limit, offset });
});

app.get("/api/events/stream", requireAuth, requirePinChanged, (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.write(`retry: 5000\nevent: ready\ndata: ${JSON.stringify({ at: now() })}\n\n`);
  const client = { res, chamaId: req.user.chamaId, keepAlive: null, closed: false };
  eventClients.add(client); openSseGauge.inc();
  client.keepAlive = setInterval(() => {
    if (res.destroyed || res.writableEnded) { removeSseClient(client); return; }
    try { res.write(": keep-alive\n\n"); } catch { removeSseClient(client); }
  }, 25000);
  client.keepAlive.unref?.();
  const cleanup = () => removeSseClient(client);
  req.on("aborted", cleanup);
  req.on("close", () => {
    if (req.aborted || res.destroyed || res.writableEnded) cleanup();
  });
  res.on("close", cleanup);
  res.on("error", cleanup);
});

app.post("/api/invitations", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), requireActiveSubscription, idempotent(async (req, res, next) => {
  const name = clean(req.body?.name); const phone = normalizePhone(req.body?.phone); const email = normalizeEmail(req.body?.email); const role = clean(req.body?.role);
  if (!name || name.length > 100) return res.status(400).json({ message: "Enter the member's name (up to 100 characters)." });
  if (!phone) return res.status(400).json({ message: "Enter a valid Kenyan mobile phone number." });
  if (!validEmail(email)) return res.status(400).json({ message: "Enter a valid email address for the member." });
  if (!ROLES.has(role)) return res.status(400).json({ message: "Choose a valid member role." });
  if (role === "chairperson") return res.status(400).json({ message: "Invite a Member, Secretary, or Treasurer. Chairperson roles are assigned through leadership changes." });
  const memberCap = memberCapFor(state, req.user.chamaId);
  const activeOrInvited = scopeToChama(state.users, req.user.chamaId).filter(item => item.status === "active").length +
    scopeToChama(state.invitations, req.user.chamaId).filter(item => !item.usedAt && !invitationRevocation(item) && Date.parse(item.expiresAt) > Date.now()).length;
  if (memberCap !== null && activeOrInvited >= memberCap) return res.status(409).json({ message: `Your ${subscriptionFor(state, req.user.chamaId).tier} plan is limited to ${memberCap} members. Renew or contact us to change plans before inviting another member.` });
  if (["secretary", "treasurer"].includes(role)) {
    if (req.user.role !== "chairperson") return res.status(403).json({ message: "Only the Chairperson can invite the first leader directly." });
    const chamaUsers = scopeToChama(state.users, req.user.chamaId);
    const roleAlreadyActive = chamaUsers.some(item => item.status === "active" && item.role === role);
    const pendingLeaderInvitation = scopeToChama(state.invitations, req.user.chamaId).some(item => item.requestedRole === role && !item.usedAt && !invitationRevocation(item) && Date.parse(item.expiresAt) > Date.now());
    const priorLeadershipChange = scopeToChama(state.leadershipChanges, req.user.chamaId)
      .some(item => item.type === "appointment" && item.role === role);
    if (roleAlreadyActive || pendingLeaderInvitation || priorLeadershipChange) return res.status(409).json({ message: "Direct leader invitations are available only for the first leader during initial setup. Invite a Member, then use the leadership assignment process." });
  }
  if (scopeToChama(state.users, req.user.chamaId).some(item => normalizeEmail(item.email) === email) || scopeToChama(state.invitations, req.user.chamaId).some(item => normalizeEmail(item.email) === email && !item.usedAt && !invitationRevocation(item) && item.expiresAt > now())) return res.status(409).json({ message: "That email address already has an account or active invitation in this chama." });
  if (scopeToChama(state.users, req.user.chamaId).some(item => item.phone === phone) || scopeToChama(state.invitations, req.user.chamaId).some(item => item.phone === phone && !item.usedAt && !invitationRevocation(item) && item.expiresAt > now())) return res.status(409).json({ message: "That phone number already has an account or active invitation." });
  const code = String(crypto.randomInt(100000, 1000000)); const invitation = { id: newId(), name, phone, email, requestedRole: role, idempotencyKey: req.idempotency.key, codeHash: hashCode(code), attemptsRemaining: invitationAttemptLimit, usedCodeHash: null, invitedBy: req.user.id, invitedAt: now(), expiresAt: new Date(Date.now() + codeLifetimeMs).toISOString(), usedAt: null, chamaId: req.user.chamaId };
  let deliveryChannel = "email";
  try {
    const emailInfo = await sendEmail(email, "Jirani Chama Invitation", `Jirani Chama invitation: your activation code is ${code}. It expires in 24 hours. Do not share it.`);
    if (process.env.SMTP_TRANSPORT === "json" && emailInfo?.message && process.env.SMTP_LOG_FILE) {
      appendJsonEmailCapture(process.env.SMTP_LOG_FILE, emailInfo.message);
    }
  }
  catch (error) { if (error.message !== "Email delivery is not configured.") return res.status(502).json({ message: `Invitation was not created: ${error.message}` }); deliveryChannel = "manual"; }
  const updated = structuredClone(state); updated.invitations.push(invitation);
  const { codeHash, usedCodeHash, ...savedInvitation } = invitation;
  const message = deliveryChannel === "manual"
    ? "Invitation created. Email delivery is not configured. Share this activation code privately; it expires in 24 hours."
    : "Invitation sent by email.";
  const body = { message, deliveryChannel, invitation: savedInvitation, ...(deliveryChannel === "manual" ? { activationCode: code } : {}) };
  const replayBody = deliveryChannel === "manual"
    ? { message: "Invitation exists. The activation code is only shown once.", deliveryChannel, invitation: savedInvitation }
    : body;
  return commit(req, res, next, updated, 201, body, replayBody);
}));
app.post("/api/invitations/:id/revoke", requireAuth, requirePinChanged, requireRole("chairperson"), idempotent((req, res, next) => {
  const reason = clean(req.body?.reason);
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: "Enter a reason of 5-500 characters." });
  const invitation = scopeToChama(state.invitations, req.user.chamaId).find(item => item.id === req.params.id);
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
app.post("/api/invitations/activate", activationLimiter, async (req, res, next) => {
  const phone = normalizePhone(req.body?.phone); const code = clean(req.body?.code); const codeDigest = hashCode(code); const pin = clean(req.body?.pin);
  try {
    const activate = async () => {
      const matchingCode = state.invitations.find(item => verifyCodeHash(code, item.codeHash) || verifyCodeHash(code, item.usedCodeHash));
      if (matchingCode?.usedAt || matchingCode?.usedCodeHash === codeDigest) return { status: 400, body: { message: "Code already used" } };
      if (matchingCode && invitationRevocation(matchingCode)) return { status: 400, body: { message: "Invitation revoked" } };
      if (matchingCode && Date.parse(matchingCode.expiresAt) <= Date.now()) return { status: 400, body: { message: "Code expired" } };
      if (matchingCode && matchingCode.phone !== phone) return { status: 400, body: { message: "Phone number does not match the invitation" } };
      const invitation = matchingCode || state.invitations.find(item => item.phone === phone && !item.usedAt && !invitationRevocation(item) && Date.parse(item.expiresAt) > Date.now());
      if (!invitation) return { status: 400, body: { message: "Incorrect activation code." } };
      if ((invitation.attemptsRemaining ?? invitationAttemptLimit) <= 0) return { status: 400, body: { message: "Invitation locked after too many incorrect activation codes." } };
      if (!matchingCode) {
        const updated = structuredClone(state);
        const saved = updated.invitations.find(item => item.id === invitation.id && item.chamaId === invitation.chamaId);
        saved.attemptsRemaining = (saved.attemptsRemaining ?? invitationAttemptLimit) - 1;
        if (saved.attemptsRemaining === 0) saved.lockedAt = now();
        await persist(updated);
        return { status: 400, body: { message: saved.attemptsRemaining === 0 ? "Invitation locked after too many incorrect activation codes." : "Incorrect activation code." } };
      }
      if (!validEmail(matchingCode.email) || !validNewPin(pin)) return { status: 400, body: { message: "Enter a valid activation code, registered email address, and 6-12 digit PIN." } };
      const subscription = subscriptionFor(state, matchingCode.chamaId);
      if (!subscriptionIsActive(subscription)) return { status: 402, body: { message: "This chama is in view-only access because its subscription is unpaid or expired. Contact the Chairperson to arrange a plan or renewal.", subscription: subscriptionView(subscription) } };
      const memberCap = memberCapFor(state, matchingCode.chamaId);
      const activeMembers = scopeToChama(state.users, matchingCode.chamaId).filter(item => item.status === "active").length;
      if (memberCap !== null && activeMembers >= memberCap) return { status: 409, body: { message: `This chama has reached its ${memberCap}-member plan limit. Ask its Chairperson to renew or change plans before activating this invitation.` } };
      const updated = structuredClone(state); const saved = updated.invitations.find(item => item.id === matchingCode.id && item.chamaId === matchingCode.chamaId); saved.usedAt = now(); saved.usedCodeHash = codeDigest;
      const inviter = scopeToChama(updated.users, saved.chamaId).find(item => item.id === saved.invitedBy);
      const chamaUsers = scopeToChama(updated.users, saved.chamaId);
      const roleAlreadyActive = chamaUsers.some(item => item.status === "active" && item.role === saved.requestedRole);
      const priorLeadershipChange = scopeToChama(updated.leadershipChanges, saved.chamaId).some(item => item.type === "appointment" && item.role === saved.requestedRole);
      const directLeaderRole = ["secretary", "treasurer"].includes(saved.requestedRole) && inviter?.role === "chairperson" && !roleAlreadyActive && !priorLeadershipChange;
      const createdAt = now();
      const user = { id: newId(), name: saved.name, phone: saved.phone, email: normalizeEmail(saved.email), role: directLeaderRole ? saved.requestedRole : "member", status: "active", pinHash: pinHash(pin), mustChangePin: false, createdAt, chamaId: saved.chamaId };
      updated.users.push(user);
      if (directLeaderRole) {
        const leadershipChange = { id: newId(), type: "appointment", role: user.role, outgoingUserId: null, incomingUserId: user.id, effectiveDate: createdAt.slice(0, 10), vote: null, emergencyReason: null, status: "confirmed", proposedBy: inviter.id, proposedAt: createdAt, confirmedBy: inviter.id, confirmedAt: createdAt, audit: [{ action: "proposed", by: inviter.id, at: createdAt }, { action: "confirmed", by: inviter.id, at: createdAt }], chamaId: saved.chamaId };
        updated.leadershipChanges.push(leadershipChange);
        updated.auditLog.push(auditEntry("leadership.confirmed", leadershipChange.id, inviter, { role: user.role, incomingUserId: user.id, outgoingUserId: null }));
      }
      await persist(updated); publishMemberUpdate(saved.chamaId); return { status: 201, body: { message: "Account activated. Please sign in.", user: safeUser(user) } };
    };
    const result = await serializeActivationAttempt(() => DATA_BACKEND === "json" ? withActivationFileLock(async () => { state = loadState(); return activate(); }) : activate());
    return res.status(result.status).json(result.body);
  } catch (error) { return next(error); }
});
app.post("/api/pin/change", requireAuth, async (req, res, next) => {
  const currentPin = clean(req.body?.currentPin); const newPin = clean(req.body?.newPin);
  if (!verifyPin(currentPin, req.user.pinHash) || !validNewPin(newPin)) return res.status(400).json({ message: "Enter your current PIN and a new 6-12 digit PIN." });
  const updated = structuredClone(state); const user = scopeToChama(updated.users, req.user.chamaId).find(item => item.id === req.user.id); user.pinHash = pinHash(newPin); user.mustChangePin = false; await persist(updated); return res.json({ message: "PIN changed successfully.", user: safeUser(user) });
});

function hasUnsupportedCashEntryFields(body) {
  const fields = body && typeof body === "object" ? body : {};
  return (Object.hasOwn(fields, "flowDirection") && fields.flowDirection !== "in") ||
    ["cashOutType", "cashOutLoanId", "customType"].some(field => Object.hasOwn(fields, field));
}

function recordManualPayment(forcedPaymentType = null) {
  return idempotent((req, res, next) => {
    const memberId = clean(req.body?.memberId);
    const foreignMember = state.users.find(item => item.id === memberId && item.chamaId !== req.user.chamaId);
    if (foreignMember) return res.status(404).json({ message: "Member not found." });
    if (hasUnsupportedCashEntryFields(req.body)) return res.status(400).json({ message: "Cash-out entries are not supported; only cash received can be recorded." });
    const member = scopeToChama(state.users, req.user.chamaId).find(item => item.id === memberId && item.status === "active"); const amount = Number(req.body?.amount); const paymentType = forcedPaymentType || clean(req.body?.paymentType); const method = clean(req.body?.method); const note = clean(req.body?.note);
  if (!member || !Number.isSafeInteger(amount) || amount < 1 || !PAYMENT_TYPES.has(paymentType) || method !== "Cash" || note.length < 3 || note.length > 500) return res.status(400).json({ message: "Manual entries are cash-only and require a 3-500 character note." });
  if (paymentType === "Loan Repayment") return res.status(400).json({ message: "Record loan repayments with the loan repayment form." });
  if (paymentType === "Monthly Contribution") return res.status(400).json({ message: "Record contributions via /api/contributions endpoint." });
  const updated = structuredClone(state);
  const transaction = { id: newId(), at: now(), memberId: member.id, memberName: member.name, amount, method, paymentType, note, loanId: null, recordedBy: req.user.id, recordedByName: req.user.name, source: "manual-cash", status: "confirmed", idempotencyKey: req.idempotency.key, chamaId: req.user.chamaId }; updated.transactions.push(transaction);
  updated.auditLog.push(auditEntry("payment.recorded", transaction.id, req.user, { memberId: member.id, memberName: member.name, amount, paymentType }));
  return commit(req, res, next, updated, 201, { message: "Payment recorded successfully.", data: transaction }, undefined, () => publishFinancialUpdate(req.user.chamaId));
  });
}
app.post("/api/payments", requireAuth, requirePinChanged, requireRole("treasurer"), requireActiveSubscription, recordManualPayment());
app.post("/api/contributions", requireAuth, requirePinChanged, requireRole("treasurer"), requireActiveSubscription, idempotent((req, res, next) => {
  const memberId = clean(req.body?.memberId);
  const foreignMember = state.users.find(item => item.id === memberId && item.chamaId !== req.user.chamaId);
  if (foreignMember) return res.status(404).json({ message: "Member not found." });
  if (hasUnsupportedCashEntryFields(req.body)) return res.status(400).json({ message: "Cash-out entries are not supported; only cash received can be recorded." });
  const member = scopeToChama(state.users, req.user.chamaId).find(item => item.id === memberId && item.status === "active"); const amount = Number(req.body?.amount); const paymentType = clean(req.body?.paymentType); const note = clean(req.body?.note); const parsedReference = parseReceiptReference(req.body?.referenceNumber); const referenceNumber = parsedReference.display; const date = clean(req.body?.date);
  if (!member || !Number.isSafeInteger(amount) || amount < 1 || (Object.hasOwn(req.body ?? {}, "paymentType") && paymentType !== "Monthly Contribution") || clean(req.body?.method) !== "Cash" || note.length < 3 || note.length > 500 || !parsedReference.valid || !isValidContributionDate(date)) return res.status(400).json({ message: "Contributions are cash-only and require a member, amount, 3-40 character reference number, a real non-future date, and a 3-500 character note." });
  if (hasReceiptReferenceConflict(state, req.user.chamaId, parsedReference.normalized)) return res.status(409).json({ message: "That receipt reference has already been used in this chama." });
  const contributionMonth = date.slice(0, 7);
  const welfarePaid = scopeToChama(state.transactions, req.user.chamaId).some(item => item.memberId === member.id && item.contributionMonth === contributionMonth && item.welfareAmount > 0);
  const meetingDate = scheduledMeetingDate(contributionMonth);
  const newPenalty = date > meetingDate ? configuredLatePenalty() : 0;
  const outstandingPenalties = scopeToChama(state.penalties, req.user.chamaId).filter(item => item.memberId === member.id && item.status === "outstanding");
  const penaltyDue = outstandingPenalties.reduce((sum, item) => sum + item.amount, 0) + newPenalty;
  const welfare = welfarePaid ? 0 : configuredWelfareFee();
  if (amount < penaltyDue + welfare) return res.status(400).json({ message: `This payment must cover ${penaltyDue ? `KES ${penaltyDue} in penalties and ` : ""}the KES ${welfare} welfare fee.` });
  const shareCapital = amount - penaltyDue - welfare;
  const updated = structuredClone(state); const savedMember = scopeToChama(updated.users, req.user.chamaId).find(item => item.id === member.id);
  const transaction = { id: newId(), at: now(), memberId: member.id, memberName: member.name, amount, method: "Cash", paymentType: "Monthly Contribution", note, referenceNumber, date, contributionMonth, welfareAmount: welfare, shareCapitalAmount: shareCapital, penaltyAmount: penaltyDue, loanId: null, recordedBy: req.user.id, recordedByName: req.user.name, source: "manual-cash", status: "confirmed", idempotencyKey: req.idempotency.key, chamaId: req.user.chamaId };
  updated.transactions.push(transaction);
  savedMember.shareCapital = (savedMember.shareCapital || 0) + shareCapital;
  updated.welfareReserve = (updated.welfareReserve || 0) + welfare;
  updated.auditLog.push(auditEntry("contribution.recorded", transaction.id, req.user, { memberId: member.id, memberName: member.name, amount, welfareAmount: welfare, shareCapitalAmount: shareCapital, penaltyAmount: penaltyDue, referenceNumber, date }));
  if (newPenalty) {
    const charge = { id: newId(), memberId: member.id, memberName: member.name, amount: newPenalty, reason: "Late contribution", status: "outstanding", transactionId: null, paidTransactionId: null, date, at: transaction.at, chamaId: req.user.chamaId };
    updated.penalties.push(charge);
    updated.auditLog.push(auditEntry("penalty.charged", charge.id, req.user, { memberId: member.id, memberName: member.name, amount: newPenalty, transactionId: transaction.id }));
  }
  // Outstanding penalties are settled from this payment before the welfare fee and share capital.
  for (const charge of scopeToChama(updated.penalties, req.user.chamaId).filter(item => item.memberId === member.id && item.status === "outstanding")) {
    charge.status = "paid"; charge.paidTransactionId = transaction.id; charge.paidAt = transaction.at;
    updated.auditLog.push(auditEntry("penalty.paid", charge.id, req.user, { memberId: member.id, memberName: member.name, amount: charge.amount, transactionId: transaction.id }));
  }
  return commit(req, res, next, updated, 201, { message: "Contribution recorded successfully.", data: transaction }, undefined, () => publishFinancialUpdate(req.user.chamaId));
}));
// All non-read /api requests are serialized before reaching this handler, and commit persists the updated record plus audit event together.
app.post("/api/contributions/:id/correct-date", requireAuth, requirePinChanged, requireRole("chairperson", "treasurer"), requireActiveSubscription, idempotent((req, res, next) => {
  const transactionId = clean(req.params.id);
  const transaction = scopeToChama(state.transactions, req.user.chamaId).find(item => item.id === transactionId);
  if (!transaction) return res.status(404).json({ message: "Contribution not found." });
  const oldDate = typeof transaction.date === "string" ? transaction.date : "";
  const date = clean(req.body?.date);
  const reason = typeof req.body?.reason === "string" ? clean(req.body.reason) : "";
  const contributionMonth = transaction.contributionMonth || oldDate.slice(0, 7);
  if (transaction.paymentType !== "Monthly Contribution" || transaction.method !== "Cash" || transaction.status !== "confirmed" || !isValidCalendarDate(oldDate) || !/^\d{4}-\d{2}$/.test(contributionMonth) || oldDate.slice(0, 7) !== contributionMonth) {
    return res.status(409).json({ message: "Only confirmed cash contribution dates with a valid original month can be corrected." });
  }
  if (!isValidContributionDate(date) || !reason || reason.length > 500) {
    return res.status(400).json({ message: "Enter a real non-future date and a non-empty reason of up to 500 characters." });
  }
  if (date === oldDate) return res.status(409).json({ message: "The corrected date must differ from the recorded date." });
  if (date.slice(0, 7) !== contributionMonth) {
    return res.status(409).json({ message: "A date correction must remain within the original contribution month." });
  }
  const deadline = scheduledMeetingDate(contributionMonth);
  if (!isValidCalendarDate(deadline) || (oldDate > deadline) !== (date > deadline)) {
    return res.status(409).json({ message: "A date correction cannot change whether the contribution was on time or late." });
  }
  const updated = structuredClone(state);
  const saved = scopeToChama(updated.transactions, req.user.chamaId).find(item => item.id === transactionId);
  saved.date = date;
  const correction = auditEntry("contribution.date_corrected", saved.id, req.user, {
    memberId: saved.memberId, memberName: saved.memberName, referenceNumber: saved.referenceNumber || "",
    oldDate, newDate: date, reason,
  });
  updated.auditLog.push(correction);
  return commit(req, res, next, updated, 200, {
    message: "Contribution date corrected and recorded in the audit log.",
    data: { transaction: saved, audit: correction },
  }, undefined, () => publishFinancialUpdate(req.user.chamaId));
}));
app.post("/api/settings/meeting-date", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), requireActiveSubscription, idempotent((req, res, next) => {
  const month = clean(req.body?.month); const date = clean(req.body?.date);
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month || Number.isNaN(Date.parse(date))) return res.status(400).json({ message: "Enter a month (YYYY-MM) and a meeting date inside that month." });
  const updated = structuredClone(state);
  updated.settings.meetingDates[month] = date;
  updated.auditLog.push(auditEntry("meeting-date.set", month, req.user, { month, date }));
  return commit(req, res, next, updated, 200, { message: "Meeting date saved.", data: { month, date } });
}));
// Cash repayment: interest on each installment is paid before its principal, earliest installment first.
function repayLoan() {
  return idempotent((req, res, next) => {
    const loanId = clean(req.body?.loanId);
    if (hasUnsupportedCashEntryFields(req.body)) return res.status(400).json({ message: "Cash-out entries are not supported; only cash received can be recorded." });
    const foreignLoan = state.loans.find(item => item.id === loanId && item.chamaId !== req.user.chamaId);
    if (foreignLoan) return res.status(404).json({ message: "Loan not found." });
    const loan = scopeToChama(state.loans, req.user.chamaId).find(item => item.id === loanId && item.status === "approved");
    const paymentType = clean(req.body?.paymentType); const amount = Number(req.body?.amount); const note = clean(req.body?.note); const parsedReference = parseReceiptReference(req.body?.referenceNumber); const referenceNumber = parsedReference.display; const date = clean(req.body?.date);
    if (!loan || !Number.isSafeInteger(amount) || amount < 1 || amount > loan.outstanding || (Object.hasOwn(req.body ?? {}, "paymentType") && paymentType !== "Loan Repayment") || clean(req.body?.method) !== "Cash" || note.length < 3 || note.length > 500 || !parsedReference.valid || !isValidContributionDate(date)) return res.status(400).json({ message: "Select an approved loan and enter a cash amount no larger than its outstanding balance, with a receipt reference, real non-future date, and note." });
    if (hasReceiptReferenceConflict(state, req.user.chamaId, parsedReference.normalized)) return res.status(409).json({ message: "That receipt reference has already been used in this chama." });
    const updated = structuredClone(state); const saved = scopeToChama(updated.loans, req.user.chamaId).find(item => item.id === loan.id);
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
    const transaction = { id: newId(), at: now(), memberId: saved.memberId, memberName: saved.memberName, amount, method: "Cash", paymentType: "Loan Repayment", note, referenceNumber, date, loanId: saved.id, principalAmount, interestAmount, recordedBy: req.user.id, recordedByName: req.user.name, source: "manual-cash", status: "confirmed", idempotencyKey: req.idempotency.key, chamaId: req.user.chamaId };
    updated.transactions.push(transaction);
    updated.auditLog.push(auditEntry("loan.repaid", saved.id, req.user, { memberId: saved.memberId, memberName: saved.memberName, transactionId: transaction.id, amount, principalAmount, interestAmount, outstanding: saved.outstanding, status: saved.status }));
    for (const release of pledgesReleased) updated.auditLog.push(auditEntry("pledge.released", saved.id, req.user, { loanId: saved.id, ...release }));
    return commit(req, res, next, updated, 201, { message: "Loan repayment recorded successfully.", data: transaction }, undefined, () => publishFinancialUpdate(req.user.chamaId));
  });
}
app.post("/api/loans/repay", requireAuth, requirePinChanged, requireRole("treasurer"), requireActiveSubscription, repayLoan());
// Once a month's deadline has passed, every active member who paid less than the welfare fee by then gets one outstanding penalty.
app.post("/api/penalties/assess", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), requireActiveSubscription, idempotent((req, res, next) => {
  const month = clean(req.body?.month) || todayInNairobi().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ message: "Enter the month as YYYY-MM." });
  const deadline = scheduledMeetingDate(month);
  if (todayInNairobi() <= deadline) return res.status(409).json({ message: `The deadline for ${month} is ${deadline}. Assess penalties after it has passed.` });
  const updated = structuredClone(state); const assessed = [];
  const chamaMembers = scopeToChama(updated.users, req.user.chamaId).filter(item => item.status === "active");
  const chamaTransactions = scopeToChama(updated.transactions, req.user.chamaId);
  const chamaPenalties = scopeToChama(updated.penalties, req.user.chamaId);
  for (const member of chamaMembers) {
    const paidByDeadline = chamaTransactions.filter(item => item.memberId === member.id && item.paymentType === "Monthly Contribution" && (item.contributionMonth || nairobiDate(item.at).slice(0, 7)) === month && transactionDate(item) <= deadline).reduce((sum, item) => sum + item.amount, 0);
    if (paidByDeadline >= configuredWelfareFee()) continue;
    // A late-payment penalty for this month already covers the miss.
    if (chamaPenalties.some(item => item.memberId === member.id && (item.month === month || String(item.date || "").startsWith(month)))) continue;
    const penaltyAmount = configuredLatePenalty();
    if (penaltyAmount === 0) continue;
    const charge = { id: newId(), memberId: member.id, memberName: member.name, amount: penaltyAmount, reason: "Missed monthly contribution", month, status: "outstanding", transactionId: null, paidTransactionId: null, date: todayInNairobi(), at: now(), chamaId: req.user.chamaId };
    updated.penalties.push(charge);
    updated.auditLog.push(auditEntry("penalty.assessed", charge.id, req.user, { memberId: member.id, memberName: member.name, amount: charge.amount, month, deadline, paidByDeadline }));
    assessed.push({ memberId: member.id, memberName: member.name, amount: charge.amount });
  }
  return commit(req, res, next, updated, 201, { message: assessed.length ? `${assessed.length} member(s) penalised for ${month}.` : `No members to penalise for ${month}.`, data: { month, deadline, assessed } }, undefined, () => publishFinancialUpdate(req.user.chamaId));
}));
// Pro-rata by share capital, rounded to whole shillings. Leftover shillings go to the largest remainders, ties by member ID,
// so the payouts always add up to the pool exactly.
function dividendCycleInput(body) {
  const start = clean(body?.cycleStartDate); const end = clean(body?.cycleEndDate); const adminExpenses = Number(body?.adminExpenses);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || start > end || !Number.isSafeInteger(adminExpenses) || adminExpenses < 0) return null;
  return { start, end, adminExpenses };
}
function dividendPreview({ start, end, adminExpenses }, source = state, chamaId) {
  const inCycle = date => date >= start && date <= end;
  const interestIncome = scopeToChama(source.transactions, chamaId).filter(item => item.interestAmount > 0 && inCycle(transactionDate(item))).reduce((sum, item) => sum + item.interestAmount, 0);
  const penaltyIncome = scopeToChama(source.penalties, chamaId).filter(item => item.status === "paid" && item.paidAt && inCycle(nairobiDate(item.paidAt))).reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = interestIncome + penaltyIncome;
  const distributablePool = totalIncome - adminExpenses;
  const members = scopeToChama(source.users, chamaId).filter(item => item.status === "active").map(item => ({ memberId: item.id, name: item.name, shareCapital: item.shareCapital || 0 }));
  const totalShareCapital = members.reduce((sum, item) => sum + item.shareCapital, 0);
  const overlapsCommitted = scopeToChama(source.dividendCycles || [], chamaId).some(cycle => start <= cycle.cycleEndDate && end >= cycle.cycleStartDate);
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
  const preview = dividendPreview(input, state, req.user.chamaId);
  if (preview.distributablePool < 0) return res.status(400).json({ message: `Admin expenses of KES ${input.adminExpenses} exceed the KES ${preview.totalIncome} income in this cycle.` });
  if (preview.totalShareCapital <= 0) return res.status(409).json({ message: "No share capital to distribute against." });
  return res.json({ message: "Dividend preview. Nothing has been paid out yet.", data: preview });
});
app.post("/api/dividends/commit", requireAuth, requirePinChanged, requireRole("chairperson", "treasurer"), requireActiveSubscription, idempotent((req, res, next) => {
  const input = dividendCycleInput(req.body);
  if (!input || !Array.isArray(req.body?.payouts)) return res.status(400).json({ message: "Send the cycle dates, admin expenses, and the payouts from the preview." });
  const preview = dividendPreview(input, state, req.user.chamaId);
  if (preview.distributablePool < 0) return res.status(400).json({ message: `Admin expenses of KES ${input.adminExpenses} exceed the KES ${preview.totalIncome} income in this cycle.` });
  if (preview.totalShareCapital <= 0) return res.status(409).json({ message: "No share capital to distribute against." });
  if (preview.overlapsCommitted) return res.status(409).json({ message: "This cycle overlaps a dividend that was already paid out." });
  const byMember = (left, right) => left.memberId.localeCompare(right.memberId);
  const submitted = req.body.payouts.map(item => ({ memberId: clean(item?.memberId), dividend: Number(item?.dividend) })).sort(byMember);
  const foreignPayout = state.users.find(item => submitted.some(payout => payout.memberId === item.id) && item.chamaId !== req.user.chamaId);
  if (foreignPayout) return res.status(404).json({ message: "Member not found." });
  const expected = preview.payouts.map(item => ({ memberId: item.memberId, dividend: item.dividend })).sort(byMember);
  if (JSON.stringify(submitted) !== JSON.stringify(expected)) return res.status(409).json({ message: "The payouts no longer match the current figures. Calculate again before committing." });
  const updated = structuredClone(state);
  for (const payout of preview.payouts) {
    if (payout.dividend <= 0) continue;
    const member = scopeToChama(updated.users, req.user.chamaId).find(item => item.id === payout.memberId);
    member.shareCapital = (member.shareCapital || 0) + payout.dividend;
  }
  const distributed = preview.payouts.reduce((sum, item) => sum + item.dividend, 0);
  const cycle = { id: newId(), cycleStartDate: input.start, cycleEndDate: input.end, adminExpenses: input.adminExpenses, interestIncome: preview.interestIncome, penaltyIncome: preview.penaltyIncome, totalIncome: preview.totalIncome, distributablePool: preview.distributablePool, distributed, payouts: expected, chamaId: req.user.chamaId, committedBy: req.user.id, committedAt: now() };
  updated.dividendCycles.push(cycle);
  updated.auditLog.push(auditEntry("dividend.distributed", cycle.id, req.user, { cycleStartDate: input.start, cycleEndDate: input.end, adminExpenses: input.adminExpenses, distributablePool: preview.distributablePool, distributed, members: expected.length }));
  return commit(req, res, next, updated, 201, { message: "Dividends added to share capital.", data: cycle });
}));
app.post("/api/loan-repayment", requireAuth, requirePinChanged, requireRole("treasurer"), requireActiveSubscription, repayLoan());
app.post("/api/loans", requireAuth, requirePinChanged, requireActiveSubscription, idempotent((req, res, next) => {
  const amount = Number(req.body?.amount); const months = Number(req.body?.months); const interestModel = clean(req.body?.interestModel) || "reducing";
  if (!Number.isSafeInteger(amount) || amount < 1 || ![1, 2, 3, 6].includes(months) || !["reducing", "flat"].includes(interestModel)) return res.status(400).json({ message: "Enter a whole amount, a repayment period of 1, 2, 3, or 6 months, and an interest model of reducing or flat." });
  const guarantorIds = req.body?.guarantorIds;
  if (!Array.isArray(guarantorIds) || guarantorIds.length !== 2 || guarantorIds.some(id => typeof id !== "string" || !id.trim()) || new Set(guarantorIds).size !== 2 || guarantorIds.includes(req.user.id)) return res.status(400).json({ message: "Choose exactly two different active members to guarantee this loan." });
  const foreignGuarantor = state.users.find(member => guarantorIds.includes(member.id) && member.chamaId !== req.user.chamaId);
  if (foreignGuarantor) return res.status(404).json({ message: "Guarantor not found." });
  const guarantors = guarantorIds.map(id => scopeToChama(state.users, req.user.chamaId).find(member => member.id === id && member.status === "active"));
  if (guarantors.some(member => !member)) return res.status(400).json({ message: "Choose exactly two different active members to guarantee this loan." });
  const shareCapital = req.user.shareCapital || 0; const limit = LOAN_LIMIT_MULTIPLE * shareCapital;
  if (amount > limit) return res.status(400).json({ message: `The most you can borrow is KES ${limit}, three times your share capital of KES ${shareCapital}.` });
  const activeLoans = scopeToChama(state.loans, req.user.chamaId).filter(loanIsPending).concat(scopeToChama(state.loans, req.user.chamaId).filter(loan => loan.status === "approved"));
  const capacities = guarantors.map(member => {
    const held = activeLoans.flatMap(loan => loan.guarantors || []).filter(item => item.memberId === member.id).reduce((sum, item) => sum + (Number.isSafeInteger(item.held) && item.held > 0 ? item.held : 0), 0);
    return { member, available: Math.max(0, (Number.isSafeInteger(member.shareCapital) ? member.shareCapital : 0) - held) };
  });
  if (capacities[0].available + capacities[1].available < amount) return res.status(409).json({ message: "The guarantors' combined unpledged share capital does not cover this loan amount." });
  let remainingToPledge = amount;
  const loanGuarantors = capacities.map(({ member, available }) => {
    const pledged = Math.min(available, remainingToPledge);
    remainingToPledge -= pledged;
    return { memberId: member.id, pledged, held: pledged };
  });
  const updated = structuredClone(state); const loan = { id: newId(), memberId: req.user.id, memberName: req.user.name, amount, months, interestModel, outstanding: 0, status: "Requested", createdAt: now(), approvals: [], approvalHistory: [], guarantors: loanGuarantors, chamaId: req.user.chamaId }; updated.loans.push(loan);
  updated.auditLog.push(auditEntry("loan.requested", loan.id, req.user, { amount, months, interestModel, guarantors: loanGuarantors.map(({ memberId, pledged }) => ({ memberId, pledged })) }));
  return commit(req, res, next, updated, 201, { message: "Loan request submitted. Your request is waiting for approval.", data: loan }, undefined, () => { publishLoanUpdate(loan, req.user.chamaId); publishFinancialUpdate(req.user.chamaId); });
}));
app.post("/api/loans/:id/decisions", requireAuth, requirePinChanged, requireRole("chairperson", "secretary", "treasurer", "member"), requireActiveSubscription, idempotent((req, res, next) => {
  const decision = clean(req.body?.decision); const reason = clean(req.body?.reason);
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ message: "Decision must be approve or reject." });
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: "Enter a reason between 5 and 500 characters." });
  const updated = structuredClone(state); const loan = scopeToChama(updated.loans, req.user.chamaId).find(item => item.id === req.params.id && loanIsPending(item)); if (!loan) return res.status(404).json({ message: "Pending loan request not found." });
  if (loan.memberId === req.user.id) return res.status(403).json({ message: "A requester cannot approve or reject their own loan." });
  const requiredRoles = loanApprovalRoles(loan, updated);
  if (!requiredRoles.includes(req.user.role)) return res.status(403).json({ message: "Your role is not required to decide this loan." });
  if (!Array.isArray(loan.approvals)) loan.approvals = [];
  if (loan.approvals.some(item => item.approverId === req.user.id)) return res.status(409).json({ message: "You have already recorded a decision for this loan." });
  if (loan.approvals.some(item => item.role === req.user.role)) return res.status(409).json({ message: `The ${roleName(req.user.role)} decision has already been recorded for this loan.` });
  if (decision === "approve" && currentBalance(state, req.user.chamaId) < loan.amount) return res.status(409).json({ message: "There is not enough group balance to approve this loan." });
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
    loan.schedule = repaymentSchedule(loan.amount, loan.months, loan.interestModel || "reducing", approvedOn, configuredLoanMonthlyRate());
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
  return commit(req, res, next, updated, 200, { message, data: view, approvals: view.approvalCount, requiredApprovals: view.requiredApprovals, progress: view.progress, history: view.history }, undefined, () => { publishLoanUpdate(loan, loan.chamaId); publishFinancialUpdate(loan.chamaId); });
}));

const activeElectionStatuses = new Set(["proposed", "scheduled", "voting", "closed", "verified", "runoff-needed"]);
function activeElectionFor(chamaId) {
  return scopeToChama(state.leadershipChanges, chamaId).find(item => isElection(item) && activeElectionStatuses.has(item.status));
}
function electionById(id, chamaId) {
  return scopeToChama(state.leadershipChanges, chamaId).find(item => isElection(item) && item.id === id);
}
function activeGroupMembers(chamaId) {
  return scopeToChama(state.users, chamaId).filter(item => item.status === "active");
}
function safeElectionView(election, viewer) {
  return electionView(election, viewer, scopeToChama(state.users, election.chamaId), electionVoterToken(election, viewer));
}
app.get("/api/leadership-elections", requireAuth, requirePinChanged, async (req, res, next) => {
  try {
    await processDueLeadershipElections();
    const data = scopeToChama(state.leadershipChanges, req.user.chamaId).filter(isElection).map(item => safeElectionView(item, req.user));
    return res.json({ data, notifications: dashboardFor(req.user).notifications });
  } catch (error) { return next(error); }
});
app.post("/api/leadership-elections", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), requireActiveSubscription, idempotent((req, res, next) => {
  const role = clean(req.body?.role);
  const scheduledDate = clean(req.body?.scheduledDate);
  const rawCandidateIds = Array.isArray(req.body?.candidateIds) ? req.body.candidateIds : [];
  const candidateIds = [...new Set(rawCandidateIds.map(clean).filter(Boolean))];
  if (!["chairperson", "secretary", "treasurer"].includes(role)) return res.status(400).json({ message: "Choose Chairperson, Secretary, or Treasurer for this election." });
  if (!validMeetingDate(scheduledDate) || scheduledDate < todayInNairobi()) return res.status(400).json({ message: "Choose today or a future date for the election." });
  if (candidateIds.length < 2 || candidateIds.length > 20 || candidateIds.length !== rawCandidateIds.length) return res.status(400).json({ message: "Select 2 to 20 different active members as candidates." });
  if (activeElectionFor(req.user.chamaId)) return res.status(409).json({ message: "Another leadership election is already in progress for this chama." });
  for (const id of candidateIds) if (state.users.some(item => item.id === id && item.chamaId !== req.user.chamaId)) return res.status(404).json({ message: "One or more candidates are not active members of this chama." });
  const members = activeGroupMembers(req.user.chamaId);
  const candidates = candidateIds.map(id => members.find(item => item.id === id && item.role === "member"));
  if (candidates.some(item => !item)) return res.status(400).json({ message: "Every candidate must be an active Member of this chama." });
  const at = now();
  const election = { id: newId(), type: "election", role, candidateIds, candidateNames: candidates.map(item => ({ id: item.id, name: item.name })), status: "scheduled", scheduledDate, proposedBy: req.user.id, proposedAt: at, ballots: [], chamaId: req.user.chamaId };
  const updated = structuredClone(state);
  updated.leadershipChanges.push(election);
  updated.auditLog.push(auditEntry("leadership.election.scheduled", election.id, req.user, { role, candidateCount: candidateIds.length, scheduledDate }));
  applyScheduledElections(updated);
  return commit(req, res, next, updated, 201, { message: `Election scheduled for ${scheduledDate}. Voting is open only on that date.`, data: safeElectionView(election, req.user) }, undefined, () => { scheduleLeadershipElectionCheck(); publishMemberUpdate(req.user.chamaId); });
}));
app.post("/api/leadership-elections/:id/runoff", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), requireActiveSubscription, idempotent((req, res, next) => {
  const election = electionById(req.params.id, req.user.chamaId);
  const scheduledDate = clean(req.body?.scheduledDate);
  if (!election || election.status !== "runoff-needed") return res.status(404).json({ message: "Election tie awaiting a runoff was not found." });
  const activeRunoff = scopeToChama(state.leadershipChanges, req.user.chamaId).some(item => isElection(item) && item.parentElectionId === election.id && activeElectionStatuses.has(item.status));
  if (activeRunoff) return res.status(409).json({ message: "A runoff for this tie is already scheduled or in progress." });
  if (!validMeetingDate(scheduledDate) || scheduledDate < todayInNairobi()) return res.status(400).json({ message: "Choose today or a future date for the runoff." });
  const members = activeGroupMembers(req.user.chamaId);
  const candidateIds = (election.result?.tiedCandidateIds || []).filter(id => members.some(member => member.id === id && member.role === "member"));
  if (candidateIds.length < 2) return res.status(409).json({ message: "Fewer than two tied candidates remain eligible for a runoff." });
  const at = now();
  const runoff = { id: newId(), type: "election", role: election.role, candidateIds, candidateNames: election.candidateNames.filter(item => candidateIds.includes(item.id)), status: "scheduled", scheduledDate, parentElectionId: election.id, proposedBy: req.user.id, proposedAt: at, ballots: [], chamaId: req.user.chamaId };
  const updated = structuredClone(state);
  updated.leadershipChanges.push(runoff);
  updated.auditLog.push(auditEntry("leadership.election.runoff-scheduled", runoff.id, req.user, { role: runoff.role, candidateCount: candidateIds.length, scheduledDate }));
  applyScheduledElections(updated);
  return commit(req, res, next, updated, 201, { message: `Runoff scheduled for ${scheduledDate}.`, data: safeElectionView(runoff, req.user) }, undefined, () => { scheduleLeadershipElectionCheck(); publishMemberUpdate(req.user.chamaId); });
}));
app.post("/api/leadership-elections/:id/decline", requireAuth, requirePinChanged, requireRole("chairperson"), requireActiveSubscription, idempotent((req, res, next) => {
  const election = electionById(req.params.id, req.user.chamaId);
  if (!election) return res.status(404).json({ message: "Election not found." });
  if (election.scheduledDate) return res.status(409).json({ message: "Scheduled elections cannot be declined after their date is set." });
  if (election.status !== "proposed" || activeElectionFor(req.user.chamaId) !== election) return res.status(409).json({ message: "Only a proposal awaiting acceptance can be declined." });
  const updated = structuredClone(state);
  const saved = updated.leadershipChanges.find(item => isElection(item) && item.id === election.id && item.chamaId === req.user.chamaId);
  saved.status = "declined"; saved.declinedAt = now(); saved.declinedBy = req.user.id;
  updated.auditLog.push(auditEntry("leadership.election.declined", saved.id, req.user, { role: saved.role }));
  addNotifications(updated, saved, `The ${saved.role} election proposal was declined. The Secretary may submit a new proposal.`, saved.declinedAt);
  return commit(req, res, next, updated, 200, { message: "Election proposal declined. The Secretary can submit a new proposal.", data: safeElectionView(saved, req.user) }, undefined, () => publishMemberUpdate(req.user.chamaId));
}));
app.post("/api/leadership-elections/:id/accept", requireAuth, requirePinChanged, requireRole("chairperson"), requireActiveSubscription, idempotent((req, res, next) => {
  const election = electionById(req.params.id, req.user.chamaId);
  if (!election) return res.status(404).json({ message: "Election not found." });
  if (election.scheduledDate) return res.status(409).json({ message: "Scheduled elections open automatically on their election date." });
  if (election.status !== "proposed" || activeElectionFor(req.user.chamaId) !== election) return res.status(409).json({ message: "This election is no longer awaiting acceptance." });
  const members = activeGroupMembers(req.user.chamaId);
  const candidates = election.candidateIds.map(id => members.find(item => item.id === id && item.role === "member"));
  if (candidates.some(item => !item)) return res.status(409).json({ message: "A proposed candidate is no longer an active Member of this chama. Ask the Secretary to revise the proposal." });
  if (members.length < 2) return res.status(409).json({ message: "At least two active chama members are required to hold an election." });
  const updated = structuredClone(state);
  const saved = updated.leadershipChanges.find(item => isElection(item) && item.id === election.id && item.chamaId === req.user.chamaId);
  saved.status = "voting"; saved.acceptedAt = now(); saved.acceptedBy = req.user.id;
  saved.eligibleVoterIds = members.map(item => item.id); saved.ballots = [];
  updated.auditLog.push(auditEntry("leadership.election.accepted", saved.id, req.user, { role: saved.role, eligibleVoters: saved.eligibleVoterIds.length }));
  return commit(req, res, next, updated, 200, { message: "Election accepted. Members can now vote.", data: safeElectionView(saved, req.user) }, undefined, () => publishMemberUpdate(req.user.chamaId));
}));
app.post("/api/leadership-elections/:id/vote", requireAuth, requirePinChanged, requireActiveSubscription, idempotent(async (req, res, next) => {
  const updated = structuredClone(state);
  applyScheduledElections(updated);
  const election = scopeToChama(updated.leadershipChanges, req.user.chamaId).find(item => isElection(item) && item.id === req.params.id);
  if (!election) return res.status(404).json({ message: "Election not found." });
  if (election.status !== "voting") return res.status(409).json({ message: "Voting is not open for this election." });
  const window = electionWindow(election.scheduledDate);
  if (window && (Date.now() < window.start || Date.now() >= window.end)) return res.status(409).json({ message: "Voting is open only on the scheduled election date in Nairobi time." });
  const voter = updated.users.find(item => item.id === req.user.id && item.chamaId === req.user.chamaId && item.status === "active");
  if (!voter || !(election.eligibleVoterIds || []).includes(voter.id)) return res.status(403).json({ message: "Only active members of this chama who were eligible when voting opened may vote." });
  const candidateId = clean(req.body?.candidateId);
  const candidate = updated.users.find(item => item.id === candidateId && item.chamaId === req.user.chamaId && item.status === "active" && item.role === "member");
  if (!candidate || !election.candidateIds.includes(candidate.id)) return res.status(400).json({ message: "Choose an active candidate in this election." });
  const voterToken = electionVoterToken(election, voter);
  if ((election.ballots || []).some(item => item.voterToken === voterToken)) return res.status(409).json({ message: "You have already voted in this election." });
  election.ballots.push({ voterToken, candidateId: candidate.id, at: now() });
  updated.auditLog.push(auditEntry("leadership.election.vote-cast", election.id, req.user, { role: election.role }));
  const view = electionView(election, voter, scopeToChama(updated.users, req.user.chamaId), voterToken);
  return commit(req, res, next, updated, 200, { message: "Your secret vote has been recorded.", data: view }, undefined, () => publishMemberUpdate(req.user.chamaId));
}));
app.post("/api/leadership-elections/:id/close", requireAuth, requirePinChanged, requireRole("chairperson"), requireActiveSubscription, idempotent((req, res, next) => {
  const election = electionById(req.params.id, req.user.chamaId);
  if (!election) return res.status(404).json({ message: "Election not found." });
  if (election.scheduledDate) return res.status(409).json({ message: "Scheduled elections close automatically at the end of their election date." });
  if (election.status !== "voting") return res.status(409).json({ message: "Only an open election can be closed." });
  const updated = structuredClone(state);
  const saved = updated.leadershipChanges.find(item => isElection(item) && item.id === election.id && item.chamaId === req.user.chamaId);
  saved.status = "closed"; saved.closedAt = now(); saved.result = resultFor(saved);
  updated.auditLog.push(auditEntry("leadership.election.closed", saved.id, req.user, { role: saved.role, votesCast: saved.result.votesCast }));
  addNotifications(updated, saved, `Voting for ${saved.role} is closed. The Chairperson is verifying the result.`, saved.closedAt);
  return commit(req, res, next, updated, 200, { message: "Voting is closed. The Chairperson can verify the result.", data: safeElectionView(saved, req.user) }, undefined, () => publishMemberUpdate(req.user.chamaId));
}));
app.post("/api/leadership-elections/:id/verify", requireAuth, requirePinChanged, requireRole("chairperson"), requireActiveSubscription, idempotent((req, res, next) => {
  const election = electionById(req.params.id, req.user.chamaId);
  if (!election) return res.status(404).json({ message: "Election not found." });
  if (election.scheduledDate) return res.status(409).json({ message: "Scheduled election results are calculated automatically when voting closes." });
  if (election.status !== "closed" || !election.result) return res.status(409).json({ message: "Only a closed election can be verified." });
  const updated = structuredClone(state);
  const saved = updated.leadershipChanges.find(item => isElection(item) && item.id === election.id && item.chamaId === req.user.chamaId);
  saved.verifiedAt = now(); saved.verifiedBy = req.user.id;
  if (saved.result.tiedCandidateIds?.length > 1) {
    const members = activeGroupMembers(req.user.chamaId);
    const runoffCandidates = saved.result.tiedCandidateIds.filter(id => members.some(item => item.id === id && item.role === "member"));
    if (runoffCandidates.length < 2) {
      saved.status = "verified-no-winner";
      saved.result.reason = "Fewer than two tied candidates remain eligible for a runoff.";
      updated.auditLog.push(auditEntry("leadership.election.verified-no-winner", saved.id, req.user, { role: saved.role, reason: "runoff candidates are no longer eligible" }));
      addNotifications(updated, saved, `The ${saved.role} election was tied, but a runoff could not open because fewer than two tied candidates remain eligible.`, saved.verifiedAt);
      return commit(req, res, next, updated, 200, { message: "The tie is verified, but a runoff cannot open because fewer than two tied candidates remain eligible.", data: safeElectionView(saved, req.user) }, undefined, () => publishMemberUpdate(req.user.chamaId));
    }
    saved.status = "verified-tie";
    const runoffAt = now();
    const runoff = { id: newId(), type: "election", role: saved.role, candidateIds: runoffCandidates, candidateNames: saved.candidateNames.filter(item => runoffCandidates.includes(item.id)), status: "voting", parentElectionId: saved.id, proposedBy: saved.proposedBy, proposedAt: runoffAt, acceptedAt: runoffAt, acceptedBy: req.user.id, eligibleVoterIds: members.map(item => item.id), ballots: [], chamaId: req.user.chamaId };
    updated.leadershipChanges.push(runoff);
    updated.auditLog.push(auditEntry("leadership.election.runoff-opened", saved.id, req.user, { role: saved.role, candidateCount: runoffCandidates.length }));
    addNotifications(updated, saved, `The ${saved.role} election was tied. A runoff is now open between the tied candidates.`, saved.verifiedAt);
    return commit(req, res, next, updated, 200, { message: "The tie has been verified. A runoff is open for the tied candidates.", data: safeElectionView(saved, req.user) }, undefined, () => publishMemberUpdate(req.user.chamaId));
  }
  const winner = saved.result.winnerId && updated.users.find(item => item.id === saved.result.winnerId && item.chamaId === req.user.chamaId && item.status === "active" && item.role === "member");
  if (!winner) {
    saved.status = "verified-no-winner";
    saved.result.reason = saved.result.votesCast ? "The leading candidate is no longer eligible." : "No votes were cast.";
    updated.auditLog.push(auditEntry("leadership.election.verified-no-winner", saved.id, req.user, { role: saved.role, votesCast: saved.result.votesCast }));
    addNotifications(updated, saved, `The ${saved.role} election has no winner. The Secretary can propose another election.`, saved.verifiedAt);
    return commit(req, res, next, updated, 200, { message: "The result is verified; no eligible winner was recorded.", data: safeElectionView(saved, req.user) }, undefined, () => publishMemberUpdate(req.user.chamaId));
  }
  saved.status = "verified"; saved.winnerId = winner.id;
  saved.activationAt = new Date(Date.parse(saved.verifiedAt) + 24 * 60 * 60 * 1000).toISOString();
  updated.auditLog.push(auditEntry("leadership.election.verified", saved.id, req.user, { role: saved.role, winnerId: winner.id, activationAt: saved.activationAt }));
  addNotifications(updated, saved, `${winner.name} won the ${saved.role} election. The role and group portal access will switch in 24 hours.`, saved.verifiedAt);
  return commit(req, res, next, updated, 200, { message: "Result verified. The group portal roles will update in 24 hours.", data: safeElectionView(saved, req.user) }, undefined, () => { scheduleLeadershipElectionCheck(); publishMemberUpdate(req.user.chamaId); });
}));

app.post("/api/leadership-changes", requireAuth, requirePinChanged, requireRole("chairperson"), requireActiveSubscription, idempotent((req, res, next) => {
  const role = clean(req.body?.role); const incomingUserId = clean(req.body?.incomingUserId);
  const foreignIncoming = state.users.find(item => item.id === incomingUserId && item.chamaId !== req.user.chamaId);
  if (foreignIncoming) return res.status(404).json({ message: "Member not found." });
  const incoming = scopeToChama(state.users, req.user.chamaId).find(item => item.id === incomingUserId && item.status === "active"); const effectiveDate = clean(req.body?.effectiveDate);
  if (!["chairperson", "secretary", "treasurer"].includes(role) || !incoming || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return res.status(400).json({ message: "Provide an active member, an office, and an effective date." });
  const chamaUsers = scopeToChama(state.users, req.user.chamaId);
  const outgoing = chamaUsers.find(item => item.role === role && item.status === "active");
  const hasOtherOfficer = chamaUsers.some(item => item.status === "active" && item.id !== req.user.id && ["chairperson", "secretary", "treasurer"].includes(item.role));
  const priorLeadershipChange = scopeToChama(state.leadershipChanges, req.user.chamaId).some(item => item.type === "appointment");
  const bootstrapOnly = !hasOtherOfficer && !priorLeadershipChange && !outgoing && incoming.role === "member" && incoming.id !== req.user.id && ["secretary", "treasurer"].includes(role);
  if (!bootstrapOnly) return res.status(409).json({ message: "Officer changes after initial setup must use a member election." });
  const confirmedImmediately = true;
  const proposedAt = now(); const record = { id: newId(), type: "appointment", bootstrap: true, role, outgoingUserId: null, incomingUserId: incoming.id, effectiveDate, vote: null, emergencyReason: null, status: "confirmed", proposedBy: req.user.id, proposedAt, confirmedBy: req.user.id, confirmedAt: proposedAt, audit: [{ action: "proposed", by: req.user.id, at: proposedAt }], chamaId: req.user.chamaId };
  if (confirmedImmediately) record.audit.push({ action: "confirmed", by: req.user.id, at: proposedAt });
  const updated = structuredClone(state); if (confirmedImmediately) { const savedOutgoing = record.outgoingUserId && scopeToChama(updated.users, req.user.chamaId).find(item => item.id === record.outgoingUserId); const savedIncoming = scopeToChama(updated.users, req.user.chamaId).find(item => item.id === record.incomingUserId); if (savedOutgoing) savedOutgoing.role = "member"; savedIncoming.role = record.role; } updated.leadershipChanges.push(record); updated.auditLog.push(auditEntry(confirmedImmediately ? "leadership.confirmed" : "leadership.proposed", record.id, req.user, { role, incomingUserId: incoming.id, outgoingUserId: outgoing?.id || null })); return commit(req, res, next, updated, 201, { message: confirmedImmediately ? "Officer assignment approved by the Chairperson." : "Officer assignment proposed and awaiting another officer.", data: record });
}));
app.post("/api/leadership-changes/:id/confirm", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), requireActiveSubscription, idempotent((req, res, next) => {
  const updated = structuredClone(state); const record = scopeToChama(updated.leadershipChanges, req.user.chamaId).find(item => item.id === req.params.id && item.status === "pending"); if (!record) return res.status(404).json({ message: "Pending leadership change not found." });
  if (record.type !== "appointment" || !record.bootstrap) return res.status(409).json({ message: "Officer changes after initial setup must use a member election." });
  if (record.proposedBy === req.user.id) return res.status(409).json({ message: "A different officer must confirm this leadership change." });
  const oldOfficial = record.outgoingUserId && scopeToChama(updated.users, req.user.chamaId).find(item => item.id === record.outgoingUserId); const incoming = scopeToChama(updated.users, req.user.chamaId).find(item => item.id === record.incomingUserId); if (oldOfficial) oldOfficial.role = "member"; if (!incoming) return res.status(404).json({ message: "Pending leadership change not found." }); incoming.role = record.role; record.status = "confirmed"; record.confirmedBy = req.user.id; record.confirmedAt = now(); record.audit.push({ action: "confirmed", by: req.user.id, at: record.confirmedAt });
  updated.auditLog.push(auditEntry("leadership.confirmed", record.id, req.user, { role: record.role, incomingUserId: record.incomingUserId, outgoingUserId: record.outgoingUserId }));
  return commit(req, res, next, updated, 200, { message: "Officer assignment confirmed.", data: record });
}));
app.post("/api/leadership-changes/:id/revoke", requireAuth, requirePinChanged, requireRole("chairperson"), idempotent((req, res, next) => {
  const reason = clean(req.body?.reason);
  if (reason.length < 5 || reason.length > 500) return res.status(400).json({ message: "Enter a reason of 5-500 characters." });
  const updated = structuredClone(state);
  const record = scopeToChama(updated.leadershipChanges, req.user.chamaId).find(item => item.id === req.params.id);
  if (!record) return res.status(404).json({ message: "Leadership change not found." });
  const member = scopeToChama(updated.users, req.user.chamaId).find(item => item.id === record.incomingUserId);
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
app.get("/api/leadership-changes", requireAuth, requirePinChanged, requireRole("chairperson", "secretary"), (req, res) => res.json({ data: scopeToChama(state.leadershipChanges, req.user.chamaId).filter(item => !isElection(item)) }));
app.get("/api/audit-log", requireAuth, requirePinChanged, requireRole("chairperson", "treasurer"), (req, res) => {
  const userChamas = new Map(state.users.map(user => [user.id, user.chamaId]));
  const data = scopeToChama(state.auditLog, req.user.chamaId, entry =>
    entry.chamaId || userChamas.get(entry.by?.id) || userChamas.get(entry.memberId)
  ).slice().reverse();
  return res.json({ data });
});

// ---------------------------------------------------------------------------
// M-Pesa settlement callbacks stay disabled until request authentication and exact amount matching exist.
function simulatedPaymentView(payment) {
  return {
    id: payment.id,
    transactionId: payment.transactionId,
    phoneNumber: payment.phoneNumber,
    amount: payment.amount,
    reference: payment.reference,
    timestamp: payment.timestamp,
    receivedAt: payment.receivedAt,
    status: SIMULATED_PAYMENT_STATUSES.has(payment.status) ? payment.status : "Unverified",
    rawPayload: payment.payload || {},
  };
}

app.get("/api/payments/inbox", requireAuth, requirePinChanged, requireRole("treasurer"), (req, res) => {
  if (!SIMULATED_PAYMENTS_ENABLED) return res.status(404).json({ message: "Not found." });
  const data = scopeToChama(state.pendingMpesas, req.user.chamaId, item => item.chamaId)
    .filter(payment => payment.simulated === true && SIMULATED_PAYMENT_STATUSES.has(payment.status))
    .slice()
    .sort((left, right) => String(right.receivedAt).localeCompare(String(left.receivedAt)))
    .map(simulatedPaymentView);
  return res.json({ data });
});

app.post("/api/payments/simulate", requireAuth, requirePinChanged, requireRole("treasurer"), (req, res, next) => {
  if (!SIMULATED_PAYMENTS_ENABLED) return res.status(404).json({ message: "Not found." });
  return next();
}, idempotent(async (req, res, next) => {
  const transactionId = clean(req.body?.transactionId).toUpperCase();
  const phoneNumber = clean(req.body?.phoneNumber).toUpperCase();
  const amountInput = req.body?.amount;
  const amount = Number(amountInput);
  const reference = clean(req.body?.reference);
  const timestampInput = clean(req.body?.timestamp);
  const timestampValue = Date.parse(timestampInput);
  const validAmountFormat = typeof amountInput === "number"
    ? Number.isFinite(amountInput)
    : typeof amountInput === "string" && /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(amountInput);
  const validTimestampFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestampInput);
  const hasTwoDecimalPlacesAtMost = Number.isFinite(amount) && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7;
  if (!/^TEST-[A-Z0-9](?:[A-Z0-9-]{2,60})$/.test(transactionId) || !/^TEST-[A-Z0-9](?:[A-Z0-9-]{2,60})$/.test(phoneNumber)) {
    return res.status(400).json({ message: "Use TEST-prefixed transaction IDs and fake phone identifiers only." });
  }
  if (!validAmountFormat || !Number.isFinite(amount) || amount <= 0 || amount > 10000000 || !hasTwoDecimalPlacesAtMost || !reference || reference.length > 80 || !validTimestampFormat || !Number.isFinite(timestampValue)) {
    return res.status(400).json({ message: "Enter a positive amount up to KES 10,000,000, a reference up to 80 characters, and a valid timestamp." });
  }
  const existing = scopeToChama(state.pendingMpesas, req.user.chamaId, item => item.chamaId)
    .find(payment => payment.simulated === true && payment.transactionId === transactionId);
  if (existing) return res.status(409).json({ message: "That simulated transaction ID is already in the inbox." });
  const timestamp = new Date(timestampValue).toISOString();
  const receivedAt = now();
  const payload = {
    testOnly: true,
    Body: {
      stkCallback: {
        CheckoutRequestID: `SIM-${transactionId}`,
        ResultCode: 0,
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: amount },
            { Name: "MpesaReceiptNumber", Value: transactionId },
            { Name: "TransactionDate", Value: timestamp },
            { Name: "PhoneNumber", Value: phoneNumber },
            { Name: "AccountReference", Value: reference },
          ],
        },
      },
    },
  };
  const payment = {
    id: newId(), chamaId: req.user.chamaId, callbackKey: `SIMULATED:${transactionId}`,
    transactionId, phoneNumber, amount, reference, timestamp, receivedAt,
    simulated: true, status: "Unverified", payload,
  };
  if (!SIMULATED_PAYMENT_STATUSES.has(payment.status)) return res.status(500).json({ message: "Invalid simulated-payment status." });
  const updated = structuredClone(state);
  if (!Array.isArray(updated.pendingMpesas)) updated.pendingMpesas = [];
  updated.pendingMpesas.push(payment);
  const body = { message: "Simulated payment saved as Unverified; no balance was changed.", data: simulatedPaymentView(payment) };
  return commit(req, res, next, updated, 201, body);
}));

app.post("/api/mpesa/callback", (req, res) => res.status(503).json({ message: "STK payment requests are not implemented. No payment request was sent or subscription activated." }));
app.post("/api/mpesa/c2b/validation", (req, res) => {
  if (!SUBSCRIPTION_PAYMENTS_ENABLED) return res.status(503).json({ ResultCode: 1, ResultDesc: SUBSCRIPTION_PAYMENTS_PAUSED_MESSAGE });
  const config = getC2bSubscriptionConfig(process.env);
  if (!config.enabled) return res.status(503).json({ ResultCode: 1, ResultDesc: "Sandbox C2B subscription verification is not configured." });
  if (!isTrustedCallbackIp(req.ip, process.env)) return res.status(403).json({ ResultCode: 1, ResultDesc: "Untrusted callback source." });
  const payment = parseC2bPayment(req.body);
  if (!payment) return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback data." });
  if (!pendingSubscriptionForPayment(state, payment, config)) return res.status(200).json({ ResultCode: 1, ResultDesc: "No matching pending subscription." });
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted." });
});
app.post("/api/mpesa/c2b/confirmation", async (req, res, next) => {
  if (!SUBSCRIPTION_PAYMENTS_ENABLED) return res.status(503).json({ ResultCode: 1, ResultDesc: SUBSCRIPTION_PAYMENTS_PAUSED_MESSAGE });
  const config = getC2bSubscriptionConfig(process.env);
  if (!config.enabled) return res.status(503).json({ ResultCode: 1, ResultDesc: "Sandbox C2B subscription verification is not configured." });
  if (!isTrustedCallbackIp(req.ip, process.env)) return res.status(403).json({ ResultCode: 1, ResultDesc: "Untrusted callback source." });
  const payment = parseC2bPayment(req.body);
  if (!payment) return res.status(400).json({ ResultCode: 1, ResultDesc: "Invalid callback data." });
  const mappedChamaId = config.shortcodeToChama.get(payment.shortcode);
  const duplicate = (state.pendingMpesas || []).find(item => String(item.mpesaReceiptNumber || "").toUpperCase() === payment.transactionId);
  if (duplicate) {
    const samePayment = duplicate.chamaId === mappedChamaId
      && String(duplicate.reference || "").toUpperCase() === payment.reference
      && duplicate.status === "Verified";
    return res.status(200).json(samePayment
      ? { ResultCode: 0, ResultDesc: "Already recorded." }
      : { ResultCode: 1, ResultDesc: "Receipt already used." });
  }
  const match = pendingSubscriptionForPayment(state, payment, config);
  if (!match) return res.status(200).json({ ResultCode: 1, ResultDesc: "No matching pending subscription." });

  const updated = structuredClone(state);
  const chama = updated.chamas.find(item => item.id === match.chama.id);
  const current = chama.subscription || {};
  const verifiedAt = new Date().toISOString();
  const verifiedMs = Date.parse(verifiedAt);
  const oldEndsAt = Date.parse(current.endsAt);
  const periodStart = subscriptionIsActive(current, verifiedMs) && Number.isFinite(oldEndsAt)
    ? new Date(Math.max(verifiedMs, oldEndsAt)) : new Date(verifiedMs);
  const periodEnd = addSubscriptionPeriod(periodStart, match.pending.billing);
  if (!periodEnd) return res.status(200).json({ ResultCode: 1, ResultDesc: "Invalid subscription term." });
  const startedAt = periodStart.toISOString();
  const endsAt = periodEnd.toISOString();
  const history = [...(Array.isArray(current.history) ? current.history : []), {
    type: "subscription.verified", at: verifiedAt, provider: "mpesa-c2b",
    reference: match.pending.reference, receiptNumber: payment.transactionId,
    tier: match.plan.label, billing: match.pending.billing, amount: payment.amount,
    currency: "KES", startedAt, endsAt,
  }];
  chama.subscription = {
    ...current, status: "active", tier: match.plan.label, billing: match.pending.billing,
    currency: "KES", expectedAmount: payment.amount, annualSavings: match.pending.annualSavings,
    maxMembers: match.plan.maxMembers, startedAt, endsAt,
    reference: match.pending.reference, verifiedAt, provider: "mpesa-c2b",
    pendingPayment: { ...match.pending, status: "paid", paidAt: verifiedAt, transactionId: payment.transactionId },
    history,
  };
  if (!Array.isArray(updated.pendingMpesas)) updated.pendingMpesas = [];
  updated.pendingMpesas.push({
    id: newId(), chamaId: chama.id, callbackKey: `C2B:${payment.transactionId}`,
    mpesaReceiptNumber: payment.transactionId, reference: payment.reference,
    amount: payment.amount, currency: "KES", status: "Verified", processed: true,
    receivedAt: verifiedAt,
    payload: { type: "subscription-c2b-confirmation", shortcode: payment.shortcode, reference: payment.reference, amount: payment.amount, currency: "KES", transactionTime: payment.transactionTime },
  });
  updated.auditLog.push(auditEntry("subscription.verified", match.pending.reference,
    { id: "mpesa-c2b", name: "M-PESA C2B verification", role: "system" }, {
      chamaId: chama.id, tier: match.plan.label, billing: match.pending.billing,
      amount: payment.amount, currency: "KES", receiptNumber: payment.transactionId,
    }));
  try {
    await persist(updated);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Subscription verified." });
  } catch (error) { return next(error); }
});

// OTP phone-auth (Phase 1)
// Alternative sign-in via SMS OTP — supplements the existing PIN login.
// /api/otp/request  — send a 6-digit code only when SMS delivery is configured.
// /api/otp/verify   — verify the code and open a session identical to PIN
//                     login.
// ---------------------------------------------------------------------------
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RATE_LIMIT = sharedRateLimit("otp", {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many OTP requests. Please try again later." },
});
function otpDestinationKey(req) {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return `ip:${ipKeyGenerator(req.ip)}`;
  const digest = crypto.createHmac("sha256", SESSION_SECRET).update(phone).digest("hex");
  return `phone:${digest}`;
}
const OTP_SEND_COOLDOWN = sharedRateLimit("otp-send-cooldown", {
  windowMs: 60 * 1000,
  max: 1,
  keyGenerator: otpDestinationKey,
  message: { message: "If that phone number is registered, a sign-in code may be sent." },
});
const OTP_SEND_DAILY_LIMIT = sharedRateLimit("otp-send-daily", {
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  keyGenerator: otpDestinationKey,
  message: { message: "If that phone number is registered, a sign-in code may be sent." },
});

app.post("/api/otp/request", OTP_RATE_LIMIT, OTP_SEND_COOLDOWN, OTP_SEND_DAILY_LIMIT, (req, res, next) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ message: "Enter a valid Kenyan mobile phone number." });
  if (!emailConfigured()) return res.status(503).json({ message: "Phone-code sign-in is unavailable until secure email delivery is configured." });
  // Find at least one active account for this phone.
  const accounts = state.users.filter(u => u.phone === phone && u.status === "active");
  // Respond identically whether or not the phone is registered (no enumeration).
  const genericOk = { message: "If that phone number is registered, a sign-in code may be sent." };
  if (!accounts.length) return res.json(genericOk);
  const otp = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + OTP_TTL_MS;
  // Store hashed OTP in session (no user lookup on request side).
  req.session.otpHash = hashCode(otp);
  req.session.otpPhone = phone;
  req.session.otpExpiresAt = expiresAt;
  req.session.save(err => {
    if (err) return next(err);
    // Never log one-time codes. Only return the generic response after dispatch.
    const recipient = accounts.find(u => validEmail(u.email)) || accounts[0];
    const recipientEmail = recipient?.email;
    sendEmail(recipientEmail, "Jirani Chama Sign-In Code", `Your Jirani Chama sign-in code is ${otp}. It expires in 10 minutes. Do not share it.`)
      .then(info => {
        if (process.env.SMTP_TRANSPORT === "json" && info?.message && process.env.SMTP_LOG_FILE) {
          appendJsonEmailCapture(process.env.SMTP_LOG_FILE, info.message);
        }
        res.json(genericOk);
      })
      .catch(() => {
        delete req.session.otpHash;
        delete req.session.otpPhone;
        delete req.session.otpExpiresAt;
        req.session.save(saveError => saveError ? next(saveError) : res.json(genericOk));
      });
  });
});

app.post("/api/otp/verify", OTP_RATE_LIMIT, async (req, res, next) => {
  const phone = normalizePhone(req.body?.phone);
  const code = clean(req.body?.code);
  const pin = clean(req.body?.pin);
  const requestedChamaId = clean(req.body?.chamaId);
  if (!phone || !/^\d{6}$/.test(code) || !validPin(pin)) {
    return res.status(400).json({ message: "Enter a valid phone number, 6-digit sign-in code, and current PIN." });
  }
  const phoneKey = `phone:${phone}`;
  const ipKey = `ip:${req.ip}`;
  if (await loginLocked(phoneKey, ipKey)) {
    return res.status(429).json({ message: "Too many login attempts. Try again in 15 minutes." });
  }
  const { otpHash, otpPhone, otpExpiresAt } = req.session;
  const valid =
    otpHash &&
    otpPhone === phone &&
    typeof otpExpiresAt === "number" &&
    Date.now() < otpExpiresAt &&
    verifyCodeHash(code, otpHash);
  if (!valid) {
    await recordLoginFailure(phoneKey, ipKey);
    return res.status(401).json({ message: "Incorrect or expired activation code." });
  }
  const accounts = state.users.filter(u => u.phone === phone && u.status === "active");
  if (!accounts.length) return res.status(401).json({ message: "No active account found for that phone number." });
  // Multi-chama: let the caller pick, same as PIN login.
  if (accounts.length > 1 && !requestedChamaId) {
    return res.status(200).json({
      message: "Pick a chama to enter.",
      chooseChamaId: accounts.map(a => ({ chamaId: a.chamaId, name: findChamaName(a.chamaId) })),
    });
  }
  const user = requestedChamaId
    ? accounts.find(a => a.chamaId === requestedChamaId)
    : accounts[0];
  if (!user) return res.status(401).json({ message: "Account not found in that chama." });
  if (!verifyPin(pin, user.pinHash)) {
    await recordLoginFailure(phoneKey, ipKey);
    return res.status(401).json({ message: "Incorrect phone number or PIN." });
  }
  await markLegacyPinForChange(user, pin);
  // The OTP is consumed only after both the code and current PIN are verified.
  delete req.session.otpHash;
  delete req.session.otpPhone;
  delete req.session.otpExpiresAt;
  await clearLoginFailures(phoneKey, ipKey);
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.lastActivityAt = Date.now();
    req.session.save(saveErr =>
      saveErr ? next(saveErr) : res.json({ message: "Signed in successfully.", user: safeUser(user) })
    );
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  // Client errors from the body parser (for example malformed JSON) keep their 4xx status.
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: "The request could not be read. Check the data and try again.", requestId: req.requestId });
  logger.error("Request failed", { err: error.message, stack: error.stack });
  return res.status(500).json({ message: "The server could not save this change. Check the dashboard before retrying.", requestId: req.requestId });
});
async function start() {
  await initializeStorage();
  await sessionBackend.connect();
  if (redisPub && redisSub) {
    redisEventsReady = await connectEventClients({
      publisher: redisPub,
      subscriber: redisSub,
      subscribe: client => client.pSubscribe("chama:*:events", (message, channel) => {
        const match = channel.match(/^chama:(.+):events$/);
        if (match) broadcastLocalSse(match[1], message);
      }),
      onFailure: error => logger.warn("Redis event fanout unavailable; local SSE and polling fallback remain active", { err: error.message }),
    });
  }
  if (redisCache && !redisCache.isOpen) await redisCache.connect();
  await processDueLeadershipElections();
  scheduleLeadershipElectionCheck();
  const server = app.listen(PORT, APP_BIND_HOST, () => logger.info(`Jirani Chama backend running at http://localhost:${PORT}`));
  server.once("close", () => {
    if (leadershipElectionTimer) clearTimeout(leadershipElectionTimer);
    leadershipElectionTimer = null;
    void closeRuntimeDependencies();
  });
  return server;
}

async function closeRuntimeDependencies() {
  if (postgresRuntimeLock) {
    await postgresRuntimeLock.release().catch(error => logger.warn("PostgreSQL runtime lock release failed", { err: error.message }));
    postgresRuntimeLock = null;
  }
  const tasks = [
    sessionBackend.close(),
    closeRedisClient(redisPub),
    closeRedisClient(redisSub),
    closeRedisClient(redisCache),
  ];
  if (postgresPool) tasks.push(postgresPool.end());
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") logger.warn("Runtime dependency close failed", { err: result.reason?.message || String(result.reason) });
  }
}

function closeRedisClient(client) {
  return client?.isOpen ? client.quit() : Promise.resolve();
}

function closeSseClients() {
  for (const client of eventClients) {
    removeSseClient(client);
    try { client.res.end(); } catch {}
  }
}

if (require.main === module) start().then(server => {
  const shutdown = () => {
    closeSseClients();
    server.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}).catch(error => {
  logger.error("Server startup failed", { err: error.message });
  process.exitCode = 1;
});

module.exports = { app, start, broadcastToChama, broadcastLocalSse, invalidateSummaryCache, writeQueue };
