import { useEffect, useRef, useState } from "react";

const TOAST_CATEGORIES = new Set(["message", "contribution_due", "loan_due", "loan_overdue", "meeting", "fine", "loan_decision"]);

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

export default function PwaRuntime() {
  const [toast, setToast] = useState(null);
  const seenIds = useRef(new Set());
  const userId = useRef(null);
  const initialized = useRef(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
    }
    let timer;
    let active = true;
    let profileEventSource = null;
    const onDashboardState = event => {
      const state = event.detail || {};
      const nextUserId = state.user?.id || null;
      if (!nextUserId) return;
      if (nextUserId !== userId.current) {
        userId.current = nextUserId;
        seenIds.current.clear();
        initialized.current = false;
        setToast(null);
      }
      const notifications = Array.isArray(state.notifications) ? state.notifications : [];
      if (!initialized.current) {
        notifications.forEach(item => item?.id && seenIds.current.add(item.id));
        initialized.current = true;
        return;
      }
      const fresh = notifications.filter(item => item?.id && !seenIds.current.has(item.id));
      fresh.forEach(item => seenIds.current.add(item.id));
      const visible = fresh.filter(item => TOAST_CATEGORIES.has(item.category));
      const newest = visible.at(-1);
      if (!newest) return;
      setToast({ id: newest.id, title: newest.title || translate("Chama update"), text: newest.text || "" });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 7000);
    };
    const onSessionEnded = () => {
      userId.current = null;
      initialized.current = false;
      seenIds.current.clear();
      setToast(null);
      profileEventSource?.close();
      profileEventSource = null;
    };
    const onLanguageChange = () => setToast(current => current ? { ...current } : null);
    const fetchProfileDashboard = async () => {
      try {
        const response = await fetch("/api/dashboard", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) return false;
        const dashboard = await response.json();
        if (active) window.dispatchEvent(new CustomEvent("chama:dashboard-state", { detail: dashboard }));
        return true;
      } catch { return false; }
    };
    window.addEventListener("chama:dashboard-state", onDashboardState);
    window.addEventListener("chama:session-ended", onSessionEnded);
    window.addEventListener("languagechange", onLanguageChange);
    if (window.location.pathname === "/profile.html" && typeof window.EventSource === "function") {
      void fetchProfileDashboard().then(authenticated => {
        if (!active || !authenticated) return;
        profileEventSource = new EventSource("/api/events/stream");
        profileEventSource.addEventListener("notifications-updated", () => { void fetchProfileDashboard(); });
      });
    }
    return () => {
      active = false;
      window.removeEventListener("chama:dashboard-state", onDashboardState);
      window.removeEventListener("chama:session-ended", onSessionEnded);
      window.removeEventListener("languagechange", onLanguageChange);
      profileEventSource?.close();
      window.clearTimeout(timer);
    };
  }, []);

  return toast ? <div className="pwa-toast" role="status" aria-live="polite" aria-atomic="true">
    <div className="pwa-toast-copy"><strong>{translate(toast.title)}</strong><p>{translate(toast.text)}</p></div>
    <button type="button" className="pwa-toast-close" aria-label={translate("Dismiss notification")} onClick={() => setToast(null)}>×</button>
  </div> : null;
}
