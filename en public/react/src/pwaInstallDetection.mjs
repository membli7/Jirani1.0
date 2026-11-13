const RELATED_PLATFORMS = new Set(["webapp", "play"]);

function toUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try { return new URL(value, base); } catch { return null; }
}

function resolveWebAppId(value, startUrl) {
  const resolved = toUrl(value, startUrl);
  if (!resolved) return null;
  resolved.hash = "";
  return resolved.href;
}

function isWithinScope(pageUrl, scopeUrl) {
  if (pageUrl.origin !== scopeUrl.origin) return false;
  const scopePath = scopeUrl.pathname;
  return pageUrl.pathname === scopePath || pageUrl.pathname.startsWith(scopePath.endsWith("/") ? scopePath : `${scopePath}/`);
}

function declaredRelatedApps(manifest, manifestUrl, startUrl, appId) {
  if (!Array.isArray(manifest.related_applications)) return [];
  const declared = [];

  for (const app of manifest.related_applications) {
    if (!app || !RELATED_PLATFORMS.has(app.platform)) continue;

    if (app.platform === "webapp") {
      const relatedId = typeof app.id === "string" ? app.id.trim() : "";
      const relatedUrl = toUrl(app.url, manifestUrl);
      const isSelf = (relatedId && resolveWebAppId(relatedId, startUrl) === appId)
        || (relatedUrl && relatedUrl.href === manifestUrl.href);
      if (isSelf) declared.push({ platform: "webapp", id: relatedId });
      continue;
    }

    // Android package detection needs the actual Play package ID and a matching
    // Digital Asset Links relationship; a URL-only placeholder is not enough.
    const packageId = typeof app.id === "string" ? app.id.trim() : "";
    if (packageId) declared.push({ platform: "play", id: packageId });
  }

  return declared;
}

/**
 * Ask the browser only when a valid relationship is present in this page's
 * same-origin manifest and the page is within that manifest's scope.
 */
export async function hasInstalledRelatedApp({
  navigatorObject,
  documentObject,
  locationObject,
  fetchImpl,
  isSecureContext,
} = {}) {
  if (!isSecureContext || typeof navigatorObject?.getInstalledRelatedApps !== "function"
    || typeof documentObject?.querySelector !== "function"
    || typeof locationObject?.href !== "string" || typeof fetchImpl !== "function") return false;

  try {
    const pageUrl = toUrl(locationObject.href);
    const manifestLink = documentObject.querySelector('link[rel~="manifest"]');
    const manifestHref = manifestLink?.href || manifestLink?.getAttribute?.("href");
    const manifestUrl = toUrl(manifestHref, pageUrl);
    if (!pageUrl || !manifestUrl || manifestUrl.origin !== pageUrl.origin) return false;

    const response = await fetchImpl(manifestUrl.href, { credentials: "same-origin", cache: "no-store" });
    if (!response?.ok || typeof response.json !== "function") return false;
    const manifest = await response.json();
    if (!manifest || typeof manifest !== "object") return false;

    const startUrl = toUrl(manifest.start_url || "/", manifestUrl);
    if (!startUrl || startUrl.origin !== pageUrl.origin) return false;
    const scopeUrl = toUrl(manifest.scope || ".", startUrl);
    if (!scopeUrl || !isWithinScope(pageUrl, scopeUrl)) return false;

    const appIdValue = typeof manifest.id === "string" && manifest.id.trim()
      ? manifest.id
      : `${startUrl.pathname}${startUrl.search}`;
    const appId = resolveWebAppId(appIdValue, startUrl);
    if (!appId) return false;

    const relationships = declaredRelatedApps(manifest, manifestUrl, startUrl, appId);
    if (!relationships.length) return false;

    const installedApps = await navigatorObject.getInstalledRelatedApps();
    if (!Array.isArray(installedApps)) return false;

    return installedApps.some(installed => relationships.some(relationship => {
      if (installed?.platform !== relationship.platform) return false;
      const installedId = typeof installed.id === "string" ? installed.id.trim() : "";
      if (!relationship.id || !installedId) return true;
      if (relationship.platform === "webapp") {
        return installedId === relationship.id || resolveWebAppId(installedId, startUrl) === appId;
      }
      return installedId === relationship.id;
    }));
  } catch {
    // Unsupported contexts, unavailable manifest responses, or API failures
    // must not be treated as proof that an app is installed.
    return false;
  }
}
