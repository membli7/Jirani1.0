"use strict";

const loginForm = document.querySelector("#login-form");
const loginNotice = document.querySelector("#login-notice");
const activationForm = document.querySelector("#activation-form");
const activationNotice = document.querySelector("#activation-notice");
const forgotPinView = document.querySelector("#forgot-pin-view");

async function postJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "chama"
    },
    body: JSON.stringify(data)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "The request could not be completed. Please try again.");
  return result;
}

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  loginNotice.hidden = true;
  loginNotice.textContent = "";

  try {
    const result = await postJson("/api/login", Object.fromEntries(new FormData(loginForm)));
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

activationForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = activationForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  activationNotice.hidden = true;
  activationNotice.textContent = "";

  try {
    const result = await postJson("/api/invitations/activate", Object.fromEntries(new FormData(activationForm)));
    activationForm.reset();
    activationForm.hidden = true;
    loginForm.hidden = false;
    loginNotice.textContent = result.message || "Account activated. Please sign in.";
    loginNotice.hidden = false;
  } catch (error) {
    activationNotice.textContent = error instanceof TypeError
      ? "Cannot reach the server. Check that it is running, then try again."
      : error.message;
    activationNotice.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#show-activate")?.addEventListener("click", () => {
  loginForm.hidden = true;
  forgotPinView.hidden = true;
  activationForm.hidden = false;
});
document.querySelector("#show-login")?.addEventListener("click", () => {
  activationForm.hidden = true;
  loginForm.hidden = false;
});
document.querySelector("#show-forgot-pin")?.addEventListener("click", () => {
  loginForm.hidden = true;
  activationForm.hidden = true;
  forgotPinView.hidden = false;
});
document.querySelector("#forgot-pin-back")?.addEventListener("click", () => {
  forgotPinView.hidden = true;
  loginForm.hidden = false;
});

const pinInput = document.querySelector("#login-pin");
const togglePinButton = document.querySelector("#toggleLoginPin");
togglePinButton?.addEventListener("click", () => {
  const show = pinInput.type === "password";
  pinInput.type = show ? "text" : "password";
  togglePinButton.setAttribute("aria-pressed", String(show));
  togglePinButton.setAttribute("aria-label", show ? "Hide PIN" : "Show PIN");
});
