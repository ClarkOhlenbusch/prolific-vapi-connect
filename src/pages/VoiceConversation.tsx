import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Vapi from "@vapi-ai/web";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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

const VoiceConversation = () => {
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
  const [isRestarting, setIsRestarting] = useState(false);
  const [assistantType, setAssistantType] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
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

    // Fetch the active assistant configuration
    const fetchAssistantConfig = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-experiment-config");
        if (error) {
          console.error("Failed to fetch experiment config:", error);
          // Fallback to env variable
          setAssistantId(import.meta.env.VITE_VAPI_ASSISTANT_ID);
          setAssistantType("unknown");
          return;
        }
        setAssistantId(data.assistantId);
        setAssistantType(data.assistantType);
        // Store for questionnaire submission
        sessionStorage.setItem("assistantType", data.assistantType);
      } catch (error) {
        console.error("Error fetching assistant config:", error);
        setAssistantId(import.meta.env.VITE_VAPI_ASSISTANT_ID);
        setAssistantType("unknown");
      }
    };

    fetchAssistantConfig();
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
    });
    vapi.on("message", (message) => {
      // Listen for end-of-call-report to get the actual end reason
      if (message.type === "end-of-call-report") {
        const endedReason = message.endedReason;
        if (endedReason === "assistant-ended-call") {
          toast({
            title: "Call Completed Successfully",
            description: "All questions have been answered. Please proceed to the questionnaire.",
          });
        } else if (endedReason === "pipeline-error" || endedReason === "assistant-error") {
          toast({
            title: "Call Error",
            description: "The call ended due to an error. Please proceed to the questionnaire or restart if needed.",
            variant: "destructive",
          });
        }
      }
    });
    vapi.on("call-end", () => {
      setIsCallActive(false);
      setCallTracked(false);

      // If we're restarting, don't show "ended" state
      if (!isRestarting) {
        setCallEnded(true);
      }
    });
    vapi.on("speech-start", () => {
      setIsSpeaking(true);
    });
    vapi.on("speech-end", () => {
      setIsSpeaking(false);
    });
    vapi.on("error", (error) => {
      // Log errors but don't show toast - end-of-call-report handles messaging
      console.error("Vapi error:", error);
    });
    return () => {
      vapi.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [prolificId]);

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
    if (!vapiRef.current || !prolificId) return;

    // Prevent duplicate calls if already tracking
    if (callTracked || callId) {
      return;
    }
    setShowPreCallModal(false);
    setIsConnecting(true);
    setElapsedTime(0); // Reset timer

    try {
      const sessionToken = localStorage.getItem("sessionToken");
      if (!sessionToken) {
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
      toast({
        title: "Call Started",
        description: "Your conversation is being tracked.",
      });
    } catch (error) {
      setIsConnecting(false);
      toast({
        title: "Failed to Start Call",
        description: "Please check your microphone permissions.",
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
  const handleRestartCall = async () => {
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
  const handleGoBack = () => {
    const storedProlificId = sessionStorage.getItem("prolificId");
    const storedSessionToken = localStorage.getItem("sessionToken");
    sessionStorage.setItem("flowStep", "1");
    if (storedProlificId && storedSessionToken) {
      navigate(`/practice?prolificId=${storedProlificId}&sessionToken=${storedSessionToken}`);
    } else {
      navigate("/");
    }
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
                <p className="text-sm text-muted-foreground">Connecting...</p>
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
