import { useMemo, useRef, useState } from "react";
import { assessMonthlyPenalties } from "../adminFinanceActions.mjs";

function translate(text, key) {
  const catalog = window.jiraniI18n;
  const byKey = key ? catalog?.t(key) : null;
  return byKey && byKey !== key ? byKey : catalog?.translateText(text) || text;
}

export default function PenaltyPanel() {
  const writer = useMemo(() => window.chamaWriteRequests.createWriteRequester(), []);
  const owner = useRef({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState({ text: "", error: false });
  const [result, setResult] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const month = new FormData(form).get("month");
    setPending(true);
    setNotice({ text: "", error: false });
    try {
      const response = await assessMonthlyPenalties(writer, owner.current, month);
      const names = response.data.assessed.map(item => item.memberName);
      setResult(names.length ? `Penalised for ${response.data.month}: ${names.join(", ")}.` : `No members to penalise for ${response.data.month}.`);
      setNotice({ text: response.message || "Monthly penalties assessed.", error: false });
      window.dispatchEvent(new window.CustomEvent("chama:dashboard-refresh-requested"));
    } catch (error) {
      if (error?.status === 401) window.dispatchEvent(new Event("chama:session-ended"));
      setNotice({ text: error?.uncertain ? window.chamaWriteRequests.unconfirmedMessage("penalties") : error.message, error: true });
    } finally {
      setPending(false);
    }
  }

  return <>
    <div className="panel-heading"><div>
      <h2 id="penalty-title">{translate("Monthly penalties")}</h2>
      <p>{translate("After the configured deadline, active members who have not met the chama's configured welfare contribution may be charged the configured penalty.", "penaltyExplanation")}</p>
    </div></div>
    <form id="penalty-form" className="form-body" onSubmit={handleSubmit}>
      <label className="field" htmlFor="penalty-month">{translate("Month")}<input id="penalty-month" name="month" type="month" required disabled={pending} /></label>
      <button className="button-primary" type="submit" disabled={pending}>{translate(pending ? "Assessing…" : "Assess monthly penalties")}</button>
    </form>
    {result && <p id="penalty-result" className="form-note" role="status" aria-live="polite">{result}</p>}
    {notice.text && <p className={`notice${notice.error ? " error" : ""}`} role={notice.error ? "alert" : "status"} aria-live="polite">{notice.text}</p>}
  </>;
}
