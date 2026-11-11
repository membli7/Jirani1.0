import { useEffect, useMemo, useRef, useState } from "react";
import { simulatedPaymentFromForm, submitSimulatedPayment } from "../simulatedPaymentActions.mjs";
import { requestDashboardRefresh } from "../loanActions.mjs";

function useDashboardSnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    const update = event => setSnapshot(event.detail || null);
    window.addEventListener("chama:dashboard-state", update);
    return () => window.removeEventListener("chama:dashboard-state", update);
  }, []);
  return snapshot;
}

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

function money(value) {
  return `KES ${Number(value).toLocaleString("en-KE")}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function notify(message, error = false) {
  window.dispatchEvent(new CustomEvent("chama:notice-requested", { detail: { message, error } }));
}

export default function SimulatedPaymentInbox() {
  useLanguageRefresh();
  const snapshot = useDashboardSnapshot();
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owner = useRef({});
  const [busy, setBusy] = useState(false);
  const payments = Array.isArray(snapshot?.simulatedPayments) ? snapshot.simulatedPayments : [];

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setBusy(true);
    try {
      const payload = simulatedPaymentFromForm(new FormData(form));
      await submitSimulatedPayment(writer, owner.current, payload);
      form.reset();
      requestDashboardRefresh();
      notify("Simulated payment saved as Unverified; no balance was changed.");
    } catch (error) {
      if (error.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      notify(error.message || t("The simulated payment could not be saved."), true);
    } finally {
      setBusy(false);
    }
  }

  if (snapshot?.permissions?.simulatePayments !== true) return null;

  return (
    <>
      <h3 id="simulated-payment-title">{t("simulatedInboxTitle")}</h3>
      <p className="finance-section-copy">{t("simulatedInboxCopy", "Use fake TEST-* values only. This does not connect to M-Pesa or any payment provider. Saving a simulation never changes a balance.")}</p>
      <form id="simulated-payment-form" className="form-body" onSubmit={handleSubmit} aria-busy={busy}>
        <label className="field" htmlFor="simulated-transaction-id">
          {t("simulatedTransactionId")}
          <input id="simulated-transaction-id" name="transactionId" type="text" pattern="TEST-[A-Za-z0-9][A-Za-z0-9-]{2,60}" maxLength={65} placeholder="TEST-PAY-2026-001" required disabled={busy} />
        </label>
        <label className="field" htmlFor="simulated-phone-number">
          {t("fakePhoneIdentifier")}
          <input id="simulated-phone-number" name="phoneNumber" type="text" pattern="TEST-[A-Za-z0-9][A-Za-z0-9-]{2,60}" maxLength={65} placeholder="TEST-PHONE-001" required disabled={busy} />
        </label>
        <label className="field" htmlFor="simulated-amount">
          {t("simulatedAmount")}
          <input id="simulated-amount" name="amount" type="number" min="0.01" max="10000000" step="0.01" required disabled={busy} />
        </label>
        <label className="field" htmlFor="simulated-reference">
          {t("simulatedReference")}
          <input id="simulated-reference" name="reference" type="text" maxLength={80} placeholder="TEST-REF-001" required disabled={busy} />
        </label>
        <label className="field" htmlFor="simulated-timestamp">
          {t("simulatedTimestamp")}
          <input id="simulated-timestamp" name="timestamp" type="datetime-local" required disabled={busy} />
        </label>
        <button className="button-primary" type="submit" disabled={busy}>{t("createSimulation")}</button>
      </form>
      <div className="finance-table-wrap simulated-payment-table-wrap">
        <table className="finance-data-table simulated-payment-table">
          <thead>
            <tr>
              <th scope="col">{t("simulatedTransactionId")}</th>
              <th scope="col">{t("fakePhoneIdentifier")}</th>
              <th scope="col">{t("amountKes")}</th>
              <th scope="col">{t("simulatedReference")}</th>
              <th scope="col">{t("receivedAt")}</th>
              <th scope="col">{t("status")}</th>
              <th scope="col">{t("rawTestPayload")}</th>
            </tr>
          </thead>
          <tbody>
            {payments.length ? payments.map(payment => (
              <tr key={payment.id || payment.transactionId}>
                <td data-label={t("simulatedTransactionId")}>{payment.transactionId}</td>
                <td data-label={t("fakePhoneIdentifier")}>{payment.phoneNumber}</td>
                <td data-label={t("amountKes")}>{money(payment.amount)}</td>
                <td data-label={t("simulatedReference")}>{payment.reference}</td>
                <td data-label={t("receivedAt")}>{formatDate(payment.receivedAt)} {formatTime(payment.receivedAt)}</td>
                <td data-label={t("status")}><span className="status-pill pending">{window.jiraniI18n?.translateText?.(payment.status) || payment.status}</span></td>
                <td data-label={t("rawTestPayload")}>
                  <details>
                    <summary>{t("rawTestPayload")}</summary>
                    <pre className="simulated-payment-payload">{JSON.stringify(payment.rawPayload || {}, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7} className="empty-state">{t("noSimulatedPayments")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
