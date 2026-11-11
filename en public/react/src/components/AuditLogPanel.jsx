import { useEffect, useMemo, useReducer, useState } from "react";
import { auditDescription, fetchAuditLog, filterAuditEntries, paginateAuditEntries } from "../auditActions.mjs";

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
  }, [refresh]);
  return version;
}

function t(key) {
  const translated = window.jiraniI18n?.t(key);
  return translated && translated !== key ? translated : window.jiraniI18n?.translateText(key) || key;
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

export default function AuditLogPanel() {
  const languageVersion = useLanguageRefresh();
  const snapshot = useDashboardSnapshot();
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pageSize = 25;
  const canView = snapshot?.permissions?.viewAuditLog === true;

  useEffect(() => {
    if (!canView) {
      setEntries([]);
      setError("");
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    fetchAuditLog(globalThis.fetch, controller.signal)
      .then(data => { setEntries(data); setError(""); setPage(0); })
      .catch(fetchError => {
        if (fetchError.name === "AbortError") return;
        setEntries([]);
        setError(fetchError.status === 403 ? "You do not have permission to view the audit log." : "The audit log could not load. Try again.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [canView, snapshot]);

  const matches = useMemo(() => filterAuditEntries(entries, query, roleName), [entries, query, languageVersion]);
  const { pageCount, currentPage, items: pageEntries } = useMemo(
    () => paginateAuditEntries(matches, page, pageSize),
    [matches, page, pageSize],
  );

  if (snapshot && !canView) return null;

  return <>
    <div className="panel-heading"><div>
      <h2 id="audit-title">{t("auditLog")}</h2>
      <p>{t("Payments, loan decisions, and officer changes, newest first. Filter and page through entries; audit records cannot be edited or deleted.")}</p>
    </div></div>
    {error && <p id="audit-notice" className="notice error" role="alert" aria-live="polite">{t(error)}</p>}
    <div className="audit-controls">
      <label className="audit-search" htmlFor="audit-search">{t("Filter audit entries")}<input
        id="audit-search"
        type="search"
        placeholder={t("Name, action, or date")}
        autoComplete="off"
        value={query}
        onChange={event => { setQuery(event.target.value); setPage(0); }}
      /></label>
      <div className="audit-pagination" role="navigation" aria-label={t("Audit log pages")}>
        <button id="audit-previous" className="mini-btn" type="button" disabled={currentPage === 0 || loading} onClick={() => setPage(value => Math.max(0, value - 1))}>{t("Previous")}</button>
        <span id="audit-page-info" role="status" aria-live="polite">{matches.length ? currentPage + 1 : 0} / {matches.length ? pageCount : 0} · {matches.length} {t("entries")}</span>
        <button id="audit-next" className="mini-btn" type="button" disabled={currentPage >= pageCount - 1 || loading} onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))}>{t("Next")}</button>
      </div>
    </div>
    <div className="table-wrap audit-table-wrap" role="region" aria-label={t("Audit log entries. Scroll within this area to review older entries.")} tabIndex="0">
      <table className="audit-table audit-log-table">
        <thead><tr><th>{t("When")}</th><th>{t("Who")}</th><th>{t("What happened")}</th></tr></thead>
        <tbody id="audit-list" aria-live="polite">
          {loading && !entries.length
            ? <tr><td colSpan="3" className="skeleton">{t("Loading…")}</td></tr>
            : pageEntries.length ? pageEntries.map((entry, index) => <tr key={entry.id || `${entry.at}-${index}`}>
              <td>{formatDate(entry.at)} {formatTime(entry.at)}</td>
              <td>{entry.by?.name || t("Unknown")}{entry.by?.role ? ` (${roleName(entry.by.role)})` : ""}</td>
              <td>{auditDescription(entry, roleName)}</td>
            </tr>) : <tr><td colSpan="3" className="empty-state">{t("No audit entries match this filter.")}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="panel-heading"><div><h3>{t("cashFlowTableTitle")}</h3></div></div>
    <div className="table-wrap audit-table-wrap" role="region" aria-label={t("Cash flow entries in the audit log. Scroll within this area to review entries.")} tabIndex="0">
      <table className="audit-table cash-flow-table">
        <thead><tr>
          <th>{t("flow")}</th><th>{t("type")}</th><th>{t("memberLabel")}</th><th>{t("amountKes")}</th>
          <th>{t("date")}</th><th>{t("time")}</th><th>{t("recordedBy")}</th><th>{t("reason")}</th><th>{t("status")}</th><th>{t("actions")}</th>
        </tr></thead>
        <tbody id="audit-cash-flows-list" aria-live="polite"></tbody>
      </table>
    </div>
  </>;
}
