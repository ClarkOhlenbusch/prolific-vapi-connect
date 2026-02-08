import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const CHUNK_RECOVERY_KEY = "chunk-load-recovery-last-reload";
const CHUNK_RECOVERY_COOLDOWN_MS = 30_000;

const maybeRecoverFromChunkLoadError = () => {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const lastReloadRaw = sessionStorage.getItem(CHUNK_RECOVERY_KEY);
  const lastReload = lastReloadRaw ? Number(lastReloadRaw) : 0;

  if (Number.isFinite(lastReload) && now - lastReload < CHUNK_RECOVERY_COOLDOWN_MS) {
    return;
  }

  sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
  window.location.reload();
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  maybeRecoverFromChunkLoadError();
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason ?? "");

  if (
    message.includes("Failed to fetch dynamically imported module")
    || message.includes("Importing a module script failed")
  ) {
    event.preventDefault();
    maybeRecoverFromChunkLoadError();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
