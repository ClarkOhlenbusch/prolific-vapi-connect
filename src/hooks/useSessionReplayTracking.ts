import { useEffect } from "react";
import type { eventWithTime, incrementalSnapshotEvent, listenerHandler } from "@rrweb/types";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const SESSION_REPLAY_VERSION = 2;
const SESSION_REPLAY_EVENT_TYPE = "session_replay_chunk";
const SESSION_REPLAY_CALL_STATE_EVENT = "session-replay-call-state";

const FLUSH_INTERVAL_MS = 8000;
const FLUSH_EVENT_COUNT = 40;
const MAX_QUEUE_EVENTS = 1200;
const MAX_CHUNK_BYTES = 700000;

const DEFAULT_MOUSE_SAMPLE_MS = 110;
const DEFAULT_SCROLL_SAMPLE_MS = 260;
const ACTIVE_CALL_MOUSE_SAMPLE_MS = 280;
const ACTIVE_CALL_SCROLL_SAMPLE_MS = 900;

const EXCLUDED_PATHS = new Set(["/", "/consent"]);
const EXCLUDED_PREFIXES = ["/researcher", "/no-consent"];

const RRWEB_EVENT_TYPE_INCREMENTAL_SNAPSHOT = 3;
const RRWEB_INCREMENTAL_SOURCE_MOUSE_MOVE = 1;
const RRWEB_INCREMENTAL_SOURCE_SCROLL = 3;
const RRWEB_INCREMENTAL_SOURCE_TOUCH_MOVE = 6;
const RRWEB_INCREMENTAL_SOURCE_DRAG = 12;

type RrwebRecord = typeof import("rrweb")["record"];
type RrwebAddCustomEvent = typeof import("rrweb")["addCustomEvent"];

type VoiceCallStatePayload = {
  active?: boolean;
  source?: string;
};

let replayInitialized = false;
let replayInitPromise: Promise<void> | null = null;
let rrwebStopHandler: listenerHandler | null = null;
let rrwebRecordFn: RrwebRecord | null = null;
let rrwebAddCustomEventFn: RrwebAddCustomEvent | null = null;
let rrwebTakeFullSnapshotFn: ((isCheckout?: boolean) => void) | null = null;

let currentPathname = "";
let currentPageName = "";
let replaySessionId: string | null = null;
let sequence = 0;
let flushTimer: number | null = null;
let lastMouseEmitTs = 0;
let lastScrollEmitTs = 0;
let isFlushing = false;
let flushRequested = false;
let isVoiceCallActive = false;
const queue: eventWithTime[] = [];

const isReplayEnabled = () => import.meta.env.VITE_ENABLE_SESSION_REPLAY !== "false";

const isTrackablePath = (pathname: string) => {
  if (EXCLUDED_PATHS.has(pathname)) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
};

const isVoiceCallPage = (pathname: string) => pathname === "/practice" || pathname === "/voice-conversation";

const getMouseSampleMs = () => {
  if (isVoiceCallActive && isVoiceCallPage(currentPathname)) return ACTIVE_CALL_MOUSE_SAMPLE_MS;
  return DEFAULT_MOUSE_SAMPLE_MS;
};

const getScrollSampleMs = () => {
  if (isVoiceCallActive && isVoiceCallPage(currentPathname)) return ACTIVE_CALL_SCROLL_SAMPLE_MS;
  return DEFAULT_SCROLL_SAMPLE_MS;
};

const isRrwebMouseMoveEvent = (event: eventWithTime): boolean => {
  if (event.type !== RRWEB_EVENT_TYPE_INCREMENTAL_SNAPSHOT) return false;
  const incremental = event as incrementalSnapshotEvent;
  return (
    incremental.data.source === RRWEB_INCREMENTAL_SOURCE_MOUSE_MOVE
    || incremental.data.source === RRWEB_INCREMENTAL_SOURCE_TOUCH_MOVE
    || incremental.data.source === RRWEB_INCREMENTAL_SOURCE_DRAG
  );
};

const isRrwebScrollEvent = (event: eventWithTime): boolean => {
  if (event.type !== RRWEB_EVENT_TYPE_INCREMENTAL_SNAPSHOT) return false;
  const incremental = event as incrementalSnapshotEvent;
  return incremental.data.source === RRWEB_INCREMENTAL_SOURCE_SCROLL;
};

