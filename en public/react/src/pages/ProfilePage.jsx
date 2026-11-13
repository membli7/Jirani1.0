import { useEffect, useMemo, useRef, useState } from "react";
import { profileModeFromSearch } from "../profileMode.mjs";
import PushNotificationSettings from "../components/PushNotificationSettings.jsx";
import PwaInstallButton from "../components/PwaInstallButton.jsx";
import { enrollPasskey, listPasskeys, removePasskey } from "../authActions.mjs";

const EMPTY_PROFILE = { firstName: "", lastName: "", nickname: "", phone: "", email: "" };
const PROFILE_FIELDS = Object.keys(EMPTY_PROFILE);
const PHOTO_SIZES = [32, 180, 192, 512];

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

async function readJson(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (response.status === 401) {
    window.location.assign("/");
    throw new Error("Your session has expired. Sign in again to edit your profile.");
  }
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status}).`);
  return body;
}

async function createPng(file, size) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("This browser cannot prepare the profile photo.");
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not convert the selected image."));
    }, "image/png"));
  } finally {
    bitmap.close?.();
  }
}

function idempotencyKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function PasskeySettings() {
  const [passkeys, setPasskeys] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    listPasskeys(window.fetch.bind(window))
      .then(items => { if (mounted) setPasskeys(items); })
      .catch(problem => { if (mounted) { setNotice(problem.message); setError(true); } })
      .finally(() => { if (mounted) setLoaded(true); });
    return () => { mounted = false; };
  }, []);

  function displayDate(value) {
    const date = value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not yet used";
  }

  async function handleAdd() {
    setBusy("add");
    setNotice("");
    setError(false);
    try {
      const result = await enrollPasskey(window.fetch.bind(window));
      setNotice(result.message || "Passkey added.");
      setPasskeys(await listPasskeys(window.fetch.bind(window)));
    } catch (problem) {
      setNotice(problem.message || "Could not add a passkey.");
      setError(true);
    } finally {
      setBusy("");
    }
  }

  async function handleRemove(credentialRef) {
    setBusy(credentialRef);
    setNotice("");
    setError(false);
    try {
      const result = await removePasskey(credentialRef, window.fetch.bind(window));
      setNotice(result.message || "Passkey removed.");
      setPasskeys(await listPasskeys(window.fetch.bind(window)));
    } catch (problem) {
      setNotice(problem.message || "Could not remove that passkey.");
      setError(true);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="profile-section passkey-settings" aria-labelledby="passkey-settings-title">
      <h2 id="passkey-settings-title">Passkeys</h2>
      <p>Use a saved passkey to sign in without entering your phone number and PIN.</p>
      <p className="field-help">Your browser/device chooses its configured authenticator, such as fingerprint, face unlock, device PIN, or another method; this site cannot force fingerprint. Adding or removing a passkey requires signing in with your current PIN within the last 10 minutes.</p>
      <button className="button-primary" type="button" onClick={handleAdd} disabled={busy !== ""}>
        {busy === "add" ? "Waiting for your device…" : "Add a passkey"}
      </button>
      {loaded && passkeys.length > 0 && (
        <ul className="passkey-list">
          {passkeys.map(item => (
            <li key={item.id}>
              <span><strong>{item.label}</strong><br />Added {displayDate(item.createdAt)} · Last used {displayDate(item.lastUsedAt)}</span>
              <button className="panel-link" type="button" onClick={() => handleRemove(item.id)} disabled={busy !== ""} aria-label={`Remove ${item.label}`}>
                {busy === item.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loaded && passkeys.length === 0 && !error && <p className="field-help">No passkeys saved for this account yet.</p>}
      <p className={`form-notice${error ? " error" : ""}`} role="status" aria-live="polite">{notice}</p>
    </section>
  );
}

export default function ProfilePage() {
  const { viewOnly, editMode } = useMemo(() => profileModeFromSearch(window.location.search), []);
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const photoInputRef = useRef(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [editing, setEditing] = useState(editMode);
  const [saving, setSaving] = useState(false);
  const [detailsStatus, setDetailsStatus] = useState("");
  const [detailsError, setDetailsError] = useState(false);
  const [photoStatus, setPhotoStatus] = useState("");
  const [photoError, setPhotoError] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const writeRequester = useMemo(() => window.chamaWriteRequests?.createWriteRequester(), []);

  useEffect(() => {
    const previousBodyClass = document.body.className;
    document.body.className = "profile-page";
    let active = true;

    const updateTitle = () => {
      const language = window.jiraniI18n?.getLanguage?.() || "en";
      const title = translate(viewOnly ? "View profile" : "Edit profile");
      document.title = viewOnly || language === "sw" ? title : `${title} | Jirani Chama`;
    };
    const applyTranslations = () => {
      window.jiraniI18n?.apply(rootRef.current || document.documentElement);
      updateTitle();
    };
    applyTranslations();
    window.addEventListener("languagechange", applyTranslations);

    const loadProfile = async () => {
      const sessionResponse = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
      const session = await readJson(sessionResponse);
      if (!session.authenticated) {
        window.location.assign("/");
        return;
      }
      const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
      const body = await readJson(response);
      if (!body.data) throw new Error("The server did not return profile details.");
      if (!active) return;
      setProfile(Object.fromEntries(PROFILE_FIELDS.map(name => [name, body.data[name] || ""])));
      setPhotoUrl("/api/profile/photo/180");
    };
    void loadProfile().catch(error => {
      if (!active) return;
      setDetailsError(true);
      setDetailsStatus(translate(error.message));
    });

    return () => {
      active = false;
      window.removeEventListener("languagechange", applyTranslations);
      document.body.className = previousBodyClass;
    };
  }, [viewOnly]);

  useEffect(() => {
    window.jiraniI18n?.apply(rootRef.current || document.documentElement);
  }, [editing, detailsStatus, photoStatus, photoUrl, photoLoaded, photoBusy]);

  async function handleSave(event) {
    event.preventDefault();
    const form = formRef.current;
    if (!form?.reportValidity()) return;
    if (!writeRequester) {
      setDetailsError(true);
      setDetailsStatus("The profile request helper is unavailable.");
      return;
    }
    setSaving(true);
    setDetailsError(false);
    setDetailsStatus(translate("Saving profile details…"));
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      const result = await writeRequester.submit({
        owner: form,
        path: "/api/profile",
        method: "PUT",
        body,
        validate: response => !!response.data,
      });
      setProfile(Object.fromEntries(PROFILE_FIELDS.map(name => [name, result.data[name] || ""])));
      setEditing(false);
      setDetailsStatus(translate(result.message || "Profile details saved."));
    } catch (error) {
      setDetailsError(true);
      setDetailsStatus(translate(error.message));
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(false);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
      setPhotoStatus(translate("Preparing profile icons…"));
      for (const [index, size] of PHOTO_SIZES.entries()) {
        const png = await createPng(file, size);
        const response = await fetch(`/api/profile/photo/${size}`, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "image/png",
            "X-Requested-With": "chama",
            "Idempotency-Key": idempotencyKey(),
          },
          body: png,
        });
        await readJson(response);
        setPhotoStatus(`${translate("Uploading profile icons…")} ${index + 1}/${PHOTO_SIZES.length}`);
      }
      setPhotoLoaded(false);
      setPhotoUrl(`/api/profile/photo/180?refresh=${Date.now()}`);
      setPhotoStatus(translate("Profile photo saved."));
    } catch (error) {
      setPhotoError(true);
      setPhotoStatus(translate(error.message));
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = "";
      setPhotoBusy(false);
    }
  }

  return (
    <div className="react-profile-page" ref={rootRef}>
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
      <main className="profile-shell">
        <a className="panel-link" href="/" data-i18n="backDashboard">← Back to dashboard</a>
        <section className="panel profile-card" aria-labelledby="profile-title">
          <h1 id="profile-title" data-i18n={viewOnly ? undefined : "editProfileTitle"}>{viewOnly ? translate("View profile") : "Edit profile"}</h1>
          <p data-i18n={viewOnly ? undefined : "profileIntro"}>
            {viewOnly ? translate("Your contact details and profile photo.") : "Update your contact details and upload one photo. Jirani Chama creates the browser, iPhone, Android, and large fallback icon sizes for you."}
          </p>
          <form id="profile-details-form" className="profile-details-form" ref={formRef} onSubmit={handleSave}>
            <fieldset id="profile-details-fields" disabled={!editing || viewOnly}>
              <legend className="sr-only" data-i18n="profileDetails">Profile details</legend>
              <div className="profile-fields">
                <label className="field" htmlFor="profile-first-name" data-i18n="firstName">First name<input id="profile-first-name" name="firstName" maxLength={50} required value={profile.firstName} onChange={event => setProfile(current => ({ ...current, firstName: event.target.value }))} /></label>
                <label className="field" htmlFor="profile-last-name" data-i18n="lastName">Last name<input id="profile-last-name" name="lastName" maxLength={50} required value={profile.lastName} onChange={event => setProfile(current => ({ ...current, lastName: event.target.value }))} /></label>
                <label className="field" htmlFor="profile-nickname" data-i18n="nickname">Nickname <span className="field-help" data-i18n="optionalShownChat">(optional; shown in group chat)</span><input id="profile-nickname" name="nickname" maxLength={50} value={profile.nickname} onChange={event => setProfile(current => ({ ...current, nickname: event.target.value }))} /></label>
                <label className="field" htmlFor="profile-phone" data-i18n="phoneNumber">Phone number<input id="profile-phone" name="phone" type="tel" autoComplete="tel" required value={profile.phone} onChange={event => setProfile(current => ({ ...current, phone: event.target.value }))} /></label>
                <label className="field" htmlFor="profile-email" data-i18n="email">Email<input id="profile-email" name="email" type="email" autoComplete="email" required value={profile.email} onChange={event => setProfile(current => ({ ...current, email: event.target.value }))} /></label>
              </div>
            </fieldset>
            {!viewOnly && (
              <>
                <button id="change-details" className="mini-btn" type="button" data-i18n="changeDetails" hidden={editing} onClick={() => setEditing(true)}>Change details</button>
                <button id="save-details" className="button-primary" type="submit" hidden={!editing} disabled={saving} data-i18n="saveDetails">Save details</button>
                </>
            )}
            <p id="profile-details-status" className={`form-notice${detailsError ? " error" : ""}`} role="status" aria-live="polite">{detailsStatus}</p>
          </form>
          <div className="profile-photo-preview" id="profile-photo-preview" aria-label="Current profile photo preview" data-i18n-aria-label="currentPhotoPreview">
            {!photoLoaded && "👤"}
            {photoUrl && <img src={photoUrl} alt={translate("Current profile photo")} hidden={!photoLoaded} onLoad={() => setPhotoLoaded(true)} onError={() => setPhotoLoaded(false)} />}
          </div>
          {!viewOnly && (
            <>
              <label className="profile-upload" htmlFor="profile-photo">
                <span className="upload-icon" aria-hidden="true">⇧</span>
                <span data-i18n="chooseProfilePhoto">Choose a profile photo</span>
                <input ref={photoInputRef} id="profile-photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon" required disabled={photoBusy} onChange={handlePhotoChange} />
              </label>
              <p className="field-help" data-i18n="profileAcceptedTypes">Choose a PNG, JPEG, WebP, GIF, SVG, or icon image. It will be converted to PNG icons in your browser before upload.</p>
            </>
          )}
          <p id="profile-status" className={`form-notice${photoError ? " error" : ""}`} role="status" aria-live="polite">{photoStatus}</p>
        </section>
        {!viewOnly && <PasskeySettings />}
        <PushNotificationSettings />
        <PwaInstallButton settings />
      </main>
    </div>
  );
}
