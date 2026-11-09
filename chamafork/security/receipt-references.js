"use strict";

const RECEIPT_REFERENCE_PATTERN = /^[a-z0-9/._-]{3,40}$/;
const MAX_RECEIPT_REFERENCE_INPUT_LENGTH = 80;

function normalizeReceiptReference(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseReceiptReference(value) {
  if (typeof value !== "string" || value.length > MAX_RECEIPT_REFERENCE_INPUT_LENGTH) {
    return { valid: false, display: "", normalized: "" };
  }
  const normalized = normalizeReceiptReference(value);
  return {
    valid: RECEIPT_REFERENCE_PATTERN.test(normalized),
    display: normalized ? value : "",
    normalized,
  };
}

function hasReceiptReferenceConflict(state, chamaId, normalizedReference) {
  if (typeof normalizedReference !== "string" || !normalizedReference || !chamaId) return false;
  const transactions = Array.isArray(state?.transactions) ? state.transactions : [];
  if (transactions.some(record => record?.chamaId === chamaId && normalizeReceiptReference(record.referenceNumber || record.ref) === normalizedReference)) return true;
  const callbacks = Array.isArray(state?.pendingMpesas) ? state.pendingMpesas : [];
  return callbacks.some(record => record?.chamaId === chamaId && normalizeReceiptReference(record.mpesaReceiptNumber) === normalizedReference);
}

module.exports = { hasReceiptReferenceConflict, normalizeReceiptReference, parseReceiptReference };
