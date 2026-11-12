import { useEffect, useRef, useState } from "react";
import { registerChama, setupIsOpen } from "../registrationActions.mjs";

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

export default function RegisterPage() {
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showExistingInstance, setShowExistingInstance] = useState(false);
  const checkSetupBeforeShowingForm = new URLSearchParams(window.location.search).get("new-chama") === "1";

  useEffect(() => {
    document.title = "Register a new chama | Jirani Chama";
    document.body.className = "";
    const applyTranslations = () => window.jiraniI18n?.apply(rootRef.current || document.documentElement);
    applyTranslations();
    window.addEventListener("languagechange", applyTranslations);
    return () => window.removeEventListener("languagechange", applyTranslations);
  }, []);

  useEffect(() => {
    window.jiraniI18n?.apply(rootRef.current || document.documentElement);
  }, [notice, showExistingInstance, submitting]);

  useEffect(() => {
    if (!checkSetupBeforeShowingForm) return undefined;
    let active = true;
    setupIsOpen().then(open => {
      if (active && !open) setShowExistingInstance(true);
    }).catch(error => {
      if (!active) return;
      const message = error instanceof TypeError
        ? "Cannot reach the server. Check that it is running, then try again."
        : error.message;
      setNotice(translate(message));
    });
    return () => { active = false; };
  }, [checkSetupBeforeShowingForm]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!formRef.current) return;
    setSubmitting(true);
    setNotice("");
    try {
      const values = Object.fromEntries(new FormData(formRef.current).entries());
      await registerChama(values, {
        fetcher: window.fetch.bind(window),
        navigate: destination => window.location.assign(destination),
      });
    } catch (error) {
      const message = error instanceof TypeError
        ? "Cannot reach the server. Check that it is running, then try again."
        : error.message;
      setNotice(translate(message));
    } finally {
      const bootstrapField = formRef.current?.elements?.namedItem("bootstrapSecret");
      if (bootstrapField) bootstrapField.value = "";
      setSubmitting(false);
    }
  }

  return (
    <div className="react-registration-page" ref={rootRef}>
      <header className="topbar auth-page-topbar">
        <a className="brand" href="/" aria-label="Jirani Chama home">
          <span className="brand-mark" aria-hidden="true"><img src="/brand-mark.svg" alt="" /></span>
          <span>Jirani Chama <small>GROUP SAVINGS</small></span>
        </a>
        <label className="language-control" htmlFor="language-switch" data-i18n="language">Language
          <select id="language-switch" aria-label="Language" data-i18n-aria-label="language" defaultValue="en">
            <option value="en" data-i18n="englishOption">English</option>
            <option value="sw" data-i18n="swahili">Kiswahili</option>
          </select>
        </label>
      </header>
      <main id="auth-page" className="login-overlay">
        <div className="login-content">
          <section className="login-brand">
            <p className="login-eyebrow">Jirani Chama</p>
            <h1>Start a new chama</h1>
            <p className="login-intro">Register your group and create the chairperson account. You will be signed in when setup is complete.</p>
          </section>
          <section className="auth-page-forms" aria-label="New chama registration" data-i18n-aria-label="newChamaRegistration">
            <section id="new-chama-existing-instance" className="login-card" hidden={!showExistingInstance}>
              <h2>This instance is already set up</h2>
              <p>To create a separate chama, open this app on a separate instance connected to an empty database. This instance’s existing records will remain unchanged.</p>
              <a className="button-primary" href="/member-login.html">Sign in to this instance</a>
            </section>
            <form id="register-chama-form" className="login-card" ref={formRef} onSubmit={handleSubmit} hidden={showExistingInstance}>
              <h2>Chama and chairperson details</h2>
              <p>All fields are required. Your PIN must have 6 to 12 digits.</p>
              <p id="register-notice" className="login-notice" role="alert" aria-live="assertive" hidden={!notice}>{notice}</p>
              <label className="field" htmlFor="register-bootstrap-secret" data-i18n="setupBootstrapLabel">Operator bootstrap code (if requested)
                <input id="register-bootstrap-secret" name="bootstrapSecret" type="password" autoComplete="off" maxLength={256} aria-describedby="register-bootstrap-note" spellCheck={false} />
              </label>
              <p id="register-bootstrap-note" className="form-note" data-i18n="setupBootstrapNote">For production setup, enter the code supplied by the operator. It is used only for first-time setup and is not saved with your account.</p>
              <label className="field" htmlFor="register-chama-name">Chama name
                <input id="register-chama-name" name="chamaName" type="text" maxLength={100} autoComplete="organization" required />
              </label>
              <label className="field" htmlFor="register-chairperson-name">Chairperson full name
                <input id="register-chairperson-name" name="name" type="text" maxLength={100} autoComplete="name" required />
              </label>
              <label className="field" htmlFor="register-chairperson-phone">Phone number
                <input id="register-chairperson-phone" name="phone" type="tel" autoComplete="tel" required />
              </label>
              <label className="field" htmlFor="register-chairperson-email">Email address
                <input id="register-chairperson-email" name="email" type="email" maxLength={254} autoComplete="email" required />
              </label>
              <fieldset className="register-rules">
                <legend>Financial rules</legend>
                <p className="form-note">These defaults can be changed for this chama. They are enforced by the server.</p>
                <label className="field" htmlFor="register-deadline-day">Monthly contribution due by day
                  <input id="register-deadline-day" name="deadlineDay" type="number" min={1} max={28} defaultValue={5} required />
                </label>
                <label className="field" htmlFor="register-welfare-fee">Monthly welfare contribution (KES)
                  <input id="register-welfare-fee" name="welfareMonthlyFee" type="number" min={0} step={1} defaultValue={500} required />
                </label>
                <label className="field" htmlFor="register-late-penalty">Late contribution penalty (KES)
                  <input id="register-late-penalty" name="lateContributionPenalty" type="number" min={0} step={1} defaultValue={200} required />
                </label>
                <label className="field" htmlFor="register-loan-rate">Monthly loan interest (%)
                  <input id="register-loan-rate" name="loanMonthlyRatePercent" type="number" min={0} max={100} step={0.1} defaultValue={5} required />
                </label>
              </fieldset>
              <label className="field" htmlFor="register-chairperson-pin">Create PIN
                <input id="register-chairperson-pin" name="pin" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={12} pattern="[0-9]{6,12}" required />
              </label>
              <button className="button-primary" type="submit" disabled={submitting}>{submitting ? "Registering…" : "Register chama"}</button>
              <p className="auth-page-links"><a href="/">Back to home</a> · <a href="/member-login.html" data-i18n="memberLogin">Member Login</a></p>
            </form>
            <section id="register-success" className="login-card" aria-live="polite" hidden>
              <h2>Chama registered</h2>
              <p>Your chairperson account is ready. Continue to your chama dashboard.</p>
              <a className="button-primary" href="/">Open dashboard</a>
            </section>
          </section>
        </div>
      </main>
    </div>
  );
}
