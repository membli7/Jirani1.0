"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const appRoot = path.join(__dirname, "..");
const buildRoot = path.join(appRoot, "frontend-dist");
const sourceRoot = path.join(appRoot, "..", "en public", "react");
const frontendCss = fs.readFileSync(path.join(sourceRoot, "..", "chama.css"), "utf8");
const interactivePages = ["index.html", "member-login.html", "register.html", "profile.html"];

function readSource(relativePath) {
  return fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
}

test("all existing interactive URLs have a built React mount and local JavaScript bundle", () => {
  for (const page of interactivePages) {
    const outputPath = path.join(buildRoot, page);
    assert.ok(fs.existsSync(outputPath), `missing React build entry for ${page}`);
    const html = fs.readFileSync(outputPath, "utf8");
    assert.match(html, /<div id="root"><\/div>/, `${page} must expose the React root`);
    assert.doesNotMatch(html, /\/src\/main\.jsx/, `${page} must not point production users at JSX source`);

    const bundles = [...html.matchAll(/src="([^"]+\.js)"/g)].map(match => match[1]);
    assert.ok(bundles.length > 0, `${page} must load its built JavaScript`);
    for (const bundle of bundles) {
      assert.ok(bundle.startsWith("/assets/"), `${page} bundle must be same-origin and fingerprinted`);
      assert.ok(fs.existsSync(path.join(buildRoot, bundle.slice(1))), `missing built bundle: ${bundle}`);
    }
  }
});

