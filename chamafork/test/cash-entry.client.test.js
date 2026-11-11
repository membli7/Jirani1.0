"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");
const { createWriteRequester } = require("../../en public/write-requests.js");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "index.html"), "utf8");
const cashEntryPanel = fs.readFileSync(path.join(__dirname, "..", "..", "en public", "react", "src", "components", "CashEntryPanel.jsx"), "utf8");
const cashEntryRequest = createWriteRequester().cashEntryRequest;

test("cash form offers only supported cash-in options and uses the canonical note field", () => {
  assert.match(html, /id="react-payment-root"/);
  assert.doesNotMatch(html, /id="payment-form"|id="cash-confirm-dialog"/);
  const paymentTypes = [...cashEntryPanel.matchAll(/<option value="([^"]+)"/g)].map(([, value]) => value);
  assert.deepEqual(paymentTypes, ["Monthly Contribution", "Loan Repayment", "Fine"]);
  assert.match(cashEntryPanel, /name="note"/);
  assert.doesNotMatch(cashEntryPanel, /name="(?:reason|flowDirection|cashOutType|cashOutLoanId|customType)"|cash-out-fields|Other Income/i);
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
  assert.match(cashEntryPanel, /<dialog id="cash-confirm-dialog"/);
  assert.match(cashEntryPanel, /This records cash already received; it does not transfer money\./);
});

test("React cash-entry action validates the saved transaction and sends an idempotent same-origin write", async () => {
  const helperUrl = pathToFileURL(path.join(__dirname, "..", "..", "en public", "react", "src", "cashEntryActions.mjs")).href;
  const { buildCashEntryRequest, recordCashEntry } = await import(helperUrl);
  const key = "synthetic-cash-idempotency-key";
  const owner = {};
  const saved = {
    id: "synthetic-transaction-id", at: "2026-11-10T12:00:00.000Z", memberId: "member-1", memberName: "Test Member",
    amount: 500, method: "Cash", paymentType: "Fine", note: "Cash received at meeting", loanId: null,
    recordedBy: "officer-1", recordedByName: "Test Officer", source: "manual-cash", status: "confirmed", idempotencyKey: key,
  };
  let sent;
  const writer = createWriteRequester({
    keyGenerator: () => key,
    fetchImpl: async (url, options) => {
      sent = { url, options };
      return { ok: true, status: 201, json: async () => ({ data: saved }) };
    },
  });
  const formData = new FormData();
  for (const [name, value] of Object.entries({ memberId: "member-1", amount: "500", paymentType: "Fine", method: "Cash", note: "Cash received at meeting" })) formData.append(name, value);
  const request = buildCashEntryRequest(writer, formData);
  const result = await recordCashEntry(writer, owner, request);
  assert.equal(result.data.id, saved.id);
  assert.equal(sent.url, "/api/payments");
  assert.equal(sent.options.method, "POST");
  assert.equal(sent.options.credentials, "same-origin");
  assert.equal(sent.options.headers["X-Requested-With"], "chama");
  assert.equal(sent.options.headers["Idempotency-Key"], key);
  assert.deepEqual(JSON.parse(sent.options.body), request.body);
});
