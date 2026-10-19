"use strict";

(function exposeWriteRequests(root, factory) {
  const writeRequests = factory();
  if (typeof module === "object" && module.exports) module.exports = writeRequests;
  if (root) root.chamaWriteRequests = writeRequests;
})(typeof globalThis === "undefined" ? this : globalThis, () => {
  function uuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (!globalThis.crypto?.getRandomValues) throw new Error("Secure random keys are not available in this browser.");
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function errorWithDetails(message, { status, data, uncertain = false } = {}) {
    const error = new Error(message);
    error.status = status;
    error.data = data;
    error.uncertain = uncertain;
    return error;
  }

  function createWriteRequester({ fetchImpl = globalThis.fetch, keyGenerator = uuid, timeoutMs = 30000 } = {}) {
    const pending = new WeakMap();

    async function submit({ owner, path, method = "POST", body, headers = {}, validate }) {
      if (!owner || (typeof owner !== "object" && typeof owner !== "function")) {
        throw new TypeError("A write owner is required to retain its idempotency key for retries.");
      }
      const fingerprint = JSON.stringify([path, method, body]);
      let request = pending.get(owner);
      if (!request || request.fingerprint !== fingerprint) {
        request = { fingerprint, key: keyGenerator() };
        pending.set(owner, request);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response;
        try {
          response = await fetchImpl(path, {
            method,
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": request.key, ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (error) {
          const timedOut = controller.signal.aborted;
          throw errorWithDetails(
            timedOut ? "The request timed out before the server confirmed it." : "The server could not be reached.",
            { uncertain: true },
          );
        }

        let data;
        try {
          data = await response.json();
        } catch {
          throw errorWithDetails("The server response could not be confirmed.", { status: response.status, uncertain: response.ok || response.status >= 500 });
        }
        if (!response.ok) {
          throw errorWithDetails(data?.message || `Request failed (${response.status}).`, {
            status: response.status,
            data,
            uncertain: response.status >= 500,
          });
        }
        if (!data || typeof data !== "object" || Array.isArray(data) || (validate && !validate(data, request.key))) {
          throw errorWithDetails("The server response did not include the saved record.", { status: response.status, data, uncertain: true });
        }
        pending.delete(owner);
        return data;
      } finally {
        clearTimeout(timeout);
      }
    }

    return { submit };
  }

  function unconfirmedMessage(section) {
    return `We couldn't confirm this was saved. Please check the ${section} tab to verify, or try again.`;
  }

  return { createWriteRequester, unconfirmedMessage };
});