test("legacy dashboard bootstrap does not signal that an active session ended", () => {
  const controller = readSource("../chama.js");
  assert.match(controller, /function showLogin\(\{ notifyReact = true \} = \{\}\)/);
  assert.match(controller, /if \(notifyReact && typeof window !== "undefined"\) window\.dispatchEvent\(new Event\("chama:session-ended"\)\)/);
  assert.match(controller, /async function restoreSession\(\) \{\s*showLogin\(\{ notifyReact: false \}\);/);
});

test("legacy controller uses a fresh immutable cache-busting URL", () => {
  const dashboardHtml = readSource("../index.html");
  assert.match(dashboardHtml, /<script src="\/chama\.js\?v=20261111\.2" defer><\/script>/);
});

test("auth forms stack on mobile widths and retain scrollability and 44px touch targets", () => {
  assert.match(frontendCss, /@media \(max-width: 760px\) \{\s*\.login-overlay \.login-content \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(frontendCss, /\.login-overlay\s*\{\s*overflow-y: auto;/);
  assert.match(frontendCss, /\.field input, \.field select, textarea \{ min-height: 44px;/);
  assert.match(frontendCss, /\.button-primary \{ min-height: 46px;/);
  assert.match(frontendCss, /\.toggle-pin-btn\s*\{[^}]*width: 44px;[^}]*height: 44px;[^}]*min-height: 44px;[^}]*min-width: 44px;/);
});

test("React owns dashboard finance, attendance, cash entry, leadership, loans, ledger, members, audit, invitations, and account routes", () => {
  const main = readSource("src/main.jsx");
  const app = readSource("src/App.jsx");
  const templates = readSource("src/pageTemplates.js");
  const registration = readSource("src/pages/RegisterPage.jsx");
  const memberLogin = readSource("src/pages/MemberLoginPage.jsx");
  const profile = readSource("src/pages/ProfilePage.jsx");
  const landing = readSource("src/pages/LandingPage.jsx");
  const chat = readSource("src/components/ChatPanel.jsx");
  const finance = readSource("src/components/FinancialOverview.jsx");
  const attendance = readSource("src/components/AttendancePanel.jsx");
  const loans = readSource("src/components/LoansPanel.jsx");
  const loanActions = readSource("src/loanActions.mjs");
  const ledger = readSource("src/components/LedgerPanel.jsx");
  const ledgerActions = readSource("src/ledgerActions.mjs");
  const memberDirectory = readSource("src/components/MemberDirectory.jsx");
  const memberActions = readSource("src/memberActions.mjs");
  const monthClose = readSource("src/components/MonthClosePanel.jsx");
  const monthCloseActions = readSource("src/monthCloseActions.mjs");
  const audit = readSource("src/components/AuditLogPanel.jsx");
  const auditActions = readSource("src/auditActions.mjs");
  const penalty = readSource("src/components/PenaltyPanel.jsx");
  const dividends = readSource("src/components/DividendsPanel.jsx");
  const adminFinanceActions = readSource("src/adminFinanceActions.mjs");
  const elections = readSource("src/components/ElectionsPanel.jsx");
  const electionActions = readSource("src/electionActions.mjs");
  const invitePanel = readSource("src/components/InviteMemberPanel.jsx");
  const invitationActions = readSource("src/invitationActions.mjs");
  const cashEntry = readSource("src/components/CashEntryPanel.jsx");
  const cashEntryActions = readSource("src/cashEntryActions.mjs");
  const leadershipPanel = readSource("src/components/LeadershipPanel.jsx");
  const leadershipActions = readSource("src/leadershipActions.mjs");
  const pinChangeOverlay = readSource("src/components/PinChangeOverlay.jsx");
  const pinChangeActions = readSource("src/pinChangeActions.mjs");
  const simulatedInbox = readSource("src/components/SimulatedPaymentInbox.jsx");
  const simulatedPaymentActions = readSource("src/simulatedPaymentActions.mjs");
  const legacyDashboard = fs.readFileSync(path.join(sourceRoot, "..", "chama.js"), "utf8");
  const dashboardTemplate = fs.readFileSync(path.join(sourceRoot, "..", "index.html"), "utf8");
  const profileMode = readSource("src/profileMode.mjs");
  const actions = readSource("src/registrationActions.mjs");
  assert.match(main, /createRoot\(mountNode\)/);
  assert.match(main, /flushSync\(/);
  assert.match(main, /\.\.\/\.\.\/i18n\.js/);
  assert.match(main, /\.\.\/\.\.\/write-requests\.js/);
  assert.match(templates, /\.\.\/\.\.\/index\.html\?raw/);
  assert.doesNotMatch(templates, /member-login\.html\?raw|profile\.html\?raw|register\.html\?raw/);
  assert.match(app, /pageKey === "profile"\) return <ProfilePage \/>/);
  assert.match(app, /pageKey === "memberLogin"\) return <MemberLoginPage \/>/);
  assert.match(app, /pageKey === "register"\) return <RegisterPage \/>/);
  assert.match(app, /pageKey === "dashboard"\) return <DashboardEntry \/>/);
  assert.match(app, /fetch\("\/api\/session"/);
  assert.match(app, /authenticated \? <LegacyPage pageKey="dashboard" \/> : <LandingPage \/>/);
  assert.match(app, /createRoot\(chatHost\)/);
  assert.match(app, /chatRoot\?\.render\(<ChatPanel \/>\)/);
  assert.match(app, /dashboardRoot\?\.render\(<FinancialOverview financeTarget=\{financeTarget\} \/>\)/);
  assert.match(app, /dashboardRoot\?\.unmount\(\)/);
  assert.match(app, /createRoot\(attendanceHost\)/);
  assert.match(app, /attendanceRoot\?\.render\(<AttendancePanel \/>\)/);
  assert.match(app, /attendanceRoot\?\.unmount\(\)/);
  assert.match(app, /loanRequestRoot\?\.render\(<LoanRequestPanel \/>\)/);
  assert.match(app, /loansRoot\?\.render\(<LoansPanel \/>\)/);
  assert.match(app, /loanRequestRoot\?\.unmount\(\)/);
  assert.match(app, /loansRoot\?\.unmount\(\)/);
  assert.match(app, /ledgerRoot\?\.render\(<LedgerPanel \/>\)/);
  assert.match(app, /ledgerRoot\?\.unmount\(\)/);
  assert.match(app, /membersRoot\?\.render\(<MemberDirectory \/>\)/);
  assert.match(app, /membersRoot\?\.unmount\(\)/);
  assert.match(app, /monthCloseRoot\?\.render\(<MonthClosePanel \/>\)/);
  assert.match(app, /monthCloseRoot\?\.unmount\(\)/);
  assert.match(app, /auditRoot\?\.render\(<AuditLogPanel \/>\)/);
  assert.match(app, /auditRoot\?\.unmount\(\)/);
  assert.match(app, /penaltyRoot\?\.render\(<PenaltyPanel \/>\)/);
  assert.match(app, /penaltyRoot\?\.unmount\(\)/);
  assert.match(app, /dividendsRoot\?\.render\(<DividendsPanel \/>\)/);
  assert.match(app, /dividendsRoot\?\.unmount\(\)/);
  assert.match(app, /electionsRoot\?\.render\(<ElectionsPanel \/>\)/);
  assert.match(app, /electionsRoot\?\.unmount\(\)/);
  assert.match(app, /inviteRoot\?\.render\(<InviteMemberPanel \/>\)/);
  assert.match(app, /inviteRoot\?\.unmount\(\)/);
  assert.match(app, /cashEntryRoot\?\.render\(<CashEntryPanel \/>\)/);
  assert.match(app, /cashEntryRoot\?\.unmount\(\)/);
  assert.match(app, /leadershipRoot\?\.render\(<LeadershipPanel \/>\)/);
  assert.match(app, /leadershipRoot\?\.unmount\(\)/);
  assert.match(app, /pinChangeRoot\?\.render\(<PinChangeOverlay \/>\)/);
  assert.match(app, /pinChangeRoot\?\.unmount\(\)/);
  assert.match(dashboardTemplate, /id="react-pin-change-root"/);
  assert.match(pinChangeOverlay, /name="currentPin"/);
  assert.match(pinChangeOverlay, /name="newPin"/);
  assert.match(pinChangeOverlay, /chama:dashboard-state/);
  assert.match(pinChangeOverlay, /chama:session-ended/);
  assert.match(pinChangeActions, /path: "\/api\/pin\/change"/);
  assert.match(pinChangeActions, /response\?\.user\?\.mustChangePin === false/);
  assert.doesNotMatch(legacyDashboard, /insertAdjacentHTML\([^\n]*pin-change|#pin-form|#pin-change/);
  assert.doesNotMatch(pinChangeOverlay, /localStorage|sessionStorage|console\./);
  assert.match(app, /simulatedPaymentRoot\?\.render\(<SimulatedPaymentInbox \/>\)/);
  assert.match(app, /simulatedPaymentRoot\?\.unmount\(\)/);
  assert.match(dashboardTemplate, /id="react-simulated-payment-root"/);
  assert.match(simulatedInbox, /snapshot\?\.permissions\?\.simulatePayments !== true/);
  assert.match(simulatedPaymentActions, /path: "\/api\/payments\/simulate"/);
  assert.match(legacyDashboard, /simulatedPayments: state\.simulatedPayments \|\| \[\]/);
  assert.doesNotMatch(legacyDashboard, /renderSimulatedPaymentInbox|#simulated-payment-form|#simulated-payment-rows/);
  assert.match(dashboardTemplate, /id="react-loan-request-root"/);
  assert.match(dashboardTemplate, /id="react-loans-root"/);
  assert.match(dashboardTemplate, /id="react-ledger-root"/);
  assert.match(dashboardTemplate, /id="react-member-directory-root"/);
  assert.match(dashboardTemplate, /id="react-month-close-root"/);
  assert.match(dashboardTemplate, /id="react-audit-root"/);
  assert.match(dashboardTemplate, /id="react-penalty-root"/);
  assert.match(dashboardTemplate, /id="react-dividend-root"/);
  assert.match(dashboardTemplate, /id="react-elections-root"/);
  assert.match(dashboardTemplate, /id="react-invite-root"/);
  assert.match(dashboardTemplate, /id="react-payment-root"/);
  assert.match(dashboardTemplate, /id="react-leadership-root"/);
  assert.match(loans, /onSubmit=\{handleSubmit\}/);
  assert.match(loans, /name="guarantorIds"/);
  assert.match(loans, /snapshot\.permissions\?\.decideLoans === true && loan\.canDecide === true/);
  assert.match(loans, /recordLoanDecision\(/);
  assert.match(loanActions, /path: "\/api\/loans"/);
  assert.match(loanActions, /\/api\/loans\/\$\{encodeURIComponent\(loanId\)\}\/decisions/);
  assert.match(legacyDashboard, /chama:dashboard-refresh-requested/);
  assert.doesNotMatch(legacyDashboard, /\$\("#loan-form"\)|\$\("#loans"\)|loanStatusLabel|updateLoanRequestAccess/);
  assert.doesNotMatch(legacyDashboard, /transaction-copy|#transactions|export-csv|contribution-date-dialog|correct-contribution/);
  assert.doesNotMatch(legacyDashboard, /memberStatusPresentation|activeMemberRows|member-invitation-history|data-revoke-invitation|data-revoke-role/);
  assert.match(legacyDashboard, /invitations: state\.invitations, leadershipChanges: state\.leadershipChanges/);
  assert.match(legacyDashboard, /leadershipElections: state\.leadershipElections, notifications: state\.notifications/);
  assert.doesNotMatch(legacyDashboard, /renderElections|\$\("#election-proposal-form"\)|\$\("#election-notifications"\)|\$\("#leadership-elections"\)|data-election-action/);
  assert.doesNotMatch(legacyDashboard, /\$\("#invite-form"\)|\$\("#copy-invite-code"\)|invite-result-message/);
  assert.doesNotMatch(legacyDashboard, /\$\("#payment-form"\)|\$\("#payment-member"\)|\$\("#payment-type"\)|confirmCashPayment/);
  assert.doesNotMatch(legacyDashboard, /renderLeadership|populateSelects|\$\("#leadership-form"\)|\$\("#leadership-list"\)|\$\("#incoming-user"\)/);
  assert.match(elections, /snapshot\?\.permissions\?\.proposeLeadershipElection === true/);
  assert.match(elections, /election\.canVote/);
  assert.match(elections, /election\.canScheduleRunoff/);
  assert.match(elections, /election\.result/);
  assert.match(electionActions, /path: "\/api\/leadership-elections"/);
  assert.match(electionActions, /\/api\/leadership-elections\/\$\{encodeURIComponent\(electionId\)\}\/vote/);
  assert.doesNotMatch(elections, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(invitePanel, /createInvitation\(writer, owner\.current, values\)/);
  assert.match(invitePanel, /activationCode/);
  assert.match(invitationActions, /path: "\/api\/invitations"/);
  assert.match(invitationActions, /invitation\.idempotencyKey === key/);
  assert.doesNotMatch(invitePanel, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(cashEntry, /snapshot\.permissions\?\.recordPayments !== true/);
  assert.match(cashEntry, /buildCashEntryRequest\(/);
  assert.match(cashEntry, /recordCashEntry\(/);
  assert.match(cashEntryActions, /method: "POST"/);
  assert.match(cashEntryActions, /transaction\.idempotencyKey === key/);
  assert.doesNotMatch(cashEntry, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(leadershipPanel, /snapshot\.permissions\?\.manageLeadership !== true/);
  assert.match(leadershipPanel, /snapshot\.permissions\?\.bootstrapLeadership === true/);
  assert.match(leadershipPanel, /leadershipProposalFromForm\(/);
  assert.match(leadershipPanel, /confirmLeadershipProposal\(/);
  assert.match(leadershipActions, /path: "\/api\/leadership-changes"/);
  assert.match(leadershipActions, /\/api\/leadership-changes\/\$\{encodeURIComponent\(changeId\)\}\/confirm/);
  assert.doesNotMatch(leadershipPanel, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(memberDirectory, /canUndoInvitation\(invitation, permissions\)/);
  assert.match(memberDirectory, /submitMemberRevocation\(/);
  assert.match(memberDirectory, /window\.prompt\(/);
  assert.match(memberActions, /24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(memberDirectory, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(monthClose, /fetchMonthlyClose\(month\)/);
  assert.match(monthClose, /monthCloseNoTransferNote/);
  assert.match(monthCloseActions, /credentials: "same-origin"/);
  assert.match(monthCloseActions, /X-Requested-With/);
  assert.doesNotMatch(legacyDashboard, /renderMonthlyClose|month-close-form|month-close-summary|month-close-exceptions|month-close-entries/);
  assert.doesNotMatch(monthClose, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(audit, /fetchAuditLog\(globalThis\.fetch, controller\.signal\)/);
  assert.match(audit, /permissions\?\.viewAuditLog === true/);
  assert.match(auditActions, /\/api\/audit-log/);
  assert.match(auditActions, /paginateAuditEntries/);
  assert.doesNotMatch(legacyDashboard, /auditDescription|loadAuditLog|renderAuditLogPage|#audit-list|#audit-search/);
  assert.doesNotMatch(audit, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(penalty, /assessMonthlyPenalties\(writer, owner\.current, month\)/);
  assert.match(dividends, /calculateDividendCycle\(writer, owner\.current, input\)/);
  assert.match(dividends, /commitDividendCycle\(writer, owner\.current, preview\.input, preview\.data\.payouts\)/);
  assert.match(adminFinanceActions, /\/api\/penalties\/assess/);
  assert.match(adminFinanceActions, /\/api\/dividends\/calculate/);
  assert.match(adminFinanceActions, /\/api\/dividends\/commit/);
  assert.doesNotMatch(legacyDashboard, /dividendDraft|renderDividendPreview|#dividend-form|#penalty-form|api\("\/api\/dividends|api\("\/api\/penalties/);
  assert.doesNotMatch(penalty, /dangerouslySetInnerHTML|innerHTML/);
  assert.doesNotMatch(dividends, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(ledger, /id="transactions"/);
  assert.match(ledger, /id="export-csv"/);
  assert.match(ledger, /canCorrectContributionDate\(item, user\)/);
  assert.match(ledger, /correctContributionDate\(/);
  assert.match(ledger, /window\.location\.assign\("\/api\/export\.csv"\)/);
  assert.match(ledgerActions, /\/api\/contributions\/\$\{encodeURIComponent\(transactionId\)\}\/correct-date/);
  assert.doesNotMatch(ledger, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(chat, /useState\(\[\]\)/);
  assert.match(chat, /onSubmit=\{handleSubmit\}/);
  assert.match(chat, /postChatMessage\(/);
  assert.match(finance, /onClick=\{\(\) => chooseView\("you"\)\}/);
  assert.match(finance, /onClick=\{\(\) => chooseView\("group"\)\}/);
  assert.match(finance, /createPortal\(<div hidden=\{!overviewVisible\}>\{section\}<\/div>, financeTarget\)/);
  assert.match(finance, /window\.addEventListener\("chama:dashboard-state"/);
  assert.match(finance, /fetchFinanceSummary\("\/api\/profile\/summary"/);
  assert.match(finance, /fetchFinanceSummary\("\/api\/summary"/);
  assert.match(attendance, /const secretary = user\?\.role === "secretary"/);
  assert.match(attendance, /expectedRevision: register\?\.revision \?\? null/);
  assert.match(attendance, /saveAttendance\(writeRequester, writeOwner\.current/);
  assert.match(attendance, /dialogRef\.current/);
  assert.match(attendance, /data-page-inactive=\{String\(!active\)\}/);
  assert.doesNotMatch(app, /"register\.js"|"auth-pages\.js"|"profile\.js"/);
  assert.match(registration, /<form id="register-chama-form"/);
  assert.match(registration, /onSubmit=\{handleSubmit\}/);
  assert.match(registration, /name="bootstrapSecret"/);
  assert.match(registration, /defaultValue=\{500\}/);
  assert.match(registration, /setupIsOpen\(\)/);
  assert.match(registration, /bootstrapField\.value = ""/);
  assert.match(actions, /fetcher\("\/api\/setup"/);
  assert.match(actions, /fetcher\("\/api\/login"/);
  assert.match(actions, /X-Setup-Bootstrap-Secret/);
  assert.match(actions, /delete payload\.bootstrapSecret/);
  assert.match(memberLogin, /<form id="login-form"/);
  assert.match(memberLogin, /id="activation-form"/);
  assert.match(memberLogin, /searchParams\.get\("activation"\) === "1" \? "activate" : "login"/);
  assert.match(memberLogin, /id="forgot-pin-form"/);
  assert.match(memberLogin, /id="reset-pin-form"/);
  assert.match(profile, /fetch\("\/api\/session"/);
  assert.match(profile, /path: "\/api\/profile"/);
  assert.match(profile, /`\/api\/profile\/photo\/\$\{size\}`/);
  assert.match(profileMode, /mode === "view"/);
  assert.match(profileMode, /mode === "edit"/);
  assert.match(landing, /id="features"/);
  assert.match(landing, /id="pricing"/);
  assert.match(landing, /id="contact"/);
  assert.match(landing, /href="\/member-login\.html\?activation=1"/);
  assert.match(landing, /selecting a plan will not start checkout, request payment, change subscription status, or affect existing access/i);
  for (const controller of ["chama.js", "contact.js"]) {
    assert.ok(app.includes(`"${controller}"`), `missing compatibility controller ${controller}`);
  }
  assert.match(app, /url\.origin === window\.location\.origin/);
  assert.match(app, /parsed\.body\.querySelectorAll\("script"\)/);
  assert.match(app, /dangerouslySetInnerHTML=\{\{ __html: page\.markup \}\}/);
  assert.match(app, /pageTemplates\[pageKey\]/);
});

test("PIN change keeps the existing same-origin endpoint and confirms the server cleared the forced-change flag", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "pinChangeActions.mjs")).href;
  const { changePin } = await import(helperUrl);
  const owner = {};
  let request;
  const writer = {
    submit: async options => {
      request = options;
      assert.equal(options.validate({ user: { mustChangePin: false } }), true);
      assert.equal(options.validate({ user: { mustChangePin: true } }), false);
      return { user: { mustChangePin: false } };
    },
  };
  const result = await changePin(writer, owner, { currentPin: "[current PIN]", newPin: "[new PIN]" });
  assert.equal(request.owner, owner);
  assert.equal(request.path, "/api/pin/change");
  assert.equal(request.method, "POST");
  assert.deepEqual(request.body, { currentPin: "[current PIN]", newPin: "[new PIN]" });
  assert.equal(result.user.mustChangePin, false);
});

test("simulated payment keeps TEST-only field normalization, idempotent write validation, and inbox response checks", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "simulatedPaymentActions.mjs")).href;
  const { simulatedPaymentFromForm, submitSimulatedPayment } = await import(helperUrl);
  const payload = simulatedPaymentFromForm(new URLSearchParams({
    transactionId: "TEST-TXN-001",
    phoneNumber: "TEST-PHONE-001",
    amount: "12.50",
    reference: "TEST-REF-001",
    timestamp: "2026-11-11T10:20",
  }));
  assert.equal(payload.amount, 12.5);
  assert.equal(payload.timestamp, new Date("2026-11-11T10:20").toISOString());
  const owner = {};
  let request;
  const saved = { data: { status: "Unverified", transactionId: "TEST-TXN-001", rawPayload: { testOnly: true } } };
  const writer = {
    submit: async options => {
      request = options;
      assert.equal(options.validate(saved), true);
      assert.equal(options.validate({ data: { ...saved.data, status: "Confirmed" } }), false);
      assert.equal(options.validate({ data: { ...saved.data, rawPayload: { testOnly: false } } }), false);
      return saved;
    },
  };
  assert.equal(await submitSimulatedPayment(writer, owner, payload), saved);
  assert.equal(request.owner, owner);
  assert.equal(request.path, "/api/payments/simulate");
  assert.equal(request.method, "POST");
  assert.deepEqual(request.body, payload);
});

test("React attendance helpers keep reads same-origin and writes revision-bound through the shared writer", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "attendanceActions.mjs")).href;
  const { fetchAttendance, saveAttendance, todayNairobiDate } = await import(helperUrl);
  let request;
  const data = { members: [{ id: "m1", name: "Member" }], registers: [] };
  const result = await fetchAttendance(async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => data };
  }, new AbortController().signal);
  assert.equal(request.url, "/api/attendance");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "same-origin");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers["X-Requested-With"], "chama");
  assert.equal(request.options.signal.aborted, false);
  assert.deepEqual(result, data);
  assert.equal(todayNairobiDate(new Date("2026-11-10T21:30:00Z")), "2026-11-11");

  const owner = {};
  const payload = { date: "2026-11-11", expectedRevision: 4, attendees: [{ userId: "m1", present: true }] };
  let write;
  const saved = await saveAttendance({ submit: async value => { write = value; return { message: "Attendance register updated." }; } }, owner, payload);
  assert.strictEqual(write.owner, owner);
  assert.equal(write.path, "/api/attendance");
  assert.equal(write.method, "POST");
  assert.deepEqual(write.body, payload);
  assert.equal(saved.message, "Attendance register updated.");
});

test("React finance helpers preserve Nairobi month buckets, filters, and same-origin API contracts", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "financeActions.mjs")).href;
  const { financialMonths, monthlyTransactionSeries, derivePersonalFinance, deriveGroupTrend, fetchFinanceSummary } = await import(helperUrl);
  const months = financialMonths(new Date("2026-11-11T00:00:00+03:00"));
  assert.equal(months[0].key, "2026-06");
  assert.equal(months.at(-1).key, "2026-11");
  const series = monthlyTransactionSeries([
    { date: "2026-11-02", paymentType: "Monthly Contribution", amount: "1200", status: "confirmed" },
    { date: "2026-11-03", paymentType: "Monthly Contribution", amount: "999", status: "pending-member" },
    { date: "2026-11-04", paymentType: "Loan Repayment", amount: "300", status: "confirmed" },
  ], months, "Contributions", "Monthly Contribution", "#347c62");
  assert.equal(series.values.at(-1), 1200);
  const personal = derivePersonalFinance({
    contributions: [{ id: "c1", amount: 1200, status: "confirmed" }, { id: "c2", amount: 1, status: "pending-member" }],
    fines: [{ id: "f1", amount: 50, status: "outstanding" }],
    loans: { ongoing: [{ id: "l1", status: "approved", outstanding: 400 }], fullyPaid: [] },
  });
  assert.equal(personal.contributions.length, 1);
  assert.deepEqual(personal.arrears.map(item => item.amount), [400, 50]);
  assert.equal(deriveGroupTrend({ financialTrends: { months: ["2026-11"], contributions: [2300], loanRepayments: [400] } }, months)[0].values.at(-1), 2300);

  let request;
  const payload = await fetchFinanceSummary("/api/summary", async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ data: { contributions: 12 } }) };
  });
  assert.equal(request.url, "/api/summary");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "same-origin");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers["X-Requested-With"], "chama");
  assert.deepEqual(payload, { contributions: 12 });
  await assert.rejects(fetchFinanceSummary("/api/summary", async () => ({ ok: false, status: 503, json: async () => ({ message: "Unavailable" }) })), error => error.status === 503);
});

test("React landing contact helper preserves the same-origin endpoint, headers and JSON fields", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "contactActions.mjs")).href;
  const { submitContact } = await import(helperUrl);
  const payload = { name: "Test Member", email: "member@example.test", subject: "Question", message: "A test message body." };
  let captured;
  const response = { ok: true, status: 200 };
  const result = await submitContact(payload, async (url, options) => {
    captured = { url, options };
    return response;
  });
  assert.equal(result, response);
  assert.equal(captured.url, "/api/contact");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.credentials, "same-origin");
  assert.equal(captured.options.headers["Content-Type"], "application/json");
  assert.equal(captured.options.headers["X-Requested-With"], "chama");
  assert.deepEqual(JSON.parse(captured.options.body), payload);
});

test("React chat helpers preserve the same-origin read and shared idempotent write contracts", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "chatActions.mjs")).href;
  const { loadChatMessages, postChatMessage } = await import(helperUrl);
  const messages = Array.from({ length: 105 }, (_, index) => ({ id: `m${index}` }));
  let request;
  const loaded = await loadChatMessages(async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ data: messages }) };
  });
  assert.equal(request.url, "/api/messages");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "same-origin");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers["X-Requested-With"], "chama");
  assert.equal(loaded.length, 100);
  assert.equal(loaded[0].id, "m5");

  const owner = {};
  let write;
  const result = await postChatMessage({
    text: "  Hello group  ",
    owner,
    writeRequester: { submit: async payload => { write = payload; return { data: { id: "message-1" } }; } },
  });
  assert.equal(result.data.id, "message-1");
  assert.equal(write.owner, owner);
  assert.equal(write.path, "/api/messages");
  assert.equal(write.method, "POST");
  assert.deepEqual(write.body, { text: "Hello group" });
  assert.equal(write.validate({ data: { id: "message-2" } }), true);
  assert.equal(write.validate({ data: {} }), false);
  await assert.rejects(postChatMessage({ text: "  ", owner, writeRequester: { submit() {} } }), /1 to 500 characters/);
});

