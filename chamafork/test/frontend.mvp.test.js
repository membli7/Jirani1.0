"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const frontend = path.join(__dirname, "..", "..", "en public");
const html = fs.readFileSync(path.join(frontend, "index.html"), "utf8");
const script = fs.readFileSync(path.join(frontend, "chama.js"), "utf8");
const profileHtml = fs.readFileSync(path.join(frontend, "profile.html"), "utf8");
const profileScript = fs.readFileSync(path.join(frontend, "profile.js"), "utf8");
const registerHtml = fs.readFileSync(path.join(frontend, "register.html"), "utf8");
const registerScript = fs.readFileSync(path.join(frontend, "register.js"), "utf8");
const memberLoginHtml = fs.readFileSync(path.join(frontend, "member-login.html"), "utf8");
const authPagesScript = fs.readFileSync(path.join(frontend, "auth-pages.js"), "utf8");

test("standalone member login posts credentials to the login API", () => {
  assert.match(memberLoginHtml, /<form id="login-form"[^>]*method="post"[^>]*action="\/api\/login"/);
  assert.match(memberLoginHtml, /<span class="brand-mark" aria-hidden="true">J<\/span>/);
  assert.doesNotMatch(memberLoginHtml, /[A-Za-z]:\\Users\\/);
  assert.match(memberLoginHtml, /<\/select><\/label>\s*<\/header>/);
  assert.match(memberLoginHtml, /src="\/auth-pages\.js\?v=/);
  assert.match(authPagesScript, /postJson\("\/api\/login"/);
  assert.match(authPagesScript, /method:\s*"POST"/);
  assert.match(authPagesScript, /credentials:\s*"same-origin"/);
  assert.match(authPagesScript, /name = "chamaId"/);
  assert.match(authPagesScript, /window\.location\.assign\("\/"\)/);
  assert.match(authPagesScript, /postJson\("\/api\/invitations\/activate"/);
  assert.match(memberLoginHtml, /PIN recovery is not available yet/);
  assert.doesNotMatch(memberLoginHtml, /We.ll send a one-time code|Send OTP/);
});

test("landing registration opens a complete first-chama setup page", () => {
  assert.match(html, /id="landing-register" href="\/register\.html"/);
  for (const field of ["chamaName", "name", "phone", "email", "deadlineDay", "welfareMonthlyFee", "lateContributionPenalty", "loanMonthlyRatePercent", "pin"]) {
    assert.match(registerHtml, new RegExp(`name="${field}"`));
  }
  assert.match(registerHtml, /id="register-chama-form"/);
  assert.match(registerHtml, /id="register-deadline-day" name="deadlineDay" type="number" min="1" max="28" value="5" required/);
  assert.match(registerHtml, /id="register-welfare-fee" name="welfareMonthlyFee" type="number" min="0" step="1" value="500" required/);
  assert.match(registerHtml, /id="register-late-penalty" name="lateContributionPenalty" type="number" min="0" step="1" value="200" required/);
  assert.match(registerHtml, /id="register-loan-rate" name="loanMonthlyRatePercent" type="number" min="0" max="100" step="0\.1" value="5" required/);
  assert.match(registerHtml, /src="\/register\.js\?v=20261020\.1" defer/);
  assert.match(registerScript, /fetch\("\/api\/setup"/);
  assert.match(registerScript, /credentials: "same-origin"/);
  assert.match(registerScript, /formData\.deadlineDay = Number\(formData\.deadlineDay\)/);
  assert.match(registerScript, /formData\.welfareMonthlyFee = Number\(formData\.welfareMonthlyFee\)/);
  assert.match(registerScript, /formData\.lateContributionPenalty = Number\(formData\.lateContributionPenalty\)/);
  assert.match(registerScript, /formData\.loanMonthlyRatePercent = Number\(formData\.loanMonthlyRatePercent\)/);
  assert.match(registerScript, /X-Requested-With": "chama"/);
  assert.match(registerScript, /register-success/);
  assert.match(registerScript, /registrationNotice\.textContent = error instanceof TypeError/);
});

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

test("loan form sends two guarantors and repayments send reference and date", () => {
  assert.match(html, /id="loan-amount" name="amount"/);
  assert.match(html, /id="loan-months" name="months"/);
  assert.match(html, /id="loan-guarantor-1" name="guarantorIds" required/);
  assert.match(html, /id="loan-guarantor-2" name="guarantorIds" required/);
  assert.match(script, /values\.guarantorIds = formData\.getAll\("guarantorIds"\)/);
  assert.match(script, /api\("\/api\/loans\/guarantors"\)/);
  assert.match(html, /name="referenceNumber"/);
  assert.match(html, /name="date" type="date"/);
  assert.match(script, /values\.paymentType === "Loan Repayment" \? "\/api\/loans\/repay"/);
});

test("profile page loads its write helper and connects forms to authenticated profile endpoints", () => {
  assert.match(profileHtml, /src="\/write-requests\.js" defer/);
  assert.match(profileHtml, /src="\/profile\.js" defer/);
  assert.match(profileScript, /fetch\("\/api\/profile"/);
  assert.match(profileScript, /path: "\/api\/profile"/);
  assert.match(profileScript, /\/api\/profile\/photo\/\$\{size\}/);
  assert.match(profileScript, /"X-Requested-With": "chama"/);
  assert.match(profileScript, /credentials: "same-origin"/);
  assert.doesNotMatch(profileScript, /\.innerHTML\s*=/);
  assert.match(script, /for \(const action of \["#edit-profile", "#view-profile"\]\)/);
  assert.match(script, /window\.location\.assign\("\/profile\.html"\)/);
});
