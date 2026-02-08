import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mic } from "lucide-react";
import { useResearcherMode } from "@/contexts/ResearcherModeContext";
import { usePageTracking } from "@/hooks/usePageTracking";
import { FeedbackProgressBar } from "@/components/FeedbackProgressBar";
import { ExperimentProgress } from "@/components/ExperimentProgress";
import { VoiceDictation, VoiceDictationRef } from "@/components/VoiceDictation";
import { logNavigationEvent, runMicDiagnostics } from "@/lib/participant-telemetry";

type FeedbackField = "voice_assistant_feedback" | "communication_style_feedback" | "experiment_feedback";
type FeedbackInputMode = "typed" | "dictated";

const FEEDBACK_FIELD_LABELS: Record<FeedbackField, string> = {
  voice_assistant_feedback: "Voice Assistant Feedback",
  communication_style_feedback: "Communication Style Feedback",
  experiment_feedback: "Experiment Feedback",
};

const FEEDBACK_FIELDS: FeedbackField[] = [
  "voice_assistant_feedback",
  "communication_style_feedback",
  "experiment_feedback",
];

const DICTATION_AUDIO_BUCKET = "dictation-audio";
const FEEDBACK_AUTOSAVE_EVENT_TYPE = "feedback_draft_autosave";
const FEEDBACK_AUTOSAVE_DEBOUNCE_MS = 2500;
const FEEDBACK_AUTOSAVE_HEARTBEAT_MS = 15000;
const RESEARCHER_ROTATE_PENDING_KEY = "researcher-session-rotate-pending";

interface DictationRecorderState {
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  mimeType: string;
  storagePath: string | null;
  attemptCount: number;
  activeStartMs: number | null;
  activeDurationMs: number;
  persisted: boolean;
  stopPromise: Promise<void> | null;
  resolveStop: (() => void) | null;
}

interface DictationDebugInfo {
  recorderState: "idle" | "recording" | "paused" | "stopped" | "unsupported";
  attemptCount: number;
  chunkCount: number;
  bytesCaptured: number;
  lastUploadStatus: "idle" | "uploading" | "uploaded" | "error";
  lastUploadAt: string | null;
  lastUploadBytes: number | null;
  storagePath: string | null;
  lastError: string | null;
  lastReason: string | null;
  persisted: boolean;
}

interface DictationUploadPayload {
  mimeType: string;
  blob: Blob;
  storagePath: string;
  attemptCount: number;
  durationMs: number;
  chunkCount: number;
}

const createDictationDebugInfo = (): DictationDebugInfo => ({
  recorderState: "idle",
  attemptCount: 0,
  chunkCount: 0,
  bytesCaptured: 0,
  lastUploadStatus: "idle",
  lastUploadAt: null,
  lastUploadBytes: null,
  storagePath: null,
  lastError: null,
  lastReason: null,
  persisted: false,
});

const createDictationDebugInfoMap = (): Record<FeedbackField, DictationDebugInfo> => ({
  voice_assistant_feedback: createDictationDebugInfo(),
  communication_style_feedback: createDictationDebugInfo(),
  experiment_feedback: createDictationDebugInfo(),
});

const createDictationRecorderState = (): DictationRecorderState => ({
  recorder: null,
  stream: null,
  chunks: [],
  mimeType: "audio/webm",
  storagePath: null,
  attemptCount: 0,
  activeStartMs: null,
  activeDurationMs: 0,
  persisted: false,
  stopPromise: null,
  resolveStop: null,
});

const createDictationRecorderStateMap = (): Record<FeedbackField, DictationRecorderState> => ({
  voice_assistant_feedback: createDictationRecorderState(),
  communication_style_feedback: createDictationRecorderState(),
  experiment_feedback: createDictationRecorderState(),
});

const resetDictationSegmentState = (recorderState: DictationRecorderState) => {
  recorderState.chunks = [];
  recorderState.storagePath = null;
  recorderState.activeStartMs = null;
  recorderState.activeDurationMs = 0;
  recorderState.persisted = false;
  recorderState.stopPromise = null;
  recorderState.resolveStop = null;
};

const getSupportedAudioMimeType = () => {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
};

