"use strict";

const crypto = require("node:crypto");

const NAMESPACE = "1e2b7f84-40b7-5d5d-9e6a-86f5f6ad7b31";

function stableId(kind, sourceId) {
  const namespace = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const digest = crypto.createHash("sha1")
    .update(namespace)
    .update(`\0${kind}\0${String(sourceId)}`)
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function fromCents(value) {
  return Number(value || 0) / 100;
}

const MONEY_KEYS = new Set([
  "amount", "outstanding", "shareCapital", "welfareReserve", "interestAmount",
  "principalAmount", "welfareAmount", "shareCapitalAmount", "penaltyAmount",
  "adminExpenses", "interestIncome", "penaltyIncome", "totalIncome",
  "distributablePool", "totalShareCapital", "distributed", "dividend",
  "openingBalance", "principal", "interest", "installment", "paidPrincipal",
  "paidInterest", "pledged", "held", "debit", "credit", "amountCents",
]);

function transformMoney(value, direction, key = "") {
  if (Array.isArray(value)) return value.map(item => transformMoney(item, direction));
  if (value && typeof value === "object") {
    const isMpesaAmount = value.Name === "Amount" && Object.hasOwn(value, "Value");
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      isMpesaAmount && childKey === "Value" && typeof childValue === "number"
        ? (direction === "store" ? cents(childValue) : fromCents(childValue))
        : transformMoney(childValue, direction, childKey),
    ]));
  }
  if (typeof value === "number" && MONEY_KEYS.has(key)) {
    return direction === "store" ? cents(value) : fromCents(value);
  }
  return value;
}

function toStoredData(value) {
  return transformMoney(value, "store");
}

function fromStoredData(value) {
  return transformMoney(value, "load");
}

function recordId(kind, chamaId, sourceId) {
  return stableId(`${kind}:${chamaId}`, sourceId);
}

module.exports = { stableId, recordId, cents, fromCents, toStoredData, fromStoredData };