test("React loan helpers preserve supported terms, two distinct guarantors and idempotent API contracts", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "loanActions.mjs")).href;
  const { loanRequestFromForm, loanStatusPresentation, submitLoanRequest, recordLoanDecision } = await import(helperUrl);
  const form = {
    get: name => ({ amount: "1200", months: "2" })[name],
    getAll: name => name === "guarantorIds" ? ["g1", "g2"] : [],
  };
  const payload = loanRequestFromForm(form);
  assert.deepEqual(payload, { amount: 1200, months: 2, guarantorIds: ["g1", "g2"] });
  assert.throws(() => loanRequestFromForm({ ...form, getAll: () => ["g1", "g1"] }), /two different active members/);
  assert.throws(() => loanRequestFromForm({ ...form, get: name => name === "months" ? "4" : "1200" }), /1, 2, 3, or 6 months/);
  assert.deepEqual(loanStatusPresentation("Waiting for decisions"), { label: "Pending", className: "pending" });
  assert.deepEqual(loanStatusPresentation("approved"), { label: "Approved", className: "success" });

  const requestOwner = {};
  let request;
  const requestResult = { data: { id: "loan-1", amount: 1200, months: 2 } };
  const writeRequester = { submit: async value => { request = value; return requestResult; } };
  assert.strictEqual(await submitLoanRequest(writeRequester, requestOwner, payload), requestResult);
  assert.strictEqual(request.owner, requestOwner);
  assert.equal(request.path, "/api/loans");
  assert.equal(request.method, "POST");
  assert.deepEqual(request.body, payload);
  assert.equal(request.validate(requestResult), true);
  assert.equal(request.validate({ data: { id: "loan-1", amount: 1200, months: 3 } }), false);

  const decisionOwner = {};
  let decisionWrite;
  const decisionResult = { data: { id: "loan/2" } };
  const decisionWriter = { submit: async value => { decisionWrite = value; return decisionResult; } };
  assert.strictEqual(await recordLoanDecision(decisionWriter, decisionOwner, "loan/2", "approve", "Reviewed and approved"), decisionResult);
  assert.strictEqual(decisionWrite.owner, decisionOwner);
  assert.equal(decisionWrite.path, "/api/loans/loan%2F2/decisions");
  assert.deepEqual(decisionWrite.body, { decision: "approve", reason: "Reviewed and approved" });
  assert.equal(decisionWrite.validate(decisionResult), true);
  assert.throws(() => recordLoanDecision(decisionWriter, decisionOwner, "loan-1", "approve", "no"), /between 5 and 500/);
});

