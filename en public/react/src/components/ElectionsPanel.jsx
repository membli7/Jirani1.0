import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  castElectionVote,
  scheduleElection,
  scheduleElectionRunoff,
  submitElectionDecision,
} from "../electionActions.mjs";
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
  const [version, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    window.addEventListener("languagechange", refresh);
    return () => window.removeEventListener("languagechange", refresh);
  }, []);
  return version;
}

function t(text) {
  const catalog = window.jiraniI18n;
  return catalog?.translateText(text) || text;
}

function roleName(role) {
  return window.jiraniI18n?.roleName(role) || (role ? `${role[0].toUpperCase()}${role.slice(1)}` : "");
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(date);
}

function todayInNairobi() {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Nairobi" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function statusLabel(status) {
  const labels = {
    proposed: "Awaiting Chairperson acceptance",
    scheduled: "Scheduled",
    voting: "Voting open",
    closed: "Closed · awaiting verification",
    verified: "Verified · role change scheduled",
    "verified-tie": "Tie verified · runoff open",
    "verified-no-winner": "No winner",
    "runoff-needed": "Tie · runoff date needed",
    completed: "Role updated",
    cancelled: "Election cancelled",
    declined: "Proposal declined",
  };
  return labels[status] || status;
}

function notifySessionEnded(error) {
  if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
}

function actionFailure(error) {
  return error?.uncertain ? window.chamaWriteRequests.unconfirmedMessage("election") : error?.message || "The election action could not be confirmed.";
}

