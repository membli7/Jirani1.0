"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const frontend = path.join(__dirname, "..", "..", "en public");
const html = fs.readFileSync(path.join(frontend, "index.html"), "utf8");
const script = fs.readFileSync(path.join(frontend, "chama.js"), "utf8");

test("audit log, penalty, and dividend panels exist and start hidden", () => {
  assert.match(html, /<section class="panel" id="audit-panel"[^>]*hidden>/);
  assert.match(html, /<tbody id="audit-list"/);
  assert.match(html, /<section class="panel" id="penalty-panel"[^>]*hidden>/);
  assert.match(html, /<section class="panel" id="dividend-panel"[^>]*hidden>/);
});

test("penalty and dividend panels are shown only to the right roles", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /assessPenalties: \["chairperson", "secretary"\]/);
  assert.match(server, /manageDividends: \["chairperson", "treasurer"\]/);
  assert.match(script, /\$\("#penalty-panel"\)\.hidden = !permissions\.assessPenalties;/);
  assert.match(script, /\$\("#dividend-panel"\)\.hidden = !permissions\.manageDividends;/);
});

test("dividend UI calculates first and commits only the previewed payouts", () => {
  assert.match(html, /name="cycleStartDate"/);
  assert.match(html, /name="cycleEndDate"/);
  assert.match(html, /name="adminExpenses"/);
  assert.match(script, /api\("\/api\/dividends\/calculate", \{ method: "POST", body: input \}\)/);
  assert.match(script, /api\("\/api\/dividends\/commit"/);
  assert.match(script, /payouts: data\.payouts\.map\(item => \(\{ memberId: item\.memberId, dividend: item\.dividend \}\)\)/);
});

test("penalty button calls the assessment endpoint", () => {
  assert.match(html, /Assess monthly penalties/);
  assert.match(script, /api\("\/api\/penalties\/assess"/);
});

test("loan form has two guarantor selects and repayments send reference and date", () => {
  assert.match(html, /id="loan-guarantor-1" name="guarantorIds"/);
  assert.match(html, /id="loan-guarantor-2" name="guarantorIds"/);
  assert.match(script, /values\.guarantorIds = \[\.\.\.form\.querySelectorAll\('select\[name="guarantorIds"\]'\)\]/);
  assert.match(html, /name="referenceNumber"/);
  assert.match(html, /name="date" type="date"/);
  assert.match(script, /values\.paymentType === "Loan Repayment" \? "\/api\/loans\/repay"/);
});