test("React ledger helpers preserve correction eligibility, calendar bounds, and idempotent API contracts", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "ledgerActions.mjs")).href;
  const { canCorrectContributionDate, contributionDateBounds, correctContributionDate } = await import(helperUrl);
  const transaction = { id: "cash/1", status: "confirmed", paymentType: "Monthly Contribution", method: "Cash", date: "2026-11-03" };
  assert.equal(canCorrectContributionDate(transaction, { role: "chairperson" }), true);
  assert.equal(canCorrectContributionDate(transaction, { role: "treasurer" }), true);
  assert.equal(canCorrectContributionDate(transaction, { role: "secretary" }), false);
  assert.equal(canCorrectContributionDate({ ...transaction, method: "M-Pesa" }, { role: "chairperson" }), false);
  assert.deepEqual(contributionDateBounds(transaction.date, "2026-11-11"), { min: "2026-11-01", max: "2026-11-11" });
  assert.deepEqual(contributionDateBounds("2026-10-03", "2026-11-11"), { min: "2026-10-01", max: "2026-10-31" });

  const owner = {};
  let write;
  const saved = { data: { transaction: { id: "cash/1" } } };
  const requester = { submit: async value => { write = value; return saved; } };
  assert.strictEqual(await correctContributionDate(requester, owner, "cash/1", { date: "2026-11-04", reason: "Corrected from the original receipt" }), saved);
  assert.strictEqual(write.owner, owner);
  assert.equal(write.path, "/api/contributions/cash%2F1/correct-date");
  assert.equal(write.method, "POST");
  assert.deepEqual(write.body, { date: "2026-11-04", reason: "Corrected from the original receipt" });
  assert.equal(write.validate(saved), true);
  assert.equal(write.validate({ data: { transaction: { id: "cash/2" } } }), false);
  assert.throws(() => correctContributionDate(requester, owner, "cash/1", { date: "not-a-date", reason: "Reason" }), /valid date/);
});

