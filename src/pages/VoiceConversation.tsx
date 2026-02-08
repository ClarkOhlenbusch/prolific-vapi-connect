import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Vapi from "@vapi-ai/web";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { EndCallDialog } from "@/components/EndCallDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Mic, Phone, Clock } from "lucide-react";
import { useResearcherMode } from "@/contexts/ResearcherModeContext";
import { ExperimentProgress } from "@/components/ExperimentProgress";
import { usePageTracking } from "@/hooks/usePageTracking";
import {
  collectClientContext,
  generateCallAttemptId,
  getCallErrorGuidance,
  getCurrentMicPermissionState,
  getMicIssueGuidance,
  logNavigationEvent,
  mapCallEndReasonToFailureCode,
  mapVapiErrorToReasonCode,
  type TroubleshootingGuidance,
  runMicDiagnostics,
} from "@/lib/participant-telemetry";

const VoiceConversation = () => {
  const ASSISTANT_AUDIO_TIMEOUT_MS = 20000;
  const MIC_AUDIO_MONITOR_SAMPLE_MS = 45000;

  const [prolificId, setProlificId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callTracked, setCallTracked] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [showPreCallModal, setShowPreCallModal] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0); // Display timer counting up
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAwaitingMicPermission, setIsAwaitingMicPermission] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [showRestartFeedbackDialog, setShowRestartFeedbackDialog] = useState(false);
  const [feedbackNextAction, setFeedbackNextAction] = useState<"restart" | "return_to_mic_test" | null>(null);
  const [micIssueGuidance, setMicIssueGuidance] = useState<TroubleshootingGuidance | null>(null);
  const [restartIssueType, setRestartIssueType] = useState("");
  const [restartIssueNotes, setRestartIssueNotes] = useState("");
  const [assistantType, setAssistantType] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callAttemptIdRef = useRef<string | null>(null);
  const attemptStartMsRef = useRef<number | null>(null);
  const firstAssistantSpeechLoggedRef = useRef(false);
  const assistantSpeechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestartingRef = useRef(false);
  const isCallActiveRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
  const pageName = "voice-conversation";

  const logEvent = useCallback((eventType: string, metadata: Record<string, unknown> = {}) => {
    void logNavigationEvent({
      prolificId,
      callId: callIdRef.current,
      pageName,
      eventType,
      metadata: metadata as Json,
    });
  }, [prolificId]);

  const logAttemptEvent = useCallback((eventType: string, metadata: Record<string, unknown> = {}) => {
    logEvent(eventType, {
      callAttemptId: callAttemptIdRef.current,
      ...metadata,
    });
  }, [logEvent]);

  const getAttemptLatencyMs = () => {
    if (attemptStartMsRef.current === null) return null;
    return Math.round(performance.now() - attemptStartMsRef.current);
  };

  usePageTracking({
    pageName,
    prolificId,
    callId,
  });

  useEffect(() => {
    callIdRef.current = callId;
  }, [callId]);

  useEffect(() => {
    isRestartingRef.current = isRestarting;
  }, [isRestarting]);

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("session-replay-call-state", {
        detail: { active: isCallActive, source: "voice-conversation" },
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("session-replay-call-state", {
          detail: { active: false, source: "voice-conversation" },
        })
      );
    };
  }, [isCallActive]);

  const clearAssistantSpeechTimeout = useCallback(() => {
    if (assistantSpeechTimeoutRef.current) {
      clearTimeout(assistantSpeechTimeoutRef.current);
      assistantSpeechTimeoutRef.current = null;
    }
  }, []);

  const runInCallMicMonitor = useCallback((callAttemptId: string | null) => {
    if (!callAttemptId) return;
    void runMicDiagnostics({ sampleMs: MIC_AUDIO_MONITOR_SAMPLE_MS })
      .then((micDiagnostics) => {
        logEvent("call_preflight_result", {
          callAttemptId,
          phase: "in_call_monitor",
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
          logEvent("mic_audio_check", {
            callAttemptId,
            phase: "in_call_monitor",
            detected: micDiagnostics.audioDetected,
            peakRms: micDiagnostics.peakRms,
            sampleMs: micDiagnostics.sampleMs,
            reasonCode: micDiagnostics.reasonCode || "none",
          });
        }
        if (callAttemptIdRef.current !== callAttemptId || !isCallActiveRef.current) {
          return;
        }
        if (micDiagnostics.audioDetected === "not_detected") {
          const guidance = getMicIssueGuidance("no_mic_audio_detected");
          toast({
            title: guidance.title,
            description: guidance.description,
            variant: "destructive",
          });
          logEvent("call_quality_warning", {
            callAttemptId,
            reason: "no_mic_audio_detected_during_call_monitor",
            reasonCode: "no_mic_audio_detected",
            peakRms: micDiagnostics.peakRms,
            sampleMs: micDiagnostics.sampleMs,
          });
        }
      })
      .catch((error: unknown) => {
        const err = error as { name?: string; message?: string };
        logEvent("mic_audio_check_error", {
          callAttemptId,
          phase: "in_call_monitor",
          errorName: err?.name,
          errorMessage: err?.message,
        });
      });
  }, [MIC_AUDIO_MONITOR_SAMPLE_MS, logEvent, toast]);

  useEffect(() => {
    // Load IDs from sessionStorage, no validation/redirects
    const storedId = sessionStorage.getItem("prolificId");
    const finalProlificId = storedId || "RESEARCHER_MODE";

    setProlificId(finalProlificId);
    sessionStorage.setItem("prolificId", finalProlificId);
    sessionStorage.setItem("flowStep", "2");

    // Set default session token if missing
    if (!localStorage.getItem("sessionToken")) {
      localStorage.setItem("sessionToken", "00000000-0000-0000-0000-000000000000");
    }

    // Read the condition that was assigned during practice conversation
    // The atomic assignment already happened in PracticeConversation
    const storedAssistantType = sessionStorage.getItem("assistantType");
    const storedAssistantId = sessionStorage.getItem("assistantId");
    
    if (storedAssistantType && storedAssistantId) {
      // Use the condition assigned during practice
      setAssistantType(storedAssistantType);
      setAssistantId(storedAssistantId);
      console.log(`[VoiceConversation] Using condition from practice: ${storedAssistantType}`);
    } else {
      // Fallback: fetch config without incrementing counter (edge case: direct navigation)
      const fetchAssistantConfig = async () => {
        try {
          // Don't pass prolificId - this is a fallback, we don't want to double-count
          const { data, error } = await supabase.functions.invoke("get-experiment-config");
          if (error) {
            console.error("Failed to fetch experiment config:", error);
            setAssistantId(import.meta.env.VITE_VAPI_ASSISTANT_ID);
            setAssistantType("unknown");
            return;
          }
          setAssistantId(data.assistantId);
          setAssistantType(data.assistantType);
          sessionStorage.setItem("assistantType", data.assistantType);
          sessionStorage.setItem("assistantId", data.assistantId);
          console.log(`[VoiceConversation] Fallback config fetched: ${data.assistantType}`);
        } catch (error) {
          console.error("Error fetching assistant config:", error);
          setAssistantId(import.meta.env.VITE_VAPI_ASSISTANT_ID);
          setAssistantType("unknown");
        }
      };
      fetchAssistantConfig();
    }
  }, []);

  // Initialize Vapi SDK - only once when component mounts
  useEffect(() => {
    if (!prolificId) return;
    const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY);
    vapiRef.current = vapi;

    // Set up event listeners
    vapi.on("call-start", () => {
      setIsCallActive(true);
      setIsConnecting(false);
      setIsAwaitingMicPermission(false);
      logAttemptEvent("call_connected", {
        attemptLatencyMs: getAttemptLatencyMs(),
      });
      clearAssistantSpeechTimeout();
      assistantSpeechTimeoutRef.current = setTimeout(() => {
        logAttemptEvent("assistant_audio_timeout", {
          reasonCode: "unknown",
          timeoutMs: ASSISTANT_AUDIO_TIMEOUT_MS,
        });
      }, ASSISTANT_AUDIO_TIMEOUT_MS);
      runInCallMicMonitor(callAttemptIdRef.current);
    });
    vapi.on("message", (message) => {
      // Listen for end-of-call-report to get the actual end reason
      if (message.type === "end-of-call-report") {
        const endedReason = message.endedReason;
        const reasonCode = mapCallEndReasonToFailureCode(endedReason);
        const isError = reasonCode !== "none";
        logAttemptEvent("call_end_report", { endedReason, isError, reasonCode });
        if (endedReason === "assistant-ended-call") {
          toast({
            title: "Call Completed Successfully",
            description: "All questions have been answered. Please proceed to the questionnaire.",
          });
        } else if (reasonCode === "assistant_pipeline_error" || reasonCode === "assistant_error" || reasonCode === "call_timeout") {
          const guidance = getCallErrorGuidance(reasonCode);
          toast({
            title: guidance.title,
            description: guidance.description,
            variant: "destructive",
          });
        }
      }
    });
    vapi.on("call-end", () => {
      clearAssistantSpeechTimeout();
      setIsCallActive(false);
      setCallTracked(false);
      logAttemptEvent("call_end", { reason: "call-end", attemptLatencyMs: getAttemptLatencyMs() });

      // If we're restarting, don't show "ended" state
      if (!isRestartingRef.current) {
        setCallEnded(true);
      }
    });
    vapi.on("speech-start", () => {
      setIsSpeaking(true);
      if (!firstAssistantSpeechLoggedRef.current) {
        firstAssistantSpeechLoggedRef.current = true;
        clearAssistantSpeechTimeout();
        logAttemptEvent("first_assistant_audio", {
          attemptLatencyMs: getAttemptLatencyMs(),
        });
      }
    });
    vapi.on("speech-end", () => {
      setIsSpeaking(false);
    });
    vapi.on("error", (error) => {
      // Log errors but don't show toast - end-of-call-report handles messaging
      console.error("Vapi error:", error);
      logAttemptEvent("call_error", {
        errorName: (error as { name?: string })?.name,
        errorMessage: (error as { message?: string })?.message,
        reasonCode: mapVapiErrorToReasonCode(
          (error as { name?: string })?.name,
          (error as { message?: string })?.message
        ),
      });
    });
    return () => {
      vapi.stop();
      clearAssistantSpeechTimeout();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [prolificId, logAttemptEvent, toast, clearAssistantSpeechTimeout, runInCallMicMonitor]);

  // Timer effect - counts up, display only
  useEffect(() => {
    if (isCallActive && !callEnded) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (!isCallActive && callEnded) {
        setElapsedTime(0); // Reset for next call
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isCallActive, callEnded]);
  const handleStartCallClick = () => {
    setShowPreCallModal(true);
  };
  const startCall = async () => {
    if (!vapiRef.current || !prolificId) {
      logEvent("call_start_failed", { reason: "missing_vapi_or_prolific", reasonCode: "unknown" });
      return;
    }

    // Prevent duplicate calls if already tracking
    if (callTracked || callId) {
      return;
    }
    setShowPreCallModal(false);
    const initialPermissionState = await getCurrentMicPermissionState();
    if (initialPermissionState === "denied") {
      setIsConnecting(false);
      setIsAwaitingMicPermission(false);
      const guidance = getMicIssueGuidance("mic_permission_denied");
      setMicIssueGuidance(guidance);
      toast({ title: guidance.title, description: guidance.description, variant: "destructive" });
      logEvent("call_start_failed", {
        reason: "mic_permission_denied_precheck",
        reasonCode: "mic_permission_denied",
      });
      return;
    }
    setIsAwaitingMicPermission(initialPermissionState === "prompt");
    setIsConnecting(true);
    setElapsedTime(0); // Reset timer

    try {
      const callAttemptId = generateCallAttemptId();
      callAttemptIdRef.current = callAttemptId;
      attemptStartMsRef.current = performance.now();
      firstAssistantSpeechLoggedRef.current = false;
      clearAssistantSpeechTimeout();

      const clientContext = await collectClientContext();
      const isRestartAttempt = sessionStorage.getItem("isRestarting") === "true";
      logAttemptEvent("call_attempt_start", {
        callAttemptId,
        isRestarting: isRestartAttempt,
        clientContext,
      });

      const sessionToken = localStorage.getItem("sessionToken");
      if (!sessionToken) {
        setIsConnecting(false);
        setIsAwaitingMicPermission(false);
        logAttemptEvent("call_start_failed", {
          reason: "missing_session_token",
          reasonCode: "session_validation_failed",
        });
        toast({
          title: "Error",
          description: "Session expired. Please start over.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      // Check if this is a restart
      const isRestarting = sessionStorage.getItem("isRestarting") === "true";
      if (isRestarting) {
        sessionStorage.removeItem("isRestarting");
      }

      // Validate session through secure edge function
      const { data: validationData, error: validationError } = await supabase.functions.invoke("initiate-vapi-call", {
        body: {
          sessionToken,
          prolificId,
          restart: isRestarting,
        },
      });
      if (validationError || !validationData?.success) {
        logAttemptEvent("call_start_failed", {
          reason: "initiate_vapi_call_failed",
          reasonCode: "session_validation_failed",
          errorMessage: validationError?.message,
        });
        const errorMsg = validationError?.message || "";
        if (errorMsg.includes("expired")) {
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please start over.",
            variant: "destructive",
          });
          localStorage.removeItem("sessionToken");
          sessionStorage.removeItem("prolificId");
          navigate("/");
        } else {
          toast({
            title: "Error",
            description: "Failed to validate session. Please try again.",
            variant: "destructive",
          });
        }
        return;
      }

      // Get the assistant ID (from config or fallback to env)
      const activeAssistantId = assistantId || import.meta.env.VITE_VAPI_ASSISTANT_ID;
      
      // Start the web call using Vapi SDK
      const call = await vapiRef.current.start(activeAssistantId, {
        variableValues: {
          prolificId: prolificId,
          sessionToken: sessionToken,
        },
        metadata: {
          prolificId: prolificId,
          researcherMode: isResearcherMode,
          assistantType: assistantType || "unknown",
        },
      });

      // Store the call ID from the Vapi SDK
      if (call?.id) {
        setCallId(call.id);
        callIdRef.current = call.id;

        // Fire-and-forget update as fallback (webhook will handle this primarily)
        supabase.functions
          .invoke("update-call-id", {
            body: {
              sessionToken,
              prolificId,
              callId: call.id,
            },
          })
          .catch((error) => {
            console.error("Failed to update call ID in database:", error);
            // Non-blocking - webhook will handle this
          });
      }
      setCallTracked(true);
      logAttemptEvent("call_start", {
        assistantId: activeAssistantId,
        assistantType: assistantType || "unknown",
        isRestarting,
        callId: call?.id || null,
        attemptLatencyMs: getAttemptLatencyMs(),
      });
      toast({
        title: "Call Started",
        description: "Your conversation is being tracked.",
      });
    } catch (error) {
      setIsConnecting(false);
      setIsAwaitingMicPermission(false);
      const reasonCode = mapVapiErrorToReasonCode(
        (error as { name?: string })?.name,
        (error as { message?: string })?.message
      );
      const guidance = getCallErrorGuidance(reasonCode);
      logAttemptEvent("call_start_failed", {
        reason: "vapi_start_error",
        reasonCode,
        errorName: (error as { name?: string })?.name,
        errorMessage: (error as { message?: string })?.message,
      });
      toast({
        title: guidance.title,
        description: guidance.description,
        variant: "destructive",
      });
    }
  };
  const handleEndCallClick = () => {
    setShowEndDialog(true);
  };
  const handleConfirmEndCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop();
    }
    setShowEndDialog(false);
  };
  const performRestartCall = async () => {
    setIsRestarting(true);

    // Stop the current call first
    if (vapiRef.current) {
      vapiRef.current.stop();
    }

    // Wait a moment for the call to fully end
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Reset state for new call
    setCallId(null);
    setCallTracked(false);
    setCallEnded(false);
    setElapsedTime(0);
    setIsRestarting(false);

    // Set restart flag and start new call
    sessionStorage.setItem("isRestarting", "true");
    setShowPreCallModal(true);
  };
  const handleRestartCall = () => {
    logAttemptEvent("restart_clicked", {
      fromCallId: callIdRef.current,
      elapsedTimeSec: elapsedTime,
    });
    setRestartIssueType("");
    setFeedbackNextAction("restart");
    setShowRestartFeedbackDialog(true);
  };
  const handleSubmitRestartFeedback = async () => {
    if (!restartIssueType) {
      toast({
        title: "Please select an issue",
        description: "Choose the issue you experienced before continuing.",
        variant: "destructive",
      });
      return;
    }
    logAttemptEvent("restart_feedback_submitted", {
      issueType: restartIssueType,
      notes: restartIssueNotes.trim() || null,
      elapsedTimeSec: elapsedTime,
      nextAction: feedbackNextAction,
    });
    setShowRestartFeedbackDialog(false);
    const nextAction = feedbackNextAction;
    setFeedbackNextAction(null);
    setRestartIssueType("");
    setRestartIssueNotes("");
    if (nextAction === "return_to_mic_test") {
      handleGoBackInternal();
      return;
    }
    await performRestartCall();
  };
  const handleProceedToQuestionnaire = () => {
    if (!callId) {
      toast({
        title: "Error",
        description: "Call ID not found. Please try again.",
        variant: "destructive",
      });
      return;
    }
    // Advance to next step
    sessionStorage.setItem("flowStep", "3");
    navigate("/questionnaire/formality", {
      state: {
        callId,
      },
    });
  };
  const handleGoBackInternal = () => {
    const storedProlificId = sessionStorage.getItem("prolificId");
    const storedSessionToken = localStorage.getItem("sessionToken");
    sessionStorage.setItem("flowStep", "1");
    if (storedProlificId && storedSessionToken) {
      navigate(`/practice?prolificId=${storedProlificId}&sessionToken=${storedSessionToken}`);
    } else {
      navigate("/");
    }
  };
  const handleGoBack = () => {
    logAttemptEvent("return_to_mic_test_clicked", {
      fromCallId: callIdRef.current,
      elapsedTimeSec: elapsedTime,
    });
    setRestartIssueType("");
    setFeedbackNextAction("return_to_mic_test");
    setShowRestartFeedbackDialog(true);
  };
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  if (!prolificId) {
    return null;
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-background to-amber-50 p-4">
      <Card className="w-full max-w-2xl shadow-xl border-orange-200">
        <CardHeader className="space-y-3">
          <ExperimentProgress />
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-300">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
              Main Conversation
            </span>
          </div>
          <CardTitle className="text-2xl text-center">Voice AI Conversation</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
            <p className="text-foreground">
              ​<span className="font-bold">Scenario:</span> Your healthcare provider has introduced Cali, a new voice
              assistant powered by artificial intelligence (AI), to help conduct brief well-being check-ins. You will
              have a conversation with the assistant, and it will ask you some questions about how you've been feeling
              lately.
            </p>
          </div>

          <div className="bg-orange-50/50 border border-orange-100 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Please read carefully before starting:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                <span>The conversation will take approximately 7-8 minutes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                <span>If asked, give your browser permission to use your microphone.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                <span>You must complete the entire conversation before proceeding to the questionnaire.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                <span>
                  If you experience minor issues (e.g., a brief pause or repeated line), please continue the
                  conversation as normal.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                <span>
                  If your microphone or speakers do not work/stop working, please click the "Restart Call" button.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 mt-0.5">•</span>
                <span>Click the button below to begin the conversation.</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-center justify-center py-8 gap-6">
            {!isCallActive && !callEnded && !isConnecting ? (
              <Button
                onClick={handleStartCallClick}
                size="lg"
                className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform bg-orange-500 hover:bg-orange-600 flex flex-col items-center justify-center gap-1"
              >
                <Mic className="w-14 h-14" />
                <span className="text-sm">Start</span>
              </Button>
            ) : isConnecting ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">
                  {isAwaitingMicPermission ? "Waiting for microphone permission..." : "Connecting..."}
                </p>
              </div>
            ) : callEnded ? (
              <div className="text-center space-y-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                  <p className="text-foreground font-semibold mb-2">Conversation Ended</p>
                  <p className="text-sm text-muted-foreground">
                    Please proceed to the questionnaire to complete your participation.
                  </p>
                </div>
                <Button onClick={handleProceedToQuestionnaire} size="lg" className="w-full">
                  Proceed to Questionnaire
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center min-w-[200px] space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <p className="text-lg font-bold text-primary">{formatTime(elapsedTime)}</p>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${isSpeaking ? "bg-destructive animate-pulse" : "bg-primary"}`}
                    ></div>
                    <p className="text-sm font-medium text-primary">
                      {isSpeaking ? "Assistant Speaking..." : "Listening..."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <Button onClick={handleRestartCall} size="lg" variant="outline" className="px-6">
                    Restart Call
                  </Button>
                  {isResearcherMode && (
                    <Button
                      onClick={handleEndCallClick}
                      size="lg"
                      variant="destructive"
                      className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform"
                    >
                      <Phone className="w-12 h-12 rotate-135" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <EndCallDialog open={showEndDialog} onOpenChange={setShowEndDialog} onConfirm={handleConfirmEndCall} />

          <Dialog
            open={Boolean(micIssueGuidance)}
            onOpenChange={(open) => {
              if (!open) setMicIssueGuidance(null);
            }}
          >
            <DialogContent className="sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle className="text-xl text-destructive">{micIssueGuidance?.title || "Microphone Issue"}</DialogTitle>
                <DialogDescription className="space-y-4 text-left pt-2">
                  <p>{micIssueGuidance?.description}</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                    <p className="font-semibold text-amber-800">Try these steps:</p>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-amber-700">
                      {(micIssueGuidance?.steps || []).map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setMicIssueGuidance(null)}>
                  Close
                </Button>
                <Button onClick={() => window.location.reload()}>
                  Refresh Page
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={showRestartFeedbackDialog}
            onOpenChange={(open) => {
              if (open) setShowRestartFeedbackDialog(true);
            }}
          >
            <DialogContent className="sm:max-w-[540px]">
              <DialogHeader>
                <DialogTitle className="text-xl">Quick Issue Report</DialogTitle>
                <DialogDescription>
                  Tell us what went wrong before restarting. This helps us diagnose microphone and connection problems.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">What issue are you experiencing? (Required)</Label>
                  <RadioGroup value={restartIssueType} onValueChange={setRestartIssueType}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cant_be_heard" id="restart-issue-cant-be-heard" />
                      <Label htmlFor="restart-issue-cant-be-heard">The assistant cannot hear me</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cant_hear_assistant" id="restart-issue-cant-hear-assistant" />
                      <Label htmlFor="restart-issue-cant-hear-assistant">I cannot hear the assistant</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="stuck_connecting" id="restart-issue-stuck-connecting" />
                      <Label htmlFor="restart-issue-stuck-connecting">Call is stuck connecting</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="ended_unexpectedly" id="restart-issue-ended-unexpectedly" />
                      <Label htmlFor="restart-issue-ended-unexpectedly">Call ended unexpectedly</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="other" id="restart-issue-other" />
                      <Label htmlFor="restart-issue-other">Other</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="restart-issue-notes" className="text-sm font-medium">
                    Additional details (optional)
                  </Label>
                  <Textarea
                    id="restart-issue-notes"
                    placeholder="Example: Browser shows mic allowed, but assistant never hears my voice."
                    value={restartIssueNotes}
                    onChange={(event) => setRestartIssueNotes(event.target.value)}
                    maxLength={300}
                  />
                  <p className="text-xs text-muted-foreground text-right">{restartIssueNotes.length}/300</p>
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button onClick={handleSubmitRestartFeedback} disabled={!restartIssueType}>
                  {feedbackNextAction === "return_to_mic_test" ? "Submit & Continue" : "Submit & Restart"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showPreCallModal} onOpenChange={setShowPreCallModal}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl">Instructions</DialogTitle>
                <DialogDescription className="space-y-4 text-left pt-4">
                  <div className="bg-accent/50 rounded-lg p-4 space-y-3">
                    <p className="text-foreground font-semibold">Please read carefully before starting:</p>
                    <div className="space-y-2 text-sm">
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>
                          The conversation will take approximately <strong>7-8 minutes</strong>
                        </span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>
                          You must complete the entire conversation before proceeding to the questionnaire
                        </span>
                      </p>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setShowPreCallModal(false)}>
                  Cancel
                </Button>
                <Button onClick={startCall}>I Understand, Start Conversation</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="pt-4 border-t border-border">
            <Button variant="outline" onClick={handleGoBack} className="w-full">
              Return to Mic Test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
export default VoiceConversation;
