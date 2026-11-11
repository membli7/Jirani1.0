import { useMemo, useRef, useState } from "react";
import { calculateDividendCycle, commitDividendCycle } from "../adminFinanceActions.mjs";

function translate(text, key) {
  const catalog = window.jiraniI18n;
  const byKey = key ? catalog?.t(key) : null;
  return byKey && byKey !== key ? byKey : catalog?.translateText(text) || text;
}

function money(value) {
  return value === null || value === undefined ? "Private" : `KES ${Number(value).toLocaleString("en-KE")}`;
}

export default function DividendsPanel() {
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owner = useRef({});
  const formRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState({ text: "", error: false });

  function handleInput() {
    setPreview(null);
  }

  async function handleCalculate(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    const input = {
      cycleStartDate: values.cycleStartDate,
      cycleEndDate: values.cycleEndDate,
      adminExpenses: Number(values.adminExpenses),
    };
    setPreview(null);
    setNotice({ text: "", error: false });
    setPending("calculate");
    try {
      const response = await calculateDividendCycle(writer, owner.current, input);
      setPreview({ input, data: response.data });
      setNotice({ text: response.message || "Dividend preview. Nothing has been paid out yet.", error: false });
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setNotice({ text: error?.uncertain ? window.chamaWriteRequests.unconfirmedMessage("dividends") : error.message, error: true });
    } finally {
      setPending("");
    }
  }

  async function handleCommit() {
    if (!preview || preview.data.overlapsCommitted || pending) return;
    setPending("commit");
    setNotice({ text: "", error: false });
    try {
      const response = await commitDividendCycle(writer, owner.current, preview.input, preview.data.payouts);
      setPreview(null);
      formRef.current?.reset();
      setNotice({ text: response.message || "Dividends added to share capital.", error: false });
      window.dispatchEvent(new window.CustomEvent("chama:dashboard-refresh-requested"));
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setNotice({ text: error?.uncertain ? window.chamaWriteRequests.unconfirmedMessage("dividends") : error.message, error: true });
    } finally {
      setPending("");
    }
  }

  const data = preview?.data;
  const payoutRows = Array.isArray(data?.payouts) ? data.payouts : [];

  return <>
    <div className="panel-heading"><div>
      <h2 id="dividend-title">{translate("Dividends")}</h2>
      <p>{translate("Preview each member's pro-rata share of a cycle's interest and penalties, after admin expenses. Nothing is paid out until you commit.", "dividendExplanation")}</p>
    </div></div>
    <form id="dividend-form" className="form-body" ref={formRef} onSubmit={handleCalculate} onInput={handleInput}>
      <label className="field" htmlFor="dividend-start">{translate("Cycle start", "cycleStart")}<input id="dividend-start" name="cycleStartDate" type="date" required disabled={Boolean(pending)} /></label>
      <label className="field" htmlFor="dividend-end">{translate("Cycle end", "cycleEnd")}<input id="dividend-end" name="cycleEndDate" type="date" required disabled={Boolean(pending)} /></label>
      <label className="field" htmlFor="dividend-expenses">{translate("Admin expenses (KES)", "adminExpensesKes")}<input id="dividend-expenses" name="adminExpenses" type="number" min="0" step="1" required disabled={Boolean(pending)} /></label>
      <button className="button-primary" type="submit" disabled={Boolean(pending)}>{translate(pending === "calculate" ? "Calculating…" : "Calculate")}</button>
    </form>
    {data && <div id="dividend-preview" aria-live="polite">
      <p className="form-note">{translate("Interest")} {money(data.interestIncome)} {translate("and penalties")} {money(data.penaltyIncome)}, {translate("less admin expenses")} {money(data.adminExpenses)}, {translate("leave a pool of")} <strong>{money(data.distributablePool)}</strong>. {translate("Total share capital:")} {money(data.totalShareCapital)}.{data.overlapsCommitted ? ` ${translate("This cycle overlaps a dividend already paid out, so it cannot be committed.")}` : ""}</p>
      <div className="table-wrap"><table>
        <thead><tr><th>{translate("Member")}</th><th>{translate("Share capital")}</th><th>{translate("Dividend")}</th></tr></thead>
        <tbody>{payoutRows.map(item => <tr key={item.memberId}>
          <td>{item.name}</td><td>{money(item.shareCapital)}</td><td>{money(item.dividend)}</td>
        </tr>)}</tbody>
      </table></div>
      {!data.overlapsCommitted && <div className="form-body">
        <button id="dividend-commit" className="button-primary" type="button" disabled={Boolean(pending)} onClick={handleCommit}>{translate(pending === "commit" ? "Committing…" : "Commit dividends to share capital")}</button>
      </div>}
    </div>}
    {notice.text && <p className={`notice${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"} aria-live="polite">{notice.text}</p>}
  </>;
}
