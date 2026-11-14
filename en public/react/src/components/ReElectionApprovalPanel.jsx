import { useMemo, useRef, useState } from "react";
import {
  castReElectionApprovalVote,
  requestReElectionApproval,
  scheduleApprovedReElection,
} from "../electionActions.mjs";
import { requestDashboardRefresh } from "../loanActions.mjs";

const activeElectionStatuses = new Set(["proposed", "scheduled", "voting", "closed", "verified", "runoff-needed"]);

function t(text) {
  return window.jiraniI18n?.translateText(text) || text;
}

function roleName(role) {
  return window.jiraniI18n?.roleName(role) || (role ? `${role[0].toUpperCase()}${role.slice(1)}` : "");
}

function formatLocalDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(date);
}

function statusLabel(status, electionId) {
  if (status === "voting") return "Approval ballot open";
  if (status === "approved") return electionId ? "Approved · election scheduled" : "Approved · ready to schedule";
  if (status === "failed") return "Approval threshold not met";
  return status;
}

function actionFailure(error) {
  return error?.uncertain ? window.chamaWriteRequests.unconfirmedMessage("election") : error?.message || "The re-election action could not be confirmed.";
}

export default function ReElectionApprovalPanel({ snapshot, approvals = [], candidates = [] }) {
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owners = useRef(new Map());
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState({ text: "", error: false });
  const role = snapshot?.user?.role;
  const activeRoleElection = (Array.isArray(snapshot?.leadershipElections) ? snapshot.leadershipElections : [])
    .some(item => item.role === role && activeElectionStatuses.has(item.status));
  const roleApprovalPending = approvals.some(item => item.role === role &&
    (item.status === "voting" || (item.status === "approved" && !item.electionId)));
  const canRequest = snapshot?.permissions?.requestReElection === true && !activeRoleElection && !roleApprovalPending;
  const reversedApprovals = [...approvals].reverse();

  function ownerFor(key) {
    let owner = owners.current.get(key);
    if (!owner) {
      owner = {};
      owners.current.set(key, owner);
    }
    return owner;
  }

  function notifySessionEnded(error) {
    if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
  }

  function complete(result, fallback) {
    setFeedback({ text: result?.message || fallback, error: false });
    requestDashboardRefresh();
  }

  async function runAction(key, action, fallback) {
    setBusy(key);
    setFeedback({ text: "", error: false });
    try {
      complete(await action(), fallback);
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ text: actionFailure(error), error: true });
    } finally {
      setBusy("");
    }
  }

  function handleRequest() {
    if (!window.confirm(t("Open a private seven-day Yes/No approval ballot for re-election of your current position?"))) return;
    return runAction("request", () => requestReElectionApproval(writer, ownerFor("request")), "The approval ballot is open.");
  }

  function handleVote(event, approval) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const choice = new FormData(form).get("choice");
    const operation = `vote:${approval.id}`;
    return runAction(operation, () => castReElectionApprovalVote(writer, ownerFor(operation), approval.id, choice), "Your ballot has been recorded.");
  }

  function handleSchedule(event, approval) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const proposal = { scheduledDate: values.get("scheduledDate"), candidateIds: values.getAll("candidateIds") };
    if (proposal.candidateIds.length < 2 || proposal.candidateIds.length > 20) {
      setFeedback({ text: t("Choose 2 to 20 active Members as candidates."), error: true });
      return;
    }
    const operation = `schedule:${approval.id}`;
    return runAction(operation, () => scheduleApprovedReElection(writer, ownerFor(operation), approval.id, proposal), "The re-election is scheduled.");
  }

  return <section className="re-election-approvals" aria-labelledby="re-election-approvals-title">
    <h3 id="re-election-approvals-title">{t("Re-election requests")}</h3>
    <p>{t("An active Chairperson, Secretary, or Treasurer may request a private seven-day Yes/No ballot for their own position. At the deadline, the ballot passes only if Yes votes meet the two-thirds threshold; it never closes early. After a pass, the Chairperson or Secretary selects candidates and an election date for that position. The incumbent remains in office until the replacement election completes.")}</p>
    {canRequest && <button className="mini-btn" type="button" disabled={Boolean(busy)} onClick={handleRequest}>
      {t(busy === "request" ? "Opening ballot…" : "Request re-election of your current position")}
    </button>}
    {feedback.text && <p className={`notice${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.text}</p>}
    {!snapshot ? <p className="empty-state">{t("Loading approval ballots…")}</p> : reversedApprovals.length ? <div className="leadership-elections" aria-live="polite">{reversedApprovals.map(approval => {
      const disabled = Boolean(busy);
      return <article className="election-card" key={approval.id}>
        <div className="election-card-heading"><div>
          <h4>{roleName(approval.role)} {t("re-election approval")}</h4>
          <span className="schedule-sub">{t("Opened")} {formatLocalDateTime(approval.openedAt)} · {t("Closes")} {formatLocalDateTime(approval.deadlineAt)}</span>
        </div><span className={`status-pill ${approval.status === "approved" ? "active" : approval.status === "failed" ? "inactive" : "pending"}`}>{t(statusLabel(approval.status, approval.electionId))}</span></div>
        <p>{t("Frozen eligible members:")} {approval.eligibleMembers} · {t("Yes votes needed:")} {approval.threshold}. {t("Abstentions do not count as approvals.")}</p>
        <p className="election-action-note">{t("Aggregate votes")} — {t("Yes:")} {approval.yesVotes} · {t("No:")} {approval.noVotes} · {t("Votes cast:")} {approval.votesCast}{approval.status === "voting"
          ? ` · ${t("Not yet voted:")} ${approval.unvoted}`
          : ` · ${t("Abstentions:")} ${approval.abstentions}`}</p>
        <p className="election-action-note">{t(approval.privacyNotice)}</p>
        {approval.status === "voting" && approval.canVote && <form className="election-ballot" onSubmit={event => handleVote(event, approval)}>
          <fieldset>
            <legend>{t("Your private approval vote")}</legend>
            <label><input type="radio" name="choice" value="yes" required disabled={disabled} /> {t("Yes")}</label>
            <label><input type="radio" name="choice" value="no" required disabled={disabled} /> {t("No")}</label>
          </fieldset>
          <button className="button-primary" type="submit" disabled={disabled}>{t(disabled ? "Submitting…" : "Cast approval vote")}</button>
        </form>}
        {approval.status === "voting" && approval.hasVoted && <p className="election-action-note">{t("Your approval ballot is recorded. Other members’ choices are not shown.")}</p>}
        {approval.status === "voting" && !approval.canVote && !approval.hasVoted && !approval.eligible && <p className="election-action-note">{t("You were not on the frozen eligible-member list when this ballot opened.")}</p>}
        {approval.result && <p className="election-result">{t(approval.result.passed ? "The approval threshold was met at the deadline." : "The approval threshold was not met at the deadline.")}</p>}
        {approval.canSchedule && <form className="form-body" onSubmit={event => handleSchedule(event, approval)}>
          <h4>{t("Schedule approved re-election")}</h4>
          <label className="field" htmlFor={`re-election-date-${approval.id}`}>{t("Election date")}<input id={`re-election-date-${approval.id}`} name="scheduledDate" type="date" min={new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Nairobi" }).format(new Date())} required disabled={disabled} /></label>
          <label className="field" htmlFor={`re-election-candidates-${approval.id}`}>{t("Candidates (choose at least two active Members)")}
            <select id={`re-election-candidates-${approval.id}`} name="candidateIds" multiple size="6" required disabled={disabled}>
              {candidates.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
            </select>
          </label>
          <button className="button-primary" type="submit" disabled={disabled || candidates.length < 2}>{t("Schedule re-election")}</button>
        </form>}
        {approval.electionId && approval.scheduledDate && <p className="election-action-note">{t("The role-specific re-election is scheduled for")} {approval.scheduledDate}.</p>}
      </article>;
    })}</div> : <p className="empty-state">{t("No re-election requests yet.")}</p>}
  </section>;
}
