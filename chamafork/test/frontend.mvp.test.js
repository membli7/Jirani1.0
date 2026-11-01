"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const frontend = path.join(__dirname, "..", "..", "en public");
const html = fs.readFileSync(path.join(frontend, "index.html"), "utf8");
const script = fs.readFileSync(path.join(frontend, "chama.js"), "utf8");
const css = fs.readFileSync(path.join(frontend, "chama.css"), "utf8");
const profileHtml = fs.readFileSync(path.join(frontend, "profile.html"), "utf8");
const profileScript = fs.readFileSync(path.join(frontend, "profile.js"), "utf8");
const registerHtml = fs.readFileSync(path.join(frontend, "register.html"), "utf8");
const registerScript = fs.readFileSync(path.join(frontend, "register.js"), "utf8");
const memberLoginHtml = fs.readFileSync(path.join(frontend, "member-login.html"), "utf8");
const authPagesScript = fs.readFileSync(path.join(frontend, "auth-pages.js"), "utf8");
const i18n = fs.readFileSync(path.join(frontend, "i18n.js"), "utf8");

test("launch-critical invitation, election, and cash copy is accurate in English and Kiswahili", () => {
  for (const message of [
    "The Chairperson or Secretary can invite Members directly.",
    "After setup, officers are selected through secret-ballot elections.",
    "After setup, the Secretary proposes officer candidates. Eligible group accounts vote by secret ballot; the Chairperson opens and closes voting and verifies the result. Verified changes take effect after 24 hours.",
    "This records cash already received; it does not transfer money."
  ]) {
    assert.ok(html.includes(message), `expected English UI copy: ${message}`);
    const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(i18n, new RegExp(`"${escaped}":\\s*"[^"]+"`), `expected Kiswahili translation for: ${message}`);
  }
});

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
  assert.match(registerHtml, /src="\/register\.js\?v=20261020\.4" defer/);
  assert.match(registerScript, /fetch\("\/api\/setup"/);
  assert.match(registerScript, /credentials: "same-origin"/);
  assert.match(registerScript, /formData\.deadlineDay = Number\(formData\.deadlineDay\)/);
  assert.match(registerScript, /formData\.welfareMonthlyFee = Number\(formData\.welfareMonthlyFee\)/);
  assert.match(registerScript, /formData\.lateContributionPenalty = Number\(formData\.lateContributionPenalty\)/);
  assert.match(registerScript, /formData\.loanMonthlyRatePercent = Number\(formData\.loanMonthlyRatePercent\)/);
  assert.match(registerScript, /X-Requested-With": "chama"/);
  assert.match(registerScript, /response\.status === 409/);
  assert.match(registerScript, /fetch\("\/api\/login"/);
  assert.match(registerScript, /window\.location\.assign\("\/"\)/);
  assert.match(registerScript, /registrationNotice\.textContent = error instanceof TypeError/);
});

test("member invitations send the required email address", () => {
  const inviteHandler = script.match(/\$\("#invite-form"\)\.addEventListener\("submit", async event => \{[\s\S]*?\n\}\);/)?.[0];
  assert.ok(inviteHandler, "member invitation form should have a submit handler");
  assert.match(inviteHandler, /namedItem\("email"\)/);
  assert.match(inviteHandler, /email:\s*emailField\.value\.trim\(\)/);
  assert.match(inviteHandler, /if \(!values\.email\)/);
});

test("registration signs in and opens the dashboard when setup was already completed", async () => {
  let submitHandler;
  let redirect = "";
  const requests = [];
  const submitButton = { disabled: false };
  const registrationForm = {
    addEventListener: (event, handler) => { if (event === "submit") submitHandler = handler; },
    querySelector: () => submitButton,
  };
  const registrationNotice = { hidden: true, textContent: "" };
  const context = {
    document: { querySelector: selector => selector === "#register-chama-form" ? registrationForm : registrationNotice },
    FormData: class { constructor() { return [["phone", "0700000000"], ["pin", "135790"]]; } },
    URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? { ok: false, status: 409, json: async () => ({ message: "Initial setup has already been completed." }) }
        : { ok: true, status: 200, json: async () => ({ message: "Signed in successfully." }) };
    },
    window: { location: { search: "", assign: url => { redirect = url; } } },
  };
  vm.runInNewContext(registerScript, context);
  await submitHandler({ preventDefault() {} });

  assert.deepEqual(requests.map(request => request.url), ["/api/setup", "/api/login"]);
  assert.deepEqual(JSON.parse(requests[1].options.body), { phone: "0700000000", pin: "135790" });
  assert.equal(redirect, "/");
  assert.equal(registrationNotice.hidden, true);
});

