export async function fetchMonthlyClose(month, fetcher = globalThis.fetch, signal) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ""))) {
    throw new TypeError("Choose a valid review month.");
  }
  const response = await fetcher(`/api/monthly-close?month=${encodeURIComponent(month)}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", "X-Requested-With": "chama" },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  const data = payload?.data;
  if (!data || data.month !== month || !data.totals || !data.exceptions || !Array.isArray(data.entries)) {
    throw new Error("The month-end review response could not be confirmed.");
  }
  return data;
}
