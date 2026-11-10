export function financialMonths(now = new Date(), count = 6) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find(item => item.type === "year").value);
  const month = Number(parts.find(item => item.type === "month").value);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key, label: date.toLocaleDateString("en-KE", { month: "short", year: "2-digit", timeZone: "UTC" }) };
  });
}

export function monthlyTransactionSeries(transactions, months, label, paymentType, color) {
  const values = Object.fromEntries(months.map(month => [month.key, 0]));
  for (const item of transactions || []) {
    const date = item.date || item.at;
    const key = typeof date === "string" ? date.slice(0, 7) : "";
    if (item.paymentType === paymentType && item.status !== "pending-member" && Object.hasOwn(values, key)) {
      values[key] += Number(item.amount) || 0;
    }
  }
  return { label, color, values: months.map(month => values[month.key]) };
}

export function derivePersonalFinance(data = {}) {
  const contributions = Array.isArray(data.contributions) ? data.contributions : [];
  const fines = Array.isArray(data.fines) ? data.fines : [];
  const loans = [...(data.loans?.ongoing || []), ...(data.loans?.fullyPaid || [])];
  const openLoans = loans.filter(item => item.status === "approved");
  const unpaidFines = fines.filter(item => item.status === "outstanding");
  return {
    contributions: contributions.filter(item => item.status !== "pending-member"),
    fines,
    loans,
    arrears: [
      ...(openLoans.reduce((sum, item) => sum + (Number(item.outstanding) || 0), 0) > 0
        ? [{ label: "Outstanding loans", amount: openLoans.reduce((sum, item) => sum + (Number(item.outstanding) || 0), 0) }]
        : []),
      ...(unpaidFines.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) > 0
        ? [{ label: "Unpaid fines", amount: unpaidFines.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) }]
        : []),
    ],
  };
}

export function deriveGroupTrend(summary = {}, months) {
  const trends = summary.financialTrends || {};
  const positions = new Map((trends.months || []).map((month, index) => [month, index]));
  const series = (key, label, color) => ({
    label,
    color,
    values: months.map(month => {
      const index = positions.get(month.key);
      return index === undefined ? 0 : Number(trends[key]?.[index]) || 0;
    }),
  });
  return [
    series("contributions", "Contributions", "#347c62"),
    series("loanRepayments", "Loan repayments", "#bd7b35"),
  ];
}

export async function fetchFinanceSummary(url, fetcher = globalThis.fetch, signal) {
  const response = await fetcher(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { Accept: "application/json", "X-Requested-With": "chama" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  return payload?.data || {};
}
