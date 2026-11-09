"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { hasReceiptReferenceConflict, normalizeReceiptReference, parseReceiptReference } = require("../security/receipt-references");

test("normalization is trimmed and case-insensitive while display input remains unchanged", () => {
  const parsed = parseReceiptReference("  MiXeD-Ref/42  ");
  assert.equal(parsed.valid, true);
  assert.equal(parsed.display, "  MiXeD-Ref/42  ");
  assert.equal(parsed.normalized, "mixed-ref/42");
  assert.equal(normalizeReceiptReference(parsed.display), parsed.normalized);
});

test("receipt references must be nonblank, bounded, and use the supported character set", () => {
  assert.equal(parseReceiptReference("   ").valid, false);
  assert.equal(parseReceiptReference("A").valid, false);
  assert.equal(parseReceiptReference("bad value").valid, false);
  assert.equal(parseReceiptReference("A".repeat(81)).valid, false);
  assert.equal(parseReceiptReference("RCPT-1000").valid, true);
});

test("same-chama checks include reversed transactions and M-PESA receipt rows across types", () => {
  const state = {
    transactions: [
      { chamaId: "chama-a", paymentType: "Monthly Contribution", status: "Reversed", referenceNumber: "  Seed-01 " },
      { chamaId: "chama-b", paymentType: "Loan Repayment", status: "confirmed", ref: "OTHER-02" },
    ],
    pendingMpesas: [{ chamaId: "chama-a", mpesaReceiptNumber: "Mpesa-03" }],
  };
  assert.equal(hasReceiptReferenceConflict(state, "chama-a", "seed-01"), true);
  assert.equal(hasReceiptReferenceConflict(state, "chama-a", "mpesa-03"), true);
  assert.equal(hasReceiptReferenceConflict(state, "chama-a", "other-02"), false);
  assert.equal(hasReceiptReferenceConflict(state, "chama-b", "seed-01"), false);
});
