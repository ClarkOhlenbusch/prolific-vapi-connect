import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

const FeedbackQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [voiceAssistantFeedback, setVoiceAssistantFeedback] = useState('');
  const [experimentFeedback, setExperimentFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const MAX_CHARS = 1000;

  useEffect(() => {
    const checkAccess = async () => {
      // Enforce flow: must be at step 4
      const currentStep = sessionStorage.getItem('flowStep');
      if (currentStep !== '4') {
        navigate('/');
        return;
      }

      const storedId = sessionStorage.getItem('prolificId');
      const stateCallId = location.state?.callId;
      
      // Check if PETS, TIAS, and Formality data exist in sessionStorage
      const petsDataString = sessionStorage.getItem('petsData');
      const tiasDataString = sessionStorage.getItem('tiasData');
      const formalityDataString = sessionStorage.getItem('formalityData');
      
      if (!storedId || !stateCallId || !petsDataString || !tiasDataString || !formalityDataString) {
        toast({
          title: "Access Denied",
          description: "Please complete the previous questionnaires first.",
          variant: "destructive"
        });
        navigate('/questionnaire/pets');
        return;
      }

      setProlificId(storedId);
      setCallId(stateCallId);
      setIsLoading(false);
    };

    checkAccess();
  }, [navigate, location, toast]);

  const handleSubmit = async () => {
    // Validate that both feedback fields are filled
    if (!voiceAssistantFeedback.trim() || !experimentFeedback.trim()) {
      toast({
        title: "Incomplete",
        description: "Please answer both feedback questions before submitting.",
        variant: "destructive"
      });
      return;
    }

    if (!prolificId || !callId) {
      toast({
        title: "Error",
        description: "Missing required data.",
        variant: "destructive"
      });
      return;
    }

    const sessionToken = localStorage.getItem('sessionToken');
    if (!sessionToken) {
      toast({
        title: "Error",
        description: "Session token not found. Please start over.",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    // Get all previous data from sessionStorage
    const petsDataString = sessionStorage.getItem('petsData');
    const tiasDataString = sessionStorage.getItem('tiasData');
    const formalityDataString = sessionStorage.getItem('formalityData');
    
    if (!petsDataString || !tiasDataString || !formalityDataString) {
      toast({
        title: "Error",
        description: "Previous questionnaire data not found.",
        variant: "destructive"
      });
      navigate('/questionnaire/pets');
      return;
    }

    setIsSubmitting(true);

    try {
      const petsData = JSON.parse(petsDataString);
      const tiasData = JSON.parse(tiasDataString);
      const formalityData = JSON.parse(formalityDataString);

      // Combine PETS and TIAS questionnaire data
      const questionnaireData = {
        prolific_id: prolificId,
        call_id: callId,
        ...petsData,
        ...tiasData,
      };

      // Create feedback data object
      const feedbackPayload = {
        prolific_id: prolificId,
        call_id: callId,
        formality: formalityData.formality,
        voice_assistant_feedback: voiceAssistantFeedback,
        experiment_feedback: experimentFeedback,
      };

      // Submit via secure edge function
      const { data, error } = await supabase.functions.invoke('submit-questionnaire', {
        body: {
          sessionToken,
          questionnaireData,
          feedbackData: feedbackPayload,
        },
      });

      if (error) {
        console.error('Error submitting questionnaire:', error);
        
        const errorMessage = error.message || '';
        
        if (errorMessage.includes('already submitted') || errorMessage.includes('409')) {
          toast({
            title: "Already Submitted",
            description: "You have already completed this questionnaire.",
          });
          navigate('/complete');
          return;
        }
        
        if (errorMessage.includes('Invalid or expired session') || errorMessage.includes('401')) {
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please start over.",
            variant: "destructive"
          });
          navigate('/');
          return;
        }

        toast({
          title: "Error",
          description: "Failed to submit questionnaire. Please try again.",
          variant: "destructive"
        });
        return;
      }

      // Clear stored data
      sessionStorage.removeItem('petsData');
      sessionStorage.removeItem('tiasData');
      sessionStorage.removeItem('formalityData');

      toast({
        title: "Success",
        description: "Your responses have been submitted successfully.",
      });

      // Advance to final step
      sessionStorage.setItem('flowStep', '5');

      navigate('/complete');
    } catch (err) {
      console.error('Unexpected error submitting questionnaire:', err);
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl text-center">Final Feedback</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Voice Assistant Experience */}
          <div className="space-y-3">
            <label className="text-lg font-medium text-foreground block">
              Please describe your experience when talking to the voice assistant.
            </label>
            <div className="bg-accent/50 rounded-lg p-4">
              <Textarea
                value={voiceAssistantFeedback}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) {
                    setVoiceAssistantFeedback(e.target.value);
                  }
                }}
                placeholder="Share your thoughts about the voice assistant..."
                className="min-h-[120px] resize-none bg-background"
              />
              <div className="mt-2 text-sm text-muted-foreground text-right">
                {voiceAssistantFeedback.length} / {MAX_CHARS} characters
              </div>
            </div>
          </div>

          {/* Overall Experiment Feedback */}
          <div className="space-y-3">
            <label className="text-lg font-medium text-foreground block">
              How was your overall experience doing the experiment? Any feedback, comments, or questions on the experiment?
            </label>
            <div className="bg-accent/50 rounded-lg p-4">
              <Textarea
                value={experimentFeedback}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) {
                    setExperimentFeedback(e.target.value);
                  }
                }}
                placeholder="Share your thoughts about the experiment..."
                className="min-h-[120px] resize-none bg-background"
              />
              <div className="mt-2 text-sm text-muted-foreground text-right">
                {experimentFeedback.length} / {MAX_CHARS} characters
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/questionnaire/formality', { state: { callId } })}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !voiceAssistantFeedback.trim() || !experimentFeedback.trim()}
              className="flex-1"
              size="lg"
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeedbackQuestionnaire;
