"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { server: webAuthnServer } = require("@passwordless-id/webauthn");
const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const USED_CHALLENGE_PREFIX = "jirani:passkeys:used:";
const LOCAL_USED_CHALLENGE_LIMIT = 10_000;
const localUsedChallenges = new Map();
const VALID_TRANSPORTS = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);

function isLoopback(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost";
}

function derivePasskeyContext({ originHeader, hostHeader, strictOrigin = false, canonicalOrigin = null } = {}) {
  if (typeof originHeader !== "string" || !originHeader || typeof hostHeader !== "string" || !hostHeader) return null;
  let parsed;
  try { parsed = new URL(originHeader); } catch { return null; }
  if (parsed.origin !== originHeader || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
  const localHttp = parsed.protocol === "http:" && isLoopback(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) return null;
  if (strictOrigin) {
    if (parsed.protocol !== "https:" || typeof canonicalOrigin !== "string" || parsed.origin !== canonicalOrigin) return null;
  } else if (parsed.host.toLowerCase() !== hostHeader.toLowerCase()) {
    return null;
  }
  const rpId = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!rpId || rpId.length > 253 || net.isIP(rpId)) return null;
  return { origin: parsed.origin, rpId };
}

function isCanonicalBase64Url(value, minLength = 1, maxLength = 8192) {
  if (typeof value !== "string" || value.length < minLength || value.length > maxLength || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try { return Buffer.from(value, "base64url").toString("base64url") === value; }
  catch { return false; }
}

function validPasskeyUserHandle(value) {
  return isCanonicalBase64Url(value, 32, 64);
}

function encodeUserHandle(value) {
  return typeof value === "string" ? Buffer.from(value, "utf8").toString("base64url") : "";
}

function decodeUserHandle(value) {
  if (!isCanonicalBase64Url(value, 1, 256)) return null;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value, "base64url")); }
  catch { return null; }
}

function newPasskeyUserHandle() {
  return crypto.randomBytes(32).toString("base64url");
}

function validCredentialId(value) {
  return isCanonicalBase64Url(value, 16, 2048);
}

function validTransportList(value) {
  return Array.isArray(value) && value.length <= 8 && value.every(item => typeof item === "string" && VALID_TRANSPORTS.has(item));
}

function isWebAuthnRegistrationPayload(value) {
  const response = value?.response;
  return !!value && typeof value === "object" && value.type === "public-key" &&
    validCredentialId(value.id) && value.rawId === value.id &&
    !!response && typeof response === "object" &&
    isCanonicalBase64Url(response.clientDataJSON, 8) &&
    isCanonicalBase64Url(response.authenticatorData, 50, 8192) &&
    isCanonicalBase64Url(response.attestationObject, 8, 16_384) &&
    isCanonicalBase64Url(response.publicKey, 32, 8192) &&
    [-7, -257].includes(response.publicKeyAlgorithm) &&
    validTransportList(response.transports);
}

function isWebAuthnAssertionPayload(value) {
  const response = value?.response;
  return !!value && typeof value === "object" && value.type === "public-key" &&
    validCredentialId(value.id) && value.rawId === value.id &&
    !!response && typeof response === "object" &&
    isCanonicalBase64Url(response.clientDataJSON, 8) &&
    isCanonicalBase64Url(response.authenticatorData, 37, 8192) &&
    isCanonicalBase64Url(response.signature, 8, 8192) &&
    isCanonicalBase64Url(response.userHandle, 1, 256);
}

function createPasskeyChallenge({ ceremony, challenge, sessionId, origin, rpId, userId = null, chamaId = null, userHandle = null, issuedAt = Date.now() } = {}) {
  if (!( ["login", "registration"].includes(ceremony)) || !isCanonicalBase64Url(challenge, 20, 128) ||
      typeof sessionId !== "string" || !sessionId || typeof origin !== "string" || typeof rpId !== "string") {
    throw new TypeError("Invalid passkey challenge context.");
  }
  return { ceremony, challenge, sessionId, origin, rpId, userId, chamaId, userHandle, issuedAt };
}

