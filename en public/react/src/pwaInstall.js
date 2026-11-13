import { hasInstalledRelatedApp } from "./pwaInstallDetection.mjs";

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    window.jiraniPwaInstallPrompt = event;
    window.dispatchEvent(new Event("chama:pwa-install-available"));
  });
  window.addEventListener("appinstalled", () => {
    window.jiraniPwaInstallPrompt = null;
    window.dispatchEvent(new Event("chama:pwa-install-available"));
  });
}

export function subscribeToPwaInstall(listener) {
  window.addEventListener("chama:pwa-install-available", listener);
  window.addEventListener("appinstalled", listener);
  return () => {
    window.removeEventListener("chama:pwa-install-available", listener);
    window.removeEventListener("appinstalled", listener);
  };
}

export function isPwaInstalled() {
  return window.matchMedia?.("(display-mode: standalone)").matches === true || navigator.standalone === true;
}

export async function isRelatedAppInstalled() {
  if (typeof window === "undefined" || typeof navigator === "undefined" || typeof document === "undefined") return false;
  return hasInstalledRelatedApp({
    navigatorObject: navigator,
    documentObject: document,
    locationObject: window.location,
    fetchImpl: typeof window.fetch === "function" ? window.fetch.bind(window) : undefined,
    isSecureContext: window.isSecureContext === true,
  });
}

export async function installPwa() {
  const prompt = window.jiraniPwaInstallPrompt;
  if (!prompt) return isPwaInstalled() ? "installed" : "unavailable";
  window.jiraniPwaInstallPrompt = null;
  window.dispatchEvent(new Event("chama:pwa-install-available"));
  await prompt.prompt();
  const result = await prompt.userChoice;
  return result?.outcome === "accepted" ? "accepted" : "dismissed";
}
