import { useEffect, useMemo, useRef, useState } from "react";
import { changePin } from "../pinChangeActions.mjs";
import { requestDashboardRefresh } from "../loanActions.mjs";

function useLanguageRefresh() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    window.addEventListener("languagechange", update);
    return () => window.removeEventListener("languagechange", update);
  }, []);
}

function t(key, fallback = key) {
  const i18n = window.jiraniI18n;
  const translated = i18n?.t?.(key);
  return translated && translated !== key ? translated : i18n?.translateText?.(fallback) || fallback;
}

export default function PinChangeOverlay() {
  useLanguageRefresh();
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owner = useRef({});
  const overlayRef = useRef(null);
  const currentPinRef = useRef(null);
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });

  useEffect(() => {
    const updateFromDashboard = event => {
      if (typeof event.detail?.user?.mustChangePin === "boolean") {
        setRequired(event.detail.user.mustChangePin);
      }
    };
    const requireChange = () => setRequired(true);
    const endSession = () => setRequired(false);
    window.addEventListener("chama:dashboard-state", updateFromDashboard);
    window.addEventListener("chama:pin-change-required", requireChange);
    window.addEventListener("chama:session-ended", endSession);
    return () => {
      window.removeEventListener("chama:dashboard-state", updateFromDashboard);
      window.removeEventListener("chama:pin-change-required", requireChange);
      window.removeEventListener("chama:session-ended", endSession);
    };
  }, []);

  useEffect(() => {
    if (required) currentPinRef.current?.focus();
  }, [required]);

  function containFocus(event) {
    if (event.key !== "Tab") return;
    const controls = Array.from(overlayRef.current?.querySelectorAll('input:not([disabled]), button:not([disabled])') || []);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setFeedback({ message: "", error: false });
    try {
      await changePin(writer, owner.current, values);
      form.reset();
      setRequired(false);
      window.dispatchEvent(new CustomEvent("chama:notice-requested", {
        detail: { message: "PIN changed successfully." },
      }));
      requestDashboardRefresh();
    } catch (error) {
      if (error.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      if (error.status === 403 && error.data?.mustChangePin) setRequired(true);
      setFeedback({
        message: window.jiraniI18n?.translateText?.(error.message) || error.message || t("The PIN could not be changed. Please try again."),
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!required) return null;

  return (
    <section
      ref={overlayRef}
      className="login-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-change-title"
      aria-describedby="pin-change-copy"
      onKeyDown={containFocus}
    >
      <form className="login-card" onSubmit={handleSubmit} aria-busy={busy}>
        <h2 id="pin-change-title">{t("Change your PIN")}</h2>
        <p id="pin-change-copy">{t("Choose a private 6–12 digit PIN before using the dashboard.")}</p>
        <label className="field" htmlFor="current-pin">
          {t("Current PIN")}
          <input
            ref={currentPinRef}
            id="current-pin"
            name="currentPin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
            disabled={busy}
          />
        </label>
        <label className="field" htmlFor="new-pin">
          {t("New PIN")}
          <input
            id="new-pin"
            name="newPin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            minLength={6}
            maxLength={12}
            pattern="[0-9]{6,12}"
            required
            disabled={busy}
          />
        </label>
        {feedback.message && (
          <p className={`form-notice${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"}>
            {feedback.message}
          </p>
        )}
        <button className="button-primary" type="submit" disabled={busy}>{t("Save PIN")}</button>
      </form>
    </section>
  );
}
