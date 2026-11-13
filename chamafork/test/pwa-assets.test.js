"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const publicRoot = path.join(__dirname, "..", "..", "en public");

test("PWA assets include root-scoped install metadata, service-worker push handling, and no app-store placeholders", () => {
  const worker = fs.readFileSync(path.join(publicRoot, "service-worker.js"), "utf8");
  const manifest = fs.readFileSync(path.join(publicRoot, "react", "index.html"), "utf8");
  assert.match(worker, /self\.addEventListener\("push"/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(manifest, /manifest\.webmanifest/);
  assert.doesNotMatch(manifest, /apps\.apple\.com|play\.google\.com/);
});

test("PWA install metadata supports related-app detection and hides the install action when installed", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const installButton = fs.readFileSync(path.join(publicRoot, "react", "src", "components", "PwaInstallButton.jsx"), "utf8");
  assert.match(server, /related_applications:\s*\[\{\s*platform:\s*"webapp",\s*url:\s*"\/manifest\.webmanifest",\s*id:\s*"\/"\s*\}\]/);
  assert.match(installButton, /if \(!installStateReady \|\| installed\) return null/);
  assert.match(installButton, /if \(settings\) return <section className="panel pwa-settings-card"/);
  const profilePage = fs.readFileSync(path.join(publicRoot, "react", "src", "pages", "ProfilePage.jsx"), "utf8");
  assert.doesNotMatch(profilePage, /pwa-settings-card/);
  assert.match(profilePage, /<PwaInstallButton settings \/>/);
  const detector = fs.readFileSync(path.join(publicRoot, "react", "src", "pwaInstallDetection.mjs"), "utf8");
  assert.match(detector, /getInstalledRelatedApps/);
  assert.match(detector, /related_applications/);
});

test("browser notification permission is requested only from the explicit Enable action", () => {
  const settings = fs.readFileSync(path.join(publicRoot, "react", "src", "components", "PushNotificationSettings.jsx"), "utf8");
  const mountFlow = settings.slice(settings.indexOf("useEffect(() => {"), settings.indexOf("async function enable()"));
  assert.match(settings, /onClick=\{enable\}/);
  assert.match(settings, /await Notification\.requestPermission\(\)/);
  assert.doesNotMatch(mountFlow, /requestPermission/);
});
