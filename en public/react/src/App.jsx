import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { pageForPath, pageTemplates } from "./pageTemplates.js";
import RegisterPage from "./pages/RegisterPage.jsx";
import MemberLoginPage from "./pages/MemberLoginPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import ChatPanel from "./components/ChatPanel.jsx";

const legacyControllerNames = new Set([
  "chama.js",
  "contact.js",
]);

function createPageModel(pageKey) {
  const parsed = new DOMParser().parseFromString(pageTemplates[pageKey], "text/html");
  const scripts = Array.from(parsed.body.querySelectorAll("script[src]"))
    .map(script => script.getAttribute("src"))
    .filter(Boolean)
    .filter(source => {
      const url = new URL(source, window.location.origin);
      return url.origin === window.location.origin
        && legacyControllerNames.has(url.pathname.split("/").pop());
    });
  parsed.body.querySelectorAll("script").forEach(script => script.remove());

  return {
    language: parsed.documentElement.lang || "en",
    title: parsed.title,
    bodyClass: parsed.body.className,
    markup: parsed.body.innerHTML,
    scripts,
  };
}

function loadClassicScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    script.dataset.chamaReactController = "true";
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error("A page controller could not be loaded."));
    document.body.append(script);
  });
}

function LegacyPage({ pageKey }) {
  const hostRef = useRef(null);
  const page = useMemo(() => createPageModel(pageKey), [pageKey]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    document.documentElement.lang = page.language;
    document.body.className = page.bodyClass;
    if (page.title) document.title = page.title;

    const chatHost = host.querySelector("#react-chat-root");
    const chatRoot = chatHost ? createRoot(chatHost) : null;
    chatRoot?.render(<ChatPanel />);

    let mounted = true;
    const loadedScripts = [];
    const loadControllers = async () => {
      try {
        for (const source of page.scripts) {
          const script = await loadClassicScript(source);
          loadedScripts.push(script);
          if (!mounted) break;
        }
      } catch {
        if (!mounted) return;
        const message = document.createElement("p");
        message.className = "notice error";
        message.setAttribute("role", "alert");
        message.textContent = "This page could not finish loading. Reload and try again.";
        host.prepend(message);
      }
    };
    void loadControllers();

    return () => {
      mounted = false;
      chatRoot?.unmount();
      loadedScripts.forEach(script => script.remove());
      document.body.querySelectorAll('script[data-chama-react-controller="true"]').forEach(script => script.remove());
    };
  }, [page]);

  // The imported templates are trusted, repository-owned source markup; user data is never interpolated here.
  return <div className="react-root" ref={hostRef} dangerouslySetInnerHTML={{ __html: page.markup }} />;
}

function DashboardEntry() {
  const [authenticated, setAuthenticated] = useState(null);

  useEffect(() => {
    let active = true;
    const endSession = () => {
      if (active) setAuthenticated(false);
    };
    window.addEventListener("chama:session-ended", endSession);
    fetch("/api/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(response => response.ok ? response.json() : { authenticated: false })
      .then(session => {
        if (active) setAuthenticated(session?.authenticated === true);
      })
      .catch(() => {
        if (active) setAuthenticated(false);
      });
    return () => {
      active = false;
      window.removeEventListener("chama:session-ended", endSession);
    };
  }, []);

  if (authenticated === null) return <main className="react-root" role="status">Loading Jirani Chama…</main>;
  return authenticated ? <LegacyPage pageKey="dashboard" /> : <LandingPage />;
}

export default function App() {
  const pageKey = pageForPath(window.location.pathname);
  if (pageKey === "profile") return <ProfilePage />;
  if (pageKey === "memberLogin") return <MemberLoginPage />;
  if (pageKey === "register") return <RegisterPage />;
  if (pageKey === "dashboard") return <DashboardEntry />;
  return <LegacyPage pageKey={pageKey} />;
}