function challengeDigest(challenge) {
  return crypto.createHash("sha256").update(challenge, "utf8").digest("hex");
}

function pruneLocalChallenges(nowMs) {
  for (const [digest, expiresAt] of localUsedChallenges) if (expiresAt <= nowMs) localUsedChallenges.delete(digest);
}

async function claimChallenge(challenge, { redisClient = null, production = false, nowMs = Date.now() } = {}) {
  const digest = challengeDigest(challenge);
  if (redisClient) {
    if (!redisClient.isOpen || typeof redisClient.sendCommand !== "function") throw new Error("Shared passkey replay protection is unavailable.");
    const result = await redisClient.sendCommand(["SET", `${USED_CHALLENGE_PREFIX}${digest}`, "1", "NX", "PX", String(PASSKEY_CHALLENGE_TTL_MS)]);
    return result === "OK";
  }
  if (production) throw new Error("Shared passkey replay protection is unavailable.");
  pruneLocalChallenges(nowMs);
  if (localUsedChallenges.has(digest)) return false;
  if (localUsedChallenges.size >= LOCAL_USED_CHALLENGE_LIMIT) throw new Error("Local passkey replay protection capacity is exhausted.");
  localUsedChallenges.set(digest, nowMs + PASSKEY_CHALLENGE_TTL_MS);
  return true;
}

async function consumePasskeyChallenge({ session, sessionId, ceremony, redisClient = null, production = false, saveSession, nowMs = Date.now() } = {}) {
  if (!session || !session.passkeyChallenge) return null;
  const record = session.passkeyChallenge;
  delete session.passkeyChallenge;
  let claimed = false;
  try {
    const issuedAt = Number(record?.issuedAt);
    const structurallyValid = ["login", "registration"].includes(record?.ceremony) &&
      isCanonicalBase64Url(record?.challenge, 20, 128) && typeof record?.sessionId === "string" &&
      typeof record?.origin === "string" && typeof record?.rpId === "string" &&
      Number.isSafeInteger(issuedAt) && issuedAt <= nowMs && nowMs - issuedAt <= PASSKEY_CHALLENGE_TTL_MS;
    if (structurallyValid && record.sessionId === sessionId && record.ceremony === ceremony) {
      claimed = await claimChallenge(record.challenge, { redisClient, production, nowMs });
    }
  } finally {
    if (typeof saveSession === "function") await saveSession(session);
  }
  return claimed ? record : null;
}

function validCounterTransition(previousCounter, nextCounter) {
  const previous = Number.isSafeInteger(previousCounter) && previousCounter >= 0 ? previousCounter : 0;
  return Number.isSafeInteger(nextCounter) && nextCounter >= 0 && !(previous > 0 && nextCounter > 0 && nextCounter <= previous);
}

function nextStoredCounter(previousCounter, nextCounter) {
  const previous = Number.isSafeInteger(previousCounter) && previousCounter >= 0 ? previousCounter : 0;
  const next = Number.isSafeInteger(nextCounter) && nextCounter >= 0 ? nextCounter : 0;
  return Math.max(previous, next);
}

const MAX_PASSKEYS_PER_ACCOUNT = 10;
const RECENT_PIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_FAILURE = { message: "Could not sign in with that passkey. Try again or use your phone number and PIN." };
const REGISTRATION_FAILURE = { message: "Could not add that passkey. Try another device or continue using your PIN." };

function safeTransports(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(item => typeof item === "string" && VALID_TRANSPORTS.has(item)))];
}

function isStoredPasskey(entry) {
  return !!entry && typeof entry === "object" && !Array.isArray(entry) &&
    typeof entry.credentialRef === "string" && /^[0-9a-f-]{36}$/i.test(entry.credentialRef) &&
    isCanonicalBase64Url(entry.id, 16, 2048) &&
    isCanonicalBase64Url(entry.publicKey, 32, 8192) &&
    ["ES256", "RS256"].includes(entry.algorithm) &&
    Number.isSafeInteger(entry.counter) && entry.counter >= 0 &&
    Array.isArray(entry.transports) && entry.transports.length <= 8 &&
    entry.transports.every(item => VALID_TRANSPORTS.has(item));
}

