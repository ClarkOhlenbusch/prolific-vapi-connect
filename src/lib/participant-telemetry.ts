import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type MicPermissionState = "granted" | "denied" | "prompt" | "unsupported" | "error" | "unknown";
export type MicPermissionSource = "permissions.query" | "getUserMedia" | "unknown";
export type MicAudioStatus = "detected" | "not_detected" | "error" | "unknown";
export type CallFailureReasonCode =
  | "none"
  | "mic_permission_denied"
  | "mic_not_found"
  | "mic_in_use"
  | "mic_constraints_failed"
  | "mic_access_error"
  | "no_mic_audio_detected"
  | "session_validation_failed"
  | "vapi_start_error"
  | "assistant_pipeline_error"
  | "assistant_error"
  | "network_error"
  | "call_timeout"
  | "unknown";

interface ConnectionInfo {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface ClientTelemetryContext {
  userAgent?: string;
  platform?: string;
  language?: string;
  isSecureContext: boolean;
  online?: boolean;
  connection?: ConnectionInfo;
  inputDeviceCount?: number;
  // Parsed / enriched fields
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  screenWidth?: number;
  screenHeight?: number;
  devicePixelRatio?: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  timezone?: string;
  colorDepth?: number;
}

export interface TroubleshootingGuidance {
  title: string;
  description: string;
  steps: string[];
}

export interface MicDiagnosticsResult {
  permissionState: MicPermissionState;
  permissionSource: MicPermissionSource;
  audioDetected: MicAudioStatus;
  reasonCode?: CallFailureReasonCode;
  peakRms?: number;
  sampleMs?: number;
  getUserMediaDurationMs?: number;
  inputDeviceCount?: number;
  trackEnabled?: boolean;
  trackMuted?: boolean;
  trackReadyState?: string;
  errorName?: string;
  errorMessage?: string;
}

interface LogNavigationEventParams {
  prolificId: string | null;
  callId: string | null;
  pageName: string;
  eventType: string;
  metadata?: Json;
  timeOnPageSeconds?: number | null;
}

const parseBrowserName = (ua: string): string => {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return "Opera";
  if (/chrome|chromium/i.test(ua) && !/edg/i.test(ua)) return "Chrome";
  if (/firefox/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  return "Unknown";
};

const parseBrowserVersion = (ua: string, name: string): string => {
  const patterns: Record<string, RegExp> = {
    Edge: /edg\/(\d+)/i,
    Opera: /(?:opr|opera)\/(\d+)/i,
    Chrome: /chrome\/(\d+)/i,
    Firefox: /firefox\/(\d+)/i,
    Safari: /version\/(\d+)/i,
  };
  const pattern = patterns[name];
  if (!pattern) return "";
  const match = ua.match(pattern);
  return match ? match[1] : "";
};

const parseOsName = (ua: string, platform: string): string => {
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/win/i.test(platform)) return "Windows";
  if (/mac/i.test(platform)) return "macOS";
  if (/linux/i.test(platform)) return "Linux";
  return "Unknown";
};

const toErrorDetails = (error: unknown): { name?: string; message?: string } | null => {
  if (!error) return null;
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (typeof error === "object") {
    const err = error as { name?: string; message?: string };
    return { name: err.name, message: err.message };
  }
  return { message: String(error) };
};

const toRoundedMs = (value: number) => Math.max(0, Math.round(value));

const getConnectionInfo = (): ConnectionInfo | undefined => {
  if (typeof navigator === "undefined") return undefined;
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
      mozConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
      webkitConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    }
  ).connection
    || (navigator as Navigator & { mozConnection?: ConnectionInfo }).mozConnection
    || (navigator as Navigator & { webkitConnection?: ConnectionInfo }).webkitConnection;
  if (!connection) return undefined;
  return {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
    saveData: connection.saveData,
  };
};

const countInputDevices = async (): Promise<number | undefined> => {
  if (typeof navigator === "undefined") return undefined;
  if (!navigator?.mediaDevices?.enumerateDevices) return undefined;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === "audioinput").length;
  } catch {
    return undefined;
  }
};

