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
    "Strongly Disagree",
    "Disagree",
    "Somewhat Disagree",
    "Neither Agree nor Disagree",
    "Somewhat Agree",
    "Agree",
    "Strongly Agree"
  ];

  useEffect(() => {
    const checkAccess = () => {
      const storedProlificId = sessionStorage.getItem('prolificId') || location.state?.prolificId;
      const storedCallId = sessionStorage.getItem('callId') || location.state?.callId;
      const tiasCompleted = sessionStorage.getItem('tiasData');

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
      } else if (isResearcherMode) {
        // Set default values for researcher mode
        setIntention1(4);
        setIntention2(4);
      }

      setIsLoading(false);
    };

    checkAccess();
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Behavioral Intention</h1>
          <p className="text-muted-foreground">
            Please indicate your level of agreement with the following statements:
          </p>
        </div>

        <div className="space-y-8">
          {/* Question 1 */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/30">
            <p className="font-medium">{questions[0]}</p>
            <RadioGroup
              value={intention1?.toString() || ''}
              onValueChange={(value) => setIntention1(parseInt(value))}
              className="space-y-2"
            >
              {scaleLabels.map((label, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <RadioGroupItem value={(index + 1).toString()} id={`intention1-${index + 1}`} />
                  <Label htmlFor={`intention1-${index + 1}`} className="font-normal cursor-pointer">
                    {index + 1}. {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Question 2 */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/30">
            <p className="font-medium">{questions[1]}</p>
            <RadioGroup
              value={intention2?.toString() || ''}
              onValueChange={(value) => setIntention2(parseInt(value))}
              className="space-y-2"
            >
              {scaleLabels.map((label, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <RadioGroupItem value={(index + 1).toString()} id={`intention2-${index + 1}`} />
                  <Label htmlFor={`intention2-${index + 1}`} className="font-normal cursor-pointer">
                    {index + 1}. {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
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
      </Card>
    </div>
  );
};

export default IntentionQuestionnaire;
