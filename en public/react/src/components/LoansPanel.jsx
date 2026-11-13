import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelLegacyLoanRequest,
  loanRequestFromForm,
  loanStatusPresentation,
  requestDashboardRefresh,
  requestLoanEstimate,
  requestLoanHumanReview,
  respondToLoanHumanReview,
  saveLoanPolicy,
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

function LoanPolicySummary({ policy }) {
  if (!policy) {
    return <p className="form-note" role="status">No loan rules are configured for this Chama. The Chairperson must set the criteria before new loan applications can be assessed. No default thresholds are assumed.</p>;
  }
  return <section className="loan-policy-summary" aria-label="Current Chama loan eligibility rules">
    <h3>Current Chama loan rules</h3>
    <p>Each loan principal is capped at the lower of {policy.maxGroupCashPercent}% of the app's recorded group balance and {policy.maxMemberContributionPercent}% of the borrower's recorded share-capital contributions, less existing principal exposure. The app's balance is not a bank or M-Pesa confirmation.</p>
    <p>For the amount requested, the first tier whose maximum covers it applies:</p>
    <ol className="loan-policy-tier-summary">
      {policy.tiers.map((tier, index) => <li key={`${policy.version || "policy"}-${index}`}>
        Up to {money(tier.maxAmountKsh)}: at least {tier.minActiveDays} active membership days and {money(tier.minShareContributionKsh)} in recorded share-capital contributions.
      </li>)}
    </ol>
    <p className="form-note">An automatic decision is recorded immediately. Members may ask for a human review. The app records decisions and repayment schedules but does not transfer or disburse loan funds.</p>
  </section>;
}

function LoanCostPreview({ terms, estimate, loading, error }) {
  const rate = Number(terms?.monthlyRatePercent);
  return <section className="loan-cost-preview" aria-live="polite" aria-label="Loan repayment cost estimate">
    <h3>Repayment cost preview</h3>
    <p>Chama rate: <strong>{Number.isFinite(rate) ? `${rate}% per month` : "not available"}</strong> on a reducing balance.</p>
    {estimate && <>
      <p><strong>Principal:</strong> {money(estimate.amount)} · <strong>Estimated interest:</strong> {money(estimate.totalInterest)} · <strong>Estimated total payable:</strong> {money(estimate.totalPayable)}</p>
      <ol className="loan-estimate-schedule">
        {estimate.schedule.map(row => <li key={row.no}><strong>Installment {row.no} · due {formatDate(row.dueDate)}:</strong> principal {money(row.principal)} + interest {money(row.interest)} = {money(row.installment)}</li>)}
      </ol>
    </>}
    {loading && <p className="form-note" role="status">Calculating the current Chama estimate…</p>}
    {!estimate && !loading && !error && <p className="form-note">Enter an amount to see the exact repayment estimate before submitting.</p>}
    {error && <p className="form-note error" role="alert">{error}</p>}
    <p className="form-note">The estimate uses the Chama’s saved monthly rate and the app’s reducing-balance formula. It is not a disbursement record and excludes any cost or fee arranged outside the app; confirm the final written terms before funds are advanced.</p>
  </section>;
}

