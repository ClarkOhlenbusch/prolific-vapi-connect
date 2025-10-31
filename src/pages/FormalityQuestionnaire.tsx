import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

const SCALE_LABELS = [
  { value: 1, label: 'Informal' },
  { value: 2, label: '' },
  { value: 3, label: '' },
  { value: 4, label: 'Neutral' },
  { value: 5, label: '' },
  { value: 6, label: '' },
  { value: 7, label: 'Formal' },
];

const FormalityQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [formalityRating, setFormalityRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      
      // Check if PETS and TIAS data exist in sessionStorage
      const petsDataString = sessionStorage.getItem('petsData');
      const tiasDataString = sessionStorage.getItem('tiasData');
      
      if (!storedId || !stateCallId || !petsDataString || !tiasDataString) {
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
    if (formalityRating === null) {
      toast({
        title: "Incomplete",
        description: "Please select a rating before submitting.",
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

    // Get PETS and TIAS data from sessionStorage
    const petsDataString = sessionStorage.getItem('petsData');
    const tiasDataString = sessionStorage.getItem('tiasData');
    
    if (!petsDataString || !tiasDataString) {
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

      // Combine all questionnaire data (for now, formality will be stored in sessionStorage for later DB update)
      const combinedData = {
        ...petsData,
        ...tiasData,
        // formality will be added to DB schema later
      };

      // Submit via secure edge function
      const { data, error } = await supabase.functions.invoke('submit-questionnaire', {
        body: {
          sessionToken,
          questionnaireData: combinedData,
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
          <CardTitle className="text-2xl text-center">Formality Assessment</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="text-lg font-medium text-foreground block text-center">
                How formal did you find the voice assistant?
              </label>
              
              <div className="bg-accent/50 rounded-lg p-6">
                <RadioGroup
                  value={formalityRating?.toString()}
                  onValueChange={(value) => setFormalityRating(parseInt(value))}
                  className="flex justify-between items-center gap-4"
                >
                  {SCALE_LABELS.map(label => (
                    <div key={label.value} className="flex flex-col items-center space-y-2">
                      <RadioGroupItem 
                        value={label.value.toString()} 
                        id={`formality-${label.value}`}
                        className="w-6 h-6"
                      />
                      <Label 
                        htmlFor={`formality-${label.value}`}
                        className="text-sm font-semibold cursor-pointer text-center"
                      >
                        {label.value}
                      </Label>
                      {label.label && (
                        <span className="text-xs text-muted-foreground text-center whitespace-nowrap">
                          {label.label}
                        </span>
                      )}
                    </div>
                  ))}
                </RadioGroup>
                <div className="flex justify-between mt-4 text-sm font-medium text-muted-foreground">
                  <span>Informal (1)</span>
                  <span>Formal (7)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/questionnaire/tias', { state: { callId } })}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to TIAS
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || formalityRating === null}
              className="flex-1"
              size="lg"
            >
              {isSubmitting ? 'Submitting...' : 'Submit All Questionnaires'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FormalityQuestionnaire;
