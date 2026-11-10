"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { createWriteRequester } = require("../../en public/write-requests.js");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "index.html"), "utf8");
const paymentForm = html.match(/<form id="payment-form"[\s\S]*?<\/form>/)?.[0];
const cashEntryRequest = createWriteRequester().cashEntryRequest;

test("cash form offers only supported cash-in options and uses the canonical note field", () => {
  assert.ok(paymentForm, "cash-entry form is present");
  const paymentTypes = [...paymentForm.matchAll(/<option\b[^>]*\bvalue="([^"]+)"/g)].map(([, value]) => value);
  assert.deepEqual(paymentTypes, ["Monthly Contribution", "Loan Repayment", "Fine"]);
  assert.match(paymentForm, /<textarea\b[^>]*\bname="note"/);
  assert.doesNotMatch(paymentForm, /name="(?:reason|flowDirection|cashOutType|cashOutLoanId|customType)"|cash-out-fields|Other Income/i);
});

for (const [paymentType, expectedPath] of [
  ["Monthly Contribution", "/api/contributions"],
  ["Loan Repayment", "/api/loans/repay"],
  ["Fine", "/api/payments"],
]) {
  test(`cash form maps ${paymentType} to the exact server payload and endpoint`, () => {
    const formData = new FormData();
    for (const [name, value] of [
      ["memberId", "member-1"],
      ["amount", "500"],
      ["referenceNumber", "RCPT-1500"],
      ["date", "2026-10-05"],
      ["paymentType", paymentType],
      ["loanId", "loan-1"],
      ["method", "Cash"],
      ["note", "Cash received at meeting"],
    ]) formData.append(name, value);

    assert.deepEqual(cashEntryRequest(formData), {
      path: expectedPath,
      body: {
        memberId: "member-1",
        amount: 500,
        referenceNumber: "RCPT-1500",
        date: "2026-10-05",
        paymentType,
        loanId: "loan-1",
        method: "Cash",
        note: "Cash received at meeting",
      },
    });
  });
}

test("unsupported cash types are not silently routed to contribution recording", () => {
  const formData = new FormData();
  formData.append("paymentType", "Other Income");
  assert.throws(() => cashEntryRequest(formData), /Unsupported cash entry type/);
});

test("cash confirmation describes recording received cash without implying a transfer", () => {
  const confirmation = html.match(/<dialog id="cash-confirm-dialog"[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(confirmation, "cash confirmation dialog is present");
  assert.match(confirmation, /This records cash already received; it does not transfer money\./);
});
