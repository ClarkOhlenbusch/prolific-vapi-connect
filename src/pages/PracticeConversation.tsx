import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Vapi from '@vapi-ai/web';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Mic, Phone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
import { ExperimentProgress } from '@/components/ExperimentProgress';
import { supabase } from '@/integrations/supabase/client';
import { usePageTracking } from '@/hooks/usePageTracking';

const PracticeConversation = () => {
  const [searchParams] = useSearchParams();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showPreCallModal, setShowPreCallModal] = useState(false);
  const [showAudioConfirmModal, setShowAudioConfirmModal] = useState(false);
  const [practiceAssistantId, setPracticeAssistantId] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();

  usePageTracking({
    pageName: 'practice-conversation',
    prolificId,
    callId: null,
  });
  // Fetch experiment config to get practice assistant ID
  // Note: We don't pass prolificId here because practice calls shouldn't affect the counter
  // The actual condition is assigned when they reach VoiceConversation
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // Don't pass prolificId - practice calls use static config and don't increment counters
        const { data, error } = await supabase.functions.invoke('get-experiment-config');
        if (error) {
          console.error('Error fetching experiment config:', error);
          return;
        }
        if (data?.practiceAssistantId) {
          setPracticeAssistantId(data.practiceAssistantId);
        }
      } catch (err) {
        console.error('Failed to fetch experiment config:', err);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    // Load IDs from URL or sessionStorage, no validation/redirects
    const prolificIdFromUrl = searchParams.get('prolificId');
    const sessionToken = searchParams.get('sessionToken');
    const storedProlificId = sessionStorage.getItem('prolificId');
    const finalProlificId = prolificIdFromUrl || storedProlificId || 'RESEARCHER_MODE';
    const finalSessionToken = sessionToken || localStorage.getItem('sessionToken') || '00000000-0000-0000-0000-000000000000';
    setProlificId(finalProlificId);
    sessionStorage.setItem('prolificId', finalProlificId);
    localStorage.setItem('sessionToken', finalSessionToken);
    sessionStorage.setItem('flowStep', '1');
  }, [searchParams]);

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
      setShowAudioConfirmModal(true);
    });
    vapi.on('speech-start', () => {
      setIsSpeaking(true);
    });
    vapi.on('speech-end', () => {
      setIsSpeaking(false);
    });
    // Listen for message events to catch call end reasons
    vapi.on('message', (message: any) => {
      if (message.type === 'end-of-call-report' && message.endedReason === 'exceeded-max-duration') {
        toast({
          title: "Call time limit reached",
          description: "Proceed with next section.",
        });
      }
    });
    vapi.on('error', error => {
      // Check if it's a timeout-related error (meeting ended due to time limit)
      const errorMessage = error?.message?.toLowerCase() || '';
      if (
        errorMessage.includes('exceeded') || 
        errorMessage.includes('max-duration') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('meeting ended') ||
        errorMessage.includes('meeting has ended') ||
        errorMessage.includes('ejection')
      ) {
        toast({
          title: "Call time limit reached",
          description: "Proceed with next section.",
        });
      } else {
        toast({
          title: "Connection Error",
          description: error?.message || "An error occurred. Please try again.",
          variant: "destructive"
        });
      }
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
      if (!practiceAssistantId) {
        toast({
          title: "Configuration Error",
          description: "Practice assistant not configured. Please try again.",
          variant: "destructive"
        });
        setIsConnecting(false);
        return;
      }

      // Start the practice call using Vapi SDK
      await vapiRef.current.start(practiceAssistantId, {
        variableValues: {
          prolificId: prolificId
        },
        metadata: {
          prolificId: prolificId,
          researcherMode: isResearcherMode,
        },
      });
      toast({
        title: "Practice Started",
        description: "Have a conversation to test your audio equipment."
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
  const handleAudioWorking = () => {
    setShowAudioConfirmModal(false);
    sessionStorage.setItem('flowStep', '2');
    const sessionToken = localStorage.getItem('sessionToken');
    navigate(`/voice-conversation?sessionToken=${sessionToken}&prolificId=${prolificId}`);
  };

  const handleAudioNotWorking = () => {
    setShowAudioConfirmModal(false);
  };
  if (!prolificId) {
    return null;
  }
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-50 via-background to-teal-50 p-4">
      <Card className="w-full max-w-2xl shadow-xl border-teal-200">
        <CardHeader className="space-y-3">
          <ExperimentProgress />
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700 border border-teal-300">
              <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              Practice Session
            </span>
          </div>
          <CardTitle className="text-2xl text-center">Practice Conversation</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-6">
            <p className="text-foreground">
              <span className="font-bold">Welcome!</span> Before the main conversation, you will do a short practice to check that everything works. This allows you to:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-foreground ml-4">
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">✓</span>
                <span>Test your microphone and speakers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">✓</span>
                <span>Get used to speaking with the assistant</span>
              </li>
            </ul>
          </div>

          <div className="bg-teal-50/50 border border-teal-100 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-foreground">Instructions:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">•</span>
                <span>Sit in a quiet place</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">•</span>
                <span>If asked, give your browser permission to use your microphone</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 mt-0.5">•</span>
                <span>Click the "Start" button below to begin the conversation</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col items-center justify-center py-8 gap-6">
            {!isCallActive && !isConnecting ? <div className="flex flex-col items-center gap-6">
                <Button onClick={handleStartCallClick} size="lg" className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-1 animate-pulse bg-teal-500 hover:bg-teal-600">
                  <Mic className="w-14 h-14" />
                  <span className="text-sm">Start</span>
                </Button>
              </div> : isConnecting ? <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Connecting...</p>
              </div> : <div className="flex flex-col items-center gap-4">
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center min-w-[200px]">
                  <div className="flex items-center justify-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-destructive animate-pulse' : 'bg-primary'}`}></div>
                    <p className="text-sm font-medium text-primary">
                      {isSpeaking ? 'Assistant Speaking...' : 'Listening...'}
                    </p>
                  </div>
                </div>
                <Button onClick={handleEndCall} size="lg" variant="destructive" className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform flex flex-col items-center justify-center gap-1">
                  <Phone className="w-10 h-10 rotate-135" />
                  <span className="text-sm">Hang Up</span>
                </Button>
                <p className="text-base text-muted-foreground text-center max-w-md">
                  When you and the assistant can hear each other, hang up to continue.
                </p>
              </div>}
          </div>

          <Dialog open={showPreCallModal} onOpenChange={setShowPreCallModal}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="text-xl">Ready to Start?</DialogTitle>
                <DialogDescription className="space-y-4 text-left pt-4">
                  <div className="bg-accent/50 rounded-lg p-4 space-y-3">
                    <div className="space-y-2 text-sm">
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>Remember, this is just a practice conversation</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>If your browser asks for permission to use the microphone, click yes.</span>
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

          <Dialog open={showAudioConfirmModal} onOpenChange={setShowAudioConfirmModal}>
            <DialogContent className="sm:max-w-[450px]">
              <DialogHeader>
                <DialogTitle className="text-xl text-center">
                  Can you hear the assistant clearly?
                </DialogTitle>
              </DialogHeader>
              <DialogFooter className="flex-col sm:flex-row gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={handleAudioNotWorking}
                  className="w-full sm:w-auto"
                >
                  No, try again
                </Button>
                <Button 
                  onClick={handleAudioWorking}
                  className="w-full sm:w-auto"
                >
                  Yes, continue
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>;
};
export default PracticeConversation;