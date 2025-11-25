import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
const SCALE_LABELS = [{
  value: 1,
  label: 'Extremely Informal'
}, {
  value: 2,
  label: 'Very Informal'
}, {
  value: 3,
  label: 'Mostly Informal'
}, {
  value: 4,
  label: 'Neutral'
}, {
  value: 5,
  label: 'Mostly Formal'
}, {
  value: 6,
  label: 'Very Formal'
}, {
  value: 7,
  label: 'Extremely Formal'
}];
const FormalityQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    toast
  } = useToast();
  const {
    isResearcherMode
  } = useResearcherMode();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [formalityRating, setFormalityRating] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const checkAccess = async () => {
      // Load IDs from sessionStorage/state, no validation/redirects
      const storedId = sessionStorage.getItem('prolificId');
      const stateCallId = location.state?.callId;
      const petsDataString = sessionStorage.getItem('petsData');
      const tiasDataString = sessionStorage.getItem('tiasData');
      const intentionDataString = sessionStorage.getItem('intentionData');
      
      const finalProlificId = storedId || 'RESEARCHER_MODE';
      const finalCallId = stateCallId || 'researcher-call-id';
      
      setProlificId(finalProlificId);
      setCallId(finalCallId);
      sessionStorage.setItem('prolificId', finalProlificId);
      sessionStorage.setItem('flowStep', '4');

      // Set default PETS data if missing
      if (!petsDataString) {
        sessionStorage.setItem('petsData', JSON.stringify({
          e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
          u1: 50, u2: 50, u3: 50, u4: 50,
          prolific_id: finalProlificId,
          call_id: finalCallId,
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

      // Set default intention data if missing
      if (!intentionDataString) {
        sessionStorage.setItem('intentionData', JSON.stringify({
          intention_1: 4, intention_2: 4
        }));
      }
      setIsLoading(false);
    };
    checkAccess();
  }, [navigate, location, toast, isResearcherMode]);
  const handleContinue = () => {
    // Skip validation if researcher mode is enabled
    if (!isResearcherMode) {
      if (formalityRating === null) {
        toast({
          title: "Incomplete",
          description: "Please select a rating before continuing.",
          variant: "destructive"
        });
        return;
      }
    }

    // Store formality data in sessionStorage
    const formalityData = {
      formality: formalityRating || 4
    };
    sessionStorage.setItem('formalityData', JSON.stringify(formalityData));

    // Navigate to feedback page
    navigate('/questionnaire/feedback', {
      state: {
        callId
      }
    });
  };
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>;
  }
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
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
              <label className="text-lg font-medium text-foreground block text-center">During this experiment, you had a conversation with Robin.
How formal did you find Robin?
            </label>
              
              <div className="bg-accent/50 rounded-lg p-6">
                <div className="grid grid-cols-7 gap-4 mb-2 text-center">
                  {SCALE_LABELS.map(label => <div key={label.value} className="text-xs font-medium text-foreground h-4 flex items-center justify-center">
                      {label.label}
                    </div>)}
                </div>
                
                <RadioGroup value={formalityRating?.toString()} onValueChange={value => setFormalityRating(parseInt(value))} className="grid grid-cols-7 place-items-center mb-2">
                  {SCALE_LABELS.map(label => <RadioGroupItem key={label.value} value={label.value.toString()} id={`formality-${label.value}`} className="w-6 h-6" />)}
                </RadioGroup>
                
                <div className="grid grid-cols-7 gap-4 text-center">
                  {SCALE_LABELS.map(label => <Label key={label.value} htmlFor={`formality-${label.value}`} className="text-sm font-semibold cursor-pointer text-foreground">
                      {label.value}
                    </Label>)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button variant="outline" onClick={() => navigate('/questionnaire/intention', {
            state: {
              callId
            }
          })} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button onClick={handleContinue} disabled={!isResearcherMode && formalityRating === null} className="flex-1" size="lg">
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>;
};
export default FormalityQuestionnaire;