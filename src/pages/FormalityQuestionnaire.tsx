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

  const handleContinue = () => {
    if (formalityRating === null) {
      toast({
        title: "Incomplete",
        description: "Please select a rating before continuing.",
        variant: "destructive"
      });
      return;
    }

    // Store formality data in sessionStorage
    const formalityData = { formality: formalityRating };
    sessionStorage.setItem('formalityData', JSON.stringify(formalityData));

    // Navigate to feedback page
    navigate('/questionnaire/feedback', { state: { callId } });
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
              onClick={handleContinue}
              disabled={formalityRating === null}
              className="flex-1"
              size="lg"
            >
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FormalityQuestionnaire;
