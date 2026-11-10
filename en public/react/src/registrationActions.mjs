const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json",
  "X-Requested-With": "chama",
});

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export async function setupIsOpen(fetcher = globalThis.fetch) {
  const response = await fetcher("/api/setup", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(result.message || "Could not check whether this instance is ready for setup.");
  }
  return Boolean(result.open);
}

export async function registerChama(values, {
  fetcher = globalThis.fetch,
  navigate = destination => globalThis.window.location.assign(destination),
} = {}) {
  const payload = { ...values };
  const bootstrapSecret = typeof payload.bootstrapSecret === "string" ? payload.bootstrapSecret : "";
  delete payload.bootstrapSecret;
  for (const field of ["deadlineDay", "welfareMonthlyFee", "lateContributionPenalty", "loanMonthlyRatePercent"]) {
    payload[field] = Number(payload[field]);
  }

  const response = await fetcher("/api/setup", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...JSON_HEADERS,
      ...(bootstrapSecret ? { "X-Setup-Bootstrap-Secret": bootstrapSecret } : {}),
    },
    body: JSON.stringify(payload),
  });
  const result = await readJson(response);

  if (!response.ok && response.status === 409 && result.message === "Initial setup has already been completed.") {
    const loginResponse = await fetcher("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: JSON_HEADERS,
      body: JSON.stringify({ phone: payload.phone, pin: payload.pin }),
    });
    const loginResult = await readJson(loginResponse);
    if (loginResponse.ok && !Array.isArray(loginResult.chooseChamaId)) {
      navigate("/");
      return;
    }
    if (loginResponse.status === 401) {
      throw new Error("This chama is already registered. Sign in with the phone number and PIN used for its Chairperson account.");
    }
    if (Array.isArray(loginResult.chooseChamaId)) {
      navigate("/member-login.html");
      return;
    }
    throw new Error(loginResult.message || "This chama is already registered. Please sign in with its Chairperson account.");
  }

  if (!response.ok) throw new Error(result.message || "Could not register the chama. Please try again.");
  navigate("/");
}
