"use strict";

// Safaricom publishes its M-PESA API Gateway callback source IPs in the Daraja
// Getting Started guide. Keep this allowlist server-side and review that source
// whenever the provider updates its callback network documentation.
// https://developer.safaricom.co.ke/apis/GettingStarted
const SAFARICOM_CALLBACK_IPS = new Set([
  "196.201.214.200",
  "196.201.214.206",
  "196.201.213.114",
  "196.201.214.207",
  "196.201.214.208",
  "196.201.213.44",
  "196.201.212.127",
  "196.201.212.138",
  "196.201.212.129",
  "196.201.212.136",
  "196.201.212.74",
  "196.201.212.69",
]);

const VALIDATION_PATH = "/api/mpesa/c2b/validation";
const CONFIRMATION_PATH = "/api/mpesa/c2b/confirmation";
const SHORTCODE_PATTERN = /^\d{4,12}$/;
const CHAMA_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

function normalizeIp(value) {
  let ip = String(value || "").trim().toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  ip = ip.split("%")[0];
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}

function parseShortcodeMap(raw) {
  const text = String(raw || "").trim();
  if (!text) return { valid: false, shortcodeToChama: new Map() };

  let entries;
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { valid: false, shortcodeToChama: new Map() };
      entries = Object.entries(parsed);
    } catch {
      const wrapped = text.endsWith("}") ? text.slice(1, -1).trim() : "";
      if (!wrapped || !/[=:]/.test(wrapped)) return { valid: false, shortcodeToChama: new Map() };
      entries = wrapped.split(/[;,]/).map(part => {
        const match = part.match(/^\s*([^=:]+?)\s*[:=]\s*([^=:]+?)\s*$/);
        return match ? [match[1], match[2]] : null;
      });
    }
  } else {
    entries = text.split(/[;,]/).map(part => {
      const match = part.match(/^\s*([^=:]+?)\s*[:=]\s*([^=:]+?)\s*$/);
      return match ? [match[1], match[2]] : null;
    });
  }

  if (!entries.length || entries.some(entry => !Array.isArray(entry) || entry.length !== 2)) {
    return { valid: false, shortcodeToChama: new Map() };
  }

  const shortcodeToChama = new Map();
  for (const [leftValue, rightValue] of entries) {
    const left = String(leftValue || "").trim();
    const right = String(rightValue || "").trim();
    const leftIsShortcode = SHORTCODE_PATTERN.test(left);
    const rightIsShortcode = SHORTCODE_PATTERN.test(right);
    if (leftIsShortcode === rightIsShortcode) return { valid: false, shortcodeToChama: new Map() };

    const shortcode = leftIsShortcode ? left : right;
    const chamaId = leftIsShortcode ? right : left;
    if (!CHAMA_ID_PATTERN.test(chamaId)) return { valid: false, shortcodeToChama: new Map() };
    if (shortcodeToChama.has(shortcode) && shortcodeToChama.get(shortcode) !== chamaId) {
      return { valid: false, shortcodeToChama: new Map() };
    }
    shortcodeToChama.set(shortcode, chamaId);
  }

  return { valid: shortcodeToChama.size > 0, shortcodeToChama };
}

function hasExpectedHttpsPath(value, expectedPath) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && !url.username && !url.password
      && !url.search && !url.hash
      && url.pathname === expectedPath;
  } catch {
    return false;
  }
}

function getC2bSubscriptionConfig(env = process.env) {
  const mapping = parseShortcodeMap(env.MPESA_SHORTCODE_CHAMA_MAP);
  const enabled = String(env.MPESA_ENV || "").trim().toLowerCase() === "sandbox"
    && String(env.MPESA_C2B_CALLBACKS_ENABLED || "") === "1"
    && hasExpectedHttpsPath(env.MPESA_C2B_VALIDATION_URL, VALIDATION_PATH)
    && hasExpectedHttpsPath(env.MPESA_C2B_CONFIRMATION_URL, CONFIRMATION_PATH)
    && mapping.valid;
  return { enabled, shortcodeToChama: mapping.shortcodeToChama };
}

function isTrustedCallbackIp(ip, env = process.env) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  if (env.NODE_ENV === "test") {
    const testIps = String(env.MPESA_TEST_CALLBACK_IPS || "")
      .split(",").map(normalizeIp).filter(Boolean);
    return testIps.includes(normalized);
  }
  return SAFARICOM_CALLBACK_IPS.has(normalized);
}

function parseAmountCents(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const amount = String(value).trim();
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(amount)) return null;
  const [whole, fraction = ""] = amount.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function parseC2bPayment(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const transactionId = String(body.TransID || "").trim().toUpperCase();
  const shortcode = String(body.BusinessShortCode || "").trim();
  const reference = String(body.BillRefNumber || "").trim().toUpperCase();
  const transactionTime = String(body.TransTime || "").trim();
  const amountCents = parseAmountCents(body.TransAmount);
  if (!/^[A-Z0-9]{1,32}$/.test(transactionId)
    || !SHORTCODE_PATTERN.test(shortcode)
    || !/^[A-Z0-9_-]{1,24}$/.test(reference)
    || !/^\d{14}$/.test(transactionTime)
    || amountCents === null) return null;
  return {
    transactionId,
    shortcode,
    reference,
    amountCents,
    amount: amountCents / 100,
    currency: "KES",
    transactionTime,
  };
}

module.exports = {
  CONFIRMATION_PATH,
  SAFARICOM_CALLBACK_IPS,
  VALIDATION_PATH,
  getC2bSubscriptionConfig,
  isTrustedCallbackIp,
  parseC2bPayment,
  parseShortcodeMap,
};
