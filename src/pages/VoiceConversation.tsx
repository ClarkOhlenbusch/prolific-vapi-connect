import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { VapiWidget } from '@vapi-ai/client-sdk-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

// Extended window interface for VAPI events
declare global {
  interface Window {
    vapiEventBus?: {
      on: (event: string, callback: (data: any) => void) => void;
      off: (event: string, callback: (data: any) => void) => void;
    };
  }
}

const VoiceConversation = () => {
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callTracked, setCallTracked] = useState(false);
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

  const handleCallStart = useCallback(async (callData?: any) => {
    console.log('Call started, data:', callData);
    setIsCallActive(true);
    
    if (!prolificId || callTracked) return;
    
    // Generate a unique call ID
    // In a real implementation, VAPI would provide this ID
    const callId = callData?.id || callData?.callId || `vapi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const { error } = await supabase
        .from('participant_calls')
        .insert({
          prolific_id: prolificId,
          call_id: callId
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
          title: "Call Started",
          description: "Your conversation has begun and is being tracked.",
        });
      }
    } catch (err) {
      console.error('Error storing call data:', err);
    }
  }, [prolificId, callTracked, toast]);

  const handleCallEnd = useCallback(() => {
    console.log('Call ended');
    setIsCallActive(false);
    setCallTracked(false);
    toast({
      title: "Call Ended",
      description: "Thank you for participating in the study!",
    });
  }, [toast]);

  // Set up event listeners for VAPI widget
  useEffect(() => {
    // Poll for the VAPI widget to be loaded
    const checkForVapi = setInterval(() => {
      // Check if VAPI widget has been initialized
      const vapiWidget = document.querySelector('vapi-widget');
      if (vapiWidget) {
        console.log('VAPI widget detected');
        clearInterval(checkForVapi);
        
        // Listen for widget state changes
        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'call-status') {
              const status = (mutation.target as Element).getAttribute('call-status');
              console.log('Call status changed:', status);
              
              if (status === 'active' && !callTracked) {
                handleCallStart();
              } else if (status === 'ended' || status === 'inactive') {
                if (isCallActive) {
                  handleCallEnd();
                }
              }
            }
          });
        });

        observer.observe(vapiWidget, {
          attributes: true,
          attributeFilter: ['call-status']
        });

        return () => observer.disconnect();
      }
    }, 500);

    return () => clearInterval(checkForVapi);
  }, [handleCallStart, handleCallEnd, callTracked, isCallActive]);

  const handleGoBack = () => {
    sessionStorage.removeItem('prolificId');
    navigate('/');
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

          {isCallActive && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
              <p className="text-sm font-medium text-primary">
                🎙️ Conversation in progress...
              </p>
            </div>
          )}

          <div className="flex justify-center py-4">
            <VapiWidget
              publicKey={import.meta.env.VITE_VAPI_PUBLIC_KEY}
              assistantId={import.meta.env.VITE_VAPI_ASSISTANT_ID}
              mode="voice"
            />
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