test("React member helpers preserve roster status, invitation undo limits, and revocation write contracts", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "memberActions.mjs")).href;
  const { memberStatusPresentation, invitationStatusPresentation, canUndoInvitation, activeRoleChangeForMember, submitMemberRevocation } = await import(helperUrl);
  assert.deepEqual(memberStatusPresentation("active"), { normalized: "active", statusKey: "activeStatus", className: "active", label: null });
  assert.deepEqual(memberStatusPresentation("inactive-account"), { normalized: "inactive account", statusKey: null, className: "inactive", label: "Inactive Account" });
  const now = Date.parse("2026-11-11T12:00:00Z");
  const invitation = { id: "invite/1", invitedAt: "2026-11-11T11:00:00Z", expiresAt: "2026-11-18T11:00:00Z" };
  assert.deepEqual(invitationStatusPresentation(invitation, now), { statusKey: "pendingActivationStatus", className: "pending" });
  assert.equal(canUndoInvitation(invitation, { revokeInvitations: true }, now), true);
  assert.equal(canUndoInvitation(invitation, { revokeInvitations: false }, now), false);
  assert.equal(canUndoInvitation({ ...invitation, usedAt: "2026-11-11T11:30:00Z" }, { revokeInvitations: true }, now), false);
  assert.equal(canUndoInvitation({ ...invitation, invitedAt: "2026-11-10T11:00:00Z" }, { revokeInvitations: true }, now), false);
  const roleChange = { id: "role-1", status: "confirmed", incomingUserId: "user-1", role: "treasurer", audit: [] };
  assert.strictEqual(activeRoleChangeForMember({ id: "user-1", role: "treasurer" }, [roleChange]), roleChange);
  assert.equal(activeRoleChangeForMember({ id: "user-1", role: "secretary" }, [roleChange]), undefined);

  const owner = {};
  let write;
  const saved = { message: "Invitation revoked." };
  const requester = { submit: async payload => { write = payload; return saved; } };
  assert.strictEqual(await submitMemberRevocation(requester, owner, "/api/invitations/invite%2F1/revoke", "Duplicate invitation"), saved);
  assert.strictEqual(write.owner, owner);
  assert.equal(write.method, "POST");
  assert.equal(write.path, "/api/invitations/invite%2F1/revoke");
  assert.deepEqual(write.body, { reason: "Duplicate invitation" });
  assert.throws(() => submitMemberRevocation(requester, owner, "/api/invitations/id/revoke", "no"), /5-500 characters/);
});

