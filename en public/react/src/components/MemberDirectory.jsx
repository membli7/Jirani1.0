import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  activeRoleChangeForMember,
  canUndoInvitation,
  invitationStatusPresentation,
  memberStatusPresentation,
  submitMemberRevocation,
} from "../memberActions.mjs";

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

function t(key) {
  return window.jiraniI18n?.t(key) || key;
}

function translate(text) {
  return window.jiraniI18n?.translateText(text) || text;
}

function roleName(role) {
  return window.jiraniI18n?.roleName(role) || (role ? `${role[0].toUpperCase()}${role.slice(1)}` : "");
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

function dispatchDashboardRefresh() {
  if (typeof window.CustomEvent === "function") {
    window.dispatchEvent(new window.CustomEvent("chama:dashboard-refresh-requested"));
  }
}

export default function MemberDirectory() {
  useLanguageRefresh();
  const snapshot = useDashboardSnapshot();
  const [pendingAction, setPendingAction] = useState("");
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const owners = useRef(new Map());
  const writeRequester = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const members = Array.isArray(snapshot?.members) ? snapshot.members : [];
  const invitations = Array.isArray(snapshot?.invitations) ? snapshot.invitations : [];
  const changes = Array.isArray(snapshot?.leadershipChanges) ? snapshot.leadershipChanges : [];
  const permissions = snapshot?.permissions || {};
  const activeMembers = members.filter(member => String(member.status || "").toLowerCase() === "active");
  const inactiveMembers = members.filter(member => String(member.status || "").toLowerCase() !== "active");

  async function revoke(kind, id, label) {
    const reasonPrompt = kind === "invitation" ? "Why are you revoking this invitation?" : "Why are you revoking this role?";
    const reason = window.prompt(translate(reasonPrompt));
    if (reason === null) return;
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 500) {
      setFeedback({ message: translate("Enter a reason of 5-500 characters."), error: true });
      return;
    }
    const route = kind === "invitation"
      ? `/api/invitations/${encodeURIComponent(id)}/revoke`
      : `/api/leadership-changes/${encodeURIComponent(id)}/revoke`;
    const key = `${kind}:${id}`;
    let owner = owners.current.get(key);
    if (!owner) {
      owner = {};
      owners.current.set(key, owner);
    }
    setPendingAction(key);
    setFeedback({ message: "", error: false });
    try {
      const result = await submitMemberRevocation(writeRequester, owner, route, normalizedReason);
      setFeedback({ message: result.message || translate(`${label} revoked and recorded in history.`), error: false });
      dispatchDashboardRefresh();
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setFeedback({ message: error.message || translate(`The ${label.toLowerCase()} could not be revoked.`), error: true });
    } finally {
      setPendingAction("");
    }
  }

  return <>
    <div className="panel-heading">
      <div><h2>{translate("Members")}</h2><p>{t("membersPanelCopy")}</p></div>
    </div>
    {feedback.message && <p className={`notice${feedback.error ? " error" : ""}`} role={feedback.error ? "alert" : "status"} aria-live="polite">{feedback.message}</p>}
    <section className="member-directory" aria-labelledby="active-members-title">
      <div className="member-directory-heading"><div>
        <h3 id="active-members-title">{t("activeMembersTitle")}</h3>
        <p className="member-directory-copy">{t("activeMembersCopy")}</p>
      </div></div>
      <div className="table-wrap members-table-wrap">
        <table className="members-table" aria-labelledby="active-members-title">
          <thead><tr>
            <th scope="col">{t("memberNameColumn")}</th><th scope="col">{t("memberPhoneColumn")}</th>
            <th scope="col">{t("memberRoleColumn")}</th><th scope="col">{t("memberStatusColumn")}</th>
            <th scope="col">{t("memberActionsColumn")}</th>
          </tr></thead>
          <tbody id="members">
            {!snapshot
              ? <tr><td colSpan="5" className="skeleton">{t("loading")}</td></tr>
              : activeMembers.length ? activeMembers.map(member => {
                const status = memberStatusPresentation(member.status);
                const roleChange = activeRoleChangeForMember(member, changes);
                const canRevokeRole = permissions.revokeLeadershipRoles === true && status.normalized === "active" && member.role !== "member" && roleChange;
                return <tr key={member.id}>
                  <td data-label={t("memberNameColumn")}>{member.name}</td>
                  <td data-label={t("memberPhoneColumn")}>{member.phone || "—"}</td>
                  <td data-label={t("memberRoleColumn")}>{roleName(member.role)}</td>
                  <td data-label={t("memberStatusColumn")}><span className={`status-pill ${status.className}`}>{status.statusKey ? t(status.statusKey) : status.label}</span></td>
                  <td data-label={t("memberActionsColumn")}>{canRevokeRole && <button className="mini-btn danger" type="button" data-revoke-role={roleChange.id} disabled={pendingAction === `role:${roleChange.id}`} onClick={() => revoke("role", roleChange.id, "Role")}>{translate(pendingAction === `role:${roleChange.id}` ? "Saving…" : "Revoke this role")}</button>}</td>
                </tr>;
              }) : <tr><td colSpan="5" className="empty-state">{t("noActiveMembers")}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    <section className="member-directory member-history-section" aria-labelledby="member-history-title">
      <div className="member-directory-heading"><div>
        <h3 id="member-history-title">{t("memberHistoryTitle")}</h3>
        <p className="member-directory-copy">{t("memberHistoryCopy")}</p>
      </div></div>
      <div className="table-wrap members-table-wrap">
        <table className="members-table" aria-labelledby="member-history-title">
          <thead><tr>
            <th scope="col">{t("memberNameColumn")}</th><th scope="col">{t("memberPhoneColumn")}</th>
            <th scope="col">{t("memberRoleColumn")}</th><th scope="col">{t("memberStatusColumn")}</th>
            <th scope="col">{t("memberActionsColumn")}</th>
          </tr></thead>
          <tbody id="member-invitation-history">
            {!snapshot
              ? <tr><td colSpan="5" className="skeleton">{t("loading")}</td></tr>
              : [...inactiveMembers.map(member => ({ type: "member", item: member })), ...(permissions.manageMembers ? invitations.map(invitation => ({ type: "invitation", item: invitation })) : [])].length
                ? [...inactiveMembers.map(member => ({ type: "member", item: member })), ...(permissions.manageMembers ? invitations.map(invitation => ({ type: "invitation", item: invitation })) : [])].map(({ type, item }) => {
                  if (type === "member") {
                    const status = memberStatusPresentation(item.status);
                    return <tr key={`member-${item.id}`}>
                      <td data-label={t("memberNameColumn")}>{item.name}</td>
                      <td data-label={t("memberPhoneColumn")}>{item.phone || "—"}</td>
                      <td data-label={t("memberRoleColumn")}>{roleName(item.role)}</td>
                      <td data-label={t("memberStatusColumn")}><span className={`status-pill ${status.className}`}>{status.statusKey ? t(status.statusKey) : status.label}</span></td>
                      <td data-label={t("memberActionsColumn")}>—</td>
                    </tr>;
                  }
                  const invitation = item;
                  const status = invitationStatusPresentation(invitation);
                  const revocation = invitation.revocation;
                  const history = revocation
                    ? <span className="schedule-sub">{translate("This invitation was revoked by")} {roleName(revocation.by?.role)} {translate("on")} {formatDate(revocation.at)} {translate("at")} {formatTime(revocation.at)} ({translate("reason")}: {revocation.reason})</span>
                    : invitation.usedAt ? <span className="schedule-sub">{translate("Activated on")} {formatDate(invitation.usedAt)} {translate("at")} {formatTime(invitation.usedAt)}</span> : null;
                  const canUndo = canUndoInvitation(invitation, permissions);
                  const actionKey = `invitation:${invitation.id}`;
                  return <tr key={`invitation-${invitation.id}`}>
                    <td data-label={t("memberNameColumn")}>{invitation.name}{history}</td>
                    <td data-label={t("memberPhoneColumn")}>{invitation.phone || "—"}</td>
                    <td data-label={t("memberRoleColumn")}>{roleName(invitation.requestedRole)}</td>
                    <td data-label={t("memberStatusColumn")}><span className={`status-pill ${status.className}`}>{t(status.statusKey)}</span></td>
                    <td data-label={t("memberActionsColumn")}>{canUndo && <button className="mini-btn danger" type="button" data-revoke-invitation={invitation.id} disabled={pendingAction === actionKey} onClick={() => revoke("invitation", invitation.id, "Invitation")}>{translate(pendingAction === actionKey ? "Saving…" : "Undo")}</button>}</td>
                  </tr>;
                }) : <tr><td colSpan="5" className="empty-state">{t("noMemberHistory")}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}
