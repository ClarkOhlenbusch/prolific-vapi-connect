import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Vapi from '@vapi-ai/web';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Mic, MicOff, Phone } from 'lucide-react';

interface PETSItem {
  id: string;
  text: string;
  key: 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'u1' | 'u2' | 'u3' | 'u4';
}

const PETS_ITEMS: PETSItem[] = [
  { id: 'E1', text: 'The system considered my mental state.', key: 'e1' },
  { id: 'E2', text: 'The system seemed emotionally intelligent.', key: 'e2' },
  { id: 'E3', text: 'The system expressed emotions.', key: 'e3' },
  { id: 'E4', text: 'The system sympathized with me.', key: 'e4' },
  { id: 'E5', text: 'The system showed interest in me.', key: 'e5' },
  { id: 'E6', text: 'The system supported me in coping with an emotional situation.', key: 'e6' },
  { id: 'U1', text: 'The system understood my goals.', key: 'u1' },
  { id: 'U2', text: 'The system understood my needs.', key: 'u2' },
  { id: 'U3', text: 'I trusted the system.', key: 'u3' },
  { id: 'U4', text: 'The system understood my intentions.', key: 'u4' },
];

const VoiceConversation = () => {
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callTracked, setCallTracked] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({
    e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
    u1: 50, u2: 50, u3: 50, u4: 50
  });
  
  const vapiRef = useRef<Vapi | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Randomize items order once on mount
  const randomizedItems = useMemo(() => {
    return [...PETS_ITEMS].sort(() => Math.random() - 0.5);
  }, []);

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
      console.log('Call started event');
      setIsCallActive(true);
    });

    vapi.on('call-end', () => {
      console.log('Call ended event');
      setIsCallActive(false);
      setCallTracked(false);
      setShowQuestionnaire(true);
    });

    vapi.on('speech-start', () => {
      console.log('Assistant started speaking');
      setIsSpeaking(true);
    });

    vapi.on('speech-end', () => {
      console.log('Assistant stopped speaking');
      setIsSpeaking(false);
    });

    vapi.on('error', (error) => {
      console.error('Vapi error details:', error);
      toast({
        title: "Call Error",
        description: error?.message || "An error occurred during the call.",
        variant: "destructive"
      });
    });

    vapi.on('message', async (message: any) => {
      console.log('Vapi message:', JSON.stringify(message, null, 2));
      
      // Look for the call ID in the message object
      // Vapi sends the call ID through various message types
      const messageCallId = message?.call?.id;
      
      if (messageCallId && !callTracked && prolificId) {
        console.log('Found call ID in message:', messageCallId);
        setCallId(messageCallId);
        
        try {
          const { error } = await supabase
            .from('participant_calls')
            .insert({
              prolific_id: prolificId,
              call_id: messageCallId
            });

          if (error) {
            console.error('Error storing call mapping:', error);
            toast({
              title: "Warning",
              description: "Call started but tracking may have failed.",
              variant: "destructive"
            });
          } else {
            console.log('Successfully stored call mapping:', { prolificId, callId });
            setCallTracked(true);
            toast({
              title: "Call Tracked",
              description: "Your conversation is being tracked.",
            });
          }
        } catch (err) {
          console.error('Error storing call data:', err);
        }
      }
    });

    return () => {
      console.log('Cleaning up Vapi instance');
      vapi.stop();
    };
  }, [prolificId]);

  const startCall = async () => {
    if (!vapiRef.current) return;
    
    try {
      console.log('Attempting to start call with assistant:', import.meta.env.VITE_VAPI_ASSISTANT_ID);
      
      // Request microphone permission explicitly
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone permission granted:', stream);
      
      // Start the call with prolificId in metadata for webhook
      await vapiRef.current.start(import.meta.env.VITE_VAPI_ASSISTANT_ID, {
        metadata: {
          prolificId: prolificId
        }
      });
      console.log('Call start initiated successfully with prolific ID:', prolificId);
    } catch (error) {
      console.error('Error starting call:', error);
      toast({
        title: "Failed to Start Call",
        description: error instanceof Error ? error.message : "Please check microphone permissions.",
        variant: "destructive"
      });
    }
  };

  const endCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop();
    }
  };

  const handleGoBack = () => {
    sessionStorage.removeItem('prolificId');
    navigate('/');
  };

  const handleSliderChange = (key: string, value: number[]) => {
    setResponses(prev => ({ ...prev, [key]: value[0] }));
  };

  const handleSubmitQuestionnaire = async () => {
    if (!prolificId || !callId) {
      toast({
        title: "Error",
        description: "Missing required data. Please try again.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate scores
      const erItems = [responses.e1, responses.e2, responses.e3, responses.e4, responses.e5, responses.e6];
      const utItems = [responses.u1, responses.u2, responses.u3, responses.u4];
      
      const pets_er = erItems.reduce((a, b) => a + b, 0) / erItems.length;
      const pets_ut = utItems.reduce((a, b) => a + b, 0) / utItems.length;
      const pets_total = pets_er * 0.6 + pets_ut * 0.4;

      const { error } = await supabase
        .from('pets_responses')
        .insert({
          prolific_id: prolificId,
          call_id: callId,
          e1: responses.e1,
          e2: responses.e2,
          e3: responses.e3,
          e4: responses.e4,
          e5: responses.e5,
          e6: responses.e6,
          u1: responses.u1,
          u2: responses.u2,
          u3: responses.u3,
          u4: responses.u4,
          pets_er,
          pets_ut,
          pets_total
        });

      if (error) {
        console.error('Error submitting questionnaire:', error);
        toast({
          title: "Error",
          description: "Failed to submit questionnaire. Please try again.",
          variant: "destructive"
        });
        return;
      }

      setShowQuestionnaire(false);
      setShowCompletion(true);

      // Auto-redirect after 5 seconds
      setTimeout(() => {
        window.location.href = 'https://app.prolific.com/submissions/complete?cc=CWJF4IWH';
      }, 5000);

    } catch (err) {
      console.error('Error submitting questionnaire:', err);
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!prolificId) {
    return null;
  }

  // Show completion message
  if (showCompletion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
        <Card className="w-full max-w-2xl shadow-xl border-border">
          <CardHeader className="space-y-3">
            <div className="w-16 h-16 mx-auto bg-primary rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-foreground" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <CardTitle className="text-2xl text-center">Study Complete!</CardTitle>
            <CardDescription className="text-center">
              Thank you for your participation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-accent/50 rounded-lg p-6 space-y-4 text-center">
              <p className="text-foreground font-semibold">You will be automatically redirected to Prolific in 5 seconds...</p>
              <p className="text-sm text-muted-foreground">If you are not redirected automatically, please use the options below:</p>
              
              <Button
                onClick={() => window.location.href = 'https://app.prolific.com/submissions/complete?cc=CWJF4IWH'}
                className="w-full"
                size="lg"
              >
                Click here to complete on Prolific
              </Button>

              <div className="pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground mb-2">Or copy and paste this completion code:</p>
                <div className="bg-background rounded-md p-3 border border-border">
                  <code className="text-lg font-mono font-bold text-primary">CWJF4IWH</code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show questionnaire
  if (showQuestionnaire) {
    const allAnswered = Object.values(responses).every(val => val !== null);
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
        <Card className="w-full max-w-3xl shadow-xl border-border">
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl text-center">Perceived Empathy of Technology Scale (PETS)</CardTitle>
            <CardDescription className="text-center">
              Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-accent/50 rounded-lg p-6">
              <p className="text-sm text-foreground leading-relaxed">
                The following questions ask about how empathic you found the system you just interacted with. 
                Please rate each statement on a scale from 0 (strongly disagree) to 100 (strongly agree). 
                There are no right or wrong answers.
              </p>
            </div>

            <div className="space-y-8">
              {randomizedItems.map((item, index) => (
                <div key={item.key} className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-semibold text-muted-foreground mt-1">{index + 1}.</span>
                    <label className="text-sm text-foreground flex-1">{item.text}</label>
                  </div>
                  <div className="pl-6">
                    <Slider
                      value={[responses[item.key]]}
                      onValueChange={(value) => handleSliderChange(item.key, value)}
                      min={0}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>Strongly disagree (0)</span>
                      <span className="font-semibold text-primary">{responses[item.key]}</span>
                      <span>Strongly agree (100)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={handleSubmitQuestionnaire}
              disabled={isSubmitting}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Questionnaire'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
            {!isCallActive ? (
              <Button
                onClick={startCall}
                size="lg"
                className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform"
              >
                <Mic className="w-12 h-12" />
              </Button>
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
                  onClick={endCall}
                  size="lg"
                  variant="destructive"
                  className="w-32 h-32 rounded-full text-lg font-bold shadow-lg hover:scale-105 transition-transform"
                >
                  <Phone className="w-12 h-12 rotate-135" />
                </Button>
              </div>
            )}
          </div>

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
