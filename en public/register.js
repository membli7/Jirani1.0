"use strict";

const registrationForm = document.querySelector("#register-chama-form");
const registrationNotice = document.querySelector("#register-notice");
const translateRegistrationText = value => window.jiraniI18n?.translateText(value) || value;

registrationForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = registrationForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  registrationNotice.hidden = true;
  registrationNotice.textContent = "";

  try {
    const formData = Object.fromEntries(new FormData(registrationForm));
    const bootstrapSecret = typeof formData.bootstrapSecret === "string" ? formData.bootstrapSecret : "";
    delete formData.bootstrapSecret;
    formData.deadlineDay = Number(formData.deadlineDay);
    formData.welfareMonthlyFee = Number(formData.welfareMonthlyFee);
    formData.lateContributionPenalty = Number(formData.lateContributionPenalty);
    formData.loanMonthlyRatePercent = Number(formData.loanMonthlyRatePercent);
    const response = await fetch("/api/setup", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "chama",
        ...(bootstrapSecret ? { "X-Setup-Bootstrap-Secret": bootstrapSecret } : {})
      },
      body: JSON.stringify(formData)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && response.status === 409 && result.message === "Initial setup has already been completed.") {
      const loginResponse = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama"
        },
        body: JSON.stringify({ phone: formData.phone, pin: formData.pin })
      });
      const loginResult = await loginResponse.json().catch(() => ({}));
      if (loginResponse.ok && !Array.isArray(loginResult.chooseChamaId)) {
        window.location.assign("/");
        return;
      }
      if (loginResponse.status === 401) {
        throw new Error("This chama is already registered. Sign in with the phone number and PIN used for its Chairperson account.");
      }
      if (Array.isArray(loginResult.chooseChamaId)) {
        window.location.assign("/member-login.html");
        return;
      }
      throw new Error(loginResult.message || "This chama is already registered. Please sign in with its Chairperson account.");
    }
    if (!response.ok) throw new Error(result.message || "Could not register the chama. Please try again.");

    window.location.assign("/");
  } catch (error) {
    registrationNotice.textContent = translateRegistrationText(error instanceof TypeError
      ? "Cannot reach the server. Check that it is running, then try again."
      : error.message);
    registrationNotice.hidden = false;
  } finally {
    const bootstrapField = registrationForm.elements?.namedItem?.("bootstrapSecret");
    if (bootstrapField) bootstrapField.value = "";
    submitButton.disabled = false;
  }
});

if (new URLSearchParams(window.location.search).get("new-chama") === "1") {
  fetch("/api/setup", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
    .then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Could not check whether this instance is ready for setup.");
      return result;
    })
    .then(result => {
      if (result.open) return;
      registrationForm.hidden = true;
      document.querySelector("#new-chama-existing-instance").hidden = false;
    })
    .catch(error => {
      registrationNotice.textContent = translateRegistrationText(error instanceof TypeError
        ? "Cannot reach the server. Check that it is running, then try again."
        : error.message);
      registrationNotice.hidden = false;
    });
}
