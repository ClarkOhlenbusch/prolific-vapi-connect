import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Vapi from '@vapi-ai/web';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { EndCallDialog } from '@/components/EndCallDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Mic, Phone, Clock } from 'lucide-react';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
const VoiceConversation = () => {
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callTracked, setCallTracked] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [showPreCallModal, setShowPreCallModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(300); // Display timer only
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const vapiRef = useRef<Vapi | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    isResearcherMode
  } = useResearcherMode();
  useEffect(() => {
    // RESEARCHER MODE BYPASS - CHECK FIRST
    if (isResearcherMode) {
      const storedId = sessionStorage.getItem('prolificId');
      
      // Set defaults
      const defaultProlificId = storedId || 'RESEARCHER_MODE';
      setProlificId(defaultProlificId);
      sessionStorage.setItem('prolificId', defaultProlificId);
      sessionStorage.setItem('flowStep', '2');

      // Set default session token if missing
      if (!localStorage.getItem('sessionToken')) {
        localStorage.setItem('sessionToken', '00000000-0000-0000-0000-000000000000');
      }
      return;
    }

    // Regular validation for non-researcher mode
    const currentStep = sessionStorage.getItem('flowStep');
    const storedId = sessionStorage.getItem('prolificId');

    if (currentStep !== '2') {
      navigate('/');
      return;
    }
    if (!storedId) {
      toast({
        title: "Error",
        description: "No Prolific ID found. Redirecting...",
        variant: "destructive"
      });
      navigate('/');
      return;
    }
    setProlificId(storedId);
  }, [navigate, toast, isResearcherMode]);

  // Initialize Vapi SDK - only once when component mounts
  useEffect(() => {
    if (!prolificId) return;
    const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY);
    vapiRef.current = vapi;

    // Set up event listeners
    vapi.on('call-start', () => {
      setIsCallActive(true);
      setIsConnecting(false);
    });
    vapi.on('message', message => {
      // Listen for end-of-call-report to get the actual end reason
      if (message.type === 'end-of-call-report') {
        const endedReason = message.endedReason;
        if (endedReason === 'assistant-ended-call') {
          toast({
            title: "Call Completed Successfully",
            description: "All questions have been answered. Please proceed to the questionnaire."
          });
        } else if (endedReason === 'pipeline-error' || endedReason === 'assistant-error') {
          toast({
            title: "Call Error",
            description: "The call ended due to an error. Please proceed to the questionnaire or restart if needed.",
            variant: "destructive"
          });
        }
      }
    });
    vapi.on('call-end', () => {
      setIsCallActive(false);
      setCallTracked(false);

      // If we're restarting, don't show "ended" state
      if (!isRestarting) {
        setCallEnded(true);
      }
    });
    vapi.on('speech-start', () => {
      setIsSpeaking(true);
    });
    vapi.on('speech-end', () => {
      setIsSpeaking(false);
    });
    vapi.on('error', error => {
      // Log errors but don't show toast - end-of-call-report handles messaging
      console.error('Vapi error:', error);
    });
    return () => {
      vapi.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [prolificId]);

  // Timer effect - display only, does NOT force-end the call
  useEffect(() => {
    if (isCallActive && !callEnded) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          // Just update the display, VAPI will end the call when ready
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (!isCallActive && callEnded) {
        setTimeRemaining(300); // Reset for next call
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
    setTimeRemaining(300); // Reset timer to 5 minutes

    try {
      const sessionToken = localStorage.getItem('sessionToken');
      if (!sessionToken) {
        toast({
          title: "Error",
          description: "Session expired. Please start over.",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      // Check if this is a restart
      const isRestarting = sessionStorage.getItem('isRestarting') === 'true';
      if (isRestarting) {
        sessionStorage.removeItem('isRestarting');
      }

      // Validate session through secure edge function
      const {
        data: validationData,
        error: validationError
      } = await supabase.functions.invoke('initiate-vapi-call', {
        body: {
          sessionToken,
          prolificId,
          restart: isRestarting
        }
      });
      if (validationError || !validationData?.success) {
        const errorMsg = validationError?.message || '';
        if (errorMsg.includes('expired')) {
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please start over.",
            variant: "destructive"
          });
          localStorage.removeItem('sessionToken');
          sessionStorage.removeItem('prolificId');
          navigate('/');
        } else {
          toast({
            title: "Error",
            description: "Failed to validate session. Please try again.",
            variant: "destructive"
          });
        }
        return;
      }

      // Start the web call using Vapi SDK
      const call = await vapiRef.current.start(import.meta.env.VITE_VAPI_ASSISTANT_ID, {
        variableValues: {
          prolificId: prolificId,
          sessionToken: sessionToken
        }
      });

      // Store the call ID from the Vapi SDK
      if (call?.id) {
        setCallId(call.id);

        // Fire-and-forget update as fallback (webhook will handle this primarily)
        supabase.functions.invoke('update-call-id', {
          body: {
            sessionToken,
            prolificId,
            callId: call.id
          }
        }).catch(error => {
          console.error('Failed to update call ID in database:', error);
          // Non-blocking - webhook will handle this
        });
      }
      setCallTracked(true);
      toast({
        title: "Call Started",
        description: "Your conversation is being tracked."
      });
    } catch (error) {
      setIsConnecting(false);
      toast({
        title: "Failed to Start Call",
        description: "Please check your microphone permissions.",
        variant: "destructive"
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

    // Stop the call first
    if (vapiRef.current) {
      vapiRef.current.stop();
    }

    // Wait a moment for the call to fully end
    await new Promise(resolve => setTimeout(resolve, 500));

    // Set a flag in sessionStorage to indicate restart
    sessionStorage.setItem('isRestarting', 'true');

    // Reset flow and redirect
    sessionStorage.setItem('flowStep', '1');
    const sessionToken = localStorage.getItem('sessionToken');
    navigate(`/practice?sessionToken=${sessionToken}&prolificId=${prolificId}`);
  };
  const handleProceedToQuestionnaire = () => {
    if (!callId) {
      toast({
        title: "Error",
        description: "Call ID not found. Please try again.",
        variant: "destructive"
      });
      return;
    }
    // Advance to next step
    sessionStorage.setItem('flowStep', '3');
    navigate('/questionnaire/pets', {
      state: {
        callId
      }
    });
  };
  const handleGoBack = () => {
    const storedProlificId = sessionStorage.getItem('prolificId');
    const storedSessionToken = localStorage.getItem('sessionToken');
    sessionStorage.setItem('flowStep', '1');
    if (storedProlificId && storedSessionToken) {
      navigate(`/practice?prolificId=${storedProlificId}&sessionToken=${storedSessionToken}`);
    } else {
      navigate('/');
    }
  };
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  if (!prolificId) {
    return null;
  }
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <div className="w-16 h-16 mx-auto bg-primary rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-primary-foreground" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <CardTitle className="text-2xl text-center">Voice AI Conversation</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-primary/10 rounded-lg p-6">
            <p className="text-foreground">​<span className="font-bold">Scenario:</span> Your healthcare provider has introduced Robin, a new voice assistant powered by artificial intelligence (AI), to help conduct brief well-being check-ins. You will have a conversation with the assistant, and it will ask you some questions about how you've been feeling lately.
            </p>
          </div>

          <div className="bg-accent/50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Please read carefully before starting:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>The conversation will automatically end after exactly 5 minutes.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>You must complete the entire 5-minute conversation before the questionnaire.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>A timer shows the remaining time.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>If you experience minor issues (e.g., a brief pause or repeated line), please continue the conversation as normal.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>If your microphone or speakers do not work/stop working, please click the "Restart Call" button.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Click the blue button below to begin the conversation.</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-center justify-center py-8 gap-6">
            {!isCallActive && !callEnded && !isConnecting ? <Button onClick={handleStartCallClick} size="lg" className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform">
                <Mic className="w-12 h-12" />
              </Button> : isConnecting ? <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Connecting...</p>
              </div> : callEnded ? <div className="text-center space-y-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                  <p className="text-foreground font-semibold mb-2">Conversation Ended</p>
                  <p className="text-sm text-muted-foreground">
                    Please proceed to the questionnaire to complete your participation.
                  </p>
                </div>
                <Button onClick={handleProceedToQuestionnaire} size="lg" className="w-full">
                  Proceed to Questionnaire
                </Button>
              </div> : <div className="flex flex-col items-center gap-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center min-w-[200px] space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    <p className="text-lg font-bold text-primary">
                      {formatTime(timeRemaining)}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-destructive animate-pulse' : 'bg-primary'}`}></div>
                    <p className="text-sm font-medium text-primary">
                      {isSpeaking ? 'Assistant Speaking...' : 'Listening...'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <Button onClick={handleRestartCall} size="lg" variant="outline" className="px-6">
                    Restart Call
                  </Button>
                  {isResearcherMode && <Button onClick={handleEndCallClick} size="lg" variant="destructive" className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform">
                      <Phone className="w-12 h-12 rotate-135" />
                    </Button>}
                </div>
              </div>}
          </div>

          <EndCallDialog open={showEndDialog} onOpenChange={setShowEndDialog} onConfirm={handleConfirmEndCall} />

          <Dialog open={showPreCallModal} onOpenChange={setShowPreCallModal}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl">Instructions</DialogTitle>
                <DialogDescription className="space-y-4 text-left pt-4">
                  <div className="bg-accent/50 rounded-lg p-4 space-y-3">
                    <p className="text-foreground font-semibold">
                      Please read carefully before starting:
                    </p>
                    <div className="space-y-2 text-sm">
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>The conversation will automatically end after exactly <strong>5 minutes</strong></span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>You must complete the entire 5-minute conversation before proceeding to the questionnaire</span>
                      </p>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setShowPreCallModal(false)}>
                  Cancel
                </Button>
                <Button onClick={startCall}>
                  I Understand, Start Conversation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="pt-4 border-t border-border">
            <Button variant="outline" onClick={handleGoBack} className="w-full">
              Return to Start
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>;
};
export default VoiceConversation;