export const collectClientContext = async (): Promise<ClientTelemetryContext> => {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
  const platform = typeof navigator !== "undefined" ? navigator.platform : undefined;
  const browserName = ua ? parseBrowserName(ua) : undefined;
  const browserVersion = ua && browserName ? parseBrowserVersion(ua, browserName) : undefined;
  const osName = (ua || platform) ? parseOsName(ua ?? "", platform ?? "") : undefined;
  return {
    userAgent: ua,
    platform,
    language: typeof navigator !== "undefined" ? navigator.language : undefined,
    isSecureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
    connection: getConnectionInfo(),
    inputDeviceCount: await countInputDevices(),
    browserName,
    browserVersion,
    osName,
    screenWidth: typeof screen !== "undefined" ? screen.width : undefined,
    screenHeight: typeof screen !== "undefined" ? screen.height : undefined,
    devicePixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : undefined,
    deviceMemory: typeof navigator !== "undefined"
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined,
    hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined,
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
    colorDepth: typeof screen !== "undefined" ? screen.colorDepth : undefined,
  };
};

export const generateCallAttemptId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
};

export const mapMicErrorToReasonCode = (
  errorName?: string,
  permissionState?: MicPermissionState
): CallFailureReasonCode => {
  if (permissionState === "denied") return "mic_permission_denied";
  switch (errorName) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "mic_permission_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "mic_not_found";
    case "NotReadableError":
    case "TrackStartError":
      return "mic_in_use";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "mic_constraints_failed";
    case "AbortError":
    case "SecurityError":
      return "mic_access_error";
    default:
      return "unknown";
  }
};

export const mapVapiErrorToReasonCode = (
  errorName?: string,
  errorMessage?: string
): CallFailureReasonCode => {
  const normalizedMessage = (errorMessage || "").toLowerCase();
  if (normalizedMessage.includes("pipeline")) return "assistant_pipeline_error";
  if (normalizedMessage.includes("assistant")) return "assistant_error";
  if (
    normalizedMessage.includes("network")
    || normalizedMessage.includes("connection")
    || normalizedMessage.includes("ice")
    || normalizedMessage.includes("webrtc")
  ) {
    return "network_error";
  }
  if (
    normalizedMessage.includes("timeout")
    || normalizedMessage.includes("exceeded")
    || normalizedMessage.includes("max-duration")
  ) {
    return "call_timeout";
  }
  if (errorName === "NotAllowedError") return "mic_permission_denied";
  return "vapi_start_error";
};

export const mapCallEndReasonToFailureCode = (endedReason?: string): CallFailureReasonCode => {
  switch (endedReason) {
    case "assistant-error":
      return "assistant_error";
    case "pipeline-error":
      return "assistant_pipeline_error";
    case "exceeded-max-duration":
      return "call_timeout";
    default:
      return "none";
  }
};

export const getCurrentMicPermissionState = async (): Promise<MicPermissionState> => {
  if (typeof navigator === "undefined") return "unknown";
  if (!navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state as MicPermissionState;
  } catch {
    return "unknown";
  }
};

export const getMicIssueGuidance = (
  reasonCode?: CallFailureReasonCode
): TroubleshootingGuidance => {
  switch (reasonCode) {
    case "mic_permission_denied":
      return {
        title: "Microphone Permission Blocked",
        description: "Your browser is blocking microphone access, so the assistant cannot hear you.",
        steps: [
          "Click the lock/info icon next to the website URL.",
          "Set Microphone permission to Allow.",
          "Refresh the page and try again.",
        ],
      };
    case "mic_not_found":
      return {
        title: "No Microphone Detected",
        description: "We could not find an available microphone on your device.",
        steps: [
          "Connect a microphone or headset.",
          "Check your system input device settings.",
          "Refresh the page and retry the call.",
        ],
      };
    case "mic_in_use":
      return {
        title: "Microphone Is Busy",
        description: "Another app may be using your microphone right now.",
        steps: [
          "Close apps like Zoom, Teams, Meet, or voice recorders.",
          "Return to this page and retry the call.",
          "If needed, refresh the page.",
        ],
      };
    case "mic_constraints_failed":
      return {
        title: "Microphone Setup Issue",
        description: "Your browser could not apply microphone settings for this call.",
        steps: [
          "Switch to your default microphone in system settings.",
          "Disconnect and reconnect your headset if using one.",
          "Refresh the page and try again.",
        ],
      };
    case "no_mic_audio_detected":
      return {
        title: "No Audio Detected",
        description: "Microphone access worked, but no sound signal was detected.",
        steps: [
          "Check that your microphone is not muted.",
          "Speak closer to the microphone and increase input volume.",
          "Confirm the correct input device is selected.",
        ],
      };
    default:
      return {
        title: "Microphone Access Problem",
        description: "We could not access your microphone for this call.",
        steps: [
          "Check browser microphone permission for this site.",
          "Check your system microphone input settings.",
          "Refresh the page and try again.",
        ],
      };
  }
};