const toPageName = (pathname: string) => {
  switch (pathname) {
    case "/":
      return "prolific-id";
    case "/consent":
      return "consent";
    case "/no-consent":
      return "no-consent";
    case "/practice":
      return "practice-conversation";
    case "/voice-conversation":
      return "voice-conversation";
    case "/questionnaire/pets":
      return "questionnaire-pets";
    case "/questionnaire/godspeed":
      return "questionnaire-godspeed";
    case "/questionnaire/tias":
      return "questionnaire-tias";
    case "/questionnaire/intention":
      return "questionnaire-intention";
    case "/questionnaire/tipi":
      return "questionnaire-tipi";
    case "/questionnaire/formality":
      return "questionnaire-formality";
    case "/questionnaire/feedback":
      return "questionnaire-feedback";
    default:
      return pathname.replace(/^\//, "").replace(/\//g, "-") || "unknown";
  }
};

const getReplaySessionId = () => {
  if (replaySessionId) return replaySessionId;
  const stored = sessionStorage.getItem("sessionReplayId");
  if (stored) {
    replaySessionId = stored;
    return replaySessionId;
  }
  replaySessionId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `replay-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  sessionStorage.setItem("sessionReplayId", replaySessionId);
  return replaySessionId;
};

const estimateSize = (value: unknown): number => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return MAX_CHUNK_BYTES + 1;
  }
};

const shouldDropBySampling = (event: eventWithTime): boolean => {
  const timestamp = event.timestamp || Date.now();

  if (isRrwebMouseMoveEvent(event)) {
    const sampleMs = getMouseSampleMs();
    if (timestamp - lastMouseEmitTs < sampleMs) return true;
    lastMouseEmitTs = timestamp;
    return false;
  }

  if (isRrwebScrollEvent(event)) {
    const sampleMs = getScrollSampleMs();
    if (timestamp - lastScrollEmitTs < sampleMs) return true;
    lastScrollEmitTs = timestamp;
    return false;
  }

  return false;
};

const queueEvent = (event: eventWithTime) => {
  if (!isTrackablePath(currentPathname)) return;
  if (shouldDropBySampling(event)) return;

  queue.push(event);
  if (queue.length > MAX_QUEUE_EVENTS) {
    queue.splice(0, queue.length - MAX_QUEUE_EVENTS);
  }
  if (queue.length >= FLUSH_EVENT_COUNT) {
    void flushReplayQueue();
  }
};

const flushReplayQueue = async () => {
  if (isFlushing) {
    flushRequested = true;
    return;
  }
  if (!queue.length) return;

  isFlushing = true;
  flushRequested = false;
  try {
    while (queue.length) {
      const prolificId = sessionStorage.getItem("prolificId");
      if (!prolificId) break;

      const chunk: eventWithTime[] = [];
      let chunkBytes = 0;

      while (queue.length && chunk.length < FLUSH_EVENT_COUNT) {
        const nextEvent = queue[0];
        const nextSize = estimateSize(nextEvent);
        if (chunk.length > 0 && chunkBytes + nextSize > MAX_CHUNK_BYTES) {
          break;
        }
        chunk.push(queue.shift() as eventWithTime);
        chunkBytes += nextSize;
        if (chunk.length === 1 && nextSize > MAX_CHUNK_BYTES) {
          break;
        }
      }

      if (!chunk.length) break;

      const metadata = {
        replayVersion: SESSION_REPLAY_VERSION,
        replayFormat: "rrweb",
        replaySessionId: getReplaySessionId(),
        sequence: sequence++,
        pathname: currentPathname,
        pageName: currentPageName,
        rrwebEvents: chunk as unknown as Json[],
      } as Json;

      const { error } = await supabase.from("navigation_events" as any).insert({
        prolific_id: prolificId,
        call_id: null,
        page_name: currentPageName || "unknown",
        event_type: SESSION_REPLAY_EVENT_TYPE,
        metadata,
      });

      if (error) {
        console.error("Error saving rrweb replay chunk:", error);
        break;
      }

      if (!flushRequested && queue.length < FLUSH_EVENT_COUNT) break;
      flushRequested = false;
    }
  } finally {
    isFlushing = false;
  }
};

const ensureFlushTimer = () => {
  if (flushTimer !== null) return;
  flushTimer = window.setInterval(() => {
    void flushReplayQueue();
  }, FLUSH_INTERVAL_MS);
};

const emitRouteCheckpoint = (reason: "init" | "path_change") => {
  if (!isTrackablePath(currentPathname)) return;
  rrwebAddCustomEventFn?.("route_change", {
    pathname: currentPathname,
    pageName: currentPageName,
    reason,
  });
  rrwebTakeFullSnapshotFn?.(true);
};

const handleReplayCallStateChange = (event: Event) => {
  const customEvent = event as CustomEvent<VoiceCallStatePayload>;
  isVoiceCallActive = Boolean(customEvent.detail?.active);
  rrwebAddCustomEventFn?.("voice_call_state", {
    active: isVoiceCallActive,
    source: customEvent.detail?.source || "unknown",
    path: currentPathname,
  });
};

const initializeReplay = async () => {
  if (replayInitialized || replayInitPromise) return replayInitPromise;
  if (!isReplayEnabled()) return;

  replayInitPromise = (async () => {
    const rrweb = await import("rrweb");
    rrwebRecordFn = rrweb.record;
    rrwebAddCustomEventFn = rrweb.addCustomEvent;
    rrwebTakeFullSnapshotFn = rrweb.record.takeFullSnapshot;

    const stop = rrwebRecordFn({
      emit: (event) => queueEvent(event),
      maskAllInputs: true,
      inlineStylesheet: true,
      checkoutEveryNms: 30000,
      checkoutEveryNth: 500,
      sampling: {
        mousemove: 60,
        scroll: 150,
        input: "last",
      },
      recordCanvas: false,
      collectFonts: false,
      inlineImages: false,
    });

    rrwebStopHandler = stop || null;
    window.addEventListener(SESSION_REPLAY_CALL_STATE_EVENT, handleReplayCallStateChange as EventListener);
    window.addEventListener("pagehide", () => {
      rrwebStopHandler?.();
      rrwebStopHandler = null;
      void flushReplayQueue();
    });

    replayInitialized = true;
    ensureFlushTimer();
    emitRouteCheckpoint("init");
  })().finally(() => {
    replayInitPromise = null;
  });

  return replayInitPromise;
};

const updateReplayPath = (pathname: string) => {
  if (!isReplayEnabled()) return;

  currentPathname = pathname;
  currentPageName = toPageName(pathname);

  if (!isTrackablePath(pathname)) {
    void flushReplayQueue();
    return;
  }

  void initializeReplay().then(() => {
    emitRouteCheckpoint("path_change");
  });
};

export const useSessionReplayTracking = (pathname: string) => {
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("replayPreview") === "1") {
      return;
    }
    updateReplayPath(pathname);
  }, [pathname]);
};
