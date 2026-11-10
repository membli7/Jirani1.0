export async function loadChatMessages(fetcher = globalThis.fetch) {
  const response = await fetcher("/api/messages", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = payload;
    throw error;
  }
  if (!Array.isArray(payload?.data)) throw new Error("The server response did not include chat messages.");
  return payload.data.slice(-100);
}

export async function postChatMessage({ text, owner, writeRequester }) {
  const normalized = String(text ?? "").trim();
  if (!normalized || normalized.length > 500) {
    throw new TypeError("Enter a message of 1 to 500 characters.");
  }
  if (!writeRequester?.submit) throw new TypeError("The secure write service is unavailable.");
  return writeRequester.submit({
    owner,
    path: "/api/messages",
    method: "POST",
    body: { text: normalized },
    validate: response => Boolean(response?.data && typeof response.data.id === "string"),
  });
}
