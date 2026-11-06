"use strict";
(() => {
  const form = document.querySelector("#contact-form");
  const submitButton = document.querySelector("#contact-submit");
  const buttonLabel = submitButton?.querySelector('[data-i18n="contactSubmitLabel"]');
  const feedback = document.querySelector("#contact-feedback");
  if (!form || !submitButton || !buttonLabel || !feedback) return;

  const translate = text => window.jiraniI18n?.translateText(text) || text;
  const showFeedback = (key, state) => {
    feedback.textContent = translate(key);
    feedback.dataset.state = state;
    feedback.hidden = false;
  };

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    form.setAttribute("aria-busy", "true");
    buttonLabel.textContent = translate("Sending…");
    feedback.hidden = true;
    delete feedback.dataset.state;

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "chama"
        },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });

      if (!response.ok) {
        if (response.status === 429) showFeedback("Too many messages were sent. Please try again later.", "error");
        else if (response.status === 502 || response.status === 503) showFeedback("Email delivery is temporarily unavailable. Please try again later or email us directly.", "error");
        else showFeedback("Please review the required fields and try again.", "error");
        return;
      }

      form.reset();
      showFeedback("Your message has been sent. Thanks for contacting us.", "success");
    } catch {
      showFeedback("We couldn’t send your message just now. Please try again or email us directly.", "error");
    } finally {
      submitButton.disabled = false;
      form.removeAttribute("aria-busy");
      buttonLabel.textContent = translate("Send message");
    }
  });
})();