test("React month-close helper preserves the read-only same-origin report API contract", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "monthCloseActions.mjs")).href;
  const { fetchMonthlyClose } = await import(helperUrl);
  let request;
  const report = {
    month: "2026-10",
    totals: {},
    exceptions: {},
    entries: [],
  };
  const result = await fetchMonthlyClose("2026-10", async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ data: report }) };
  });
  assert.strictEqual(result, report);
  assert.equal(request.url, "/api/monthly-close?month=2026-10");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "same-origin");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers["X-Requested-With"], "chama");
  await assert.rejects(fetchMonthlyClose("not-a-month", async () => { throw new Error("unexpected network call"); }), /valid review month/);
  await assert.rejects(fetchMonthlyClose("2026-10", async () => ({ ok: true, json: async () => ({ data: { month: "2026-09" } }) })), /could not be confirmed/);
});

test("React audit helpers preserve searchable event text, 25-item paging, and the read-only API contract", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "auditActions.mjs")).href;
  const { auditDescription, filterAuditEntries, paginateAuditEntries, fetchAuditLog } = await import(helperUrl);
  const entries = Array.from({ length: 30 }, (_, index) => ({
    id: `audit-${index}`,
    at: `2026-10-${String(index + 1).padStart(2, "0")}`,
    type: `Action ${index}`,
    by: { name: `Officer ${index}`, role: "treasurer" },
  }));
  const firstPage = paginateAuditEntries(entries, 0, 25);
  assert.equal(firstPage.items.length, 25);
  assert.equal(firstPage.pageCount, 2);
  assert.equal(firstPage.items[0].type, "Action 0");
  assert.equal(firstPage.items.at(-1).type, "Action 24");
  const lastPage = paginateAuditEntries(entries, 1, 25);
  assert.equal(lastPage.items.length, 5);
  assert.equal(lastPage.items.at(-1).type, "Action 29");
  assert.deepEqual(filterAuditEntries(entries, "Officer 29", value => value), [entries[29]]);
  assert.deepEqual(filterAuditEntries(entries, "Action 29", value => value), [entries[29]]);
  assert.equal(auditDescription({ type: "payment.recorded", amount: 1200, memberName: "Amina" }), "KES 1200 cash payment recorded for Amina");

  let request;
  const loaded = await fetchAuditLog(async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ data: entries }) };
  });
  assert.strictEqual(loaded, entries);
  assert.equal(request.url, "/api/audit-log");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "same-origin");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers["X-Requested-With"], "chama");
  await assert.rejects(fetchAuditLog(async () => ({ ok: true, json: async () => ({ data: {} }) })), /could not be confirmed/);
  await assert.rejects(fetchAuditLog(async () => ({ ok: false, status: 403, json: async () => ({ message: "forbidden" }) })), error => error.status === 403);
});

