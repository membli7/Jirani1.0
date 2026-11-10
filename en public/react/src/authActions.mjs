async function postJson(url, values, fetcher = globalThis.fetch) {
  const response = await fetcher(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
    },
    body: JSON.stringify(values),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "The request could not be completed. Please try again.");
  }
  return result;
}

export function signIn(values, fetcher = globalThis.fetch) {
  return postJson("/api/login", values, fetcher);
}

export function activateInvitation(values, fetcher = globalThis.fetch) {
  return postJson("/api/invitations/activate", values, fetcher);
}

export function requestPinReset(values, fetcher = globalThis.fetch) {
  return postJson("/api/forgot-pin", values, fetcher);
}

export function resetPin(values, email, fetcher = globalThis.fetch) {
  return postJson("/api/reset-pin", { ...values, email }, fetcher);
}
