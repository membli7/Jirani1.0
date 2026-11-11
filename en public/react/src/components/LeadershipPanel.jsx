import { useEffect, useMemo, useRef, useState } from "react";
import { confirmLeadershipProposal, leadershipProposalFromForm, submitLeadershipProposal } from "../leadershipActions.mjs";
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

function roleName(role) {
  const labels = { chairperson: "chairperson", secretary: "secretary", treasurer: "treasurer" };
  return t(labels[role] || role, role || "Unknown role");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(date);
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }).format(date);
}

export default function LeadershipPanel() {
  useLanguageRefresh();
  const snapshot = useDashboardSnapshot();
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const proposalOwner = useRef({});
  const confirmOwner = useRef({});
  const formRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const members = Array.isArray(snapshot?.members) ? snapshot.members : [];
  const activeMembers = members.filter(member => member.status === "active");
  const changes = Array.isArray(snapshot?.leadershipChanges) ? snapshot.leadershipChanges.filter(change => change.type !== "election") : [];

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setBusy(true);
    setFeedback({ message: "", error: false });
    try {
      const payload = leadershipProposalFromForm(new FormData(form));
      await submitLeadershipProposal(writer, proposalOwner.current, payload);
      form.reset();
      setFeedback({ message: t("Officer assignment proposed.", "Officer assignment proposed."), error: false });
      requestDashboardRefresh();
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setFeedback({ message: error?.uncertain ? window.chamaWriteRequests.unconfirmedMessage("Officer assignments") : error?.message || "The officer assignment could not be confirmed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function confirmChange(changeId) {
    if (busy) return;
    setBusy(true);
    setFeedback({ message: "", error: false });
    try {
      await confirmLeadershipProposal(writer, confirmOwner.current, changeId);
      setFeedback({ message: t("Officer assignment confirmed.", "Officer assignment confirmed."), error: false });
      requestDashboardRefresh();
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setFeedback({ message: error?.uncertain ? window.chamaWriteRequests.unconfirmedMessage("Officer assignments") : error?.message || "The officer assignment could not be confirmed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) return <p className="form-note" role="status">{t("loading", "Loading…")}</p>;
  if (snapshot.permissions?.manageLeadership !== true) return null;

  return <>
    {snapshot.permissions?.bootstrapLeadership === true && <form id="leadership-form" className="form-body" ref={formRef} onSubmit={handleSubmit}>
      <label className="field" htmlFor="leadership-role">{t("Office", "Office")}
        <select name="role" id="leadership-role" required disabled={busy}>
          <option value="chairperson">{roleName("chairperson")}</option>
          <option value="secretary">{roleName("secretary")}</option>
          <option value="treasurer">{roleName("treasurer")}</option>
        </select>
      </label>
      <label className="field" htmlFor="incoming-user">{t("Incoming official", "Incoming official")}
        <select name="incomingUserId" id="incoming-user" required disabled={busy || !activeMembers.length}>
          {activeMembers.map(member => <option key={member.id} value={member.id}>{member.name} ({roleName(member.role)})</option>)}
        </select>
      </label>
      <label className="field" htmlFor="effective-date">{t("Effective date", "Effective date")}
        <input id="effective-date" name="effectiveDate" type="date" required disabled={busy} />
      </label>
      <button className="button-primary" type="submit" disabled={busy || !activeMembers.length}>{t(busy ? "saving" : "Propose assignment", busy ? "Saving…" : "Propose assignment")}</button>
    </form>}
    {feedback.message && <p className={`notice${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
    <div id="leadership-list" className="schedule-body">
      {changes.length ? changes.map(change => {
        const incoming = members.find(member => member.id === change.incomingUserId)?.name || "Unknown member";
        const proposer = members.find(member => member.id === change.proposedBy)?.name || "Officer";
        const revocation = (Array.isArray(change.audit) ? change.audit : []).find(item => item.action === "revoked");
        const canConfirm = change.status === "pending" && change.proposedBy !== snapshot.user?.id;
        return <div className="schedule-item" key={change.id}>
          <div>
            <strong>{revocation ? `${incoming} — ${t("role revoked", "role revoked")}` : `${roleName(change.role)}: ${incoming}`}</strong>
            {revocation
              ? <span className="schedule-sub">{incoming} was {roleName(change.role)} ({formatDate(`${change.effectiveDate}T12:00:00Z`)}), revoked ({formatDate(revocation.at)} {formatTime(revocation.at)} by {roleName(revocation.byRole || "chairperson")}; {t("reason", "reason")}: {revocation.reason})</span>
              : <span className="schedule-sub">{t("Officer assignment proposed by", "Officer assignment proposed by")} {proposer} · {change.status}</span>}
          </div>
          {canConfirm && <button className="mini-btn" type="button" disabled={busy} onClick={() => void confirmChange(change.id)}>{t("Confirm", "Confirm")}</button>}
        </div>;
      }) : <div className="empty-state">{t("No officer assignments recorded.", "No officer assignments recorded.")}</div>}
    </div>
  </>;
}
