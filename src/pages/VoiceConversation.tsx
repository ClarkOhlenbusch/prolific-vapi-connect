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

const VoiceConversation = () => {
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callTracked, setCallTracked] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [showPreCallModal, setShowPreCallModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  
  const vapiRef = useRef<Vapi | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Retrieve the Prolific ID from sessionStorage
    const storedId = sessionStorage.getItem('prolificId');
    
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
  }, [navigate, toast]);

  // Initialize Vapi SDK - only once when component mounts
  useEffect(() => {
    if (!prolificId) return;

    const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY);
    vapiRef.current = vapi;

    // Set up event listeners
    vapi.on('call-start', () => {
      setIsCallActive(true);
    });

    vapi.on('call-end', () => {
      setIsCallActive(false);
      setCallTracked(false);
      setCallEnded(true);
    });

    vapi.on('speech-start', () => {
      setIsSpeaking(true);
    });

    vapi.on('speech-end', () => {
      setIsSpeaking(false);
    });

    vapi.on('error', (error) => {
      toast({
        title: "Call Error",
        description: error?.message || "An error occurred during the call.",
        variant: "destructive"
      });
    });

    return () => {
      vapi.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [prolificId]);

  // Timer effect - starts when call is active
  useEffect(() => {
    if (isCallActive && !callEnded) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Time's up - force end the call
            if (vapiRef.current) {
              vapiRef.current.stop();
            }
            if (timerRef.current) {
              clearInterval(timerRef.current);
            }
            toast({
              title: "Time's Up",
              description: "The 5-minute conversation has ended.",
            });
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
  }, [isCallActive, callEnded, toast]);

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
      
      // Validate session through secure edge function
      const { data: validationData, error: validationError } = await supabase.functions.invoke('initiate-vapi-call', {
        body: { sessionToken, prolificId }
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
        
        // Update the database with the call ID
        const { error: updateError } = await supabase.functions.invoke('update-call-id', {
          body: { 
            sessionToken, 
            prolificId,
            callId: call.id 
          }
        });

        if (updateError) {
          console.error('Failed to update call ID in database:', updateError);
          // Don't block the call from starting, just log the error
        }
      }
      
      setCallTracked(true);
      toast({
        title: "Call Started",
        description: "Your conversation is being tracked.",
      });
    } catch (error) {
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

  const handleProceedToQuestionnaire = () => {
    if (!callId) {
      toast({
        title: "Error",
        description: "Call ID not found. Please try again.",
        variant: "destructive"
      });
      return;
    }
    navigate('/questionnaire/pets', { state: { callId } });
  };

  const handleGoBack = () => {
    sessionStorage.removeItem('prolificId');
    navigate('/');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!prolificId) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <div className="w-16 h-16 mx-auto bg-primary rounded-full flex items-center justify-center">
            <svg 
              className="w-8 h-8 text-primary-foreground" 
              fill="none" 
              strokeWidth="2" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <CardTitle className="text-2xl text-center">Voice AI Conversation</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-accent/50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Instructions:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Click the voice button below to start your conversation with the AI</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Speak clearly and naturally during the conversation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Your conversation is being tracked for research purposes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Click the button again to end the conversation when you're done</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-center justify-center py-8 gap-6">
            {!isCallActive && !callEnded ? (
              <Button
                onClick={handleStartCallClick}
                size="lg"
                className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform"
              >
                <Mic className="w-12 h-12" />
              </Button>
            ) : callEnded ? (
              <div className="text-center space-y-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-6">
                  <p className="text-foreground font-semibold mb-2">Conversation Ended</p>
                  <p className="text-sm text-muted-foreground">
                    Please proceed to the questionnaire to complete your participation.
                  </p>
                </div>
                <Button
                  onClick={handleProceedToQuestionnaire}
                  size="lg"
                  className="w-full"
                >
                  Proceed to Questionnaire
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
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
                <Button
                  onClick={handleEndCallClick}
                  size="lg"
                  variant="destructive"
                  className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform"
                >
                  <Phone className="w-12 h-12 rotate-135" />
                </Button>
              </div>
            )}
          </div>

          <EndCallDialog 
            open={showEndDialog}
            onOpenChange={setShowEndDialog}
            onConfirm={handleConfirmEndCall}
          />

          <Dialog open={showPreCallModal} onOpenChange={setShowPreCallModal}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl">Healthcare Conversation Guidelines</DialogTitle>
                <DialogDescription className="space-y-4 text-left pt-4">
                  <div className="bg-accent/50 rounded-lg p-4 space-y-3">
                    <p className="text-foreground font-semibold">
                      Please read carefully before starting:
                    </p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>This is a healthcare conversational setting with an AI assistant</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>The conversation will automatically end after exactly <strong>5 minutes</strong></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>You must complete the entire 5-minute conversation before proceeding to the questionnaire</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>A timer will be displayed during the conversation to show remaining time</span>
                      </li>
                    </ul>
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
            <Button 
              variant="outline" 
              onClick={handleGoBack}
              className="w-full"
            >
              Return to Start
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VoiceConversation;
