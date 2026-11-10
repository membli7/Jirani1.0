export function todayNairobiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Nairobi",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function fetchAttendance(fetcher = globalThis.fetch, signal) {
  const response = await fetcher("/api/attendance", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", "X-Requested-With": "chama" },
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.members) || !Array.isArray(data.registers)) {
    throw new Error("The attendance response could not be confirmed.");
  }
  return data;
}

export function saveAttendance(writeRequester, owner, payload) {
  if (!writeRequester || typeof writeRequester.submit !== "function") {
    return Promise.reject(new TypeError("The shared write requester is unavailable."));
  }
  return writeRequester.submit({
    owner,
    path: "/api/attendance",
    method: "POST",
    body: payload,
  });
}
