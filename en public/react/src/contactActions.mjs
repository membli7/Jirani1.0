export function submitContact(values, fetcher = globalThis.fetch) {
  return fetcher("/api/contact", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "chama",
    },
    body: JSON.stringify(values),
  });
}
