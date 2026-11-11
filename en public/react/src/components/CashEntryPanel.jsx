import { useEffect, useMemo, useRef, useState } from "react";
import { buildCashEntryRequest, recordCashEntry } from "../cashEntryActions.mjs";
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
  return `KES ${Number(value || 0).toLocaleString("en-KE")}`;
}

export default function CashEntryPanel() {
  useLanguageRefresh();
  const snapshot = useDashboardSnapshot();
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owner = useRef({});
  const formRef = useRef(null);
  const dialogRef = useRef(null);
  const [memberId, setMemberId] = useState("");
  const [loanId, setLoanId] = useState("");
  const [paymentType, setPaymentType] = useState("Monthly Contribution");
  const [confirmation, setConfirmation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const members = Array.isArray(snapshot?.members) ? snapshot.members.filter(member => member.status === "active") : [];
  const selectedMemberId = members.some(member => member.id === memberId) ? memberId : members[0]?.id || "";
  const selectedMember = members.find(member => member.id === selectedMemberId);
  const loans = (Array.isArray(snapshot?.loans) ? snapshot.loans : [])
    .filter(loan => loan.status === "approved" && loan.memberId === selectedMemberId);
  const availableLoanId = loans.some(loan => loan.id === loanId) ? loanId : "";

  useEffect(() => {
    if (memberId !== selectedMemberId) setMemberId(selectedMemberId);
  }, [memberId, selectedMemberId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmation && dialog && !dialog.open) dialog.showModal();
  }, [confirmation]);

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    try {
      const request = buildCashEntryRequest(writer, new FormData(form));
      const body = request.body;
      const memberName = selectedMember?.name || "Selected member";
      setFeedback({ message: "", error: false });
      setConfirmation({
        request,
        summary: `${memberName} · ${money(body.amount)} · ${body.paymentType}. Note: ${body.note}`,
      });
    } catch (error) {
      setFeedback({ message: error.message || "The cash entry is invalid.", error: true });
    }
  }

  function cancelConfirmation() {
    dialogRef.current?.close();
    setConfirmation(null);
  }

  async function confirmCashEntry() {
    const pending = confirmation;
    if (!pending) return;
    dialogRef.current?.close();
    setConfirmation(null);
    setSubmitting(true);
    setFeedback({ message: "", error: false });
    try {
      await recordCashEntry(writer, owner.current, pending.request);
      formRef.current?.reset();
      setPaymentType("Monthly Contribution");
      setMemberId(members[0]?.id || "");
      setLoanId("");
      setFeedback({ message: t("cashPaymentRecorded", "Cash payment recorded."), error: false });
      requestDashboardRefresh();
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setFeedback({
        message: error?.uncertain
          ? window.chamaWriteRequests.unconfirmedMessage("Transactions")
          : error?.message || "The cash payment could not be confirmed.",
        error: true,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!snapshot || snapshot.permissions?.recordPayments !== true) return null;

  return <>
    <form id="payment-form" className="form-body" ref={formRef} onSubmit={handleSubmit}>
      <label className="field" id="payment-member-field" htmlFor="payment-member">{t("memberLabel", "Member")}
        <select name="memberId" id="payment-member" value={selectedMemberId} required disabled={submitting || !members.length} onChange={event => { setMemberId(event.target.value); setLoanId(""); }}>
          {members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
        </select>
      </label>
      <label className="field" htmlFor="cash-amount">{t("amountKes", "Amount (KES)")}
        <input id="cash-amount" name="amount" type="number" min="1" step="1" required disabled={submitting} />
      </label>
      <label className="field" htmlFor="cash-reference">{t("receiptReference", "Receipt reference")}
        <input id="cash-reference" name="referenceNumber" maxLength="80" disabled={submitting} />
      </label>
      <label className="field" htmlFor="cash-date">{t("date", "Date")}
        <input id="cash-date" name="date" type="date" required disabled={submitting} />
        <small>{t("cashDateLimit", "Dates can be backdated up to 30 days.")}</small>
      </label>
      <label className="field" id="payment-type-field" htmlFor="payment-type">{t("type", "Type")}
        <select name="paymentType" id="payment-type" value={paymentType} required disabled={submitting} onChange={event => setPaymentType(event.target.value)}>
          <option value="Monthly Contribution">{t("monthlyContribution", "Monthly Contribution")}</option>
          <option value="Loan Repayment">{t("repayment", "Loan Repayment")}</option>
          <option value="Fine">{t("fine", "Fine")}</option>
        </select>
      </label>
      <label className="field" id="repayment-field" htmlFor="payment-loan" hidden={paymentType !== "Loan Repayment"}>
        {t("loan", "Loan")}
        <select name="loanId" id="payment-loan" value={availableLoanId} required={paymentType === "Loan Repayment"} disabled={submitting} onChange={event => setLoanId(event.target.value)}>
          <option value="">{t("selectLoan", "Select a loan")}</option>
          {loans.map(loan => <option value={loan.id} key={loan.id}>{loan.memberName} — {money(loan.outstanding)}</option>)}
        </select>
      </label>
      <input type="hidden" name="method" value="Cash" />
      <label className="field" htmlFor="cash-note">{t("note", "Note")}
        <textarea name="note" id="cash-note" minLength={3} maxLength={500} required disabled={submitting} placeholder={t("cashNotePlaceholder", "e.g. Cash received at the weekly meeting")} />
      </label>
      <button className="button-primary" type="submit" disabled={submitting || !members.length}>{t(submitting ? "saving" : "recordCash", submitting ? "Saving…" : "Record cash")}</button>
    </form>
    {feedback.message && <p className={`notice${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
    <dialog id="cash-confirm-dialog" aria-labelledby="cash-confirm-title" ref={dialogRef} onCancel={cancelConfirmation} onClose={() => setConfirmation(null)}>
      <div id="cash-confirm-form">
        <h2 id="cash-confirm-title">{t("confirmCashEntry", "Confirm cash entry")}</h2>
        <p>{t("cashReceivedOnly", "This records cash already received; it does not transfer money.")}</p>
        <p id="cash-confirm-summary">{confirmation?.summary || ""}</p>
        <div className="dialog-actions">
          <button className="mini-btn" type="button" onClick={cancelConfirmation}>{t("cancel", "Cancel")}</button>
          <button className="button-primary" type="button" onClick={confirmCashEntry}>{t("confirmCashEntry", "Confirm cash entry")}</button>
        </div>
      </div>
    </dialog>
  </>;
}
