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