export const getCallErrorGuidance = (
  reasonCode?: CallFailureReasonCode
): TroubleshootingGuidance => {
  switch (reasonCode) {
    case "network_error":
      return {
        title: "Network Connection Issue",
        description: "The call could not connect reliably to the voice service.",
        steps: [
          "Check that your internet connection is stable.",
          "Disable VPN/proxy temporarily if enabled.",
          "Retry the call or refresh the page.",
        ],
      };
    case "assistant_pipeline_error":
    case "assistant_error":
      return {
        title: "Assistant Service Error",
        description: "The voice assistant encountered a temporary backend issue.",
        steps: [
          "Wait a moment and retry the call.",
          "If it happens repeatedly, refresh the page and try again.",
          "Use the issue report option so researchers can diagnose it.",
        ],
      };
    case "call_timeout":
      return {
        title: "Call Timed Out",
        description: "The session reached a time or connection limit.",
        steps: [
          "Retry the call from this page.",
          "Ensure your internet is stable.",
          "Refresh the page if the issue continues.",
        ],
      };
    default:
      return {
        title: "Call Connection Error",
        description: "Something interrupted the call startup.",
        steps: [
          "Check microphone permissions and internet connection.",
          "Retry the call.",
          "Refresh the page if needed.",
        ],
      };
  }
};

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  return new AudioContextCtor();
};

const measureStreamAudio = async (stream: MediaStream, sampleMs: number, rmsThreshold: number) => {
  const audioContext = getAudioContext();
  if (!audioContext) {
    return { detected: false, peakRms: 0, errorName: "AudioContextUnsupported" };
  }

  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let peakRms = 0;

  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      // If resume fails, continue and rely on analyser data
    }
  }

  const startTime = performance.now();
  const minDetectionWindowMs = 300;
  const result = await new Promise<{ detected: boolean; peakRms: number }>((resolve) => {
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      if (rms > peakRms) {
        peakRms = rms;
      }
      // Exit early once we have enough confidence that audio is present.
      if (peakRms >= rmsThreshold && performance.now() - startTime >= minDetectionWindowMs) {
        resolve({ detected: true, peakRms });
        return;
      }
      if (performance.now() - startTime >= sampleMs) {
        resolve({ detected: peakRms >= rmsThreshold, peakRms });
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });

  source.disconnect();
  analyser.disconnect();
  await audioContext.close();
  return result;
};

