import { useEffect } from "react";

const HOTJAR_ID = 6641427;
const HOTJAR_SV = 6;
const EXCLUDED_PATHS = new Set(["/", "/consent"]);

declare global {
  interface Window {
    hj?: (...args: unknown[]) => void;
    _hjSettings?: { hjid: number; hjsv: number };
  }
}

let hotjarInitialized = false;

const initializeHotjar = () => {
  if (hotjarInitialized) return;

  window.hj =
    window.hj ||
    function (...args: unknown[]) {
      (window.hj as unknown as { q?: unknown[] }).q =
        (window.hj as unknown as { q?: unknown[] }).q || [];
      (window.hj as unknown as { q: unknown[] }).q.push(args);
    };

  window._hjSettings = { hjid: HOTJAR_ID, hjsv: HOTJAR_SV };

  if (!document.getElementById("hotjar-script-loader")) {
    const script = document.createElement("script");
    script.id = "hotjar-script-loader";
    script.async = true;
    script.src = `https://static.hotjar.com/c/hotjar-${HOTJAR_ID}.js?sv=${HOTJAR_SV}`;
    document.head.appendChild(script);
  }

  hotjarInitialized = true;
};

export const useHotjarTracking = (pathname: string) => {
  useEffect(() => {
    if (EXCLUDED_PATHS.has(pathname)) return;

    initializeHotjar();
    window.hj?.("stateChange", pathname);
  }, [pathname]);
};