function passkeysFor(user) {
  return Array.isArray(user?.passkeys) ? user.passkeys.filter(isStoredPasskey) : [];
}

function createPasskeyRouter(dependencies) {
  const {
    express,
    getState,
    persist,
    redisClient = null,
    production = false,
    strictOrigin = false,
    canonicalOrigin = null,
    allowedOrigins = new Set(),
    sessionIdleMs = 30 * 60 * 1000,
    requireAuth,
    requirePinChanged,
    loginLimiter,
    passkeyLoginLimiter,
    passkeyManagementLimiter,
    activeSessionsGauge,
    safeUser,
    findChamaName,
    loginLocked,
    recordLoginFailure,
    clearLoginFailures,
    normalizePhone,
    saveSession,
    makeId = () => crypto.randomUUID(),
    now = () => new Date().toISOString(),
  } = dependencies || {};

  const router = express.Router();
  const noStore = (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };
  const secureContextFor = req => {
    const context = derivePasskeyContext({
      originHeader: req.get("Origin"),
      hostHeader: req.get("host"),
      strictOrigin,
      canonicalOrigin,
    });
    if (!context || (strictOrigin && !allowedOrigins.has(context.origin))) return null;
    return context;
  };
  const recentPin = (req, res, next) => {
    const authenticatedAt = Number(req.session?.pinAuthenticatedAt);
    const age = Date.now() - authenticatedAt;
    if (req.session?.authMethod !== "pin" || !Number.isSafeInteger(authenticatedAt) || age < 0 || age > RECENT_PIN_WINDOW_MS) {
      return res.status(403).json({ message: "Sign in with your current PIN again before managing passkeys." });
    }
    return next();
  };
  const ipKeyFor = req => `ip:${req.ip}`;
  const unknownAccountKeyFor = ipKey => `passkey-unknown:${crypto.createHash("sha256").update(ipKey).digest("hex")}`;
  const failUnknownLogin = async (res, ipKey) => {
    const unknownKey = unknownAccountKeyFor(ipKey);
    if (!(await loginLocked(unknownKey, ipKey))) await recordLoginFailure(unknownKey, ipKey);
    return res.status(401).json(LOGIN_FAILURE);
  };
  const failKnownLogin = async (res, phoneKey, ipKey) => {
    if (!(await loginLocked(phoneKey, ipKey))) await recordLoginFailure(phoneKey, ipKey);
    return res.status(401).json(LOGIN_FAILURE);
  };
  const regenerateSession = req => new Promise((resolve, reject) => {
    req.session.regenerate(error => error ? reject(error) : resolve());
  });
  const credentialMatches = (credentialId, state) => {
    const matches = [];
    for (const user of state.users || []) {
      if (user?.status !== "active") continue;
      for (const passkey of passkeysFor(user)) {
        if (passkey.id === credentialId) matches.push({ user, passkey });
      }
    }
    return matches;
  };
  const handleForRegistration = (user, users) => {
    const hasAnyPasskeyMetadata = Array.isArray(user.passkeys) && user.passkeys.length > 0;
    if (validPasskeyUserHandle(user.passkeyUserHandle)) {
      const collision = users.some(other => (other.id !== user.id || other.chamaId !== user.chamaId) && other.passkeyUserHandle === user.passkeyUserHandle);
      return collision ? null : { value: user.passkeyUserHandle, changed: false };
    }
    if (hasAnyPasskeyMetadata) return null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = newPasskeyUserHandle();
      if (!users.some(other => other.passkeyUserHandle === candidate)) return { value: candidate, changed: true };
    }
    return null;
  };
  const displayNameFor = user => {
    const name = String(user?.name || "Member").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    const chama = String(findChamaName(user?.chamaId) || "Chama").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return Array.from(`${name || "Member"} · ${chama || "Chama"}`).slice(0, 64).join("");
  };
  const publicPasskeysFor = user => passkeysFor(user).map(entry => ({
    id: entry.credentialRef,
    label: entry.label || "Passkey",
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
    lastUsedAt: typeof entry.lastUsedAt === "string" ? entry.lastUsedAt : null,
  }));

  router.post("/login/options", noStore, loginLimiter, passkeyLoginLimiter, async (req, res, next) => {
    const context = secureContextFor(req);
    if (!context) return res.status(400).json({ message: "Passkey sign-in requires a same-origin secure connection." });
    const lastActivityAt = Number(req.session?.lastActivityAt);
    const hasActiveUser = req.session?.userId && Number.isFinite(lastActivityAt) && Date.now() - lastActivityAt < sessionIdleMs &&
      (getState().users || []).some(user => user.id === req.session.userId && user.status === "active");
    if (hasActiveUser) return res.status(409).json({ message: "Sign out before starting a new passkey sign-in." });
    try {
      await regenerateSession(req);
      const challenge = webAuthnServer.randomChallenge();
      req.session.passkeyChallenge = createPasskeyChallenge({
        ceremony: "login",
        challenge,
        sessionId: req.sessionID,
        origin: context.origin,
        rpId: context.rpId,
      });
      await saveSession(req.session);
      return res.json({ challenge, rpId: context.rpId, timeout: PASSKEY_CHALLENGE_TTL_MS, userVerification: "required" });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/login/verify", noStore, loginLimiter, passkeyLoginLimiter, async (req, res, next) => {
    const ipKey = ipKeyFor(req);
    let challengeRecord;
    try {
      challengeRecord = await consumePasskeyChallenge({
        session: req.session,
        sessionId: req.sessionID,
        ceremony: "login",
        redisClient,
        production,
        saveSession,
      });
    } catch (error) {
      return next(error);
    }
    const context = secureContextFor(req);
    if (!challengeRecord || !context || challengeRecord.origin !== context.origin || challengeRecord.rpId !== context.rpId || challengeRecord.userId !== null || challengeRecord.chamaId !== null) {
      return failUnknownLogin(res, ipKey);
    }
    if (!isWebAuthnAssertionPayload(req.body)) return failUnknownLogin(res, ipKey);

    const matches = credentialMatches(req.body.id, getState());
    if (matches.length !== 1) return failUnknownLogin(res, ipKey);
    const { user, passkey } = matches[0];
    const phone = normalizePhone(user.phone) || String(user.phone || "");
    const phoneKey = `phone:${phone}`;
    if (await loginLocked(phoneKey, ipKey)) return res.status(401).json(LOGIN_FAILURE);
    if (user.mustChangePin || !validPasskeyUserHandle(user.passkeyUserHandle) || decodeUserHandle(req.body.response.userHandle) !== user.passkeyUserHandle) {
      return failKnownLogin(res, phoneKey, ipKey);
    }

    let verification;
    try {
      verification = await webAuthnServer.verifyAuthentication(req.body, {
        id: passkey.id,
        publicKey: passkey.publicKey,
        algorithm: passkey.algorithm,
        transports: passkey.transports,
      }, {
        challenge: challengeRecord.challenge,
        origin: challengeRecord.origin,
        domain: challengeRecord.rpId,
        userVerified: true,
      });
    } catch {
      return failKnownLogin(res, phoneKey, ipKey);
    }
    if (verification.userVerified !== true || verification.credentialId !== passkey.id || !validCounterTransition(passkey.counter, verification.counter)) {
      return failKnownLogin(res, phoneKey, ipKey);
    }

    const updated = structuredClone(getState());
    const savedUser = (updated.users || []).find(item => item.id === user.id && item.chamaId === user.chamaId && item.status === "active");
    const savedPasskey = Array.isArray(savedUser?.passkeys) && savedUser.passkeys.find(item => item.credentialRef === passkey.credentialRef && item.id === passkey.id);
    if (!savedUser || !savedPasskey || !validCounterTransition(savedPasskey.counter, verification.counter)) return failKnownLogin(res, phoneKey, ipKey);
    savedPasskey.counter = nextStoredCounter(savedPasskey.counter, verification.counter);
    savedPasskey.lastUsedAt = now();
    try {
      await persist(updated);
      await clearLoginFailures(phoneKey, ipKey);
      await regenerateSession(req);
      req.session.userId = savedUser.id;
      req.session.lastActivityAt = Date.now();
      req.session.authMethod = "passkey";
      await saveSession(req.session);
      activeSessionsGauge.inc();
      return res.json({ message: "Signed in successfully.", user: safeUser(savedUser) });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/", noStore, requireAuth, requirePinChanged, (req, res) => res.json({ data: publicPasskeysFor(req.user) }));

  router.post("/registration/options", noStore, requireAuth, requirePinChanged, recentPin, passkeyManagementLimiter, async (req, res, next) => {
    const context = secureContextFor(req);
    if (!context) return res.status(400).json({ message: "Passkey enrollment requires a same-origin secure connection." });
    const state = getState();
    const currentUser = (state.users || []).find(user => user.id === req.user.id && user.chamaId === req.user.chamaId && user.status === "active");
    if (!currentUser) return res.status(401).json({ message: "Your session has expired. Please sign in again." });
    const existing = passkeysFor(currentUser);
    if (existing.length >= MAX_PASSKEYS_PER_ACCOUNT) return res.status(409).json({ message: "This account already has the maximum number of passkeys." });
    const handle = handleForRegistration(currentUser, state.users || []);
    if (!handle) return res.status(409).json(REGISTRATION_FAILURE);
    try {
      let user = currentUser;
      if (handle.changed) {
        const updated = structuredClone(state);
        user = updated.users.find(item => item.id === currentUser.id && item.chamaId === currentUser.chamaId && item.status === "active");
        if (!user) return res.status(401).json({ message: "Your session has expired. Please sign in again." });
        user.passkeyUserHandle = handle.value;
        await persist(updated);
      }
      const challenge = webAuthnServer.randomChallenge();
      req.session.passkeyChallenge = createPasskeyChallenge({
        ceremony: "registration",
        challenge,
        sessionId: req.sessionID,
        origin: context.origin,
        rpId: context.rpId,
        userId: user.id,
        chamaId: user.chamaId,
        userHandle: handle.value,
      });
      await saveSession(req.session);
      return res.json({
        challenge,
        rpId: context.rpId,
        timeout: PASSKEY_CHALLENGE_TTL_MS,
        userVerification: "required",
        user: { id: handle.value, name: "member@jirani-chama", displayName: displayNameFor(user) },
        excludeCredentials: passkeysFor(user).map(entry => ({ id: entry.id, transports: entry.transports })),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/registration/verify", noStore, requireAuth, requirePinChanged, recentPin, passkeyManagementLimiter, async (req, res, next) => {
    let challengeRecord;
    try {
      challengeRecord = await consumePasskeyChallenge({
        session: req.session,
        sessionId: req.sessionID,
        ceremony: "registration",
        redisClient,
        production,
        saveSession,
      });
    } catch (error) {
      return next(error);
    }
    const context = secureContextFor(req);
    const currentUser = (getState().users || []).find(user => user.id === req.user.id && user.chamaId === req.user.chamaId && user.status === "active");
    if (!challengeRecord || !context || challengeRecord.origin !== context.origin || challengeRecord.rpId !== context.rpId ||
        challengeRecord.userId !== req.user.id || challengeRecord.chamaId !== req.user.chamaId ||
        !currentUser || challengeRecord.userHandle !== currentUser.passkeyUserHandle || !validPasskeyUserHandle(challengeRecord.userHandle)) {
      return res.status(400).json(REGISTRATION_FAILURE);
    }
    if (!isWebAuthnRegistrationPayload(req.body)) return res.status(400).json(REGISTRATION_FAILURE);

    let registration;
    try {
      registration = await webAuthnServer.verifyRegistration(req.body, {
        challenge: challengeRecord.challenge,
        origin: challengeRecord.origin,
        domain: challengeRecord.rpId,
        userVerified: true,
      });
    } catch {
      return res.status(400).json(REGISTRATION_FAILURE);
    }
    if (registration.userVerified !== true || !registration.credential ||
        registration.credential.id !== req.body.id || !isCanonicalBase64Url(registration.credential.publicKey, 32, 8192) ||
        !["ES256", "RS256"].includes(registration.credential.algorithm) ||
        !Number.isSafeInteger(registration.authenticator?.counter) || registration.authenticator.counter < 0) {
      return res.status(400).json(REGISTRATION_FAILURE);
    }

    const state = getState();
    const duplicateCredentialId = (state.users || []).some(user => Array.isArray(user.passkeys) && user.passkeys.some(entry => entry?.id === registration.credential.id));
    if (duplicateCredentialId) return res.status(400).json(REGISTRATION_FAILURE);
    const updated = structuredClone(state);
    const savedUser = (updated.users || []).find(user => user.id === req.user.id && user.chamaId === req.user.chamaId && user.status === "active");
    if (!savedUser || savedUser.passkeyUserHandle !== challengeRecord.userHandle) return res.status(400).json(REGISTRATION_FAILURE);
    if (passkeysFor(savedUser).length >= MAX_PASSKEYS_PER_ACCOUNT) return res.status(409).json({ message: "This account already has the maximum number of passkeys." });
    if (!Array.isArray(savedUser.passkeys)) savedUser.passkeys = [];
    savedUser.passkeys.push({
      credentialRef: makeId(),
      id: registration.credential.id,
      publicKey: registration.credential.publicKey,
      algorithm: registration.credential.algorithm,
      counter: registration.authenticator.counter,
      transports: safeTransports(registration.credential.transports),
      label: `Passkey ${savedUser.passkeys.length + 1}`,
      createdAt: now(),
      lastUsedAt: null,
    });
    try {
      await persist(updated);
      return res.status(201).json({ message: "Passkey added. You can use it to sign in on this device." });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:credentialRef", noStore, requireAuth, requirePinChanged, recentPin, passkeyManagementLimiter, async (req, res, next) => {
    const credentialRef = req.params.credentialRef;
    if (typeof credentialRef !== "string" || !/^[0-9a-f-]{36}$/i.test(credentialRef)) return res.status(404).json({ message: "Passkey not found." });
    const updated = structuredClone(getState());
    const user = (updated.users || []).find(item => item.id === req.user.id && item.chamaId === req.user.chamaId && item.status === "active");
    if (!user || !Array.isArray(user.passkeys)) return res.status(404).json({ message: "Passkey not found." });
    const index = user.passkeys.findIndex(item => item?.credentialRef === credentialRef);
    if (index < 0) return res.status(404).json({ message: "Passkey not found." });
    user.passkeys.splice(index, 1);
    if (user.passkeys.length === 0) {
      delete user.passkeys;
      delete user.passkeyUserHandle;
    }
    try {
      await persist(updated);
      return res.json({ message: "Passkey removed." });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createPasskeyRouter,
  passkeysFor,
  isStoredPasskey,
  PASSKEY_CHALLENGE_TTL_MS,
  derivePasskeyContext,
  isCanonicalBase64Url,
  validPasskeyUserHandle,
  encodeUserHandle,
  decodeUserHandle,
  newPasskeyUserHandle,
  isWebAuthnRegistrationPayload,
  isWebAuthnAssertionPayload,
  createPasskeyChallenge,
  consumePasskeyChallenge,
  validCounterTransition,
  nextStoredCounter,
};