function LoanPolicyEditor({ policy, onSaved }) {
  const [groupPercent, setGroupPercent] = useState(policy?.maxGroupCashPercent ?? "");
  const [memberPercent, setMemberPercent] = useState(policy?.maxMemberContributionPercent ?? "");
  const [tiers, setTiers] = useState(() => policy?.tiers?.map(tier => ({
    maxAmountKsh: String(tier.maxAmountKsh),
    minActiveDays: String(tier.minActiveDays),
    minShareContributionKsh: String(tier.minShareContributionKsh),
  })) || [{ maxAmountKsh: "", minActiveDays: "", minShareContributionKsh: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const writeRequester = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owner = useRef({});

  function updateTier(index, field, value) {
    setTiers(current => current.map((tier, tierIndex) => tierIndex === index ? { ...tier, [field]: value } : tier));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setSubmitting(true);
    setFeedback({ message: "", error: false });
    try {
      const policyPayload = {
        maxGroupCashPercent: Number(groupPercent),
        maxMemberContributionPercent: Number(memberPercent),
        tiers: tiers.map(tier => ({
          maxAmountKsh: Number(tier.maxAmountKsh),
          minActiveDays: Number(tier.minActiveDays),
          minShareContributionKsh: Number(tier.minShareContributionKsh),
        })),
      };
      const result = await saveLoanPolicy(writeRequester, owner.current, policyPayload);
      setFeedback({ message: result.message || "Chama loan rules saved.", error: false });
      onSaved?.();
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ message: error.message || "The loan rules could not be saved.", error: true });
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="loan-policy-editor" onSubmit={handleSubmit}>
    <h3>Configure loan eligibility rules</h3>
    <p>Only the Chairperson can change these rules. Choose values that match the Chama's adopted rules. No numeric defaults are pre-filled; saving changes applies to future applications.</p>
    <div className="loan-policy-percentages">
      <label className="field" htmlFor="loan-policy-group-percent">Maximum share of recorded group balance (%)
        <input id="loan-policy-group-percent" type="number" min="0" max="100" step="1" required value={groupPercent} disabled={submitting} onChange={event => setGroupPercent(event.target.value)} />
      </label>
      <label className="field" htmlFor="loan-policy-member-percent">Maximum loan as a share of member contributions (%)
        <input id="loan-policy-member-percent" type="number" min="0" max="1000" step="1" required value={memberPercent} disabled={submitting} onChange={event => setMemberPercent(event.target.value)} />
      </label>
    </div>
    <fieldset className="loan-policy-tier-list">
      <legend>Amount-based eligibility tiers</legend>
      <p className="form-note">Enter maximum loan amounts in strictly increasing order. Higher amounts can require a longer active period and more recorded share-capital contributions.</p>
      {tiers.map((tier, index) => <fieldset className="loan-policy-tier" key={index}>
        <legend>Tier {index + 1}</legend>
        <label className="field" htmlFor={`loan-policy-tier-${index}-max`}>Maximum loan amount (KES)
          <input id={`loan-policy-tier-${index}-max`} type="number" min="1" max="1000000000" step="1" required value={tier.maxAmountKsh} disabled={submitting} onChange={event => updateTier(index, "maxAmountKsh", event.target.value)} />
        </label>
        <label className="field" htmlFor={`loan-policy-tier-${index}-days`}>Minimum active membership (days)
          <input id={`loan-policy-tier-${index}-days`} type="number" min="0" max="36500" step="1" required value={tier.minActiveDays} disabled={submitting} onChange={event => updateTier(index, "minActiveDays", event.target.value)} />
        </label>
        <label className="field" htmlFor={`loan-policy-tier-${index}-contribution`}>Minimum recorded share-capital contributions (KES)
          <input id={`loan-policy-tier-${index}-contribution`} type="number" min="0" max="1000000000" step="1" required value={tier.minShareContributionKsh} disabled={submitting} onChange={event => updateTier(index, "minShareContributionKsh", event.target.value)} />
        </label>
        {tiers.length > 1 && <button className="mini-btn danger" type="button" disabled={submitting} onClick={() => setTiers(current => current.filter((_, tierIndex) => tierIndex !== index))}>Remove tier {index + 1}</button>}
      </fieldset>)}
      <button className="mini-btn" type="button" disabled={submitting || tiers.length >= 8} onClick={() => setTiers(current => [...current, { maxAmountKsh: "", minActiveDays: "", minShareContributionKsh: "" }])}>Add amount tier</button>
    </fieldset>
    <button className="button-primary" type="submit" disabled={submitting}>{submitting ? "Saving…" : policy ? "Save Chama loan rules" : "Set Chama loan rules"}</button>
    {feedback.message && <p className={`form-note${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
  </form>;
}

export function LoanRequestPanel() {
  const snapshot = useDashboardSnapshot();
  const [selectedGuarantors, setSelectedGuarantors] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const [estimate, setEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const formRef = useRef(null);
  const ownerRef = useRef({});
  const estimateTimerRef = useRef(null);
  const estimateSequenceRef = useRef(0);
  const writeRequester = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const guarantors = Array.isArray(snapshot?.guarantorMembers) ? snapshot.guarantorMembers : [];
  const policy = snapshot?.loanPolicy || null;
  useEffect(() => () => {
    if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current);
    estimateSequenceRef.current += 1;
  }, []);

  function scheduleEstimate() {
    const form = formRef.current;
    if (!form) return;
    const amount = Number(form.elements.namedItem("amount")?.value);
    const months = Number(form.elements.namedItem("months")?.value);
    const sequence = ++estimateSequenceRef.current;
    if (estimateTimerRef.current) clearTimeout(estimateTimerRef.current);
    setEstimate(null);
    setEstimateError("");
    setEstimateLoading(false);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000 || ![1, 2, 3, 6].includes(months)) return;
    estimateTimerRef.current = setTimeout(async () => {
      if (sequence !== estimateSequenceRef.current) return;
      setEstimateLoading(true);
      try {
        const result = await requestLoanEstimate(amount, months);
        if (sequence === estimateSequenceRef.current) setEstimate(result);
      } catch (error) {
        notifySessionEnded(error);
        if (sequence === estimateSequenceRef.current) setEstimateError(error.message || "The repayment estimate could not be loaded.");
      } finally {
        if (sequence === estimateSequenceRef.current) setEstimateLoading(false);
      }
    }, 300);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || !policy) return;
    let payload;
    try {
      payload = loanRequestFromForm(new FormData(form));
    } catch (error) {
      setFeedback({ message: error.message || "Check the loan request fields.", error: true });
      return;
    }
    if (!estimate || estimate.amount !== payload.amount || estimate.months !== payload.months) {
      setFeedback({ message: "Wait for the current repayment estimate before submitting this application.", error: true });
      return;
    }
    setSubmitting(true);
    setFeedback({ message: "", error: false });
    try {
      const result = await submitLoanRequest(writeRequester, ownerRef.current, payload);
      form.reset();
      setSelectedGuarantors(["", ""]);
      setEstimate(null);
      setEstimateError("");
      setFeedback({ message: result.message || "Loan application decided.", error: false });
      requestDashboardRefresh();
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ message: error.message || "The loan application could not be submitted.", error: true });
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
        <p>An immediate decision under your Chama's configured rules</p>
      </div>
    </div>
    <div className="loan-panel-body">
      <LoanPolicySummary policy={policy} />
      <p className="form-note">Eligible applications are recorded as approved without a Chairperson or Treasurer vote. You can ask for a human review of an automated decision. Approval in this app does not transfer funds or confirm an off-app disbursement.</p>
      <form id="loan-form" className="form-body" ref={formRef} onSubmit={handleSubmit}>
        <label className="field" htmlFor="loan-amount">Amount (KES)<input id="loan-amount" name="amount" type="number" min="1" max="1000000000" step="1" required disabled={submitting || !policy} onChange={scheduleEstimate} /></label>
        <label className="field" htmlFor="loan-months">Repayment period<select id="loan-months" name="months" defaultValue="1" disabled={submitting || !policy} onChange={scheduleEstimate}>
          <option value="1">1 month</option><option value="2">2 months</option><option value="3">3 months</option><option value="6">6 months</option>
        </select></label>
        <LoanCostPreview terms={snapshot?.loanTerms} estimate={estimate} loading={estimateLoading} error={estimateError} />
        {[0, 1].map(index => <label className="field" htmlFor={`loan-guarantor-${index + 1}`} key={index}>
          {index === 0 ? "First guarantor" : "Second guarantor"}
          <select
            id={`loan-guarantor-${index + 1}`}
            name="guarantorIds"
            required
            value={selectedGuarantors[index]}
            disabled={submitting || !policy || !snapshot || guarantors.length < 2}
            onChange={event => selectGuarantor(index, event.target.value)}
          >
            <option value="">Select a guarantor</option>
            {guarantors.map(member => <option key={member.id} value={member.id} disabled={selectedGuarantors[1 - index] === member.id}>{member.name}</option>)}
          </select>
        </label>)}
        {!snapshot
          ? <p className="form-note" role="status">Loading current loan rules and active guarantors…</p>
          : !policy
            ? <p className="form-note">Applications are unavailable until the Chairperson configures the Chama's rules.</p>
            : guarantors.length < 2
              ? <p className="form-note">At least two other active members are needed to choose guarantors.</p>
              : null}
        <button id="loan-submit" className="button-primary" type="submit" disabled={submitting || !snapshot || !policy || guarantors.length < 2 || !estimate || estimateLoading}>{submitting ? "Submitting…" : "Submit for automatic decision"}</button>
        {feedback.message && <p className={`form-note${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
      </form>
    </div>
  </>;
}

export default function LoansPanel() {
  const snapshot = useDashboardSnapshot();
  const [reviewRequestExplanations, setReviewRequestExplanations] = useState({});
  const [reviewFindings, setReviewFindings] = useState({});
  const [busyLoanId, setBusyLoanId] = useState("");
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const writeRequester = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owners = useRef(new Map());
  const visibleLoans = useMemo(() => {
    const own = Array.isArray(snapshot?.loans) ? snapshot.loans : [];
    const queue = Array.isArray(snapshot?.approvalQueue) ? snapshot.approvalQueue : [];
    return [...new Map([...own, ...queue].map(loan => [loan.id, loan])).values()];
  }, [snapshot]);

  function ownerFor(loanId) {
    let owner = owners.current.get(loanId);
    if (!owner) {
      owner = {};
      owners.current.set(loanId, owner);
    }
    return owner;
  }

  function updateReviewFinding(loanId, field, value) {
    setReviewFindings(current => ({ ...current, [loanId]: { ...(current[loanId] || {}), [field]: value } }));
  }

  async function handleReviewRequest(loan) {
    const reason = String(reviewRequestExplanations[loan.id] || "").trim();
    setFeedback({ message: "", error: false });
    setBusyLoanId(loan.id);
    try {
      const result = await requestLoanHumanReview(writeRequester, ownerFor(loan.id), loan.id, reason);
      setReviewRequestExplanations(current => ({ ...current, [loan.id]: "" }));
      setFeedback({ message: result.message || "Human review requested.", error: false });
      requestDashboardRefresh();
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ message: error.message || "Human review could not be requested.", error: true });
    } finally {
      setBusyLoanId("");
    }
  }

  async function handleHumanReview(loan) {
    const finding = reviewFindings[loan.id] || {};
    const outcome = finding.outcome || "upheld";
    const informationConsidered = String(finding.informationConsidered || "").trim();
    const reason = String(finding.reason || "").trim();
    setFeedback({ message: "", error: false });
    setBusyLoanId(loan.id);
    try {
      const result = await respondToLoanHumanReview(writeRequester, ownerFor(loan.id), loan.id, {
        outcome,
        memberExplanationConsidered: finding.memberExplanationConsidered === true,
        noConflictOfInterest: finding.noConflictOfInterest === true,
        informationConsidered,
        reason,
      });
      setReviewFindings(current => ({ ...current, [loan.id]: {} }));
      setFeedback({ message: result.message || "Human review completed.", error: false });
      requestDashboardRefresh();
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ message: error.message || "The human review could not be recorded.", error: true });
    } finally {
      setBusyLoanId("");
    }
  }

  async function handleCancelLegacy(loan) {
    setFeedback({ message: "", error: false });
    setBusyLoanId(loan.id);
    try {
      const result = await cancelLegacyLoanRequest(writeRequester, ownerFor(loan.id), loan.id);
      setFeedback({ message: result.message || "Previous request cancelled.", error: false });
      requestDashboardRefresh();
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ message: error.message || "The previous request could not be cancelled.", error: true });
    } finally {
      setBusyLoanId("");
    }
  }

  return <>
    <div className="panel-heading">
      <div>
        <h2 id="loans-title">Loan records</h2>
        <p>{translate("New applications are decided immediately under the Chama's configured eligibility rules. Officers can see the records; they do not vote on new applications.")}</p>
      </div>
      <span className="status-pill">Automatic eligibility</span>
    </div>
    <div className="loan-panel-body">
      <LoanPolicySummary policy={snapshot?.loanPolicy || null} />
      {snapshot?.user?.role === "chairperson" && <LoanPolicyEditor key={snapshot.loanPolicy?.version || "unconfigured"} policy={snapshot.loanPolicy || null} onSaved={requestDashboardRefresh} />}
      {feedback.message && <p className={`form-note${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
      <div id="loans" className="loan-list" aria-live="polite">
        {!snapshot
          ? <div className="empty-state">Loading loan records…</div>
          : visibleLoans.length ? visibleLoans.map(loan => {
            const presentation = loanStatusPresentation(loan.status);
            const steps = Array.isArray(loan.approvalSteps) ? loan.approvalSteps : [];
            const humanReview = loan.humanReview;
            const finding = reviewFindings[loan.id] || {};
            const outcome = finding.outcome || "upheld";
            const informationConsidered = String(finding.informationConsidered || "").trim();
            const writtenReasons = String(finding.reason || "").trim();
            return <article className="loan-card" key={loan.id}>
              <div className="loan-card-heading">
                <div><h3>{loan.memberName} · {money(loan.amount)}</h3><span className="schedule-sub">{loan.months} month{loan.months === 1 ? "" : "s"} · Requested {formatDate(loan.createdAt)}</span></div>
                <span className={`status-pill ${presentation.className}`}>{translate(presentation.label)}</span>
              </div>
              <p className="loan-progress">{translate(loan.progressMessage || presentation.label)}</p>
              {loan.automatedDecision && <section className="loan-auto-decision" aria-label="Automated loan decision details">
                <h4>Automated decision record</h4>
                <p><strong>Result:</strong> {loan.automatedDecision.decision === "approve" ? "Approved automatically" : "Not approved automatically"} · {formatDate(loan.automatedDecision.at)} at {formatTime(loan.automatedDecision.at)}</p>
                <p><strong>Reason:</strong> {loan.automatedDecision.reason}</p>
                {loan.automatedDecision.criteria && <div>
                  <p><strong>Recorded eligibility inputs:</strong></p>
                  <ul className="loan-decision-criteria">
                    <li>Active Chama membership: {Number.isInteger(loan.automatedDecision.criteria.activeDays) ? `${loan.automatedDecision.criteria.activeDays} days` : "not verified"}</li>
                    <li>Recorded share-capital contributions: {money(loan.automatedDecision.criteria.shareContributions)}</li>
                    <li>Recorded group balance and applicable cap: {money(loan.automatedDecision.criteria.groupBalance)} · {money(loan.automatedDecision.criteria.groupLimit)}</li>
                    <li>Existing principal and remaining member limit: {money(loan.automatedDecision.criteria.priorPrincipal)} · {money(loan.automatedDecision.criteria.memberContributionLimit)}</li>
                    <li>Applicable amount-tier ceiling: {loan.automatedDecision.criteria.tierMaximum == null ? "above all configured tiers" : money(loan.automatedDecision.criteria.tierMaximum)}</li>
                    <li>Two selected guarantors' available share capital: {loan.automatedDecision.criteria.guarantorsCovered ? "sufficient" : "not sufficient"}</li>
                  </ul>
                </div>}
                <p className="form-note">Policy version {loan.automatedDecision.policyVersion || "recorded"} and the decision inputs are retained in Chama records. An automated approval is not evidence that money was transferred.</p>
              </section>}
              {loan.status === "approved" && Array.isArray(loan.schedule) && loan.schedule.length > 0 && <section className="loan-recorded-schedule" aria-label="Projected loan repayment schedule">
                <h4>Projected repayment schedule</h4>
                <p>{Number.isFinite(loan.monthlyRatePercent) ? `${loan.monthlyRatePercent}% per month` : "Recorded monthly rate"} · reducing balance · estimated total payable {money(loan.totalPayable)}.</p>
                <ol className="loan-estimate-schedule">
                  {loan.schedule.map(row => <li key={`${loan.id}-installment-${row.no}`}><strong>Installment {row.no} · estimated due {formatDate(row.dueDate)}:</strong> principal {money(row.principal)} + interest {money(row.interest)} = {money(row.installment)}</li>)}
                </ol>
                <p className="form-note">This is an app-recorded projection, not proof that funds were disbursed. The app does not make the off-app transfer; confirm actual disbursement and the final written terms before treating any installment as due.</p>
              </section>}
              {steps.length > 0 && <ol className="loan-approval-trail" aria-label={`Previous workflow records for ${loan.memberName}`}>
                {steps.map((step, index) => {
                  const completed = step.status === "approve" || step.status === "reject";
                  const icon = step.status === "approve" ? "✓" : step.status === "reject" ? "✕" : "Awaiting";
                  const statusLabel = step.status === "approve" ? "Approved" : step.status === "reject" ? "Rejected" : "Awaiting";
                  return <li className={`loan-step ${completed ? `is-${step.status}` : "is-awaiting"}`} key={`${loan.id}-${step.role}-${index}`}>
                    <strong>{roleName(step.role)} <span aria-label={statusLabel}>{icon}</span></strong>
                    {completed
                      ? <span className="loan-step-meta">{step.approverName} · {formatDate(step.at)} at {formatTime(step.at)}</span>
                      : <span className="loan-step-meta">Decision not recorded</span>}
                    {step.reason && <span className="loan-step-reason">Reason: {step.reason}</span>}
                  </li>;
                })}
              </ol>}
              {loan.canCancel && <div className="loan-review-actions">
                <p>This request was created under the previous vote workflow. Cancelling it preserves its history and lets you apply again under the current rules.</p>
                <button className="mini-btn danger" type="button" disabled={busyLoanId === loan.id} onClick={() => handleCancelLegacy(loan)}>Cancel previous request</button>
              </div>}
              {humanReview && <section className="loan-human-review" aria-label="Human review record">
                <h4>Human review: {humanReview.status === "completed" ? "Completed" : "Requested"}</h4>
                {humanReview.status === "requested" && <p className="form-note">A non-conflicted Chama officer should consider your explanation and relevant information and provide a written result within a reasonable period. No fixed response deadline is set here; the result and reasons will appear in this record and your in-app notifications.</p>}
                {Array.isArray(humanReview.history) && humanReview.history.length > 0 && <ol className="loan-review-history" aria-label="Human review result history">
                  {humanReview.history.map((event, index) => {
                    const completed = event.stage === "completed";
                    const resultLabel = event.outcome === "upheld"
                      ? "Original automated decision upheld"
                      : event.outcome === "not_upheld"
                        ? "Original automated decision not upheld"
                        : event.outcome ? `Recorded outcome: ${event.outcome}` : "Review requested";
                    return <li key={event.id || `${loan.id}-review-${index}`}>
                      <strong>{completed ? resultLabel : "Review requested"}</strong>
                      <span className="loan-step-meta">{event.actorName || "Chama member"}{event.actorRole ? ` (${roleName(event.actorRole)})` : ""} · {formatDate(event.at)} at {formatTime(event.at)}</span>
                      {event.informationConsidered && <p><strong>Information considered:</strong> {event.informationConsidered}</p>}
                      {event.reason && <p><strong>{completed ? "Written reasons" : "Member's explanation"}:</strong> {event.reason}</p>}
                    </li>;
                  })}
                </ol>}
                {humanReview.response && <p className="form-note">The review finding is separate from the loan's recorded status. It does not approve or fund the loan or change balances, guarantor holds, or accounting.</p>}
              </section>}
              {loan.canRequestHumanReview && <div className="loan-review-actions">
                <label htmlFor={`loan-review-request-${loan.id}`}>Explain the relevant facts or information you want a person to consider (5 to 1,000 characters)</label>
                <textarea id={`loan-review-request-${loan.id}`} minLength="5" maxLength="1000" rows="4" value={reviewRequestExplanations[loan.id] || ""} disabled={busyLoanId === loan.id} onChange={event => setReviewRequestExplanations(current => ({ ...current, [loan.id]: event.target.value }))} />
                <button className="mini-btn" type="button" disabled={busyLoanId === loan.id || String(reviewRequestExplanations[loan.id] || "").trim().length < 5} onClick={() => handleReviewRequest(loan)}>Request human review</button>
              </div>}
              {loan.canReview && <div className="loan-review-actions">
                <label htmlFor={`loan-review-outcome-${loan.id}`}>Independent human-review outcome</label>
                <select id={`loan-review-outcome-${loan.id}`} value={outcome} disabled={busyLoanId === loan.id} onChange={event => updateReviewFinding(loan.id, "outcome", event.target.value)}>
                  <option value="upheld">Uphold the original automated decision</option>
                  <option value="not_upheld">Do not uphold the original automated decision</option>
                </select>
                <p className="form-note">This review result is recorded separately; it does not change the loan's approval or funding status.</p>
                <label className="loan-review-confirmation" htmlFor={`loan-review-explanation-considered-${loan.id}`}>
                  <input id={`loan-review-explanation-considered-${loan.id}`} type="checkbox" checked={finding.memberExplanationConsidered === true} disabled={busyLoanId === loan.id} onChange={event => updateReviewFinding(loan.id, "memberExplanationConsidered", event.target.checked)} />
                  I considered the member's explanation and relevant information.
                </label>
                <label className="loan-review-confirmation" htmlFor={`loan-review-conflict-free-${loan.id}`}>
                  <input id={`loan-review-conflict-free-${loan.id}`} type="checkbox" checked={finding.noConflictOfInterest === true} disabled={busyLoanId === loan.id} onChange={event => updateReviewFinding(loan.id, "noConflictOfInterest", event.target.checked)} />
                  I confirm that I have no other conflict of interest in this review.
                </label>
                <label htmlFor={`loan-review-information-${loan.id}`}>Information considered (5 to 2,000 characters)</label>
                <textarea id={`loan-review-information-${loan.id}`} minLength="5" maxLength="2000" rows="4" value={finding.informationConsidered || ""} disabled={busyLoanId === loan.id} onChange={event => updateReviewFinding(loan.id, "informationConsidered", event.target.value)} />
                <label htmlFor={`loan-review-reason-${loan.id}`}>Written reasons for the review outcome (20 to 2,000 characters)</label>
                <textarea id={`loan-review-reason-${loan.id}`} minLength="20" maxLength="2000" rows="4" value={finding.reason || ""} disabled={busyLoanId === loan.id} onChange={event => updateReviewFinding(loan.id, "reason", event.target.value)} />
                <button className="mini-btn" type="button" disabled={busyLoanId === loan.id || finding.memberExplanationConsidered !== true || finding.noConflictOfInterest !== true || informationConsidered.length < 5 || informationConsidered.length > 2000 || writtenReasons.length < 20 || writtenReasons.length > 2000} onClick={() => handleHumanReview(loan)}>Record review outcome</button>
              </div>}
            </article>;
          }) : <div className="empty-state">No loan records available.</div>}
      </div>
    </div>
  </>;
}
