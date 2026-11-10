import { useLayoutEffect, useMemo, useRef } from "react";
import { pageForPath, pageTemplates } from "./pageTemplates.js";

const legacyControllerNames = new Set([
  "chama.js",
  "contact.js",
  "auth-pages.js",
  "register.js",
  "profile.js",
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

export default function App() {
  const hostRef = useRef(null);
  const pageKey = pageForPath(window.location.pathname);
  const page = useMemo(() => createPageModel(pageKey), [pageKey]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    document.documentElement.lang = page.language;
    document.body.className = page.bodyClass;
    if (page.title) document.title = page.title;

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
      loadedScripts.forEach(script => script.remove());
      document.body.querySelectorAll('script[data-chama-react-controller="true"]').forEach(script => script.remove());
    };
  }, [page]);

  // The imported templates are trusted, repository-owned source markup; user data is never interpolated here.
  return <div className="react-root" ref={hostRef} dangerouslySetInnerHTML={{ __html: page.markup }} />;
}
