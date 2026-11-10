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

test("auth forms stack on mobile widths and retain scrollability and 44px touch targets", () => {
  assert.match(frontendCss, /@media \(max-width: 760px\) \{\s*\.login-overlay \.login-content \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(frontendCss, /\.login-overlay\s*\{\s*overflow-y: auto;/);
  assert.match(frontendCss, /\.field input, \.field select, textarea \{ min-height: 44px;/);
  assert.match(frontendCss, /\.button-primary \{ min-height: 46px;/);
  assert.match(frontendCss, /\.toggle-pin-btn\s*\{[^}]*width: 44px;[^}]*height: 44px;[^}]*min-height: 44px;[^}]*min-width: 44px;/);
});

test("React owns dashboard finance and attendance features plus the existing account routes", () => {
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