export default function ElectionsPanel() {
  const snapshot = useDashboardSnapshot();
  const languageVersion = useLanguageRefresh();
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owners = useRef(new Map());
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState({ text: "", error: false });
  const elections = Array.isArray(snapshot?.leadershipElections) ? snapshot.leadershipElections : [];
  const notifications = Array.isArray(snapshot?.notifications) ? snapshot.notifications : [];
  const members = Array.isArray(snapshot?.members) ? snapshot.members : [];
  const candidates = members.filter(member => member.status === "active" && member.role === "member");
  const canPropose = snapshot?.permissions?.proposeLeadershipElection === true;

  function ownerFor(key) {
    let owner = owners.current.get(key);
    if (!owner) {
      owner = {};
      owners.current.set(key, owner);
    }
    return owner;
  }

  function complete(result, fallback) {
    setFeedback({ text: result?.message || fallback, error: false });
    requestDashboardRefresh();
  }

  async function handleProposal(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const proposal = {
      role: values.get("role"),
      candidateIds: values.getAll("candidateIds"),
      scheduledDate: values.get("scheduledDate"),
    };
    if (proposal.candidateIds.length < 2 || proposal.candidateIds.length > 20) {
      setFeedback({ text: t("Choose 2 to 20 active Members as candidates."), error: true });
      return;
    }
    const operation = "proposal";
    setBusy(operation);
    setFeedback({ text: "", error: false });
    try {
      const result = await scheduleElection(writer, ownerFor(operation), proposal);
      form.reset();
      complete(result, "Election scheduled.");
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ text: actionFailure(error), error: true });
    } finally {
      setBusy("");
    }
  }

  async function handleVote(event, election) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const candidateId = new FormData(form).get("candidateId");
    const operation = `vote:${election.id}`;
    setBusy(operation);
    setFeedback({ text: "", error: false });
    try {
      const result = await castElectionVote(writer, ownerFor(operation), election.id, candidateId);
      complete(result, "Your secret vote has been recorded.");
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ text: actionFailure(error), error: true });
    } finally {
      setBusy("");
    }
  }

  async function handleRunoff(event, election) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const scheduledDate = new FormData(form).get("scheduledDate");
    const operation = `runoff:${election.id}`;
    setBusy(operation);
    setFeedback({ text: "", error: false });
    try {
      const result = await scheduleElectionRunoff(writer, ownerFor(operation), election.id, scheduledDate);
      complete(result, "Runoff scheduled.");
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ text: actionFailure(error), error: true });
    } finally {
      setBusy("");
    }
  }

  async function handleDecision(election, decision) {
    const prompts = {
      accept: "Accept these candidates and open voting?",
      decline: "Decline this proposal? The Secretary can submit a new one.",
      close: "Close voting now? Members will no longer be able to vote.",
      verify: "Verify the displayed election result?",
    };
    if (prompts[decision] && !window.confirm(t(prompts[decision]))) return;
    const operation = `decision:${election.id}:${decision}`;
    setBusy(operation);
    setFeedback({ text: "", error: false });
    try {
      const result = await submitElectionDecision(writer, ownerFor(operation), election.id, decision);
      complete(result, "Election updated.");
    } catch (error) {
      notifySessionEnded(error);
      setFeedback({ text: actionFailure(error), error: true });
    } finally {
      setBusy("");
    }
  }

  const today = useMemo(() => todayInNairobi(), []);
  const reversedElections = useMemo(() => [...elections].reverse(), [elections, languageVersion]);
  const reversedNotifications = useMemo(() => [...notifications].reverse(), [notifications]);

  return <>
    <div className="panel-heading"><div>
      <h2 id="leadership-elections-title">{t("Leadership elections")}</h2>
      <p>{t("The Chairperson or Secretary schedules candidates and a date. Eligible chama accounts can cast one secret vote on that date only, from midnight to 11:59 p.m. Nairobi time. The highest vote count wins and takes office when voting closes; a tie requires a scheduled runoff.")}</p>
    </div></div>
    {canPropose && <form id="election-proposal-form" className="form-body" onSubmit={handleProposal}>
      <h3>{t("Schedule an election")}</h3>
      <label className="field" htmlFor="election-date">{t("Election date")}<input id="election-date" name="scheduledDate" type="date" min={today} required disabled={Boolean(busy)} /></label>
      <label className="field" htmlFor="election-role">{t("Office")}<select id="election-role" name="role" required disabled={Boolean(busy)}>
        <option value="chairperson">{roleName("chairperson")}</option><option value="secretary">{roleName("secretary")}</option><option value="treasurer">{roleName("treasurer")}</option>
      </select></label>
      <label className="field" htmlFor="election-candidates">{t("Candidates (choose at least two active Members)")}
        <select id="election-candidates" name="candidateIds" multiple size="6" required disabled={Boolean(busy)}>
          {candidates.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}
        </select>
      </label>
      <button className="button-primary" type="submit" disabled={Boolean(busy) || candidates.length < 2}>{t(busy === "proposal" ? "Scheduling…" : "Schedule election")}</button>
    </form>}
    {feedback.text && <p className={`notice${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.text}</p>}
    <h3>{t("Election notices")}</h3>
    <div id="election-notifications" className="election-notifications" aria-live="polite">
      {reversedNotifications.length ? reversedNotifications.map(item => <article className="election-notice" key={item.id}>
        <strong>{formatDate(item.at)} · {t("Election update")}</strong><p>{item.text}</p>
      </article>) : <p className="empty-state">{t("No election notices yet.")}</p>}
    </div>
    <h3>{t("Ballots and results")}</h3>
    <div id="leadership-elections" className="leadership-elections" aria-live="polite">
      {!snapshot ? <p className="empty-state">{t("Loading elections…")}</p> : reversedElections.length ? reversedElections.map(election => {
        const busyForElection = Boolean(busy);
        const isChair = snapshot.user?.role === "chairperson";
        const result = election.result;
        const actions = [
          !election.scheduledDate && election.status === "proposed" && isChair ? ["accept", "Accept candidates and open voting", false] : null,
          !election.scheduledDate && election.status === "proposed" && isChair ? ["decline", "Decline proposal", true] : null,
          !election.scheduledDate && election.status === "voting" && isChair ? ["close", "Close voting", true] : null,
          !election.scheduledDate && election.status === "closed" && isChair ? ["verify", "Verify result", false] : null,
        ].filter(Boolean);
        return <article className="election-card" key={election.id}>
          <div className="election-card-heading"><div>
            <h4>{roleName(election.role)} {t("election")}{election.runoff ? ` · ${t("runoff")}` : ""}</h4>
            <span className="schedule-sub">{election.scheduledDate
              ? `${t("Scheduled")} ${formatDate(election.proposedAt)}`
              : election.acceptedAt
                ? `${t("Voting opened")} ${formatDate(election.proposedAt)} ${t("at")} ${formatTime(election.acceptedAt)}`
                : `${t("Proposed")} ${formatDate(election.proposedAt)} ${t("by the Secretary")}`}</span>
          </div><span className={`status-pill ${election.status === "completed" ? "active" : ["verified-no-winner", "cancelled", "declined"].includes(election.status) ? "inactive" : "pending"}`}>{t(statusLabel(election.status))}</span></div>
          <ul className="election-candidates">{(election.candidates || []).map(candidate => <li key={candidate.id}>{candidate.name}{candidate.active ? "" : ` · ${t("no longer eligible")}`}</li>)}</ul>
          {election.scheduledDate && <p className="election-action-note">{t(election.status === "scheduled" ? "Voting opens" : "Election date")} {formatDate(election.scheduledDate)}. {t("Voting is available from midnight to 11:59 p.m. Nairobi time on that date.")}</p>}
          {result
            ? <div className="election-counts"><strong>{result.votesCast} {t(result.votesCast === 1 ? "vote" : "votes")}</strong><ul>{(election.candidates || []).map(candidate => <li key={candidate.id}>{candidate.name}: {result.counts?.[candidate.id] || 0}</li>)}</ul></div>
            : election.status === "scheduled"
              ? <p>{t("Ballots become available on the election date.")}</p>
              : <p>{election.votesCast} {t(election.votesCast === 1 ? "vote" : "votes")} {t("recorded")} · {election.eligibleVoters} {t("eligible members")}</p>}
          {election.winnerName && <p className="election-result">{t("Winner:")} <strong>{election.winnerName}</strong>. {election.activationAt ? `${t("Portal access changes")} ${formatDate(election.activationAt)} ${t("at")} ${formatTime(election.activationAt)}.` : ""}</p>}
          {election.runoff && <p className="election-action-note">{t("Runoff ballot for the tied candidates.")}</p>}
          {election.canVote && <form className="election-ballot" data-election-ballot={election.id} onSubmit={event => handleVote(event, election)}>
            <label className="field" htmlFor={`election-choice-${election.id}`}>{t("Choose one candidate")}<select id={`election-choice-${election.id}`} name="candidateId" required disabled={busyForElection}>
              <option value="">{t("Select a candidate")}</option>{(election.candidates || []).filter(candidate => candidate.active).map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
            </select></label>
            <button className="button-primary" type="submit" disabled={busyForElection}>{t(busyForElection ? "Submitting…" : "Cast secret vote")}</button>
          </form>}
          {election.hasVoted && <p className="election-action-note">{t("Your secret vote is recorded.")}</p>}
          {election.canScheduleRunoff && <form className="election-runoff" data-election-runoff={election.id} onSubmit={event => handleRunoff(event, election)}>
            <label className="field" htmlFor={`runoff-date-${election.id}`}>{t("Runoff date")}<input id={`runoff-date-${election.id}`} name="scheduledDate" type="date" min={today} required disabled={busyForElection} /></label>
            <button className="mini-btn" type="submit" disabled={busyForElection}>{t(busyForElection ? "Scheduling…" : "Schedule runoff")}</button>
          </form>}
          {actions.map(([decision, label, danger]) => <button className={`mini-btn${danger ? " danger" : ""}`} type="button" key={decision} disabled={busyForElection} onClick={() => handleDecision(election, decision)}>{t(label)}</button>)}
        </article>;
      }) : <p className="empty-state">{t("No leadership elections are active.")}</p>}
    </div>
  </>;
}
