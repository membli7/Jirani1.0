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

async function requestJson(url, options = {}, fetcher = globalThis.fetch) {
  const response = await fetcher(url, { credentials: "same-origin", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "The request could not be completed. Please try again.");
  }
  return result;
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("This passkey could not be used.");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function getWebAuthnClient() {
  if (typeof window === "undefined" || window.isSecureContext !== true) {
    throw new Error("Passkeys need a compatible browser on HTTPS or localhost. You can still sign in with your PIN.");
  }
  const { client } = await import("@passwordless-id/webauthn");
  if (!client.isAvailable()) throw new Error("Passkeys are not available in this browser. You can still sign in with your PIN.");
  return client;
}

async function runWebAuthnQuietly(operation) {
  const originalDebug = console.debug;
  console.debug = () => {};
  try {
    return await operation();
  } finally {
    console.debug = originalDebug;
  }
}

async function browserPasskeyLogin(client, options) {
  try {
    return await runWebAuthnQuietly(() => client.authenticate({
      challenge: options.challenge,
      domain: options.rpId,
      timeout: options.timeout,
      userVerification: "required",
      hints: ["client-device"],
    }));
  } catch (error) {
    if (error?.name === "NotAllowedError") {
      throw new Error("Passkey sign-in was cancelled or unavailable. Try again or use your PIN.");
    }
    throw error;
  }
}

export function signIn(values, fetcher = globalThis.fetch) {
  return postJson("/api/login", values, fetcher);
}

export async function signInWithPasskey(fetcher = globalThis.fetch) {
  const client = await getWebAuthnClient();
  const options = await postJson("/api/passkeys/login/options", {}, fetcher);
  const assertion = await browserPasskeyLogin(client, options);
  return postJson("/api/passkeys/login/verify", assertion, fetcher);
}

export async function listPasskeys(fetcher = globalThis.fetch) {
  const result = await requestJson("/api/passkeys", {}, fetcher);
  return Array.isArray(result.data) ? result.data : [];
}

export async function enrollPasskey(fetcher = globalThis.fetch) {
  const client = await getWebAuthnClient();
  const options = await postJson("/api/passkeys/registration/options", {}, fetcher);
  const excludeCredentials = (Array.isArray(options.excludeCredentials) ? options.excludeCredentials : []).map(item => ({
    type: "public-key",
    id: decodeBase64Url(item.id),
    transports: Array.isArray(item.transports) ? item.transports : [],
  }));
  let credential;
  try {
    credential = await runWebAuthnQuietly(() => client.register({
      challenge: options.challenge,
      domain: options.rpId,
      timeout: options.timeout,
      user: options.user,
      discoverable: "required",
      userVerification: "required",
      attestation: false,
      hints: ["client-device"],
      customProperties: {
        rp: { id: options.rpId, name: "Jirani Chama" },
        excludeCredentials,
      },
    }));
  } catch (error) {
    if (error?.name === "NotAllowedError" || error?.name === "InvalidStateError") {
      throw new Error("Passkey setup was cancelled or unavailable. You can continue using your PIN.");
    }
    throw error;
  }
  return postJson("/api/passkeys/registration/verify", credential, fetcher);
}

export async function removePasskey(credentialRef, fetcher = globalThis.fetch) {
  return requestJson(`/api/passkeys/${encodeURIComponent(credentialRef)}`, {
    method: "DELETE",
    headers: { "X-Requested-With": "chama" },
  }, fetcher);
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
