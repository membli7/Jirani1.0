import { useEffect, useState } from "react";

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

async function readJson(response) {
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status}).`);
  return body;
}

function decodeVapidKey(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

function supported() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export default function PushNotificationSettings() {
  const [config, setConfig] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [, setLanguageVersion] = useState(0);

  async function refresh() {
    const configResponse = await fetch("/api/push/config", { credentials: "same-origin", cache: "no-store" });
    const nextConfig = await readJson(configResponse);
    setConfig(nextConfig);
    if (supported()) {
      const registration = await navigator.serviceWorker.ready;
      const localSubscription = await registration.pushManager.getSubscription();
      setSubscription(localSubscription);
      if (localSubscription && nextConfig.enabled && Notification.permission === "granted") {
        await fetch("/api/push/subscription", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
          body: JSON.stringify(localSubscription.toJSON()),
        }).then(readJson);
      }
    }
  }

  useEffect(() => {
    let active = true;
    refresh().catch(() => {
      if (active) {
        setError(true);
        setStatus("Push notification status could not be checked.");
      }
    });
    const languageChange = () => { if (active) setLanguageVersion(version => version + 1); };
    window.addEventListener("languagechange", languageChange);
    return () => {
      active = false;
      window.removeEventListener("languagechange", languageChange);
    };
  }, []);

  async function enable() {
    if (!supported() || !config?.enabled || busy) return;
    setBusy(true);
    setError(false);
    setStatus("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied"
          ? "Notifications are blocked in this browser. Enable them in browser settings to use push."
          : "Browser notification permission was not granted.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let nextSubscription = await registration.pushManager.getSubscription();
      if (!nextSubscription) {
        nextSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(config.publicKey),
        });
      }
      await readJson(await fetch("/api/push/subscription", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
        body: JSON.stringify(nextSubscription.toJSON()),
      }));
      setSubscription(nextSubscription);
      setStatus("Browser push notifications are enabled for this account and Chama.");
    } catch (requestError) {
      setError(true);
      setStatus(requestError.message || "Push notifications could not be enabled.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription || busy) return;
    setBusy(true);
    setError(false);
    setStatus("");
    try {
      await readJson(await fetch("/api/push/subscription", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }));
      setSubscription(null);
      void subscription.unsubscribe().catch(() => {});
      setStatus("Browser push notifications are turned off.");
    } catch (requestError) {
      setError(true);
      setStatus(requestError.message || "Push notifications could not be turned off.");
    } finally {
      setBusy(false);
    }
  }

  const permission = supported() ? Notification.permission : "unsupported";
  const pushActive = Boolean(subscription) && permission === "granted" && config?.enabled === true;
  let help = "In-app pop-ups are on. Browser push can deliver messages, meeting reminders, contribution due dates, fines, late loan repayments, and loan decisions when enabled.";
  if (!supported()) help = "In-app pop-ups are on. This browser needs HTTPS (or localhost) and service-worker support for browser push.";
  else if (!config?.enabled && config !== null) help = "In-app pop-ups are on. Browser push delivery will be available when the site is configured with its VAPID keys.";
  else if (permission === "denied") help = "In-app pop-ups are on. Notifications are blocked in browser settings; allow them there before enabling push.";

  return <section className="panel pwa-settings-card" aria-labelledby="push-settings-title">
    <div className="panel-heading"><div>
      <h2 id="push-settings-title">{translate("Notifications")}</h2>
      <p>{translate(help)}</p>
    </div></div>
    <div className="pwa-settings-actions">
      {subscription && permission === "granted"
        ? <button className="mini-btn" type="button" onClick={disable} disabled={busy}>{translate(busy ? "Turning off…" : "Turn off browser push")}</button>
        : <button className="button-primary" type="button" onClick={enable} disabled={busy || !supported() || !config?.enabled || permission === "denied"}>
          {translate(busy ? "Enabling…" : "Enable browser notifications")}
      </button>}
      <span className="pwa-permission-status" role="status">
        {pushActive ? translate("Browser push is enabled")
          : permission === "denied" ? translate("Blocked by browser")
            : config === null ? translate("Checking push setup…")
              : !config?.enabled ? translate("Site push setup required") : translate("Not enabled")}
      </span>
    </div>
    <p className={`pwa-action-status${error ? " error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">{translate(status)}</p>
  </section>;
}