test("React financial admin actions retain penalty and dividend preview/commit contracts", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "adminFinanceActions.mjs")).href;
  const { assessMonthlyPenalties, calculateDividendCycle, commitDividendCycle } = await import(helperUrl);
  const owner = {};
  const input = { cycleStartDate: "2026-01-01", cycleEndDate: "2026-10-31", adminExpenses: 250 };
  const payouts = [{ memberId: "member-1", dividend: 600 }, { memberId: "member-2", dividend: 400 }];
  const requests = [];
  const requester = {
    submit: async request => {
      requests.push(request);
      let response;
      if (request.path === "/api/penalties/assess") response = { message: "1 member(s) penalised for 2026-10.", data: { month: "2026-10", assessed: [{ memberName: "Amina" }] } };
      else if (request.path === "/api/dividends/calculate") response = { message: "Dividend preview. Nothing has been paid out yet.", data: { ...input, payouts, overlapsCommitted: false } };
      else response = { message: "Dividends added to share capital.", data: { cycleStartDate: input.cycleStartDate, cycleEndDate: input.cycleEndDate, payouts: request.body.payouts } };
      assert.equal(request.owner, owner);
      assert.equal(request.method, "POST");
      assert.equal(request.validate(response), true);
      return response;
    },
  };

  await assessMonthlyPenalties(requester, owner, "2026-10");
  assert.equal(requests[0].path, "/api/penalties/assess");
  assert.deepEqual(requests[0].body, { month: "2026-10" });
  const preview = await calculateDividendCycle(requester, owner, input);
  assert.equal(requests[1].path, "/api/dividends/calculate");
  assert.deepEqual(requests[1].body, input);
  await commitDividendCycle(requester, owner, input, preview.data.payouts);
  assert.equal(requests[2].path, "/api/dividends/commit");
  assert.deepEqual(requests[2].body, { ...input, payouts });

  assert.throws(() => assessMonthlyPenalties(requester, owner, "2026-13"), /YYYY-MM/);
  assert.throws(() => calculateDividendCycle(requester, owner, { ...input, cycleStartDate: "2026-11-01" }), /valid cycle dates/);
  assert.throws(() => commitDividendCycle(requester, owner, input, null), /preview/);
  assert.equal(requests.length, 3);
});

