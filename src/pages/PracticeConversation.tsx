import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Vapi from '@vapi-ai/web';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Mic, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';

const PracticeConversation = () => {
  const [searchParams] = useSearchParams();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPreCallModal, setShowPreCallModal] = useState(false);
  const [hasCompletedPractice, setHasCompletedPractice] = useState(false);
  
  const vapiRef = useRef<Vapi | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();

  useEffect(() => {
    // RESEARCHER MODE BYPASS - CHECK FIRST
    if (isResearcherMode) {
      const prolificIdFromUrl = searchParams.get('prolificId');
      const sessionToken = searchParams.get('sessionToken');
      
      // Set defaults
      const defaultProlificId = prolificIdFromUrl || 'RESEARCHER_MODE';
      const defaultSessionToken = sessionToken || '00000000-0000-0000-0000-000000000000';
      
      setProlificId(defaultProlificId);
      sessionStorage.setItem('prolificId', defaultProlificId);
      localStorage.setItem('sessionToken', defaultSessionToken);
      sessionStorage.setItem('flowStep', '1');
      return;
    }
    
    // Regular validation for non-researcher mode
    const prolificIdFromUrl = searchParams.get('prolificId');
    const sessionToken = searchParams.get('sessionToken');
    const currentStep = sessionStorage.getItem('flowStep');
    
    if (currentStep !== '1') {
      navigate('/');
      return;
    }
    
    if (!prolificIdFromUrl || !sessionToken) {
      toast({
        title: "Error",
        description: "Missing required parameters. Redirecting...",
        variant: "destructive"
      });
      navigate('/');
      return;
    }
    
    setProlificId(prolificIdFromUrl);
    sessionStorage.setItem('prolificId', prolificIdFromUrl);
    localStorage.setItem('sessionToken', sessionToken);
  }, [navigate, toast, searchParams, isResearcherMode]);

  // Initialize Vapi SDK
  useEffect(() => {
    if (!prolificId) return;

    const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY);
    vapiRef.current = vapi;

    // Set up event listeners
    vapi.on('call-start', () => {
      setIsCallActive(true);
      setIsConnecting(false);
    });

    vapi.on('call-end', () => {
      setIsCallActive(false);
      setHasCompletedPractice(true);
    });

    vapi.on('speech-start', () => {
      setIsSpeaking(true);
    });

    vapi.on('speech-end', () => {
      setIsSpeaking(false);
    });

    vapi.on('error', (error) => {
      toast({
        title: "Connection Error",
        description: error?.message || "An error occurred. Please try again.",
        variant: "destructive"
      });
      setIsConnecting(false);
    });

    return () => {
      vapi.stop();
    };
  }, [prolificId, toast]);

  const handleStartCallClick = () => {
    setShowPreCallModal(true);
  };

  const startCall = async () => {
    if (!vapiRef.current || !prolificId) return;
    
    setShowPreCallModal(false);
    setIsConnecting(true);
    
    try {
      const practiceAssistantId = import.meta.env.VITE_VAPI_PRACTICE_ASSISTANT_ID;
      
      if (!practiceAssistantId || practiceAssistantId === 'YOUR_PRACTICE_ASSISTANT_ID_HERE') {
        toast({
          title: "Configuration Error",
          description: "Practice assistant not configured. Please set VITE_VAPI_PRACTICE_ASSISTANT_ID.",
          variant: "destructive"
        });
        setIsConnecting(false);
        return;
      }

      // Start the practice call using Vapi SDK
      await vapiRef.current.start(practiceAssistantId, {
        variableValues: {
          prolificId: prolificId,
        }
      });
      
      toast({
        title: "Practice Started",
        description: "Have a conversation to test your audio equipment.",
      });
    } catch (error) {
      setIsConnecting(false);
      toast({
        title: "Failed to Start",
        description: "Please check your microphone permissions and try again.",
        variant: "destructive"
      });
    }
  };

  const handleEndCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop();
    }
  };

  const handleProceed = () => {
    // Mark step complete and proceed to actual conversation
    sessionStorage.setItem('flowStep', '2');
    const sessionToken = localStorage.getItem('sessionToken');
    navigate(`/voice-conversation?sessionToken=${sessionToken}&prolificId=${prolificId}`);
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
          <CardTitle className="text-2xl text-center">Practice Conversation</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-primary/10 rounded-lg p-6">
            <p className="text-foreground">
              <span className="font-bold">Welcome!</span> Before starting the actual research conversation, you'll have a brief practice session with our AI assistant. This allows you to:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-foreground ml-4">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>Test your microphone and speakers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>Get comfortable with the voice interface</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">✓</span>
                <span>Understand what to expect in the research conversation</span>
              </li>
            </ul>
          </div>

          <div className="bg-accent/50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Instructions:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Ensure you're in a quiet environment with minimal background noise</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Click the microphone button to start the practice conversation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>The assistant will guide you through a brief practice session</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Make sure you can hear the assistant and it can hear you</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>You can end the practice at any time by clicking the red phone button</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>When you're ready, click "Proceed to Research Conversation" to begin the actual study</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-center justify-center py-8 gap-6">
            {!isCallActive && !isConnecting ? (
              <div className="flex flex-col items-center gap-6">
                <Button
                  onClick={handleStartCallClick}
                  size="lg"
                  className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform"
                >
                  <Mic className="w-12 h-12" />
                </Button>
                {hasCompletedPractice && (
                  <div className="w-full space-y-4">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
                      <p className="text-sm text-foreground">
                        ✓ Practice session completed
                      </p>
                    </div>
                    <Button
                      onClick={handleProceed}
                      size="lg"
                      className="w-full"
                    >
                      Proceed to Research Conversation
                    </Button>
                  </div>
                )}
              </div>
            ) : isConnecting ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Connecting...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center min-w-[200px]">
                  <div className="flex items-center justify-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-destructive animate-pulse' : 'bg-primary'}`}></div>
                    <p className="text-sm font-medium text-primary">
                      {isSpeaking ? 'Assistant Speaking...' : 'Listening...'}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleEndCall}
                  size="lg"
                  variant="destructive"
                  className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform"
                >
                  <Phone className="w-12 h-12 rotate-135" />
                </Button>
                <p className="text-xs text-muted-foreground text-center max-w-md">
                  End the practice when you're confident your audio is working properly
                </p>
              </div>
            )}
          </div>

          <Dialog open={showPreCallModal} onOpenChange={setShowPreCallModal}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl">Ready to Start?</DialogTitle>
                <DialogDescription className="space-y-4 text-left pt-4">
                  <div className="bg-accent/50 rounded-lg p-4 space-y-3">
                    <p className="text-foreground font-semibold">
                      Before you begin:
                    </p>
                    <div className="space-y-2 text-sm">
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Make sure you're in a quiet environment</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Check that your microphone and speakers are working</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>This is just practice - take your time to get comfortable</span>
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
                  Start Practice Conversation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
};

export default PracticeConversation;
