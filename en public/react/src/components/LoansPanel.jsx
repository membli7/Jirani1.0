import { useEffect, useMemo, useRef, useState } from "react";
import {
  loanRequestFromForm,
  loanStatusPresentation,
  recordLoanDecision,
  requestDashboardRefresh,
  submitLoanRequest,
} from "../loanActions.mjs";

function useDashboardSnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    const update = event => setSnapshot(event.detail || null);
    window.addEventListener("chama:dashboard-state", update);
    return () => window.removeEventListener("chama:dashboard-state", update);
  }, []);
  return snapshot;
}

function translate(text) {
  return window.jiraniI18n?.translateText(text) || text;
}

function roleName(role) {
  return window.jiraniI18n?.roleName(role) || (role ? `${role[0].toUpperCase()}${role.slice(1)}` : "");
}

function money(value) {
  if (value === null || value === undefined) return "Private";
  const amount = Number(value);
  return `KES ${Number.isFinite(amount) ? amount.toLocaleString("en-KE") : "0"}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(date);
}

function notifySessionEnded(error) {
  if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
}

export function LoanRequestPanel() {
  const snapshot = useDashboardSnapshot();
  const [selectedGuarantors, setSelectedGuarantors] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const formRef = useRef(null);
  const ownerRef = useRef({});
  const writeRequester = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const guarantors = Array.isArray(snapshot?.guarantorMembers) ? snapshot.guarantorMembers : [];

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setSubmitting(true);
    setFeedback({ message: "", error: false });
    try {
      const payload = loanRequestFromForm(new FormData(form));
      const result = await submitLoanRequest(writeRequester, ownerRef.current, payload);
      form.reset();
      setSelectedGuarantors(["", ""]);
      setFeedback({ message: result.message || "Loan request submitted.", error: false });
      requestDashboardRefresh();
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ message: error.message || "The loan request could not be submitted.", error: true });
    } finally {
      setSubmitting(false);
    }
  }

  function selectGuarantor(index, value) {
    setSelectedGuarantors(current => current.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  return <>
    <div className="panel-heading">
      <div>
        <h2>Request a loan</h2>
        <p>For your own account</p>
      </div>
    </div>
    <form id="loan-form" className="form-body" ref={formRef} onSubmit={handleSubmit}>
      <label className="field" htmlFor="loan-amount">Amount (KES)<input id="loan-amount" name="amount" type="number" min="1" step="1" required disabled={submitting} /></label>
      <label className="field" htmlFor="loan-months">Repayment period<select id="loan-months" name="months" defaultValue="1" disabled={submitting}>
        <option value="1">1 month</option><option value="2">2 months</option><option value="3">3 months</option><option value="6">6 months</option>
      </select></label>
      {[0, 1].map(index => <label className="field" htmlFor={`loan-guarantor-${index + 1}`} key={index}>
        {index === 0 ? "First guarantor" : "Second guarantor"}
        <select
          id={`loan-guarantor-${index + 1}`}
          name="guarantorIds"
          required
          value={selectedGuarantors[index]}
          disabled={submitting || !snapshot || guarantors.length < 2}
          onChange={event => selectGuarantor(index, event.target.value)}
        >
          <option value="">Select a guarantor</option>
          {guarantors.map(member => <option key={member.id} value={member.id} disabled={selectedGuarantors[1 - index] === member.id}>{member.name}</option>)}
        </select>
      </label>)}
      {!snapshot
        ? <p className="form-note" role="status">Loading active guarantors…</p>
        : guarantors.length < 2
          ? <p className="form-note">At least two other active members are needed to choose guarantors.</p>
          : null}
      <button id="loan-submit" className="button-primary" type="submit" disabled={submitting || !snapshot || guarantors.length < 2}>{submitting ? "Submitting…" : "Submit request"}</button>
      {feedback.message && <p className={`form-note${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
    </form>
  </>;
}

export default function LoansPanel() {
  const snapshot = useDashboardSnapshot();
  const [reasons, setReasons] = useState({});
  const [busyLoanId, setBusyLoanId] = useState("");
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const writeRequester = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owners = useRef(new Map());
  const visibleLoans = useMemo(() => {
    const own = Array.isArray(snapshot?.loans) ? snapshot.loans : [];
    const queue = Array.isArray(snapshot?.approvalQueue) ? snapshot.approvalQueue : [];
    return [...new Map([...own, ...queue].map(loan => [loan.id, loan])).values()];
  }, [snapshot]);

  async function handleDecision(loan, decision) {
    const reason = String(reasons[loan.id] || "").trim();
    setFeedback({ message: "", error: false });
    setBusyLoanId(loan.id);
    try {
      let owner = owners.current.get(loan.id);
      if (!owner) {
        owner = {};
        owners.current.set(loan.id, owner);
      }
      const result = await recordLoanDecision(writeRequester, owner, loan.id, decision, reason);
      setReasons(current => ({ ...current, [loan.id]: "" }));
      setFeedback({ message: result.message || "Decision recorded.", error: false });
      requestDashboardRefresh();
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ message: error.message || "The loan decision could not be recorded.", error: true });
    } finally {
      setBusyLoanId("");
    }
  }

  return <>
    <div className="panel-heading">
      <div>
        <h2 id="loans-title">Loan requests</h2>
        <p>{translate(snapshot?.user?.role === "member"
          ? "Your requests and eligible independent approvals."
          : "Three roles review each request; the Secretary fills a Chairperson or Treasurer borrower’s approval seat.")}</p>
      </div>
      <span className="status-pill">Three-role review</span>
    </div>
    <div className="loan-panel-body">
      <p className="form-note">A loan needs three role decisions; borrowers cannot decide their own requests. If the borrower is Chairperson or Treasurer, the Secretary fills that approval seat. This app records the decision; it does not transfer loan funds.</p>
      {feedback.message && <p className={`form-note${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
      <div id="loans" className="loan-list" aria-live="polite">
        {!snapshot
          ? <div className="empty-state">Loading loan requests…</div>
          : visibleLoans.length ? visibleLoans.map(loan => {
            const presentation = loanStatusPresentation(loan.status);
            const steps = Array.isArray(loan.approvalSteps) ? loan.approvalSteps : [];
            const canDecide = snapshot.permissions?.decideLoans === true && loan.canDecide === true;
            return <article className="loan-card" key={loan.id}>
              <div className="loan-card-heading">
                <div><h3>{loan.memberName} · {money(loan.amount)}</h3><span className="schedule-sub">{loan.months} month{loan.months === 1 ? "" : "s"} · Requested {formatDate(loan.createdAt)}</span></div>
                <span className={`status-pill ${presentation.className}`}>{translate(presentation.label)}</span>
              </div>
              <p className="loan-progress">{translate(loan.progressMessage || presentation.label)}</p>
              <ol className="loan-approval-trail" aria-label={`Approval trail for ${loan.memberName}`}>
                {steps.map((step, index) => {
                  const completed = step.status === "approve" || step.status === "reject";
                  const icon = step.status === "approve" ? "✓" : step.status === "reject" ? "✕" : "Awaiting";
                  const statusLabel = step.status === "approve" ? "Approved" : step.status === "reject" ? "Rejected" : "Awaiting";
                  return <li className={`loan-step ${completed ? `is-${step.status}` : "is-awaiting"}`} key={`${loan.id}-${step.role}-${index}`}>
                    <strong>{roleName(step.role)} <span aria-label={statusLabel}>{icon}</span></strong>
                    {completed
                      ? <span className="loan-step-meta">{step.approverName} · {formatDate(step.at)} at {formatTime(step.at)}</span>
                      : <span className="loan-step-meta">Decision not yet recorded</span>}
                    {step.reason && <span className="loan-step-reason">Reason: {step.reason}</span>}
                  </li>;
                })}
              </ol>
              {canDecide && <div className="loan-decision">
                <label htmlFor={`loan-reason-${loan.id}`}>Decision reason</label>
                <textarea
                  id={`loan-reason-${loan.id}`}
                  aria-label="Reason for loan decision"
                  minLength="5"
                  maxLength="500"
                  placeholder="Reason (required)"
                  value={reasons[loan.id] || ""}
                  disabled={busyLoanId === loan.id}
                  onChange={event => setReasons(current => ({ ...current, [loan.id]: event.target.value }))}
                />
                <div className="loan-decision-actions">
                  <button className="mini-btn" type="button" data-loan={loan.id} data-decision="approve" disabled={busyLoanId === loan.id} onClick={() => handleDecision(loan, "approve")}>Approve</button>
                  <button className="mini-btn danger" type="button" data-loan={loan.id} data-decision="reject" disabled={busyLoanId === loan.id} onClick={() => handleDecision(loan, "reject")}>Reject</button>
                </div>
              </div>}
            </article>;
          }) : <div className="empty-state">No loans available.</div>}
      </div>
    </div>
  </>;
}