test("root page restores the dashboard for an existing authenticated session", async () => {
  const source = script.match(/async function restoreSession\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, "root page should define its session restoration flow");
  assert.match(html, /src="\/chama\.js\?v=20261020\.10" defer/);

  const calls = [];
  const restoreSession = vm.runInNewContext(`(${source})`, {
    api: async path => { calls.push(["api", path]); return { authenticated: true }; },
    showLogin: () => calls.push(["showLogin"]),
    refresh: async () => calls.push(["refresh"]),
    checkBackendConnection: async options => calls.push(["checkBackendConnection", options]),
  });
  await restoreSession();

  assert.deepEqual(calls, [["showLogin"], ["api", "/api/session"], ["refresh"]]);
});

test("root page keeps setup selection for a signed-out visitor", async () => {
  const source = script.match(/async function restoreSession\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, "root page should define its session restoration flow");

  const calls = [];
  const restoreSession = vm.runInNewContext(`(${source})`, {
    api: async path => { calls.push(["api", path]); return { authenticated: false }; },
    showLogin: () => calls.push(["showLogin"]),
    refresh: async () => calls.push(["refresh"]),
    checkBackendConnection: async options => calls.push(["checkBackendConnection", options]),
  });
  await restoreSession();

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["showLogin"],
    ["api", "/api/session"],
    ["checkBackendConnection", { selectInitialScreen: true }],
  ]);
});

test("root app tolerates the absence of standalone authentication forms", async () => {
  const normalizedScript = script.replace(/\r\n/g, "\n");
  const backendStart = normalizedScript.indexOf("async function checkBackendConnection(");
  const backendEnd = normalizedScript.indexOf("\nfunction setLoginNotice", backendStart);
  const loginSource = script.split(/\r?\n/).find(line => line.startsWith("function showLogin()"));
  const backendSource = backendStart >= 0 && backendEnd > backendStart ? normalizedScript.slice(backendStart, backendEnd) : null;
  assert.ok(backendSource, "root page should define backend status handling");
  assert.ok(loginSource, "root page should define its signed-out state");

  const nodes = new Map([["#logout", {}], ["#app", {}], ["#login", {}], ["#identity", {}], ["#menu-identity", {}]]);
  const context = {
    $: selector => nodes.get(selector) || null,
    fetch: async url => url === "/api/health"
      ? { ok: true }
      : { ok: true, json: async () => ({ requiresSetup: false }) },
    setConnectionStatus() {},
    clearAppData() {},
    stopPollingFallback() {},
    clearTimeout() {},
    clearInterval() {},
    setLoginNotice() {},
    setNavigationOpen() {},
    eventStream: null,
    streamRetryTimer: null,
    activityTimer: null,
    authenticated: false,
  };
  const checkBackendConnection = vm.runInNewContext(`(${backendSource})`, context);
  const showLogin = vm.runInNewContext(`(${loginSource})`, context);
  await checkBackendConnection({ selectInitialScreen: true });
  showLogin();

  assert.equal(nodes.get("#app").hidden, true);
  assert.equal(nodes.get("#login").hidden, false);
});

test("root renderer tolerates summary cards absent from the current dashboard markup", () => {
  for (const id of ["balance", "contributions", "outstanding"]) {
    assert.doesNotMatch(script, new RegExp(`\\$\\("#${id}"\\)\\.textContent\\s*=`));
  }
});

