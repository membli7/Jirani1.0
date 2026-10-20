"use strict";

const loginForm = document.querySelector("#login-form");
const loginNotice = document.querySelector("#login-notice");

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  loginNotice.hidden = true;
  loginNotice.textContent = "";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "chama"
      },
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Could not sign in. Please try again.");
    if (Array.isArray(result.chooseChamaId)) {
      let chamaField = loginForm.querySelector("#login-chama");
      if (!chamaField) {
        const label = document.createElement("label");
        label.className = "field";
        label.htmlFor = "login-chama";
        label.append("Choose your chama");
        chamaField = document.createElement("select");
        chamaField.id = "login-chama";
        chamaField.name = "chamaId";
        chamaField.required = true;
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select a chama";
        chamaField.append(placeholder);
        label.append(chamaField);
        loginForm.insertBefore(label, submitButton);
      }
      for (const option of Array.from(chamaField.options).slice(1)) option.remove();
      for (const chama of result.chooseChamaId) {
        const option = document.createElement("option");
        option.value = chama.chamaId;
        option.textContent = chama.name;
        chamaField.append(option);
      }
      loginNotice.textContent = "Select your chama, then sign in again.";
      loginNotice.hidden = false;
      return;
    }
    window.location.assign("/");
  } catch (error) {
    loginNotice.textContent = error instanceof TypeError
      ? "Cannot reach the server. Check that it is running, then try again."
      : error.message;
    loginNotice.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});
