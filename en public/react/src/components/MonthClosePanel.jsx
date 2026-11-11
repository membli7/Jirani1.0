import { useEffect, useReducer, useState } from "react";
import { todayNairobiDate } from "../attendanceActions.mjs";
import { fetchMonthlyClose } from "../monthCloseActions.mjs";

function t(key) {
  return window.jiraniI18n?.t(key) || key;
}

function money(value) {
  return value === null || value === undefined
    ? "Private"
    : `KES ${Number(value).toLocaleString("en-KE")}`;
}

function count(value) {
  return Number(value) || 0;
}

function useLanguageRefresh() {
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    window.addEventListener("languagechange", refresh);
    return () => window.removeEventListener("languagechange", refresh);
  }, [refresh]);
}

export default function MonthClosePanel() {
  useLanguageRefresh();
  const today = todayNairobiDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState({ key: "", error: false });

  async function handleSubmit(event) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setLoading(true);
    setNotice({ key: "monthCloseLoading", error: false });
    try {
      setData(await fetchMonthlyClose(month));
      setNotice({ key: "monthCloseReady", error: false });
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setNotice({
        key: error?.status === 403 ? "forbidden"
          : error?.status === 400 ? "monthCloseSelectMonth" : "monthCloseFailed",
        error: true,
      });
    } finally {
      setLoading(false);
    }
  }

  const totals = data?.totals || {};
  const exceptions = data?.exceptions || {};
  const summaryCards = data ? [
    {
      label: t("monthCloseContributions"),
      value: money(totals.contributionTotal),
      detail: `${count(totals.contributionCount)} ${t("monthCloseContributionCount")} · ${t("monthCloseWelfare")} ${money(totals.welfareAmount)} · ${t("monthCloseShareCapital")} ${money(totals.shareCapitalAmount)}`,
    },
    {
      label: t("monthCloseRepayments"),
      value: money(totals.repaymentTotal),
      detail: `${count(totals.repaymentCount)} ${t("monthCloseRepaymentCount")}`,
    },
    {
      label: t("monthCloseOpenLoans"),
      value: money(totals.openLoanBalance),
      detail: t("monthCloseNoTransferNote"),
    },
  ] : [];
  const exceptionCards = data ? [
    {
      key: "membersWithoutContribution",
      title: t("monthCloseNoContribution"),
      render: item => item.name,
      note: t("monthCloseMissingContributionNote"),
    },
    {
      key: "pendingLoanRequests",
      title: t("monthClosePendingLoans"),
      render: item => `${item.memberName || t("member")} · ${money(item.amount)}`,
    },
    {
      key: "outstandingPenalties",
      title: t("monthCloseUnpaidPenalties"),
      render: item => `${item.memberName || t("member")} · ${money(item.amount)}${item.reason ? ` · ${item.reason}` : ""}`,
    },
    {
      key: "incompleteReferences",
      title: t("monthCloseIncompleteReferences"),
      render: item => `${item.memberName || t("member")} · ${item.paymentType} · ${money(item.amount)}`,
    },
  ] : [];
  const entries = Array.isArray(data?.entries) ? data.entries : [];

  return <>
    <div className="panel-heading">
      <div>
        <h2 id="cash-flows-title">{t("monthCloseTitle")}</h2>
        <p>{t("monthCloseIntro")}</p>
      </div>
    </div>
    <form id="month-close-form" className="month-close-form" onSubmit={handleSubmit}>
      <label className="field" htmlFor="month-close-month"><span>{t("monthCloseMonth")}</span><input
        id="month-close-month"
        name="month"
        type="month"
        required
        max={today.slice(0, 7)}
        value={month}
        disabled={loading}
        onChange={event => setMonth(event.target.value)}
      /></label>
      <button className="button-primary" type="submit" disabled={loading}>{t(loading ? "monthCloseLoading" : "monthCloseLoad")}</button>
    </form>
    {notice.key && <p id="month-close-notice" className={`notice${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"} aria-live="polite">{t(notice.key)}</p>}
    <div id="month-close-summary" className="month-close-summary" aria-live="polite">
      {summaryCards.map(card => <article className="month-close-stat" key={card.label}>
        <h3>{card.label}</h3><strong>{card.value}</strong><p>{card.detail}</p>
      </article>)}
    </div>
    <h3 className="month-close-section-title">{t("monthCloseItemsTitle")}</h3>
    <div id="month-close-exceptions" className="month-close-exceptions" aria-live="polite">
      {exceptionCards.map(card => {
        const items = Array.isArray(exceptions[card.key]) ? exceptions[card.key] : [];
        return <article className="month-close-exception" key={card.key}>
          <div className="month-close-exception-heading"><h4>{card.title}</h4><span>{items.length}</span></div>
          {items.length
            ? <ul>{items.map((item, index) => <li key={item.id || `${card.key}-${index}`}>{card.render(item)}</li>)}</ul>
            : <p className="month-close-empty">{t("monthCloseNoItems")}</p>}
          {card.note && <p className="month-close-note">{card.note}</p>}
        </article>;
      })}
    </div>
    <h3 className="month-close-section-title">{t("monthCloseEntriesTitle")}</h3>
    <div id="month-close-entries" className="month-close-entries" aria-live="polite">
      {data && (count(data.entriesOmittedCount) > 0 && <p className="month-close-note">{t("monthCloseLatest100")}</p>)}
      {entries.length
        ? entries.map((item, index) => <article className="month-close-entry" key={item.id || `entry-${index}`}>
          <div className="month-close-entry-heading"><h4>{item.memberName || t("member")}</h4><strong>{money(item.amount)}</strong></div>
          <p>{item.date} · {item.type}</p>
          <p>{t("monthCloseReference")}: {item.referenceNumber || "—"} · {t("monthCloseRecordedBy")}: {item.recordedByName || "—"}</p>
        </article>)
        : data && <p className="month-close-empty">{t("monthCloseNoEntries")}</p>}
    </div>
  </>;
}
