"use strict";

const registrationForm = document.querySelector("#register-chama-form");
const registrationNotice = document.querySelector("#register-notice");

registrationForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = registrationForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  registrationNotice.hidden = true;
  registrationNotice.textContent = "";

  try {
    const formData = Object.fromEntries(new FormData(registrationForm));
    formData.deadlineDay = Number(formData.deadlineDay);
    formData.welfareMonthlyFee = Number(formData.welfareMonthlyFee);
    formData.lateContributionPenalty = Number(formData.lateContributionPenalty);
    formData.loanMonthlyRatePercent = Number(formData.loanMonthlyRatePercent);
    const response = await fetch("/api/setup", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "chama"
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
    registrationNotice.textContent = error instanceof TypeError
      ? "Cannot reach the server. Check that it is running, then try again."
      : error.message;
    registrationNotice.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});
