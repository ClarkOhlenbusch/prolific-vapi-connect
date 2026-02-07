import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type MicPermissionState = "granted" | "denied" | "prompt" | "unsupported" | "error" | "unknown";
export type MicPermissionSource = "permissions.query" | "getUserMedia" | "unknown";
export type MicAudioStatus = "detected" | "not_detected" | "error" | "unknown";

export interface MicDiagnosticsResult {
  permissionState: MicPermissionState;
  permissionSource: MicPermissionSource;
  audioDetected: MicAudioStatus;
  peakRms?: number;
  sampleMs?: number;
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
  const sampleMs = options.sampleMs ?? 800;
  const rmsThreshold = options.rmsThreshold ?? 0.02;

  let permissionState: MicPermissionState = "unknown";
  let permissionSource: MicPermissionSource = "unknown";

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
      errorName: "MediaDevicesUnsupported",
    };
  }

  if (permissionState === "denied") {
    return {
      permissionState,
      permissionSource,
      audioDetected: "unknown",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionState = "granted";
    permissionSource = "getUserMedia";

    let audioDetected: MicAudioStatus = "unknown";
    let peakRms: number | undefined;
    try {
      const analysis = await measureStreamAudio(stream, sampleMs, rmsThreshold);
      audioDetected = analysis.detected ? "detected" : "not_detected";
      peakRms = analysis.peakRms;
    } catch (error) {
      audioDetected = "error";
      const err = toErrorDetails(error);
      stream.getTracks().forEach((track) => track.stop());
      return {
        permissionState,
        permissionSource,
        audioDetected,
        peakRms,
        sampleMs,
        errorName: err?.name,
        errorMessage: err?.message,
      };
    }

    stream.getTracks().forEach((track) => track.stop());
    return {
      permissionState,
      permissionSource,
      audioDetected,
      peakRms,
      sampleMs,
    };
  } catch (error) {
    const err = toErrorDetails(error);
    const errName = err?.name || "";
    const deniedNames = new Set(["NotAllowedError", "PermissionDeniedError"]);
    return {
      permissionState: deniedNames.has(errName) ? "denied" : "error",
      permissionSource: "getUserMedia",
      audioDetected: "error",
      errorName: err?.name,
      errorMessage: err?.message,
      sampleMs,
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
