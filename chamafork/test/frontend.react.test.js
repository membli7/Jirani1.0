"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const appRoot = path.join(__dirname, "..");
const buildRoot = path.join(appRoot, "frontend-dist");
const sourceRoot = path.join(appRoot, "..", "en public", "react");
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

test("React mounts the existing pages and loads only the allowlisted same-origin controllers", () => {
  const main = readSource("src/main.jsx");
  const app = readSource("src/App.jsx");
  const templates = readSource("src/pageTemplates.js");
  assert.match(main, /createRoot\(mountNode\)/);
  assert.match(main, /flushSync\(/);
  assert.match(main, /\.\.\/\.\.\/i18n\.js/);
  assert.match(main, /\.\.\/\.\.\/write-requests\.js/);
  assert.match(templates, /\.\.\/\.\.\/index\.html\?raw/);
  assert.match(templates, /\.\.\/\.\.\/member-login\.html\?raw/);
  assert.match(templates, /\.\.\/\.\.\/register\.html\?raw/);
  assert.match(templates, /\.\.\/\.\.\/profile\.html\?raw/);
  for (const controller of ["chama.js", "contact.js", "auth-pages.js", "register.js", "profile.js"]) {
    assert.ok(app.includes(`"${controller}"`), `missing compatibility controller ${controller}`);
  }
  assert.match(app, /url\.origin === window\.location\.origin/);
  assert.match(app, /parsed\.body\.querySelectorAll\("script"\)/);
  assert.match(app, /dangerouslySetInnerHTML=\{\{ __html: page\.markup \}\}/);
  assert.match(app, /pageTemplates\[pageKey\]/);
});