export const runMicDiagnostics = async (
  options: { sampleMs?: number; rmsThreshold?: number } = {}
): Promise<MicDiagnosticsResult> => {
  if (typeof navigator === "undefined") {
    return {
      permissionState: "unsupported",
      permissionSource: "unknown",
      audioDetected: "unknown",
      reasonCode: "mic_access_error",
    };
  }

  const sampleMs = options.sampleMs ?? 800;
  const rmsThreshold = options.rmsThreshold ?? 0.02;
  const diagnosticsStart = performance.now();

  let permissionState: MicPermissionState = "unknown";
  let permissionSource: MicPermissionSource = "unknown";
  const inputDeviceCount = await countInputDevices();

  if (typeof navigator !== "undefined" && navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      permissionState = status.state as MicPermissionState;
      permissionSource = "permissions.query";
    } catch {
      permissionState = "unsupported";
      permissionSource = "permissions.query";
    }
  }

  if (!navigator?.mediaDevices?.getUserMedia) {
    return {
      permissionState: permissionState === "unknown" ? "unsupported" : permissionState,
      permissionSource,
      audioDetected: "unknown",
      inputDeviceCount,
      reasonCode: "mic_access_error",
      errorName: "MediaDevicesUnsupported",
    };
  }

  if (permissionState === "denied") {
    return {
      permissionState,
      permissionSource,
      audioDetected: "unknown",
      inputDeviceCount,
      reasonCode: "mic_permission_denied",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionState = "granted";
    permissionSource = "getUserMedia";

    let audioDetected: MicAudioStatus = "unknown";
    let reasonCode: CallFailureReasonCode = "none";
    let peakRms: number | undefined;
    const audioTrack = stream.getAudioTracks()[0];
    try {
      const analysis = await measureStreamAudio(stream, sampleMs, rmsThreshold);
      audioDetected = analysis.detected ? "detected" : "not_detected";
      peakRms = analysis.peakRms;
      if (audioDetected === "not_detected") {
        reasonCode = "no_mic_audio_detected";
      }
    } catch (error) {
      audioDetected = "error";
      const err = toErrorDetails(error);
      stream.getTracks().forEach((track) => track.stop());
      return {
        permissionState,
        permissionSource,
        audioDetected,
        reasonCode: mapMicErrorToReasonCode(err?.name, permissionState),
        peakRms,
        sampleMs,
        getUserMediaDurationMs: toRoundedMs(performance.now() - diagnosticsStart),
        inputDeviceCount,
        trackEnabled: audioTrack?.enabled,
        trackMuted: audioTrack?.muted,
        trackReadyState: audioTrack?.readyState,
        errorName: err?.name,
        errorMessage: err?.message,
      };
    }

    stream.getTracks().forEach((track) => track.stop());
    return {
      permissionState,
      permissionSource,
      audioDetected,
      reasonCode,
      peakRms,
      sampleMs,
      getUserMediaDurationMs: toRoundedMs(performance.now() - diagnosticsStart),
      inputDeviceCount,
      trackEnabled: audioTrack?.enabled,
      trackMuted: audioTrack?.muted,
      trackReadyState: audioTrack?.readyState,
    };
  } catch (error) {
    const err = toErrorDetails(error);
    const errName = err?.name || "";
    const deniedNames = new Set(["NotAllowedError", "PermissionDeniedError"]);
    return {
      permissionState: deniedNames.has(errName) ? "denied" : "error",
      permissionSource: "getUserMedia",
      audioDetected: "error",
      reasonCode: mapMicErrorToReasonCode(err?.name, permissionState),
      errorName: err?.name,
      errorMessage: err?.message,
      sampleMs,
      getUserMediaDurationMs: toRoundedMs(performance.now() - diagnosticsStart),
      inputDeviceCount,
    };
  }
};

export const logNavigationEvent = async ({
  prolificId,
  callId,
  pageName,
  eventType,
  metadata = {},
  timeOnPageSeconds = null,
}: LogNavigationEventParams) => {
  if (!prolificId) return;
  try {
    await supabase.from("navigation_events" as any).insert({
      prolific_id: prolificId,
      call_id: callId || null,
      page_name: pageName,
      event_type: eventType,
      time_on_page_seconds: timeOnPageSeconds,
      metadata,
    });
  } catch (error) {
    console.error("Error logging navigation event:", error);
  }
};

export const formatMicPermission = (state?: string | null): string | null => {
  if (!state) return null;
  switch (state) {
    case "granted":
      return "Granted";
    case "denied":
      return "Denied";
    case "prompt":
      return "Prompt";
    case "unsupported":
      return "Unsupported";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
};

export const formatMicAudio = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    if (value === "detected") return "Detected";
    if (value === "not_detected") return "Not detected";
    if (value === "error") return "Error";
  }
  if (typeof value === "boolean") {
    return value ? "Detected" : "Not detected";
  }
  return "Unknown";
};
