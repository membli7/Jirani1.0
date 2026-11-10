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

test("signed-out landing, registration, member login and profile are React-owned while authenticated dashboard stays bridged", () => {
  const main = readSource("src/main.jsx");
  const app = readSource("src/App.jsx");
  const templates = readSource("src/pageTemplates.js");
  const registration = readSource("src/pages/RegisterPage.jsx");
  const memberLogin = readSource("src/pages/MemberLoginPage.jsx");
  const profile = readSource("src/pages/ProfilePage.jsx");
  const landing = readSource("src/pages/LandingPage.jsx");
  const chat = readSource("src/components/ChatPanel.jsx");
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
  assert.match(chat, /useState\(\[\]\)/);
  assert.match(chat, /onSubmit=\{handleSubmit\}/);
  assert.match(chat, /postChatMessage\(/);
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
