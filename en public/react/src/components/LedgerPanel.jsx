import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { todayNairobiDate } from "../attendanceActions.mjs";
import {
  canCorrectContributionDate,
  contributionDateBounds,
  correctContributionDate,
} from "../ledgerActions.mjs";

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
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    window.addEventListener("languagechange", refresh);
    return () => window.removeEventListener("languagechange", refresh);
  }, [refresh]);
}

function translate(text) {
  return window.jiraniI18n?.translateText(text) || text;
}

function money(value) {
  const amount = Number(value);
  return `KES ${Number.isFinite(amount) ? amount.toLocaleString("en-KE") : "0"}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(date);
}

function dispatchDashboardRefresh() {
  if (typeof window.CustomEvent === "function") {
    window.dispatchEvent(new window.CustomEvent("chama:dashboard-refresh-requested"));
  }
}

export default function LedgerPanel() {
  useLanguageRefresh();
  const snapshot = useDashboardSnapshot();
  const [selected, setSelected] = useState(null);
  const [correctionDate, setCorrectionDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const dialogRef = useRef(null);
  const writeOwner = useRef({});
  const writeRequester = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const transactions = Array.isArray(snapshot?.transactions) ? snapshot.transactions : [];
  const user = snapshot?.user;
  const correctionBounds = selected ? contributionDateBounds(selected.date, todayNairobiDate()) : null;

  function openCorrection(transaction) {
    if (!canCorrectContributionDate(transaction, user)) return;
    setSelected(transaction);
    setCorrectionDate(transaction.date);
    setReason("");
    setFeedback({ message: "", error: false });
    dialogRef.current?.showModal();
  }

  async function handleCorrection(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || !selected) return;
    setSaving(true);
    setFeedback({ message: "", error: false });
    try {
      const result = await correctContributionDate(writeRequester, writeOwner.current, selected.id, {
        date: correctionDate,
        reason,
      });
      setFeedback({ message: result.message || "Contribution date corrected and recorded in the audit log.", error: false });
      dialogRef.current?.close();
      dispatchDashboardRefresh();
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setFeedback({ message: error.message || "The contribution date could not be corrected.", error: true });
    } finally {
      setSaving(false);
    }
  }

  return <>
      <div className="panel-heading">
      <div>
        <h2>{translate("Transactions")}</h2>
        <p>{translate(user?.role === "member" ? "Only your confirmed entries are shown." : "All confirmed group entries.")}</p>
      </div>
      <button id="export-csv" className="mini-btn" type="button" onClick={() => window.location.assign("/api/export.csv")}>{translate("Export transactions & attendance CSV")}</button>
    </div>
    {feedback.message && <p className={`notice${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
    <div className="table-wrap">
      <table>
        <thead><tr>
          <th scope="col">{translate("Date")}</th><th scope="col">{translate("Member")}</th><th scope="col">{translate("Amount")}</th>
          <th scope="col">{translate("Method")}</th><th scope="col">{translate("Type")}</th><th scope="col">{translate("Actions")}</th>
        </tr></thead>
        <tbody id="transactions">
          {!snapshot
            ? <tr><td colSpan="6" className="skeleton">{translate("Loading…")}</td></tr>
            : transactions.length ? transactions.map(item => {
              const date = item.date || item.at;
              return <tr key={item.id}>
                <td data-label={translate("Date")}>{formatDate(date)}</td>
                <td data-label={translate("Member")}>{item.memberName}<span className="schedule-sub">{item.payer || item.recordedByName || ""}</span></td>
                <td data-label={translate("Amount")}>{money(item.amount)}</td>
                <td data-label={translate("Method")}>{translate(item.method)}{(item.ref || item.referenceNumber) && <span className="schedule-sub">{item.ref || item.referenceNumber}</span>}</td>
                <td data-label={translate("Type")}>{translate(item.paymentType)}</td>
                <td data-label={translate("Actions")}>{canCorrectContributionDate(item, user) && <button className="mini-btn" type="button" onClick={() => openCorrection(item)}>{translate("Correct date")}</button>}</td>
              </tr>;
            }) : <tr><td colSpan="6" className="empty-state">{translate("No transactions available.")}</td></tr>}
        </tbody>
      </table>
    </div>
    <div id="transaction-pagination" className="transaction-pagination" role="navigation" aria-label="Transaction pages" hidden>
      <button id="transactions-previous" className="mini-btn" type="button" disabled>{translate("Previous")}</button>
      <span id="transactions-page-info" role="status" aria-live="polite"></span>
      <button id="transactions-next" className="mini-btn" type="button" disabled>{translate("Next")}</button>
    </div>
    <dialog id="contribution-date-dialog" ref={dialogRef} aria-labelledby="contribution-date-title" onClose={() => setSelected(null)}>
      <form id="contribution-date-form" className="form-body contribution-correction-form" onSubmit={handleCorrection}>
        <h2 id="contribution-date-title">{translate("Correct contribution date")}</h2>
        <p>{translate("Only Chairpersons and Treasurers can correct a recorded cash contribution. The change requires a reason, must stay in the same month and cannot change whether the contribution was on time or late.")}</p>
        {feedback.error && <p id="contribution-date-notice" className="notice error" role="alert" aria-live="polite">{feedback.message}</p>}
        <label className="field" htmlFor="contribution-correction-date">{translate("Corrected date")}<input
          id="contribution-correction-date"
          name="date"
          type="date"
          required
          min={correctionBounds?.min}
          max={correctionBounds?.max}
          value={correctionDate}
          disabled={saving}
          onChange={event => setCorrectionDate(event.target.value)}
        /></label>
        <label className="field" htmlFor="contribution-correction-reason">{translate("Reason for correction")}<textarea
          id="contribution-correction-reason"
          name="reason"
          maxLength="500"
          required
          value={reason}
          disabled={saving}
          onChange={event => setReason(event.target.value)}
        /></label>
        <div className="dialog-actions">
          <button className="mini-btn" type="button" disabled={saving} onClick={() => dialogRef.current?.close()}>{translate("Cancel")}</button>
          <button className="button-primary" type="submit" disabled={saving}>{translate(saving ? "Saving…" : "Save correction")}</button>
        </div>
      </form>
    </dialog>
  </>;
}