test("React election actions preserve existing same-origin route payloads and reject invalid candidate selections", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "electionActions.mjs")).href;
  const { scheduleElection, castElectionVote, submitElectionDecision, scheduleElectionRunoff } = await import(helperUrl);
  const owner = {};
  const requests = [];
  const requester = {
    submit: async request => {
      requests.push(request);
      const response = {
        message: "Accepted.",
        data: {
          id: request.path.includes("/runoff") ? "runoff-1" : "election-1",
          role: "treasurer",
          scheduledDate: request.path.includes("/runoff") ? "2026-11-20" : "2026-11-21",
        },
      };
      assert.equal(request.owner, owner);
      assert.equal(request.method, "POST");
      assert.equal(request.validate(response), true);
      return response;
    },
  };

  await scheduleElection(requester, owner, { role: "treasurer", scheduledDate: "2026-11-21", candidateIds: ["member-a", "member-b"] });
  assert.equal(requests[0].path, "/api/leadership-elections");
  assert.deepEqual(requests[0].body, { role: "treasurer", candidateIds: ["member-a", "member-b"], scheduledDate: "2026-11-21" });
  await castElectionVote(requester, owner, "election-1", "member-a");
  assert.equal(requests[1].path, "/api/leadership-elections/election-1/vote");
  assert.deepEqual(requests[1].body, { candidateId: "member-a" });
  await submitElectionDecision(requester, owner, "election-1", "verify");
  assert.equal(requests[2].path, "/api/leadership-elections/election-1/verify");
  assert.deepEqual(requests[2].body, {});
  await scheduleElectionRunoff(requester, owner, "election-1", "2026-11-20");
  assert.equal(requests[3].path, "/api/leadership-elections/election-1/runoff");
  assert.deepEqual(requests[3].body, { scheduledDate: "2026-11-20" });

  assert.throws(() => scheduleElection(requester, owner, { role: "treasurer", scheduledDate: "2026-11-21", candidateIds: ["member-a", "member-a"] }), /2 to 20 different/);
  assert.throws(() => submitElectionDecision(requester, owner, "election-1", "reveal-ballots"), /valid election action/);
  assert.equal(requests.length, 4);
});

test("React leadership actions preserve bootstrap routes and validate officer assignment payloads", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "leadershipActions.mjs")).href;
  const { leadershipProposalFromForm, submitLeadershipProposal, confirmLeadershipProposal } = await import(helperUrl);
  const owner = {};
  const requests = [];
  const requester = {
    submit: async request => {
      requests.push(request);
      const response = request.path.endsWith("/confirm")
        ? { data: { id: "change-1", status: "confirmed" } }
        : { data: { id: "change-1", type: "appointment", bootstrap: true, role: "secretary", incomingUserId: "member-1", effectiveDate: "2026-11-25" } };
      assert.equal(request.owner, owner);
      assert.equal(request.method, "POST");
      assert.equal(request.validate(response), true);
      return response;
    },
  };
  const formData = new FormData();
  formData.set("role", "secretary");
  formData.set("incomingUserId", "member-1");
  formData.set("effectiveDate", "2026-11-25");
  const payload = leadershipProposalFromForm(formData);
  await submitLeadershipProposal(requester, owner, payload);
  assert.equal(requests[0].path, "/api/leadership-changes");
  assert.deepEqual(requests[0].body, payload);
  await confirmLeadershipProposal(requester, owner, "change-1");
  assert.equal(requests[1].path, "/api/leadership-changes/change-1/confirm");
  assert.deepEqual(requests[1].body, {});
  assert.throws(() => leadershipProposalFromForm(new FormData()), /valid officer role/);
  assert.throws(() => submitLeadershipProposal(requester, owner, { role: "member", incomingUserId: "member-1", effectiveDate: "2026-11-25" }), /officer role/);
  assert.equal(requests.length, 2);
});

test("React invitation action preserves the existing response contract and verifies the server idempotency key", async () => {
  const helperUrl = pathToFileURL(path.join(sourceRoot, "src", "invitationActions.mjs")).href;
  const { createInvitation } = await import(helperUrl);
  const owner = {};
  const key = "synthetic-idempotency-key";
  const requests = [];
  const requester = {
    submit: async request => {
      requests.push(request);
      const response = {
        message: "Invitation sent by email.",
        deliveryChannel: "email",
        invitation: {
          id: "synthetic-invitation-id", name: "Test Member", phone: "synthetic-phone",
          requestedRole: "member", idempotencyKey: key, attemptsRemaining: 5,
          invitedBy: "synthetic-officer-id", invitedAt: "2026-11-10T12:00:00.000Z",
          expiresAt: "2026-11-11T12:00:00.000Z", usedAt: null,
        },
      };
      assert.equal(request.owner, owner);
      assert.equal(request.path, "/api/invitations");
      assert.equal(request.method, "POST");
      assert.equal(request.validate(response, key), true);
      assert.equal(request.validate(response, "different-key"), false);
      return response;
    },
  };
  const result = await createInvitation(requester, owner, { name: "  Test Member ", phone: " synthetic-phone ", email: " member@example.test ", role: "member" });
  assert.equal(result.message, "Invitation sent by email.");
  assert.deepEqual(requests[0].body, { name: "Test Member", phone: "synthetic-phone", email: "member@example.test", role: "member" });
  assert.throws(() => createInvitation(requester, owner, { name: "Test", phone: "synthetic-phone", email: "member@example.test", role: "chairperson" }), /Choose a member role/);
  assert.equal(requests.length, 1);
});
