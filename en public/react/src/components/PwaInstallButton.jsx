import { useEffect, useState } from "react";
import { installPwa, isPwaInstalled, isRelatedAppInstalled, subscribeToPwaInstall } from "../pwaInstall.js";

function translate(value) {
  return window.jiraniI18n?.translateText(value) || value;
}

function installInstructions() {
  const agent = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(agent)) return "In Safari, tap Share, then choose Add to Home Screen.";
  if (/Android/i.test(agent)) return "Open your browser menu and choose Install app or Add to home screen.";
  return "Use your browser’s install icon or menu and choose Install app.";
}

export default function PwaInstallButton({ compact = false, settings = false }) {
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installStateReady, setInstallStateReady] = useState(false);
  const [message, setMessage] = useState("");
  const [, setLanguageVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      setPromptAvailable(Boolean(window.jiraniPwaInstallPrompt));
      if (isPwaInstalled()) {
        setInstalled(true);
        setInstallStateReady(true);
      }
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallStateReady(true);
    };
    refresh();
    const unsubscribe = subscribeToPwaInstall(refresh);
    window.addEventListener("appinstalled", onAppInstalled);
    const languageChange = () => setLanguageVersion(version => version + 1);
    window.addEventListener("languagechange", languageChange);

    if (isPwaInstalled()) {
      setInstalled(true);
      setInstallStateReady(true);
    } else {
      void isRelatedAppInstalled().then(relatedInstalled => {
        if (!active) return;
        setInstalled(current => current || relatedInstalled || isPwaInstalled());
        setInstallStateReady(true);
      }).catch(() => {
        if (active) setInstallStateReady(true);
      });
    }

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("languagechange", languageChange);
    };
  }, []);

  async function handleInstall() {
    setMessage("");
    const outcome = await installPwa();
    if (outcome === "accepted" || outcome === "installed") {
      setMessage("App installed on this device.");
      setInstalled(true);
      setInstallStateReady(true);
    } else if (outcome === "dismissed") {
      setMessage("Installation was not completed. You can try again from the browser menu.");
    } else if (!isPwaInstalled()) {
      setMessage(installInstructions());
    }
  }

  if (!installStateReady || installed) return null;

  const action = <div className={`pwa-install-action${compact ? " compact" : ""}`}>
    <button className={compact ? "mini-btn" : "button-primary button-secondary"} type="button" onClick={handleInstall}>
      {promptAvailable ? translate("Install app") : translate("Add app to device")}
    </button>
    {message ? <p className="pwa-action-status" role="status" aria-live="polite">{translate(message)}</p> : null}
  </div>;

  if (settings) return <section className="panel pwa-settings-card" aria-labelledby="install-app-title">
    <div className="panel-heading"><div>
      <h2 id="install-app-title" data-i18n="pwaInstallTitle">Use Jirani Chama as an app</h2>
      <p data-i18n="pwaInstallCopy">Add this site to your device’s home screen for an app-like experience. On iPhone or a browser without an install prompt, use the browser’s Share or menu option.</p>
    </div></div>
    <div className="pwa-settings-actions">{action}</div>
  </section>;

  return action;
}
