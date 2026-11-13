import assert from "node:assert/strict";
import { test } from "node:test";
import { hasInstalledRelatedApp } from "../../en public/react/src/pwaInstallDetection.mjs";

const manifestUrl = "https://chama.example/manifest.webmanifest";
const pageUrl = "https://chama.example/profile.html";
const baseManifest = {
  id: "/",
  start_url: "/",
  scope: "/",
  related_applications: [{ platform: "webapp", url: "/manifest.webmanifest", id: "/" }],
};

function makeContext({ manifest = baseManifest, installedApps = [], apiAvailable = true, page = pageUrl, secure = true } = {}) {
  let apiCalls = 0;
  const navigatorObject = apiAvailable
    ? { async getInstalledRelatedApps() { apiCalls += 1; return installedApps; } }
    : {};
  const documentObject = {
    querySelector(selector) {
      assert.equal(selector, 'link[rel~="manifest"]');
      return { href: manifestUrl };
    },
  };
  const fetchImpl = async url => {
    assert.equal(url, manifestUrl);
    return { ok: true, async json() { return manifest; } };
  };
  return {
    args: { navigatorObject, documentObject, locationObject: { href: page }, fetchImpl, isSecureContext: secure },
    apiCalls: () => apiCalls,
  };
}

test("does not call the installed-app API when the browser does not support it", async () => {
  const context = makeContext({ apiAvailable: false, installedApps: [{ platform: "webapp", id: "https://chama.example/" }] });
  assert.equal(await hasInstalledRelatedApp(context.args), false);
  assert.equal(context.apiCalls(), 0);
});

test("does not call the API without a valid relationship in the linked manifest", async () => {
  const context = makeContext({ manifest: { ...baseManifest, related_applications: [] } });
  assert.equal(await hasInstalledRelatedApp(context.args), false);
  assert.equal(context.apiCalls(), 0);
});

test("recognizes a browser-verified same-scope PWA using the manifest's relative app ID", async () => {
  const context = makeContext({ installedApps: [{ platform: "webapp", id: "https://chama.example/" }] });
  assert.equal(await hasInstalledRelatedApp(context.args), true);
  assert.equal(context.apiCalls(), 1);
});

test("recognizes a Play app only when a real package ID is declared and matches", async () => {
  const packageId = "test.package";
  const manifest = {
    ...baseManifest,
    related_applications: [
      ...baseManifest.related_applications,
      { platform: "play", id: packageId },
    ],
  };
  const context = makeContext({ manifest, installedApps: [{ platform: "play", id: packageId }] });
  assert.equal(await hasInstalledRelatedApp(context.args), true);
});

test("does not treat an unrelated Play package as the declared Android app", async () => {
  const manifest = {
    ...baseManifest,
    related_applications: [...baseManifest.related_applications, { platform: "play", id: "test.package" }],
  };
  const context = makeContext({ manifest, installedApps: [{ platform: "play", id: "other.package" }] });
  assert.equal(await hasInstalledRelatedApp(context.args), false);
});

test("does not query installed apps outside the manifest scope or in insecure contexts", async () => {
  const outOfScope = makeContext({ page: "https://chama.example.evil/profile.html" });
  assert.equal(await hasInstalledRelatedApp(outOfScope.args), false);
  assert.equal(outOfScope.apiCalls(), 0);

  const insecure = makeContext({ secure: false });
  assert.equal(await hasInstalledRelatedApp(insecure.args), false);
  assert.equal(insecure.apiCalls(), 0);
});
