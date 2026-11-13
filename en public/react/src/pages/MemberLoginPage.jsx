import { useEffect, useRef, useState } from "react";
import { activateInvitation, requestPinReset, resetPin, signIn, signInWithPasskey } from "../authActions.mjs";

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

function messageFor(error) {
  return translate(error instanceof TypeError
    ? "Cannot reach the server. Check that it is running, then try again."
    : error.message);
}

export default function MemberLoginPage() {
  const rootRef = useRef(null);
  const loginFormRef = useRef(null);
  const activationFormRef = useRef(null);
  const forgotFormRef = useRef(null);
  const resetFormRef = useRef(null);
  const searchParams = new URLSearchParams(window.location.search);
  const [view, setView] = useState(searchParams.get("activation") === "1" ? "activate" : "login");
  const [loginNotice, setLoginNotice] = useState("");
  const [activationNotice, setActivationNotice] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [resetFormVisible, setResetFormVisible] = useState(false);
  const [chamaChoices, setChamaChoices] = useState([]);
  const [pinVisible, setPinVisible] = useState(false);
  const [busy, setBusy] = useState("");
  const switchChama = searchParams.get("switch-chama") === "1";

  useEffect(() => {
    document.title = "Member login | Jirani Chama";
    document.body.className = "";
    const applyTranslations = () => window.jiraniI18n?.apply(rootRef.current || document.documentElement);
    applyTranslations();
    window.addEventListener("languagechange", applyTranslations);
    return () => window.removeEventListener("languagechange", applyTranslations);
  }, []);

  useEffect(() => {
    window.jiraniI18n?.apply(rootRef.current || document.documentElement);
  }, [view, loginNotice, activationNotice, recoveryNotice, resetFormVisible, chamaChoices.length, busy]);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy("login");
    setLoginNotice("");
    try {
      const values = Object.fromEntries(new FormData(loginFormRef.current).entries());
      const result = await signIn(values, window.fetch.bind(window));
      if (Array.isArray(result.chooseChamaId)) {
        setChamaChoices(result.chooseChamaId);
        setLoginNotice(translate("Select your chama, then sign in again."));
        return;
      }
      window.location.assign("/");
    } catch (error) {
      setLoginNotice(messageFor(error));
      } finally {
      setBusy("");
    }
  }

  async function handlePasskeyLogin() {
    setBusy("passkey");
    setLoginNotice("");
    try {
      await signInWithPasskey(window.fetch.bind(window));
      window.location.assign("/");
    } catch (error) {
      setLoginNotice(messageFor(error));
    } finally {
      setBusy("");
    }
  }

  async function handleActivation(event) {
    event.preventDefault();
    setBusy("activation");
    setActivationNotice("");
    try {
      const values = Object.fromEntries(new FormData(activationFormRef.current).entries());
      const result = await activateInvitation(values, window.fetch.bind(window));
      activationFormRef.current?.reset();
      setView("login");
      setLoginNotice(translate(result.message || "Account activated. Please sign in."));
    } catch (error) {
      setActivationNotice(messageFor(error));
    } finally {
      setBusy("");
    }
  }

  async function handlePinRequest(event) {
    event.preventDefault();
    setBusy("recovery");
    try {
      const values = Object.fromEntries(new FormData(forgotFormRef.current).entries());
      const result = await requestPinReset(values, window.fetch.bind(window));
      setRecoveryNotice(translate(result.message));
      setResetFormVisible(true);
    } catch (error) {
      setRecoveryNotice(messageFor(error));
    } finally {
      setBusy("");
    }
  }

  async function handlePinReset(event) {
    event.preventDefault();
    setBusy("reset");
    try {
      const values = Object.fromEntries(new FormData(resetFormRef.current).entries());
      const email = new FormData(forgotFormRef.current).get("email");
      const result = await resetPin(values, email, window.fetch.bind(window));
      resetFormRef.current?.reset();
      forgotFormRef.current?.reset();
      setResetFormVisible(false);
      setView("login");
      setLoginNotice(translate(result.message));
    } catch (error) {
      setRecoveryNotice(messageFor(error));
    } finally {
      setBusy("");
    }
  }

  function showForgotPin() {
    setView("forgot");
    setResetFormVisible(false);
    setRecoveryNotice("");
  }

  function returnFromRecovery() {
    forgotFormRef.current?.reset();
    resetFormRef.current?.reset();
    setResetFormVisible(false);
    setRecoveryNotice("");
    setView("login");
  }

  return (
    <div className="react-auth-page" ref={rootRef}>
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
            <h1 id="login-page-title">{switchChama ? "Switch chama" : "Member login"}</h1>
            <p className="login-intro">Keep contributions, loans, and group decisions together in one secure place.</p>
          </section>
          <section className="auth-page-forms" aria-label="Member login">
            <form id="login-form" className="login-card" ref={loginFormRef} onSubmit={handleLogin} hidden={view !== "login"}>
              <h2 id="login-form-title">{switchChama ? "Choose a chama" : "Welcome back"}</h2>
              <p id="login-form-copy">{switchChama ? "Sign in again to choose a chama linked to your phone number." : "Sign in with your Kenyan mobile number and PIN."}</p>
              <p className="login-notice" id="login-notice" role="alert" aria-live="assertive" hidden={!loginNotice}>{loginNotice}</p>
              <label className="field" htmlFor="login-phone">Phone number
                <input id="login-phone" name="phone" type="tel" autoComplete="tel" required />
              </label>
              <label className="field" htmlFor="login-pin">PIN
                <div className="pin-field-wrap">
                  <input id="login-pin" name="pin" type={pinVisible ? "text" : "password"} inputMode="numeric" autoComplete="current-password" required />
                  <button type="button" className="toggle-pin-btn" id="toggleLoginPin" aria-label={pinVisible ? "Hide PIN" : "Show PIN"} aria-pressed={pinVisible} onClick={() => setPinVisible(value => !value)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </label>
              {chamaChoices.length > 0 && (
                <label className="field" htmlFor="login-chama">Choose your chama
                  <select id="login-chama" name="chamaId" required defaultValue="">
                    <option value="">Select a chama</option>
                    {chamaChoices.map(chama => <option key={chama.chamaId} value={chama.chamaId}>{chama.name}</option>)}
                  </select>
                </label>
              )}
              <button className="panel-link forgot-pin-link" id="show-forgot-pin" type="button" onClick={showForgotPin}>Forgot PIN?</button>
              <button className="button-primary" type="submit" disabled={busy === "login" || busy === "passkey"}>{busy === "login" ? "Signing in…" : "Sign in"}</button>
              {!switchChama && (
                <>
                  <button className="button-primary" id="passkey-login" type="button" onClick={handlePasskeyLogin} disabled={busy !== ""}>
                    {busy === "passkey" ? "Waiting for passkey…" : "Sign in with a passkey"}
                  </button>
                  <p className="field-help">Your device may ask for a fingerprint, face unlock, device PIN, or another configured authenticator. You can always sign in with your PIN.</p>
                </>
              )}
              <button className="panel-link" id="show-activate" type="button" onClick={() => setView("activate")}>Activate invitation</button>
              <p className="login-footer">Your chama’s records are available to you after sign-in.</p>
            </form>
            <form id="activation-form" className="login-card" ref={activationFormRef} onSubmit={handleActivation} hidden={view !== "activate"}>
              <h2>Activate account</h2>
              <p className="form-note"><span data-i18n="policyReviewPrompt">Before entering your details, review:</span>{" "}<a href="/terms.html" target="_blank" rel="noopener noreferrer" data-i18n="termsAndConditions">Terms and Conditions</a> · <a href="/privacy.html" target="_blank" rel="noopener noreferrer" data-i18n="privacyNotice">Privacy Notice</a></p>
              <p className="login-notice" id="activation-notice" role="alert" aria-live="assertive" hidden={!activationNotice}>{activationNotice}</p>
              <label className="field" htmlFor="activate-phone">Phone number<input id="activate-phone" name="phone" type="tel" required /></label>
              <label className="field" htmlFor="activate-code">Activation code<input id="activate-code" name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
              <label className="field" htmlFor="activate-pin">Choose a 6–12 digit PIN<input id="activate-pin" name="pin" type="password" inputMode="numeric" autoComplete="new-password" minLength={6} maxLength={12} pattern="[0-9]{6,12}" required /></label>
              <label className="terms-acceptance" htmlFor="activate-terms-accepted">
                <input id="activate-terms-accepted" name="termsAccepted" type="checkbox" value="true" required />
                <span><span data-i18n="termsAcceptanceLead">I have read and agree to the</span>{" "}<a href="/terms.html" target="_blank" rel="noopener noreferrer" data-i18n="termsAndConditions">Terms and Conditions</a></span>
              </label>
              <label className="terms-acceptance" htmlFor="activate-privacy-acknowledged">
                <input id="activate-privacy-acknowledged" name="privacyNoticeAcknowledged" type="checkbox" value="true" required />
                <span><span data-i18n="privacyAcknowledgementLead">I acknowledge that I have read the</span>{" "}<a href="/privacy.html" target="_blank" rel="noopener noreferrer" data-i18n="privacyNotice">Privacy Notice</a><br /><span data-i18n="privacyAcknowledgementNote">This confirms receipt of the notice; it is not consent to unrelated processing.</span></span>
              </label>
              <button className="button-primary" type="submit" disabled={busy === "activation"}>{busy === "activation" ? "Activating…" : "Activate"}</button>
              <button className="panel-link" id="show-login" type="button" onClick={() => setView("login")}>Back to sign in</button>
            </form>
            <section id="forgot-pin-view" className="login-card recovery-card" hidden={view !== "forgot"}>
              <h2>Forgot PIN?</h2>
              <p>Enter the email address saved on your account. If it matches an active account, we will send a PIN reset code.</p>
              <p className="login-notice" id="forgot-pin-notice" role="alert" aria-live="assertive" hidden={!recoveryNotice}>{recoveryNotice}</p>
              <form id="forgot-pin-form" ref={forgotFormRef} onSubmit={handlePinRequest}>
                <label className="field" htmlFor="forgot-pin-email">Email address<input id="forgot-pin-email" name="email" type="email" autoComplete="email" required /></label>
                <button className="button-primary" type="submit" disabled={busy === "recovery"}>{busy === "recovery" ? "Sending…" : "Send reset code"}</button>
              </form>
              <form id="reset-pin-form" ref={resetFormRef} onSubmit={handlePinReset} hidden={!resetFormVisible}>
                <label className="field" htmlFor="reset-pin-code">Reset code<input id="reset-pin-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>
                <label className="field" htmlFor="reset-pin-new">New 6–12 digit PIN<input id="reset-pin-new" name="newPin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required /></label>
                <button className="button-primary" type="submit" disabled={busy === "reset"}>{busy === "reset" ? "Resetting…" : "Reset PIN"}</button>
              </form>
              <button className="panel-link" id="forgot-pin-back" type="button" onClick={returnFromRecovery}>Back to sign in</button>
            </section>
            <p className="auth-page-links">Starting a new group? <a href="/register.html">Register a new chama</a></p>
            <p className="auth-page-links"><a href="/">Back to home</a></p>
          </section>
        </div>
      </main>
    </div>
  );
}
