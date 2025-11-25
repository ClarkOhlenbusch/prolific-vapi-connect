import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
import { toast } from 'sonner';

interface IntentionData {
  intention_1: number | null;
  intention_2: number | null;
}

const IntentionQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isResearcherMode } = useResearcherMode();
  
  const [isLoading, setIsLoading] = useState(true);
  const [prolificId, setProlificId] = useState<string>('');
  const [callId, setCallId] = useState<string>('');
  
  const [intention1, setIntention1] = useState<number | null>(null);
  const [intention2, setIntention2] = useState<number | null>(null);

  const questions = [
    "If available, I intend to start using voice assistants like Robin within the next month.",
    "If available, in the next months, I plan to experiment or regularly use voice assistants like Robin."
  ];

  const scaleLabels = [
    "Not at all",
    "Slightly",
    "Somewhat",
    "Moderately",
    "Quite a bit",
    "Very",
    "Extremely"
  ];

  useEffect(() => {
    // RESEARCHER MODE BYPASS - CHECK FIRST
    if (isResearcherMode) {
      const storedId = sessionStorage.getItem('prolificId') || location.state?.prolificId;
      const stateCallId = location.state?.callId;
      const petsDataString = sessionStorage.getItem('petsData');
      const tiasDataString = sessionStorage.getItem('tiasData');
      
      // Set defaults
      const defaultProlificId = storedId || 'RESEARCHER_MODE';
      const defaultCallId = stateCallId || 'researcher-call-id';
      setProlificId(defaultProlificId);
      setCallId(defaultCallId);
      sessionStorage.setItem('prolificId', defaultProlificId);
      sessionStorage.setItem('callId', defaultCallId);
      sessionStorage.setItem('flowStep', '4');

      // Set default PETS data if missing
      if (!petsDataString) {
        sessionStorage.setItem('petsData', JSON.stringify({
          e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
          u1: 50, u2: 50, u3: 50, u4: 50,
          prolific_id: defaultProlificId,
          call_id: defaultCallId,
          pets_er: 50, pets_ut: 50, pets_total: 50
        }));
      }

      // Set default TIAS data if missing
      if (!tiasDataString) {
        sessionStorage.setItem('tiasData', JSON.stringify({
          tias_1: 4, tias_2: 4, tias_3: 4, tias_4: 4, tias_5: 4, tias_6: 4,
          tias_7: 4, tias_8: 4, tias_9: 4, tias_10: 4, tias_11: 4, tias_12: 4,
          tias_total: 4
        }));
      }
      
      console.log('Researcher mode active - bypassing validation', { defaultProlificId, defaultCallId });
      setIsLoading(false);
      return;
    }

    // Regular validation for non-researcher mode
    const storedProlificId = sessionStorage.getItem('prolificId') || location.state?.prolificId;
    const storedCallId = sessionStorage.getItem('callId') || location.state?.callId;
    const tiasCompleted = sessionStorage.getItem('tiasData');

    console.log('Regular validation mode', { storedProlificId, storedCallId, tiasCompleted, isResearcherMode });

    if (!storedProlificId || !storedCallId) {
      toast.error('Session expired. Please start from the beginning.');
      navigate('/');
      return;
    }

    if (!tiasCompleted) {
      toast.error('Please complete the TIAS questionnaire first.');
      navigate('/questionnaire/tias');
      return;
    }

    setProlificId(storedProlificId);
    setCallId(storedCallId);

    // Load existing data if available
    const existingData = sessionStorage.getItem('intentionData');
    if (existingData) {
      const data: IntentionData = JSON.parse(existingData);
      setIntention1(data.intention_1);
      setIntention2(data.intention_2);
    }

    setIsLoading(false);
  }, [navigate, location.state, isResearcherMode]);

  const handleNext = () => {
    if (!isResearcherMode && (intention1 === null || intention2 === null)) {
      toast.error('Please answer all questions before continuing.');
      return;
    }

    const intentionData: IntentionData = {
      intention_1: intention1,
      intention_2: intention2,
    };

    sessionStorage.setItem('intentionData', JSON.stringify(intentionData));
    navigate('/questionnaire/formality', {
      state: { prolificId, callId }
    });
  };

  const handleBack = () => {
    navigate('/questionnaire/tias', {
      state: { prolificId, callId }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </Card>
      </div>
    );
  }

  const allAnswered = intention1 !== null && intention2 !== null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-4xl shadow-xl border-border">
        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-center">Questionnaire 4</h1>
          </div>

          <div className="bg-accent/50 rounded-lg p-6">
            <p className="text-sm text-foreground leading-relaxed">
              During this experiment, you had a conversation with Robin. Please indicate the extent to which you agree with each of the following statements using the scale provided (1 = Not at all, 7 = Extremely).
            </p>
          </div>

          <div className="space-y-6">
            {/* Question 1 */}
            <div className="space-y-3 pb-6 border-b border-border">
              <div className="flex items-start gap-3">
                <span className="text-sm font-semibold text-muted-foreground mt-1">1.</span>
                <label className="text-sm flex-1 font-medium text-foreground">
                  {questions[0]}
                </label>
              </div>
              <div className="pl-6">
                <RadioGroup
                  value={intention1?.toString() || ''}
                  onValueChange={(value) => setIntention1(parseInt(value))}
                  className="flex flex-col gap-2"
                >
                  {scaleLabels.map((label, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <RadioGroupItem value={(index + 1).toString()} id={`intention1-${index + 1}`} />
                      <Label htmlFor={`intention1-${index + 1}`} className="text-sm font-normal cursor-pointer">
                        {index + 1} - {label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>

            {/* Question 2 */}
            <div className="space-y-3 pb-6">
              <div className="flex items-start gap-3">
                <span className="text-sm font-semibold text-muted-foreground mt-1">2.</span>
                <label className="text-sm flex-1 font-medium text-foreground">
                  {questions[1]}
                </label>
              </div>
              <div className="pl-6">
                <RadioGroup
                  value={intention2?.toString() || ''}
                  onValueChange={(value) => setIntention2(parseInt(value))}
                  className="flex flex-col gap-2"
                >
                  {scaleLabels.map((label, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <RadioGroupItem value={(index + 1).toString()} id={`intention2-${index + 1}`} />
                      <Label htmlFor={`intention2-${index + 1}`} className="text-sm font-normal cursor-pointer">
                        {index + 1} - {label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
            >
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={!isResearcherMode && !allAnswered}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default IntentionQuestionnaire;
