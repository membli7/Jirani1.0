import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createInvitation } from "../invitationActions.mjs";
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
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    window.addEventListener("languagechange", refresh);
    return () => window.removeEventListener("languagechange", refresh);
  }, []);
}

function t(key) {
  return window.jiraniI18n?.t(key) || key;
}

export default function InviteMemberPanel() {
  useLanguageRefresh();
  const snapshot = useDashboardSnapshot();
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owner = useRef({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [copyMessage, setCopyMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setSubmitting(true);
    setResult(null);
    setCopyMessage("");
    try {
      const values = Object.fromEntries(new FormData(form));
      const response = await createInvitation(writer, owner.current, values);
      form.reset();
      setResult({
        message: response.activationCode
          ? `${response.message} Share the code privately with the member.`
          : response.message,
        code: response.activationCode || "",
        error: false,
      });
      requestDashboardRefresh();
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      const message = error?.uncertain
        ? window.chamaWriteRequests.unconfirmedMessage("Invitations")
        : error?.message || "The invitation could not be confirmed.";
      setResult({ message, code: "", error: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function copyCode() {
    if (!result?.code) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopyMessage("Activation code copied. Share it privately.");
    } catch {
      setCopyMessage("Copy failed. Select the activation code and copy it manually.");
    }
  }

  if (!snapshot) return <p className="form-note" role="status">{t("loading")}</p>;
  if (snapshot.permissions?.manageMembers !== true) return null;

  return <>
    <form id="invite-form" className="form-body" onSubmit={handleSubmit}>
      <label className="field" htmlFor="invite-name">{t("inviteName")}
        <input id="invite-name" name="name" autoComplete="name" maxLength={100} required disabled={submitting} />
      </label>
      <label className="field" htmlFor="invite-phone">{t("invitePhone")}
        <input id="invite-phone" name="phone" type="tel" autoComplete="tel" placeholder="0712 345 678" required disabled={submitting} />
      </label>
      <label className="field" htmlFor="invite-email">{t("inviteEmail")}
        <input id="invite-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={submitting} />
      </label>
      <label className="field" htmlFor="invite-role">{t("Requested role")}
        <select id="invite-role" name="role" defaultValue="member" required disabled={submitting}>
          <option value="member">{t("member")}</option>
          <option value="secretary">{t("secretary")}</option>
          <option value="treasurer">{t("treasurer")}</option>
        </select>
      </label>
      <button className="button-primary" type="submit" disabled={submitting}>{t(submitting ? "Creating invitation…" : "Create invitation")}</button>
    </form>
    {result && <div id="invite-result" className={`invite-result${result.error ? " error" : ""}`} role={result.error ? "alert" : "status"} aria-live="polite">
      <p id="invite-result-message">{result.message}</p>
      {result.code && <div className="invite-code-row">
        <output id="invite-code" aria-label={t("activationCodeLabel")}>{result.code}</output>
        <button id="copy-invite-code" className="mini-btn" type="button" onClick={copyCode}>{t("copyCode")}</button>
      </div>}
      {copyMessage && <p className="form-note" role="status">{copyMessage}</p>}
    </div>}
  </>;
}
