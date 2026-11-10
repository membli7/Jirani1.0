import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  deriveGroupTrend,
  derivePersonalFinance,
  fetchFinanceSummary,
  financialMonths,
  monthlyTransactionSeries,
} from "../financeActions.mjs";

const money = value => value === null || value === undefined ? "Private" : `KES ${Number(value).toLocaleString("en-KE")}`;
const formatDate = value => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(date);
};
const translate = (key, fallback) => {
  const i18n = window.jiraniI18n;
  const translated = i18n?.t?.(key);
  return translated && translated !== key ? translated : i18n?.translateText?.(fallback) || fallback;
};

function FinanceTable({ caption, headings, rows, emptyMessage }) {
  return (
    <div className="table-wrap finance-table-wrap">
      <table className="finance-data-table">
        <caption className="screen-reader-only">{caption}</caption>
        <thead><tr>{headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={row.key || index}>{row.cells.map((cell, cellIndex) => (
              <td data-label={headings[cellIndex]} key={cellIndex}>{cell}</td>
            ))}</tr>
          )) : <tr><td colSpan={headings.length} className="empty-state">{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TrendChart({ months, series, label }) {
  const width = 720, height = 270, left = 64, right = 20, top = 18, bottom = 50;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maxValue = Math.max(0, ...series.flatMap(item => item.values.map(Number)));
  const scaleMax = maxValue > 0 ? Math.ceil(maxValue / 1000) * 1000 : 1000;
  const x = index => left + (months.length < 2 ? plotWidth / 2 : index * plotWidth / (months.length - 1));
  const y = value => top + plotHeight - Number(value) / scaleMax * plotHeight;
  return (
    <>
      <div className="financial-trend-legend">
        {series.map(item => <span className="trend-legend-item" key={item.label}><i className={`trend-legend-dot ${item.color === "#bd7b35" ? "is-ochre" : "is-green"}`} />{item.label}</span>)}
      </div>
      <svg className="financial-trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {Array.from({ length: 5 }, (_, index) => {
          const value = scaleMax * index / 4, py = y(value);
          return <g key={index}><line x1={left} y1={py} x2={width - right} y2={py} className="trend-grid" /><text x={left - 8} y={py + 4} textAnchor="end" className="trend-axis-label">{Math.round(value).toLocaleString("en-KE")}</text></g>;
        })}
        {series.map(item => {
          const points = item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
          return <g key={item.label}>
            <polyline points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {item.values.map((value, index) => <circle key={`${item.label}-${index}`} cx={x(index)} cy={y(value)} r="4" fill={item.color}><title>{item.label} · {months[index].label}: {money(value)}</title></circle>)}
          </g>;
        })}
        {months.map((month, index) => <text key={month.key} x={x(index)} y={height - 20} textAnchor="middle" className="trend-axis-label">{month.label}</text>)}
      </svg>
      <div className="trend-data-wrap" role="region" aria-label="Monthly financial trend data. Scroll horizontally to view all series." tabIndex="0">
        <table className="trend-data">
          <thead><tr><th scope="col">Month</th>{series.map(item => <th scope="col" key={item.label}>{item.label}</th>)}</tr></thead>
          <tbody>{months.map((month, index) => <tr key={month.key}><th scope="row">{month.label}</th>{series.map(item => <td key={item.label}>{money(item.values[index])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function PersonalView({ data, transactions, months, error }) {
  const personal = derivePersonalFinance(data || {});
  const loading = !data && !error;
  const emptyMessage = message => loading ? "Loading…" : error ? "Financial records could not load." : message;
  const series = [
    monthlyTransactionSeries(transactions, months, "Contributions", "Monthly Contribution", "#347c62"),
    monthlyTransactionSeries(transactions, months, "Loan repayments", "Loan Repayment", "#bd7b35"),
  ];
  const dateLabel = translate("date", "Date"), amountLabel = translate("amountKes", "Amount (KES)");
  const noteLabel = translate("note", "Note"), reasonLabel = translate("reason", "Reason");
  const statusLabel = translate("status", "Status"), balanceLabel = translate("balanceDue", "Balance due");
  const dueLabel = translate("dueItem", "Amount due");
  return <section className="financial-view" id="you-dashboard" role="tabpanel" tabIndex="0" aria-labelledby="you-dashboard-title">
    <div className="finance-view-heading"><h2 id="you-dashboard-title">{translate("yourFinances", "Your finances")}</h2><p>{translate("yourFinancesCopy", "Only your own records are shown here.")}</p></div>
    <p className="finance-data-notice" role="status" aria-live="polite" hidden={!error}>{error}</p>
    <div className="finance-view-layout"><div className="finance-table-grid">
      <section className="finance-section" aria-labelledby="you-contributions-title"><h3 id="you-contributions-title">{translate("yourContributions", "Your contributions")}</h3>
        <FinanceTable caption={translate("yourContributions", "Your contributions")} headings={[dateLabel, amountLabel, noteLabel]} emptyMessage={emptyMessage("No contributions recorded.")} rows={personal.contributions.map(item => ({ key: item.id || item.at, cells: [formatDate(item.at), money(item.amount), item.note || item.paymentType || "Monthly contribution"] }))} />
      </section>
      <section className="finance-section" aria-labelledby="you-fines-title"><h3 id="you-fines-title">{translate("yourFines", "Your fines")}</h3>
        <FinanceTable caption={translate("yourFines", "Your fines")} headings={[dateLabel, reasonLabel, translate("amountDue", "Amount due")]} emptyMessage={emptyMessage("No fines recorded.")} rows={personal.fines.map(item => ({ key: item.id || item.at || item.date, cells: [formatDate(item.at || item.date), item.reason || "Fine", `${money(item.amount)}${item.status === "outstanding" ? " · Unpaid" : " · Paid"}`] }))} />
      </section>
      <section className="finance-section" aria-labelledby="you-loans-title"><h3 id="you-loans-title">{translate("yourLoanBalances", "Your loan balances")}</h3>
        <FinanceTable caption={translate("yourLoanBalances", "Your loan balances")} headings={[dateLabel, statusLabel, balanceLabel]} emptyMessage={emptyMessage("No loans recorded.")} rows={personal.loans.map(item => ({ key: item.id || item.createdAt, cells: [formatDate(item.createdAt), item.status, money(item.status === "approved" ? item.outstanding : 0)] }))} />
      </section>
      <section className="finance-section" aria-labelledby="you-arrears-title"><h3 id="you-arrears-title">{translate("yourArrears", "Your arrears")}</h3><p className="finance-section-copy">{translate("arrearsIncludedCopy", "Based on recorded outstanding loan balances and assessed unpaid fines.")}</p>
        <FinanceTable caption={translate("yourArrears", "Your arrears")} headings={[dueLabel, amountLabel]} emptyMessage={emptyMessage("No arrears recorded.")} rows={personal.arrears.map(item => ({ key: item.label, cells: [item.label, money(item.amount)] }))} />
      </section>
    </div><aside className="finance-chart-section" aria-labelledby="you-chart-title"><h3 id="you-chart-title">Your monthly financial trends (KES)</h3><TrendChart months={months} series={series} label="Monthly financial trends for the last six months" /></aside></div>
  </section>;
}

function GroupView({ summary, months, error }) {
  const data = summary || {};
  const total = value => summary ? money(value) : "Loading…";
  const emptyMessage = !summary && !error ? "Loading…" : error ? "Group financial data could not load." : "No monthly data available.";
  const amountLabel = translate("amountKes", "Amount (KES)"), monthLabel = translate("month", "Month");
  const series = deriveGroupTrend(data, months);
  return <section className="financial-view" id="dashboard" role="tabpanel" tabIndex="0" aria-labelledby="group-dashboard-title">
    <div className="finance-view-heading"><h2 id="group-dashboard-title">{translate("groupFinances", "Group finances")}</h2><p>{translate("groupFinancesCopy", "Group totals are shown without individual member records.")}</p></div>
    <p className="finance-data-notice" role="status" aria-live="polite" hidden={!error}>{error}</p>
    <div className="finance-view-layout">
      <div className="group-finance-summary" aria-label="Group financial totals">
        <article className="finance-summary-card"><span>This month’s contributions</span><strong>{total(data.contributions)}</strong></article>
        <article className="finance-summary-card"><span>Outstanding loans</span><strong>{total(data.outstanding)}</strong></article>
        <article className="finance-summary-card"><span>Group balance</span><strong>{total(data.balance)}</strong></article>
        <article className="finance-summary-card"><span>Active members</span><strong>{summary ? Number(data.memberCount || 0).toLocaleString("en-KE") : "Loading…"}</strong></article>
      </div>
      <div className="finance-table-grid">
        {["balanceHistory", "contributionHistory", "loanApprovalHistory", "groupLoanBalances", "investmentHistory", "fineHistory", "expenseHistory", "groupArrears"].map((key, index) => {
          const labels = ["Chama balance", "Monthly contributions", "Loan amounts approved each month", "Group loan balance", "Share capital by month", "Penalties by month", "Expenses by month", "Group arrears"];
          const titleKeys = ["balance", "contributionHistory", "loanApprovalHistory", "groupLoanBalances", "shareCapitalToDate", "penaltiesToDate", "expensesToDate", "groupArrears"];
          const headingIds = ["group-balance-title", "group-contributions-title", "group-loans-title", "group-loan-balances-title", "group-investments-title", "group-fines-title", "group-expenses-title", "group-arrears-title"];
          return <section className="finance-section" aria-labelledby={headingIds[index]} key={key}><h3 id={headingIds[index]}>{translate(titleKeys[index], labels[index])}</h3>
            <FinanceTable caption={translate(key, labels[index])} headings={[monthLabel, amountLabel]} emptyMessage={emptyMessage} rows={[]} />
          </section>;
        })}
      </div>
      <aside className="finance-chart-section" aria-labelledby="group-chart-title"><h3 id="group-chart-title">Group monthly financial trends (KES)</h3><TrendChart months={months} series={series} label="Monthly financial trends for the last six months" /></aside>
    </div>
  </section>;
}

export default function FinancialOverview({ financeTarget }) {
  const [view, setView] = useState("you");
  const [transactions, setTransactions] = useState([]);
  const [personal, setPersonal] = useState(null);
  const [group, setGroup] = useState(null);
  const [personalError, setPersonalError] = useState("");
  const [groupError, setGroupError] = useState("");
  const [overviewVisible, setOverviewVisible] = useState(true);
  const [, setLanguageVersion] = useState(0);
  const months = useMemo(() => financialMonths(), []);

  useEffect(() => {
    let activeController;
    const updateDashboard = event => {
      const detail = event.detail || {};
      setTransactions(Array.isArray(detail.transactions) ? detail.transactions : []);
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      Promise.allSettled([
        fetchFinanceSummary("/api/profile/summary", globalThis.fetch, controller.signal),
        fetchFinanceSummary("/api/summary", globalThis.fetch, controller.signal),
      ]).then(([personalResult, groupResult]) => {
        if (controller.signal.aborted) return;
        if (personalResult.status === "fulfilled") { setPersonal(personalResult.value); setPersonalError(""); }
        else { if (personalResult.reason?.status === 401) window.dispatchEvent(new Event("chama:session-ended")); setPersonalError("Your financial details could not load. Try refreshing the page."); }
        if (groupResult.status === "fulfilled") { setGroup(groupResult.value); setGroupError(""); }
        else { if (groupResult.reason?.status === 401) window.dispatchEvent(new Event("chama:session-ended")); setGroupError("Group financial totals could not load. Try refreshing the page."); }
      }).catch(() => {});
    };
    const selectView = event => { if (event.detail?.view === "you" || event.detail?.view === "group") setView(event.detail.view); };
    const selectPage = event => setOverviewVisible(event.detail?.overview === true);
    const onLanguageChange = () => setLanguageVersion(value => value + 1);
    window.addEventListener("chama:dashboard-state", updateDashboard);
    window.addEventListener("chama:finance-view", selectView);
    window.addEventListener("chama:app-page", selectPage);
    window.addEventListener("languagechange", onLanguageChange);
    return () => {
      window.removeEventListener("chama:dashboard-state", updateDashboard);
      window.removeEventListener("chama:finance-view", selectView);
      window.removeEventListener("chama:app-page", selectPage);
      window.removeEventListener("languagechange", onLanguageChange);
      activeController?.abort();
    };
  }, []);

  function chooseView(next) {
    setView(next);
    window.dispatchEvent(new CustomEvent("chama:financial-tab-selected", { detail: { view: next } }));
  }

  const tabs = <>
    <button className={`dashboard-tab${view === "you" ? " is-active" : ""}`} type="button" role="tab" aria-controls="you-dashboard" aria-selected={view === "you"} tabIndex={view === "you" ? 0 : -1} onClick={() => chooseView("you")}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.5 3.1-5.5 7-5.5s6.2 2 7 5.5" /></svg><span>{translate("youTab", "You")}</span>
    </button>
    <button className={`dashboard-tab${view === "group" ? " is-active" : ""}`} type="button" role="tab" aria-controls="dashboard" aria-selected={view === "group"} tabIndex={view === "group" ? 0 : -1} onClick={() => chooseView("group")}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c.7-3.3 2.6-5 6-5s5.3 1.7 6 5M15 15c3.3-.3 5.2 1.3 6 4" /></svg><span>{translate("groupTab", "Group")}</span>
    </button>
  </>;
  const section = view === "you"
    ? <PersonalView data={personal} transactions={transactions} months={months} error={personalError} />
    : <GroupView summary={group} months={months} error={groupError} />;
  return <>
    {tabs}
    {financeTarget ? createPortal(<div hidden={!overviewVisible}>{section}</div>, financeTarget) : <div hidden={!overviewVisible}>{section}</div>}
  </>;
}