const fileExtensionForMimeType = (mimeType: string) => {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const FeedbackQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [voiceAssistantExperience, setVoiceAssistantExperience] = useState("");
  const [communicationStyleFeedback, setCommunicationStyleFeedback] = useState("");
  const [experimentFeedback, setExperimentFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [interimExperience, setInterimExperience] = useState("");
  const [interimStyle, setInterimStyle] = useState("");
  const [interimExperiment, setInterimExperiment] = useState("");
  const [dictationDebug, setDictationDebug] = useState<Record<FeedbackField, DictationDebugInfo>>(createDictationDebugInfoMap());
  const loggedInputModesRef = useRef<Set<string>>(new Set());
  const feedbackInputModesRef = useRef<Record<FeedbackField, { typed: boolean; dictated: boolean }>>({
    voice_assistant_feedback: { typed: false, dictated: false },
    communication_style_feedback: { typed: false, dictated: false },
    experiment_feedback: { typed: false, dictated: false },
  });
  const autosaveFingerprintRef = useRef<string>("");
  const autosaveInFlightRef = useRef(false);
  const autosaveQueuedRef = useRef(false);
  const dictationRecordersRef = useRef<Record<FeedbackField, DictationRecorderState>>(createDictationRecorderStateMap());
  const submitInFlightRef = useRef(false);
  
  // Refs to stop dictation when clicking on another field
  const experienceDictationRef = useRef<VoiceDictationRef>(null);
  const styleDictationRef = useRef<VoiceDictationRef>(null);
  const experimentDictationRef = useRef<VoiceDictationRef>(null);
  
  // Refs for scrolling to questions
  const experienceQuestionRef = useRef<HTMLDivElement>(null);
  const styleQuestionRef = useRef<HTMLDivElement>(null);
  const experimentQuestionRef = useRef<HTMLDivElement>(null);
  
  const MAX_CHARS = 2500;
  const MIN_WORDS = 35;
  
  // Stop all dictation sessions
  const stopAllDictation = useCallback(() => {
    experienceDictationRef.current?.stopListening();
    styleDictationRef.current?.stopListening();
    experimentDictationRef.current?.stopListening();
  }, []);

  const logFeedbackEvent = useCallback((eventType: string, metadata: Record<string, unknown> = {}) => {
    if (!prolificId) return;
    void logNavigationEvent({
      prolificId,
      callId,
      pageName: "feedback",
      eventType,
      metadata: metadata as Json,
    });
  }, [prolificId, callId]);

  const updateDictationDebug = useCallback((field: FeedbackField, patch: Partial<DictationDebugInfo>) => {
    setDictationDebug((prev) => ({
      ...prev,
      [field]: {
        ...prev[field],
        ...patch,
      },
    }));
  }, []);

  const buildFeedbackDraftMetadata = useCallback(() => {
    const responses = {
      voice_assistant_feedback: voiceAssistantExperience,
      communication_style_feedback: communicationStyleFeedback,
      experiment_feedback: experimentFeedback,
    };
    const wordCounts = {
      voice_assistant_feedback: countWords(voiceAssistantExperience),
      communication_style_feedback: countWords(communicationStyleFeedback),
      experiment_feedback: countWords(experimentFeedback),
    };
    const inputModes = {
      voice_assistant_feedback: { ...feedbackInputModesRef.current.voice_assistant_feedback },
      communication_style_feedback: { ...feedbackInputModesRef.current.communication_style_feedback },
      experiment_feedback: { ...feedbackInputModesRef.current.experiment_feedback },
    };
    return {
      responses,
      wordCounts,
      inputModes,
    };
  }, [communicationStyleFeedback, experimentFeedback, voiceAssistantExperience]);

  const persistFeedbackDraft = useCallback(async (reason: string, force = false) => {
    if (!prolificId) return;

    const draftMetadata = buildFeedbackDraftMetadata();
    const fingerprint = JSON.stringify(draftMetadata.responses);
    if (!force && autosaveFingerprintRef.current === fingerprint) {
      return;
    }

    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true;
      return;
    }

    autosaveInFlightRef.current = true;
    try {
      await logNavigationEvent({
        prolificId,
        callId,
        pageName: "feedback",
        eventType: FEEDBACK_AUTOSAVE_EVENT_TYPE,
        metadata: {
          ...draftMetadata,
          reason,
          capturedAt: new Date().toISOString(),
        },
      });
      autosaveFingerprintRef.current = fingerprint;
    } catch (error) {
      console.error("Error autosaving feedback draft:", error);
    } finally {
      autosaveInFlightRef.current = false;
      if (autosaveQueuedRef.current) {
        autosaveQueuedRef.current = false;
        await persistFeedbackDraft("queued_retry", true);
      }
    }
  }, [buildFeedbackDraftMetadata, callId, prolificId]);

  const buildRecordingStoragePath = useCallback((field: FeedbackField, mimeType: string) => {
    const safeProlificId = prolificId || "unknown-prolific";
    const safeCallId = callId || "unknown-call";
    const ext = fileExtensionForMimeType(mimeType);
    const randomSuffix = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    return `${safeProlificId}/${safeCallId}/${field}/${Date.now()}-${randomSuffix}.${ext}`;
  }, [prolificId, callId]);

  const ensureDictationRecorder = useCallback(async (field: FeedbackField) => {
    const recorderState = dictationRecordersRef.current[field];
    if (recorderState.recorder) {
      console.info("[DictationAudio] Reusing existing recorder", {
        field,
        recorderState: recorderState.recorder.state,
      });
      return recorderState;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      updateDictationDebug(field, {
        recorderState: "unsupported",
        lastError: "MediaRecorder or microphone access is not supported in this browser.",
      });
      logFeedbackEvent("dictation_recording_error", {
        field,
        fieldLabel: FEEDBACK_FIELD_LABELS[field],
        errorCode: "media_recorder_unsupported",
      });
      return null;
    }

    try {
      console.info("[DictationAudio] Creating MediaRecorder", {
        field,
        prolificId,
        callId,
      });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeType = getSupportedAudioMimeType();
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      recorderState.stream = stream;
      recorderState.recorder = recorder;
      recorderState.mimeType = supportedMimeType || recorder.mimeType || "audio/webm";
      resetDictationSegmentState(recorderState);
      console.info("[DictationAudio] Recorder created", {
        field,
        mimeType: recorderState.mimeType,
      });
      updateDictationDebug(field, {
        recorderState: "idle",
        lastError: null,
        storagePath: recorderState.storagePath,
        persisted: recorderState.persisted,
      });

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recorderState.chunks.push(event.data);
          const totalBytes = recorderState.chunks.reduce((sum, chunk) => sum + chunk.size, 0);
          console.info("[DictationAudio] Chunk captured", {
            field,
            chunkSizeBytes: event.data.size,
            chunkCount: recorderState.chunks.length,
            totalBytes,
          });
          updateDictationDebug(field, {
            chunkCount: recorderState.chunks.length,
            bytesCaptured: totalBytes,
          });
        }
      };

      recorder.onstart = () => {
        recorderState.attemptCount += 1;
        recorderState.activeStartMs = Date.now();
        console.info("[DictationAudio] Recording started", {
          field,
          attemptCount: recorderState.attemptCount,
        });
        updateDictationDebug(field, {
          recorderState: "recording",
          attemptCount: recorderState.attemptCount,
          lastError: null,
        });
      };

      recorder.onresume = () => {
        recorderState.activeStartMs = Date.now();
        console.info("[DictationAudio] Recording resumed", { field });
        updateDictationDebug(field, {
          recorderState: "recording",
          lastError: null,
        });
      };

      recorder.onpause = () => {
        if (recorderState.activeStartMs) {
          recorderState.activeDurationMs += Date.now() - recorderState.activeStartMs;
          recorderState.activeStartMs = null;
        }
        console.info("[DictationAudio] Recording paused", {
          field,
          durationMs: Math.max(0, Math.round(recorderState.activeDurationMs)),
        });
        updateDictationDebug(field, {
          recorderState: "paused",
        });
      };

      recorder.onstop = () => {
        if (recorderState.activeStartMs) {
          recorderState.activeDurationMs += Date.now() - recorderState.activeStartMs;
          recorderState.activeStartMs = null;
        }
        console.info("[DictationAudio] Recording stopped", {
          field,
          durationMs: Math.max(0, Math.round(recorderState.activeDurationMs)),
          chunkCount: recorderState.chunks.length,
        });
        recorderState.resolveStop?.();
        recorderState.resolveStop = null;
        recorderState.stopPromise = null;
        updateDictationDebug(field, {
          recorderState: "stopped",
        });
      };

      recorder.onerror = () => {
        console.error("[DictationAudio] MediaRecorder runtime error", { field });
        updateDictationDebug(field, {
          lastUploadStatus: "error",
          lastError: "MediaRecorder runtime error.",
        });
        logFeedbackEvent("dictation_recording_error", {
          field,
          fieldLabel: FEEDBACK_FIELD_LABELS[field],
          errorCode: "media_recorder_runtime_error",
        });
      };

      return recorderState;
    } catch (error) {
      console.error("[DictationAudio] Failed to create recorder", {
        field,
        message: error instanceof Error ? error.message : String(error),
      });
      updateDictationDebug(field, {
        lastUploadStatus: "error",
        lastError: error instanceof Error ? error.message : String(error),
      });
      logFeedbackEvent("dictation_recording_error", {
        field,
        fieldLabel: FEEDBACK_FIELD_LABELS[field],
        errorCode: "media_recorder_setup_failed",
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }, [callId, logFeedbackEvent, prolificId, updateDictationDebug]);

  const startOrResumeDictationRecording = useCallback(async (field: FeedbackField) => {
    console.info("[DictationAudio] Start/resume requested", { field, isResearcherMode });
    const recorderState = await ensureDictationRecorder(field);
    if (!recorderState?.recorder) return;

    const recorder = recorderState.recorder;
    if (recorder.state === "inactive") {
      resetDictationSegmentState(recorderState);
      updateDictationDebug(field, {
        recorderState: "idle",
        chunkCount: 0,
        bytesCaptured: 0,
        storagePath: null,
        persisted: false,
        lastError: null,
      });
      recorder.start(1000);
      return;
    }
    if (recorder.state === "paused") {
      recorder.resume();
    }
    updateDictationDebug(field, {
      recorderState: "recording",
      lastError: null,
    });
  }, [ensureDictationRecorder, isResearcherMode, updateDictationDebug]);

  const pauseDictationRecording = useCallback((field: FeedbackField) => {
    const recorder = dictationRecordersRef.current[field].recorder;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      updateDictationDebug(field, {
        recorderState: "paused",
      });
    }
  }, [updateDictationDebug]);

  const stopDictationRecording = useCallback(async (field: FeedbackField) => {
    const recorderState = dictationRecordersRef.current[field];
    const recorder = recorderState.recorder;
    if (!recorder || recorder.state === "inactive") return;
    if (!recorderState.stopPromise) {
      recorderState.stopPromise = new Promise<void>((resolve) => {
        recorderState.resolveStop = resolve;
      });
    }
    recorder.stop();
    await recorderState.stopPromise;
  }, []);

  const pauseOtherDictationRecordings = useCallback((activeField: FeedbackField) => {
    FEEDBACK_FIELDS.forEach((field) => {
      if (field !== activeField) {
        pauseDictationRecording(field);
      }
    });
  }, [pauseDictationRecording]);

  const uploadDictationSnapshot = useCallback(async (
    field: FeedbackField,
    payload: DictationUploadPayload,
    options: { finalizeRow?: boolean } = {}
  ): Promise<boolean> => {
    console.info("[DictationAudio] Upload snapshot requested", {
      field,
      finalizeRow: Boolean(options.finalizeRow),
      prolificId,
      callId,
    });
    if (!prolificId) {
      updateDictationDebug(field, {
        lastUploadStatus: "error",
        lastError: "Missing prolificId; cannot upload dictation audio.",
      });
      return false;
    }

    updateDictationDebug(field, {
      lastUploadStatus: "uploading",
      lastError: null,
    });

    if (!payload.chunkCount || payload.blob.size === 0) {
      console.info("[DictationAudio] Skipping upload because no chunks were captured", {
        field,
        attemptCount: payload.attemptCount,
      });
      updateDictationDebug(field, {
        lastUploadStatus: "idle",
      });
      return true;
    }

    console.info("[DictationAudio] Uploading audio blob", {
      field,
      storagePath: payload.storagePath,
      mimeType: payload.mimeType,
      sizeBytes: payload.blob.size,
      chunkCount: payload.chunkCount,
    });

    const { error: uploadError } = await supabase.storage
      .from(DICTATION_AUDIO_BUCKET)
      .upload(payload.storagePath, payload.blob, {
        contentType: payload.mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("[DictationAudio] Storage upload failed", {
        field,
        storagePath: payload.storagePath,
        message: uploadError.message,
      });
      updateDictationDebug(field, {
        lastUploadStatus: "error",
        lastError: uploadError.message,
        storagePath: payload.storagePath,
      });
      logFeedbackEvent("dictation_recording_upload_error", {
        field,
        fieldLabel: FEEDBACK_FIELD_LABELS[field],
        message: uploadError.message,
        storagePath: payload.storagePath,
        attemptCount: payload.attemptCount,
      });
      return false;
    }

    console.info("[DictationAudio] Storage upload succeeded", {
      field,
      storagePath: payload.storagePath,
      sizeBytes: payload.blob.size,
      durationMs: payload.durationMs,
      attemptCount: payload.attemptCount,
    });
    updateDictationDebug(field, {
      lastUploadStatus: "uploaded",
      lastUploadAt: new Date().toISOString(),
      lastUploadBytes: payload.blob.size,
      storagePath: payload.storagePath,
      chunkCount: payload.chunkCount,
      bytesCaptured: payload.blob.size,
      attemptCount: payload.attemptCount,
    });
    logFeedbackEvent("dictation_recording_uploaded", {
      field,
      fieldLabel: FEEDBACK_FIELD_LABELS[field],
      attemptCount: payload.attemptCount,
      fileSizeBytes: payload.blob.size,
      durationMs: payload.durationMs,
      storageBucket: DICTATION_AUDIO_BUCKET,
      storagePath: payload.storagePath,
      isFinal: Boolean(options.finalizeRow),
    });

    if (!options.finalizeRow) return true;

    console.info("[DictationAudio] Inserting dictation metadata row", {
      field,
      prolificId,
      callId,
      storagePath: payload.storagePath,
    });
    const { error: insertError } = await (supabase.from("dictation_recordings") as ReturnType<typeof supabase.from>).insert({
      prolific_id: prolificId,
      call_id: callId || null,
      page_name: "feedback",
      field,
      mime_type: payload.mimeType,
      storage_bucket: DICTATION_AUDIO_BUCKET,
      storage_path: payload.storagePath,
      file_size_bytes: payload.blob.size,
      duration_ms: payload.durationMs,
      attempt_count: payload.attemptCount,
    } as Record<string, unknown>);

    if (insertError) {
      console.error("[DictationAudio] Metadata insert failed", {
        field,
        message: insertError.message,
      });
      updateDictationDebug(field, {
        lastUploadStatus: "error",
        lastError: `Metadata insert failed: ${insertError.message}`,
      });
      logFeedbackEvent("dictation_recording_upload_error", {
        field,
        fieldLabel: FEEDBACK_FIELD_LABELS[field],
        message: insertError.message,
        stage: "metadata_insert",
        storagePath: payload.storagePath,
        attemptCount: payload.attemptCount,
      });
      return false;
    }

    console.info("[DictationAudio] Metadata row inserted", {
      field,
      storagePath: payload.storagePath,
    });
    updateDictationDebug(field, { persisted: true, lastError: null });
    return true;
  }, [callId, logFeedbackEvent, prolificId, updateDictationDebug]);

  const persistDictationSegment = useCallback(async (field: FeedbackField) => {
    await stopDictationRecording(field);
    const recorderState = dictationRecordersRef.current[field];
    const mimeType = recorderState.mimeType || "audio/webm";
    const chunkCount = recorderState.chunks.length;
    if (!chunkCount) {
      updateDictationDebug(field, {
        recorderState: "idle",
        lastUploadStatus: "idle",
        chunkCount: 0,
        bytesCaptured: 0,
      });
      return;
    }
    if (!recorderState.storagePath) {
      recorderState.storagePath = buildRecordingStoragePath(field, mimeType);
    }
    const payload: DictationUploadPayload = {
      mimeType,
      blob: new Blob(recorderState.chunks, { type: mimeType }),
      storagePath: recorderState.storagePath,
      attemptCount: recorderState.attemptCount,
      durationMs: Math.max(0, Math.round(recorderState.activeDurationMs)),
      chunkCount,
    };
    const uploadSucceeded = await uploadDictationSnapshot(field, payload, { finalizeRow: true });
    if (!uploadSucceeded) return;
    resetDictationSegmentState(recorderState);
    updateDictationDebug(field, {
      recorderState: "idle",
      chunkCount: 0,
      bytesCaptured: 0,
      storagePath: null,
      persisted: false,
    });
  }, [buildRecordingStoragePath, stopDictationRecording, updateDictationDebug, uploadDictationSnapshot]);

  const persistDictationRecordings = useCallback(async () => {
    if (!prolificId) return;

    console.info("[DictationAudio] Persisting dictation recordings", { prolificId, callId });
    for (const field of FEEDBACK_FIELDS) {
      await persistDictationSegment(field);
    }
  }, [callId, persistDictationSegment, prolificId]);

  const markFeedbackInputMode = useCallback((field: FeedbackField, mode: FeedbackInputMode) => {
    feedbackInputModesRef.current[field][mode] = true;
    const dedupeKey = `${field}:${mode}`;
    if (loggedInputModesRef.current.has(dedupeKey)) return;
    loggedInputModesRef.current.add(dedupeKey);
    logFeedbackEvent("feedback_input_mode", {
      field,
      fieldLabel: FEEDBACK_FIELD_LABELS[field],
      mode,
    });
  }, [logFeedbackEvent]);

  const runDictationMicPrecheck = useCallback(async (field: FeedbackField) => {
    if (isResearcherMode) return true;

    const micDiagnostics = await runMicDiagnostics({ sampleMs: 900 });
    logFeedbackEvent("mic_permission", {
      context: "dictation",
      field,
      fieldLabel: FEEDBACK_FIELD_LABELS[field],
      state: micDiagnostics.permissionState,
      source: micDiagnostics.permissionSource,
      reasonCode: micDiagnostics.reasonCode || "none",
      getUserMediaDurationMs: micDiagnostics.getUserMediaDurationMs,
      inputDeviceCount: micDiagnostics.inputDeviceCount,
      trackEnabled: micDiagnostics.trackEnabled,
      trackMuted: micDiagnostics.trackMuted,
      trackReadyState: micDiagnostics.trackReadyState,
      errorName: micDiagnostics.errorName,
      errorMessage: micDiagnostics.errorMessage,
    });

    if (micDiagnostics.audioDetected !== "unknown") {
      logFeedbackEvent("mic_audio_check", {
        context: "dictation",
        field,
        fieldLabel: FEEDBACK_FIELD_LABELS[field],
        detected: micDiagnostics.audioDetected,
        peakRms: micDiagnostics.peakRms,
        sampleMs: micDiagnostics.sampleMs,
        reasonCode: micDiagnostics.reasonCode || "none",
      });
    }

    const isPermissionBlocked = micDiagnostics.permissionState === "denied";
    const isMicAccessError = micDiagnostics.permissionState === "error" || micDiagnostics.permissionState === "unsupported";
    if (isPermissionBlocked || isMicAccessError) {
      updateDictationDebug(field, {
        lastUploadStatus: "error",
        lastError: `Mic precheck blocked: ${micDiagnostics.permissionState}`,
      });
      logFeedbackEvent("dictation_start_blocked", {
        field,
        fieldLabel: FEEDBACK_FIELD_LABELS[field],
        reasonCode: micDiagnostics.reasonCode || "mic_access_error",
        permissionState: micDiagnostics.permissionState,
      });
      toast({
        title: "Microphone Access Needed",
        description: "Please allow microphone access in your browser to use dictation.",
        variant: "destructive",
      });
      return false;
    }

    updateDictationDebug(field, {
      lastError: null,
    });
    return true;
  }, [isResearcherMode, logFeedbackEvent, toast, updateDictationDebug]);

  const handleDictationListeningChange = useCallback((field: FeedbackField, isListeningNow: boolean, reason?: string) => {
    logFeedbackEvent(isListeningNow ? "dictation_started" : "dictation_stopped", {
      field,
      fieldLabel: FEEDBACK_FIELD_LABELS[field],
      reason: reason || null,
    });
    updateDictationDebug(field, {
      lastReason: reason || null,
      recorderState: isListeningNow ? "recording" : "paused",
    });
    if (isListeningNow) {
      markFeedbackInputMode(field, "dictated");
      pauseOtherDictationRecordings(field);
      void startOrResumeDictationRecording(field);
      return;
    }
    void persistDictationSegment(field);
  }, [
    logFeedbackEvent,
    markFeedbackInputMode,
    pauseOtherDictationRecordings,
    persistDictationSegment,
    startOrResumeDictationRecording,
    updateDictationDebug,
  ]);

  const handleDictationError = useCallback((field: FeedbackField, errorCode: string, message?: string) => {
    logFeedbackEvent("dictation_error", {
      field,
      fieldLabel: FEEDBACK_FIELD_LABELS[field],
      errorCode,
      message: message || null,
    });
    updateDictationDebug(field, {
      lastUploadStatus: "error",
      lastError: `${errorCode}${message ? `: ${message}` : ""}`,
    });
    void persistDictationSegment(field);
  }, [logFeedbackEvent, persistDictationSegment, updateDictationDebug]);

  const { trackBackButtonClick } = usePageTracking({
    pageName: "feedback",
    prolificId,
    callId,
  });

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const getWordCountStatus = (text: string): { count: number; isValid: boolean } => {
    const count = countWords(text);
    return { count, isValid: count >= MIN_WORDS };
  };

  useEffect(() => {
    const checkAccess = async () => {
      const storedId = sessionStorage.getItem("prolificId");
      const stateCallId = location.state?.callId;
      const petsDataString = sessionStorage.getItem("petsData");
      const godspeedDataString = sessionStorage.getItem("godspeedData");
      const tiasDataString = sessionStorage.getItem("tiasData");
      const tipiDataString = sessionStorage.getItem("tipiData");
      const intentionDataString = sessionStorage.getItem("intentionData");
      const formalityDataString = sessionStorage.getItem("formalityData");

      const finalProlificId = storedId || "RESEARCHER_MODE";
      const finalCallId = stateCallId || sessionStorage.getItem("callId") || "researcher-call-id";

      setProlificId(finalProlificId);
      setCallId(finalCallId);
      sessionStorage.setItem("prolificId", finalProlificId);
      sessionStorage.setItem("callId", finalCallId);
      sessionStorage.setItem("flowStep", "4");

      if (!petsDataString) {
        sessionStorage.setItem(
          "petsData",
          JSON.stringify({
            e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
            u1: 50, u2: 50, u3: 50, u4: 50,
            e1_position: 1, e2_position: 2, e3_position: 3, e4_position: 4, e5_position: 5, e6_position: 6,
            u1_position: 7, u2_position: 8, u3_position: 9, u4_position: 10,
            attention_check_1: 50,
            attention_check_1_expected: 50,
            attention_check_1_position: 11,
            prolific_id: finalProlificId,
            call_id: finalCallId,
            pets_er: 50,
            pets_ut: 50,
            pets_total: 50,
          }),
        );
      }

      if (!godspeedDataString) {
        sessionStorage.setItem(
          "godspeedData",
          JSON.stringify({
            godspeed_anthro_1: 3,
            godspeed_anthro_2: 3,
            godspeed_anthro_3: 3,
            godspeed_anthro_4: 3,
            godspeed_like_1: 3,
            godspeed_like_2: 3,
            godspeed_like_3: 3,
            godspeed_like_4: 3,
            godspeed_like_5: 3,
            godspeed_intel_1: 3,
            godspeed_intel_2: 3,
            godspeed_intel_3: 3,
            godspeed_intel_4: 3,
            godspeed_intel_5: 3,
            godspeed_anthro_1_position: 1,
            godspeed_anthro_2_position: 2,
            godspeed_anthro_3_position: 3,
            godspeed_anthro_4_position: 4,
            godspeed_like_1_position: 5,
            godspeed_like_2_position: 6,
            godspeed_like_3_position: 7,
            godspeed_like_4_position: 8,
            godspeed_like_5_position: 9,
            godspeed_intel_1_position: 10,
            godspeed_intel_2_position: 11,
            godspeed_intel_3_position: 12,
            godspeed_intel_4_position: 13,
            godspeed_intel_5_position: 14,
            godspeed_anthro_total: 3,
            godspeed_like_total: 3,
            godspeed_intel_total: 3,
            godspeed_attention_check_1: 3,
            godspeed_attention_check_1_expected: 3,
            godspeed_attention_check_1_position: 15,
          }),
        );
      }

      if (!tiasDataString) {
        sessionStorage.setItem(
          "tiasData",
          JSON.stringify({
            tias_1: 4, tias_2: 4, tias_3: 4, tias_4: 4, tias_5: 4, tias_6: 4,
            tias_7: 4, tias_8: 4, tias_9: 4, tias_10: 4, tias_11: 4, tias_12: 4,
            tias_1_position: 1, tias_2_position: 2, tias_3_position: 3, tias_4_position: 4,
            tias_5_position: 5, tias_6_position: 6, tias_7_position: 7, tias_8_position: 8,
            tias_9_position: 9, tias_10_position: 10, tias_11_position: 11, tias_12_position: 12,
            tias_attention_check_1: 4,
            tias_attention_check_1_expected: 4,
            tias_attention_check_1_position: 13,
            tias_total: 4,
          }),
        );
      }

      if (!tipiDataString) {
        sessionStorage.setItem(
          "tipiData",
          JSON.stringify({
            tipi_1: 4, tipi_2: 4, tipi_3: 4, tipi_4: 4, tipi_5: 4,
            tipi_6: 4, tipi_7: 4, tipi_8: 4, tipi_9: 4, tipi_10: 4,
            tipi_1_position: 1, tipi_2_position: 2, tipi_3_position: 3, tipi_4_position: 4, tipi_5_position: 5,
            tipi_6_position: 6, tipi_7_position: 7, tipi_8_position: 8, tipi_9_position: 9, tipi_10_position: 10,
            tipi_attention_check_1: 4,
            tipi_attention_check_1_expected: 4,
            tipi_attention_check_1_position: 11,
            tipi_extraversion: 4,
            tipi_agreeableness: 4,
            tipi_conscientiousness: 4,
            tipi_emotional_stability: 4,
            tipi_openness: 4,
          }),
        );
      }

      // Check if intentionData exists AND has valid non-null values
      const needsIntentionDefaults = !intentionDataString || (() => {
        try {
          const parsed = JSON.parse(intentionDataString);
          return parsed.intention_1 === null || parsed.intention_2 === null;
        } catch {
          return true;
        }
      })();

      if (needsIntentionDefaults) {
        sessionStorage.setItem(
          "intentionData",
          JSON.stringify({
            intention_1: 4,
            intention_2: 4,
          }),
        );
      }

      if (!formalityDataString) {
        sessionStorage.setItem(
          "formalityData",
          JSON.stringify({
            formality: 4,
          }),
        );
      }
      setIsLoading(false);
    };
    checkAccess();
  }, [navigate, location, toast, isResearcherMode]);

  useEffect(() => {
    loggedInputModesRef.current.clear();
    feedbackInputModesRef.current = {
      voice_assistant_feedback: { typed: false, dictated: false },
      communication_style_feedback: { typed: false, dictated: false },
      experiment_feedback: { typed: false, dictated: false },
    };
    autosaveFingerprintRef.current = "";
    autosaveInFlightRef.current = false;
    autosaveQueuedRef.current = false;
    setDictationDebug(createDictationDebugInfoMap());
    FEEDBACK_FIELDS.forEach((field) => {
      const state = dictationRecordersRef.current[field];
      try {
        if (state.recorder && state.recorder.state !== "inactive") {
          state.recorder.stop();
        }
      } catch {
        // ignore reset cleanup errors
      }
      state.stream?.getTracks().forEach((track) => track.stop());
    });
    dictationRecordersRef.current = createDictationRecorderStateMap();
  }, [prolificId, callId]);

  useEffect(() => {
    return () => {
      FEEDBACK_FIELDS.forEach((field) => {
        const state = dictationRecordersRef.current[field];
        try {
          if (state.recorder && state.recorder.state !== "inactive") {
            state.recorder.stop();
          }
        } catch {
          // ignore stop errors during unmount cleanup
        }
        state.stream?.getTracks().forEach((track) => track.stop());
      });
    };
  }, []);

  useEffect(() => {
    if (!prolificId) return;
    const timer = window.setTimeout(() => {
      void persistFeedbackDraft("debounced_change");
    }, FEEDBACK_AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [
    communicationStyleFeedback,
    experimentFeedback,
    prolificId,
    persistFeedbackDraft,
    voiceAssistantExperience,
  ]);

  useEffect(() => {
    if (!prolificId) return;
    const intervalId = window.setInterval(() => {
      void persistFeedbackDraft("heartbeat");
    }, FEEDBACK_AUTOSAVE_HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [persistFeedbackDraft, prolificId]);

  useEffect(() => {
    if (!prolificId) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void persistFeedbackDraft("visibility_hidden", true);
      }
    };
    const handlePageHide = () => {
      void persistFeedbackDraft("pagehide", true);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [persistFeedbackDraft, prolificId]);

  const handleBackClick = async () => {
    await persistFeedbackDraft("back_click", true);
    stopAllDictation();
    await persistDictationRecordings();
    await trackBackButtonClick({
      voiceAssistantExperienceWordCount: countWords(voiceAssistantExperience),
      communicationStyleWordCount: countWords(communicationStyleFeedback),
      experimentFeedbackWordCount: countWords(experimentFeedback),
    });
    
    navigate("/questionnaire/tipi", {
      state: {
        callId,
      },
    });
  };

  const handleSubmit = async () => {
    // Stop all dictation when submitting
    await persistFeedbackDraft("submit_click", true);
    stopAllDictation();
    
    const experienceStatus = getWordCountStatus(voiceAssistantExperience);
    const styleStatus = getWordCountStatus(communicationStyleFeedback);
    const experimentStatus = getWordCountStatus(experimentFeedback);

    if (!isResearcherMode) {
      if (!experienceStatus.isValid || !styleStatus.isValid || !experimentStatus.isValid) {
        setShowValidationErrors(true);
        
        // Scroll to the first question that doesn't meet the minimum
        setTimeout(() => {
          if (!experienceStatus.isValid && experienceQuestionRef.current) {
            experienceQuestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (!styleStatus.isValid && styleQuestionRef.current) {
            styleQuestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (!experimentStatus.isValid && experimentQuestionRef.current) {
            experimentQuestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
        
        toast({
          title: "Minimum Word Count Required",
          description: `Please write at least ${MIN_WORDS} words for each question before submitting.`,
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
    }

    const markSessionComplete = async (sessionToken: string | null): Promise<boolean> => {
      if (sessionToken) {
        const { data: markCompleteData, error: markCompleteError } = await supabase.functions.invoke("mark-session-complete", {
          body: {
            sessionToken,
          },
        });

        if (!markCompleteError) {
          const successFlag =
            typeof markCompleteData === "object" &&
            markCompleteData !== null &&
            "success" in markCompleteData
              ? Boolean((markCompleteData as Record<string, unknown>).success)
              : true;
          if (successFlag) return true;
        } else {
          console.error("Failed to mark session complete via edge function:", markCompleteError);
        }

        const { data: fallbackSessionRows, error: fallbackSessionError } = await supabase
          .from("participant_calls")
          .update({ token_used: true })
          .eq("session_token", sessionToken)
          .eq("token_used", false)
          .select("id")
          .limit(1);

        if (fallbackSessionError) {
          console.error("Fallback update by session token failed while marking session complete:", fallbackSessionError);
        } else if ((fallbackSessionRows?.length || 0) > 0) {
          return true;
        }
      }

      if (!callId) {
        return false;
      }

      let callScopedUpdate = supabase
        .from("participant_calls")
        .update({ token_used: true })
        .eq("call_id", callId)
        .eq("token_used", false);
      if (prolificId) {
        callScopedUpdate = callScopedUpdate.eq("prolific_id", prolificId);
      }
      const { data: fallbackCallRows, error: fallbackCallError } = await callScopedUpdate
        .select("id")
        .limit(1);

      if (fallbackCallError) {
        console.error("Fallback update by call ID failed while marking session complete:", fallbackCallError);
        return false;
      }

      return (fallbackCallRows?.length || 0) > 0;
    };

    const getFunctionErrorInfo = async (
      invokeError: unknown,
      invokeData: unknown,
    ): Promise<{ status: number | null; message: string }> => {
      let status: number | null = null;
      let bodyMessage = "";

      if (invokeError && typeof invokeError === "object") {
        const context = (invokeError as { context?: unknown }).context;
        if (typeof Response !== "undefined" && context instanceof Response) {
          status = context.status;
          try {
            const jsonPayload = (await context.clone().json()) as Record<string, unknown>;
            const payloadError = jsonPayload.error;
            const payloadMessage = jsonPayload.message;
            if (typeof payloadError === "string" && payloadError.trim()) {
              bodyMessage = payloadError.trim();
            } else if (typeof payloadMessage === "string" && payloadMessage.trim()) {
              bodyMessage = payloadMessage.trim();
            }
          } catch {
            try {
              const textPayload = await context.clone().text();
              if (textPayload.trim()) {
                bodyMessage = textPayload.trim();
              }
            } catch {
              // Ignore parsing failures for function error payload
            }
          }
        }
      }

      if (!bodyMessage && invokeData && typeof invokeData === "object") {
        const dataError = (invokeData as Record<string, unknown>).error;
        if (typeof dataError === "string" && dataError.trim()) {
          bodyMessage = dataError.trim();
        }
      }

      const baseMessage =
        invokeError && typeof invokeError === "object" && typeof (invokeError as { message?: unknown }).message === "string"
          ? String((invokeError as { message: string }).message)
          : "";
      const message = `${baseMessage} ${bodyMessage}`.trim();
      return {
        status,
        message: message || baseMessage || bodyMessage || "Unknown function invocation error",
      };
    };

    if (!prolificId || !callId) {
      toast({
        title: "Error",
        description: "Missing required data.",
        variant: "destructive",
      });
      return;
    }
    const sessionToken = localStorage.getItem("sessionToken");
    if (!sessionToken) {
      toast({
        title: "Error",
        description: "Session token not found. Please start over.",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    const petsDataString = sessionStorage.getItem("petsData");
    const godspeedDataString = sessionStorage.getItem("godspeedData");
    const tiasDataString = sessionStorage.getItem("tiasData");
    const tipiDataString = sessionStorage.getItem("tipiData");
    const intentionDataString = sessionStorage.getItem("intentionData");
    const formalityDataString = sessionStorage.getItem("formalityData");
    if (!petsDataString || !godspeedDataString || !tiasDataString || !tipiDataString || !intentionDataString || !formalityDataString) {
      toast({
        title: "Error",
        description: "Previous questionnaire data not found.",
        variant: "destructive",
      });
      navigate("/questionnaire/pets");
      return;
    }
    if (submitInFlightRef.current) {
      return;
    }
    submitInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const petsData = JSON.parse(petsDataString);
      const godspeedData = JSON.parse(godspeedDataString);
      const tiasData = JSON.parse(tiasDataString);
      const tipiData = JSON.parse(tipiDataString);
      const intentionData = JSON.parse(intentionDataString);
      const formalityData = JSON.parse(formalityDataString);

      const feedbackPayload = {
        formality: formalityData.formality,
        voice_assistant_feedback: voiceAssistantExperience || "Not provided",
        communication_style_feedback: communicationStyleFeedback || "Not provided",
        experiment_feedback: experimentFeedback || "Not provided",
      };

      // Get assistant type from session storage (set during VoiceConversation)
      const assistantType = sessionStorage.getItem("assistantType") || null;

      const { data, error } = await supabase.functions.invoke("submit-questionnaire", {
        body: {
          sessionToken,
          petsData,
          godspeedData,
          tiasData,
          tipiData,
          intentionData,
          feedbackData: feedbackPayload,
          assistantType,
        },
      });
      if (error) {
        const { status: errorStatus, message: errorMessage } = await getFunctionErrorInfo(error, data);
        const normalizedErrorMessage = errorMessage.toLowerCase();
        console.error("Error submitting questionnaire:", {
          status: errorStatus,
          errorMessage,
          error,
          data,
        });

        const isAlreadySubmitted =
          errorStatus === 409 ||
          normalizedErrorMessage.includes("already submitted");
        if (isAlreadySubmitted) {
          const completionMarked = await markSessionComplete(sessionToken);
          if (isResearcherMode) {
            sessionStorage.setItem("flowStep", "5");
            sessionStorage.setItem(RESEARCHER_ROTATE_PENDING_KEY, "1");
          }
          toast({
            title: "Already Submitted",
            description: completionMarked
              ? "You have already completed this questionnaire. This session was marked completed."
              : "You have already completed this questionnaire.",
          });
          navigate(isResearcherMode ? "/debriefing" : "/complete");
          return;
        }

        const isInvalidSession =
          errorStatus === 401 ||
          normalizedErrorMessage.includes("invalid or expired session");
        if (isInvalidSession) {
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please start over.",
            variant: "destructive",
          });
          navigate("/");
          return;
        }

        // If save succeeded server-side but client saw a non-2xx/network edge-case, recover gracefully.
        const { data: existingResponse, error: existingResponseError } = await supabase
          .from("experiment_responses")
          .select("id")
          .eq("prolific_id", prolificId)
          .maybeSingle();

        if (!existingResponseError && existingResponse) {
          const completionMarked = await markSessionComplete(sessionToken);
          if (isResearcherMode) {
            sessionStorage.setItem("flowStep", "5");
            sessionStorage.setItem(RESEARCHER_ROTATE_PENDING_KEY, "1");
          }
          toast({
            title: "Submission Recovered",
            description: completionMarked
              ? "Your responses were already saved and this session was marked as completed."
              : "Your responses were already saved.",
          });
          navigate(isResearcherMode ? "/debriefing" : "/complete");
          return;
        }

        toast({
          title: "Error",
          description: "Failed to submit questionnaire. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const completionMarked = await markSessionComplete(sessionToken);
      if (!completionMarked) {
        toast({
          title: "Warning",
          description: "Questionnaire saved, but completion status could not be updated.",
          variant: "destructive",
        });
      }

      try {
        await persistDictationRecordings();
      } catch (dictationPersistError) {
        console.error("Dictation persistence failed after questionnaire submit:", dictationPersistError);
      }

      sessionStorage.removeItem("petsData");
      sessionStorage.removeItem("tiasData");
      sessionStorage.removeItem("formalityData");

      sessionStorage.setItem("flowStep", "5");
      if (isResearcherMode) {
        sessionStorage.setItem(RESEARCHER_ROTATE_PENDING_KEY, "1");
      }
      toast({
        title: isResearcherMode ? "Researcher Preview Submitted" : "Success",
        description: isResearcherMode
          ? "Researcher responses have been submitted successfully."
          : "Your responses have been submitted successfully.",
      });
      navigate("/debriefing");
    } catch (err) {
      console.error("Unexpected error submitting questionnaire:", err);
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      submitInFlightRef.current = false;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const experienceStatus = getWordCountStatus(voiceAssistantExperience);
  const styleStatus = getWordCountStatus(communicationStyleFeedback);
  const experimentStatus = getWordCountStatus(experimentFeedback);
  const showDictationDebug = isResearcherMode || new URLSearchParams(location.search).get("debugAudio") === "1";

  const getDebugStatusColor = (status: DictationDebugInfo["lastUploadStatus"]) => {
    if (status === "uploaded") return "text-emerald-600";
    if (status === "uploading") return "text-sky-600";
    if (status === "error") return "text-rose-600";
    return "text-muted-foreground";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-3xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <ExperimentProgress />
          <CardTitle className="text-2xl text-center">Final Feedback</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
          {/* Bonus motivation message */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 mt-4">
            <p className="text-sm text-foreground text-center font-medium whitespace-nowrap">
              The more detail you provide, the more helpful your feedback and the higher your bonus payout may be.
            </p>
          </div>
          {/* Voice dictation hint */}
          <div className="flex items-center justify-center gap-2 text-muted-foreground mt-2">
            <Mic className="h-4 w-4" />
            <p className="text-sm">
              <span className="font-medium">Tip:</span> Click the "Dictate" button to speak your response instead of typing
            </p>
          </div>
          {showDictationDebug && (
            <details className="rounded border bg-muted/40 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-medium">Dictation Audio Debug</summary>
              <div className="mt-2 space-y-2">
                {FEEDBACK_FIELDS.map((field) => {
                  const debug = dictationDebug[field];
                  return (
                    <div key={field} className="rounded border bg-background p-2">
                      <p className="font-medium">{FEEDBACK_FIELD_LABELS[field]}</p>
                      <p className="text-muted-foreground">
                        Recorder: {debug.recorderState} | Attempts: {debug.attemptCount} | Chunks: {debug.chunkCount} | Captured: {formatBytes(debug.bytesCaptured)}
                      </p>
                      <p className={getDebugStatusColor(debug.lastUploadStatus)}>
                        Upload: {debug.lastUploadStatus}{debug.lastUploadAt ? ` @ ${new Date(debug.lastUploadAt).toLocaleTimeString()}` : ""}
                        {debug.lastUploadBytes != null ? ` | Last size: ${formatBytes(debug.lastUploadBytes)}` : ""}
                        {debug.persisted ? " | DB row persisted" : ""}
                      </p>
                      {debug.lastReason && (
                        <p className="text-muted-foreground">Last reason: {debug.lastReason}</p>
                      )}
                      {debug.storagePath && (
                        <p className="text-muted-foreground break-all">Path: {debug.storagePath}</p>
                      )}
                      {debug.lastError && (
                        <p className="text-rose-600 break-words">Error: {debug.lastError}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Question 1: Voice Assistant Experience */}
          <div ref={experienceQuestionRef} className={`space-y-3 p-4 rounded-lg transition-colors ${showValidationErrors && !experienceStatus.isValid ? 'bg-destructive/10 border border-destructive/50' : showValidationErrors && experienceStatus.isValid ? 'border border-green-500/30' : ''}`}>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">
                Experience with Cali
              </p>
              <label className={`text-lg font-medium block ${showValidationErrors && !experienceStatus.isValid ? 'text-destructive' : 'text-foreground'}`}>
                Describe your experience interacting with Cali during the conversation.
              </label>
              <p className="text-sm text-foreground/70">
                You may consider aspects such as:
              </p>
              <ul className="text-sm text-foreground/70 list-disc list-inside ml-2 space-y-1">
                <li>How Cali communicated overall</li>
                <li>How well Cali understood and responded to you</li>
                <li>Anything that stood out positively or negatively during the interaction</li>
                <li>Any technical issues during the call (audio quality, delays, pauses, voice changes, or glitches)</li>
              </ul>
            </div>
            {showDictationDebug && (
              <p className={`text-xs ${getDebugStatusColor(dictationDebug.voice_assistant_feedback.lastUploadStatus)}`}>
                Audio status: {dictationDebug.voice_assistant_feedback.lastUploadStatus} | Recorder: {dictationDebug.voice_assistant_feedback.recorderState}
              </p>
            )}
            <div className="bg-accent/50 rounded-lg p-4 space-y-3">
              <div className="relative">
                <Textarea
                  value={voiceAssistantExperience + interimExperience}
                  onChange={(e) => {
                    // Only update if not currently showing interim text
                    if (!interimExperience && e.target.value.length <= MAX_CHARS) {
                      setVoiceAssistantExperience(e.target.value);
                      markFeedbackInputMode("voice_assistant_feedback", "typed");
                    }
                  }}
                  onFocus={() => {
                    // Stop other dictation sessions when focusing this field
                    styleDictationRef.current?.stopListening();
                    experimentDictationRef.current?.stopListening();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                  className={`min-h-[150px] resize-none bg-background pr-24 ${showValidationErrors && !experienceStatus.isValid ? 'border-destructive' : ''}`}
                  placeholder="Describe your experience with Cali... (or click Dictate to speak)"
                />
                <div className="absolute top-2 right-2">
                  <VoiceDictation
                    ref={experienceDictationRef}
                    onTranscript={(text) => {
                      markFeedbackInputMode("voice_assistant_feedback", "dictated");
                      setVoiceAssistantExperience((prev) => {
                        const prefix = prev && !prev.endsWith(" ") ? " " : "";
                        const newValue = prev + `${prefix}${text}`;
                        return newValue.length <= MAX_CHARS ? newValue : prev;
                      });
                      logFeedbackEvent("dictation_transcript_appended", {
                        field: "voice_assistant_feedback",
                        fieldLabel: FEEDBACK_FIELD_LABELS.voice_assistant_feedback,
                        text,
                        length: text.length,
                      });
                    }}
                    onInterimTranscript={(text) => {
                      if (text) {
                        const prefix = voiceAssistantExperience && !voiceAssistantExperience.endsWith(" ") ? " " : "";
                        setInterimExperience(prefix + text);
                      } else {
                        setInterimExperience("");
                      }
                    }}
                    onBeforeStart={() => runDictationMicPrecheck("voice_assistant_feedback")}
                    onListeningChange={(isListeningNow, reason) => handleDictationListeningChange("voice_assistant_feedback", isListeningNow, reason)}
                    onDictationError={(errorCode, message) => handleDictationError("voice_assistant_feedback", errorCode, message)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <FeedbackProgressBar 
                wordCount={experienceStatus.count} 
                minWords={MIN_WORDS} 
                showValidationError={showValidationErrors && !experienceStatus.isValid}
                showValidationSuccess={showValidationErrors && experienceStatus.isValid}
              />
            </div>
          </div>

          {/* Question 2: Communication Style and Formality */}
          <div ref={styleQuestionRef} className={`space-y-3 p-4 rounded-lg transition-colors ${showValidationErrors && !styleStatus.isValid ? 'bg-destructive/10 border border-destructive/50' : showValidationErrors && styleStatus.isValid ? 'border border-green-500/30' : ''}`}>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">
                Communication Style (Formality)
              </p>
              <label className={`text-lg font-medium block ${showValidationErrors && !styleStatus.isValid ? 'text-destructive' : 'text-foreground'}`}>
                How would you describe Cali's communication style?
              </label>
              <p className="text-sm text-foreground/70">
                Please include:
              </p>
              <ul className="text-sm text-foreground/70 list-disc list-inside ml-2 space-y-1">
                <li>Whether Cali felt more formal or more informal (and what gave you that impression)</li>
                <li>How appropriate that style felt for this conversation</li>
                <li>Whether the style affected your comfort, engagement, or trust</li>
              </ul>
            </div>
            {showDictationDebug && (
              <p className={`text-xs ${getDebugStatusColor(dictationDebug.communication_style_feedback.lastUploadStatus)}`}>
                Audio status: {dictationDebug.communication_style_feedback.lastUploadStatus} | Recorder: {dictationDebug.communication_style_feedback.recorderState}
              </p>
            )}
            <div className="bg-accent/50 rounded-lg p-4 space-y-3">
              <div className="relative">
                <Textarea
                  value={communicationStyleFeedback + interimStyle}
                  onChange={(e) => {
                    if (!interimStyle && e.target.value.length <= MAX_CHARS) {
                      setCommunicationStyleFeedback(e.target.value);
                      markFeedbackInputMode("communication_style_feedback", "typed");
                    }
                  }}
                  onFocus={() => {
                    experienceDictationRef.current?.stopListening();
                    experimentDictationRef.current?.stopListening();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                  className={`min-h-[150px] resize-none bg-background pr-24 ${showValidationErrors && !styleStatus.isValid ? 'border-destructive' : ''}`}
                  placeholder="Describe Cali's communication style... (or click Dictate to speak)"
                />
                <div className="absolute top-2 right-2">
                  <VoiceDictation
                    ref={styleDictationRef}
                    onTranscript={(text) => {
                      markFeedbackInputMode("communication_style_feedback", "dictated");
                      setCommunicationStyleFeedback((prev) => {
                        const prefix = prev && !prev.endsWith(" ") ? " " : "";
                        const newValue = prev + `${prefix}${text}`;
                        return newValue.length <= MAX_CHARS ? newValue : prev;
                      });
                      logFeedbackEvent("dictation_transcript_appended", {
                        field: "communication_style_feedback",
                        fieldLabel: FEEDBACK_FIELD_LABELS.communication_style_feedback,
                        text,
                        length: text.length,
                      });
                    }}
                    onInterimTranscript={(text) => {
                      if (text) {
                        const prefix = communicationStyleFeedback && !communicationStyleFeedback.endsWith(" ") ? " " : "";
                        setInterimStyle(prefix + text);
                      } else {
                        setInterimStyle("");
                      }
                    }}
                    onBeforeStart={() => runDictationMicPrecheck("communication_style_feedback")}
                    onListeningChange={(isListeningNow, reason) => handleDictationListeningChange("communication_style_feedback", isListeningNow, reason)}
                    onDictationError={(errorCode, message) => handleDictationError("communication_style_feedback", errorCode, message)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <FeedbackProgressBar 
                wordCount={styleStatus.count} 
                minWords={MIN_WORDS} 
                showValidationError={showValidationErrors && !styleStatus.isValid}
                showValidationSuccess={showValidationErrors && styleStatus.isValid}
              />
            </div>
          </div>

          {/* Question 3: Experiment Feedback */}
          <div ref={experimentQuestionRef} className={`space-y-3 p-4 rounded-lg transition-colors ${showValidationErrors && !experimentStatus.isValid ? 'bg-destructive/10 border border-destructive/50' : showValidationErrors && experimentStatus.isValid ? 'border border-green-500/30' : ''}`}>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">
                Feedback on the Experiment
              </p>
              <p className="text-xs text-foreground/60 italic -mt-1">
                This question is about the study setup and experience, not about Cali.
              </p>
              <label className={`text-lg font-medium block ${showValidationErrors && !experimentStatus.isValid ? 'text-destructive' : 'text-foreground'}`}>
                Please share any feedback on the experiment itself, such as:
              </label>
              <ul className="text-sm text-foreground/70 list-disc list-inside ml-2 space-y-1">
                <li>Clarity of instructions and tasks</li>
                <li>Technical issues with the study platform (navigation problems, issues replying to survey questions, page loading issues)</li>
                <li>Flow and pacing of the study</li>
                <li>Anything that could be improved for future participants</li>
              </ul>
            </div>
            {showDictationDebug && (
              <p className={`text-xs ${getDebugStatusColor(dictationDebug.experiment_feedback.lastUploadStatus)}`}>
                Audio status: {dictationDebug.experiment_feedback.lastUploadStatus} | Recorder: {dictationDebug.experiment_feedback.recorderState}
              </p>
            )}
            <div className="bg-accent/50 rounded-lg p-4 space-y-3">
              <div className="relative">
                <Textarea
                  value={experimentFeedback + interimExperiment}
                  onChange={(e) => {
                    if (!interimExperiment && e.target.value.length <= MAX_CHARS) {
                      setExperimentFeedback(e.target.value);
                      markFeedbackInputMode("experiment_feedback", "typed");
                    }
                  }}
                  onFocus={() => {
                    experienceDictationRef.current?.stopListening();
                    styleDictationRef.current?.stopListening();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                  placeholder="Share your feedback on the experiment... (or click Dictate to speak)"
                  className={`min-h-[150px] resize-none bg-background pr-24 ${showValidationErrors && !experimentStatus.isValid ? 'border-destructive' : ''}`}
                />
                <div className="absolute top-2 right-2">
                  <VoiceDictation
                    ref={experimentDictationRef}
                    onTranscript={(text) => {
                      markFeedbackInputMode("experiment_feedback", "dictated");
                      setExperimentFeedback((prev) => {
                        const prefix = prev && !prev.endsWith(" ") ? " " : "";
                        const newValue = prev + `${prefix}${text}`;
                        return newValue.length <= MAX_CHARS ? newValue : prev;
                      });
                      logFeedbackEvent("dictation_transcript_appended", {
                        field: "experiment_feedback",
                        fieldLabel: FEEDBACK_FIELD_LABELS.experiment_feedback,
                        text,
                        length: text.length,
                      });
                    }}
                    onInterimTranscript={(text) => {
                      if (text) {
                        const prefix = experimentFeedback && !experimentFeedback.endsWith(" ") ? " " : "";
                        setInterimExperiment(prefix + text);
                      } else {
                        setInterimExperiment("");
                      }
                    }}
                    onBeforeStart={() => runDictationMicPrecheck("experiment_feedback")}
                    onListeningChange={(isListeningNow, reason) => handleDictationListeningChange("experiment_feedback", isListeningNow, reason)}
                    onDictationError={(errorCode, message) => handleDictationError("experiment_feedback", errorCode, message)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <FeedbackProgressBar 
                wordCount={experimentStatus.count} 
                minWords={MIN_WORDS} 
                showValidationError={showValidationErrors && !experimentStatus.isValid}
                showValidationSuccess={showValidationErrors && experimentStatus.isValid}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={handleBackClick}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1"
              size="lg"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeedbackQuestionnaire;