test("authenticated dashboard navigation uses an accessible hamburger drawer", () => {
  assert.match(html, /id="menu-toggle"[\s\S]*?aria-controls="menu-bar"/);
  assert.match(html, /<nav class="menu-bar" id="menu-bar"[\s\S]*?data-panel="members-panel"/);
  assert.match(html, /id="menu-identity"/);
  assert.match(script, /menuToggle\.addEventListener\("click"/);
  assert.match(script, /menuBar\.addEventListener\("click"/);
  assert.match(script, /function showAppPage\(panelId\)/);
  assert.match(script, /showAppPage\(panelLink\.dataset\.panel\)/);
  assert.match(script, /aria-expanded/);
  assert.match(css, /\.topbar\.is-authenticated \.topbar-nav/);
  assert.match(css, /\.menu-bar\.menu-open\s*\{\s*display:\s*flex !important/);
});

test("You and Group have separate financial views with mobile bottom navigation and comparable totals", () => {
  assert.match(html, /id="dashboard-tabs"[\s\S]*?data-dashboard-tab="you"[\s\S]*?data-dashboard-tab="group"/);
  assert.match(html, /id="you-chart"/);
  assert.match(html, /id="group-chart"/);
  assert.match(script, /api\("\/api\/profile\/summary"\)/);
  assert.match(script, /api\("\/api\/summary"\)/);
  assert.match(script, /function renderComparableChart\(/);
  assert.match(script, /await loadFinancialViews\(\)/);
  assert.match(script, /summary\.balance !== null && summary\.balance !== undefined/);
  assert.match(css, /\.topbar\.is-authenticated \.dashboard-tabs\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*0;/);
});

test("header icons, profile actions, live dot, muted background, and short menu are usable", () => {
  const profileMenu = html.match(/<div id="profile-menu"[\s\S]*?<\/div>/)?.[0] || "";
  for (const action of ["View profile", "Edit profile", "Create new chama", "Switch chama"]) assert.match(profileMenu, new RegExp(action));
  assert.match(html, /id="notification-button"[^>]*aria-controls="chat-panel"/);
  assert.match(script, /\$\("#notification-button"\)\.addEventListener\("click", \(\) => showAppPage\("chat-panel"\)\)/);
  assert.match(html, /connection-status-dot/);
  assert.match(css, /\.topbar\.is-authenticated \.connection-status\s*\{[\s\S]*?display:\s*inline-flex !important/);
  assert.match(css, /\.connection-status\[data-status="live"\] \.connection-status-dot\s*\{\s*background:\s*#2f9b5e/);
  assert.match(css, /\.connection-status:not\(\[data-status="live"\]\) \.connection-status-dot\s*\{\s*background:\s*#9aa39d/);
  assert.match(css, /body:has\(#app:not\(\[hidden\]\)\)\s*\{[\s\S]*?radial-gradient/);
  assert.match(css, /\.menu-bar\s*\{\s*height:\s*auto; bottom:\s*auto; max-height:\s*min\(72vh, 640px\)/);
  assert.match(profileScript, /profileMode === "view"/);
  assert.match(profileScript, /profileMode === "edit"/);
  assert.match(registerHtml, /id="new-chama-existing-instance"/);
  assert.match(registerScript, /get\("new-chama"\) === "1"/);
  assert.match(memberLoginHtml, /id="login-page-title"/);
  assert.match(authPagesScript, /get\("switch-chama"\) === "1"/);
});

test("audit log, penalty, and dividend panels exist and start hidden", () => {
  assert.match(html, /<section class="panel" id="audit-panel"[^>]*hidden>/);
  assert.match(html, /<tbody id="audit-list"/);
  assert.match(html, /<section class="panel" id="penalty-panel"[^>]*hidden>/);
  assert.match(html, /<section class="panel" id="dividend-panel"[^>]*hidden>/);
});

test("audit log search and paging render only the requested entries", () => {
  const renderSource = script.match(/function renderAuditLogPage\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(renderSource, "audit log should define its search and pagination renderer");
  const nodes = new Map([
    ["#audit-search", { value: "" }],
    ["#audit-list", { innerHTML: "" }],
    ["#audit-page-info", { textContent: "" }],
    ["#audit-previous", { disabled: false }],
    ["#audit-next", { disabled: false }],
  ]);
  const context = {
    $: selector => nodes.get(selector),
    auditEntries: Array.from({ length: 30 }, (_, index) => ({ at: `2026-10-${String(index + 1).padStart(2, "0")}`, type: `Action ${index}` })),
    auditPage: 0,
    auditPageSize: 25,
    esc: value => String(value),
    fmtDate: value => value,
    fmtTime: () => "09:00",
    roleName: value => value,
    auditDescription: entry => entry.type,
  };
  const renderPage = vm.runInNewContext(`(${renderSource})`, context);
  renderPage();
  assert.match(nodes.get("#audit-list").innerHTML, /Action 0/);
  assert.doesNotMatch(nodes.get("#audit-list").innerHTML, /Action 29/);
  assert.equal(nodes.get("#audit-page-info").textContent, "1 / 2 · 30 entries");
  assert.equal(nodes.get("#audit-next").disabled, false);
  nodes.get("#audit-search").value = "Action 29";
  renderPage();
  assert.match(nodes.get("#audit-list").innerHTML, /Action 29/);
  assert.equal(nodes.get("#audit-page-info").textContent, "1 / 1 · 1 entries");
  assert.equal(nodes.get("#audit-next").disabled, true);
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
  assert.match(profileHtml, /src="\/profile\.js\?v=20261020\.2" defer/);
  assert.match(profileScript, /fetch\("\/api\/profile"/);
  assert.match(profileScript, /path: "\/api\/profile"/);
  assert.match(profileScript, /\/api\/profile\/photo\/\$\{size\}/);
  assert.match(profileScript, /"X-Requested-With": "chama"/);
  assert.match(profileScript, /credentials: "same-origin"/);
  assert.doesNotMatch(profileScript, /\.innerHTML\s*=/);
  assert.match(html, /id="profile-menu"[\s\S]*?href="\/profile\.html\?mode=view"[^>]*>View profile<\/a>/);
});

test("profile menu view and edit links select the correct profile-page mode", async () => {
  async function loadMode(mode) {
    const detailFields = Object.fromEntries(["firstName", "lastName", "nickname", "phone", "email"].map(name => [name, { value: "" }]));
    const fields = { disabled: true };
    const changeButton = { hidden: false, addEventListener() {} };
    const saveButton = { hidden: true };
    const detailsForm = { elements: { namedItem: name => detailFields[name] }, addEventListener() {} };
    const photoInput = { disabled: false, addEventListener() {} };
    const photoPreview = { replaceChildren() {} };
    const uploadLabel = { hidden: false };
    const pageHeading = { textContent: "Edit profile" };
    const nodes = new Map([
      ["#profile-details-form", detailsForm],
      ["#profile-details-fields", fields],
      ["#change-details", changeButton],
      ["#save-details", saveButton],
      ["#profile-details-status", { classList: { toggle() {} }, textContent: "" }],
      ["#profile-photo", photoInput],
      ["#profile-photo-preview", photoPreview],
      ["#profile-status", { classList: { toggle() {} }, textContent: "" }],
      [".profile-upload", uploadLabel],
      [".profile-card > p", { textContent: "" }],
      ["#profile-title", pageHeading],
    ]);
    const document = {
      title: "",
      querySelector: selector => nodes.get(selector),
      createElement: () => ({ addEventListener() {}, alt: "", src: "" }),
    };
    const context = {
      document,
      URLSearchParams,
      window: { location: { search: mode ? "?mode=" + mode : "", assign() {} } },
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: { firstName: "Asha", lastName: "Test", nickname: "", phone: "+254700000000", email: "asha@example.test" } }) }),
    };
    vm.runInNewContext(profileScript, context);
    await new Promise(resolve => setImmediate(resolve));
    return { detailFields, fields, changeButton, saveButton, photoInput, uploadLabel, document, pageHeading };
  }

  const view = await loadMode("view");
  assert.equal(view.pageHeading.textContent, "View profile");
  assert.equal(view.fields.disabled, true);
  assert.equal(view.changeButton.hidden, true);
  assert.equal(view.saveButton.hidden, true);
  assert.equal(view.photoInput.disabled, true);
  assert.equal(view.uploadLabel.hidden, true);
  assert.equal(view.document.title, "View profile | Jirani Chama");
  assert.equal(view.detailFields.firstName.value, "Asha");

  const edit = await loadMode("edit");
  assert.equal(edit.fields.disabled, false);
  assert.equal(edit.changeButton.hidden, true);
  assert.equal(edit.saveButton.hidden, false);
  assert.equal(edit.photoInput.disabled, false);
});
