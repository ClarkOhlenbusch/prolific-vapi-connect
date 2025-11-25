import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
interface TIASItem {
  id: string;
  text: string;
  key: 'tias_1' | 'tias_2' | 'tias_3' | 'tias_4' | 'tias_5' | 'tias_6' | 'tias_7' | 'tias_8' | 'tias_9' | 'tias_10' | 'tias_11' | 'tias_12';
  isReversed: boolean;
}
interface TIASAttentionCheckItem {
  id: string;
  text: string;
  key: 'tias_ac1';
  expectedValue: number;
  isAttentionCheck: true;
}
type TIASQuestionItem = TIASItem | TIASAttentionCheckItem;
const TIAS_ITEMS: TIASItem[] = [{
  id: 'T1',
  text: 'Robin is deceptive.',
  key: 'tias_1',
  isReversed: true
}, {
  id: 'T2',
  text: 'Robin behaves in an underhanded manner.',
  key: 'tias_2',
  isReversed: true
}, {
  id: 'T3',
  text: 'I am suspicious of Robin\'s intent, action, or output.',
  key: 'tias_3',
  isReversed: true
}, {
  id: 'T4',
  text: 'I am wary of Robin.',
  key: 'tias_4',
  isReversed: true
}, {
  id: 'T5',
  text: 'Robin\'s action will have a harmful or injurious outcome.',
  key: 'tias_5',
  isReversed: true
}, {
  id: 'T6',
  text: 'I am confident in Robin.',
  key: 'tias_6',
  isReversed: false
}, {
  id: 'T7',
  text: 'Robin provides security.',
  key: 'tias_7',
  isReversed: false
}, {
  id: 'T8',
  text: 'Robin has integrity.',
  key: 'tias_8',
  isReversed: false
}, {
  id: 'T9',
  text: 'Robin is dependable.',
  key: 'tias_9',
  isReversed: false
}, {
  id: 'T10',
  text: 'Robin is reliable.',
  key: 'tias_10',
  isReversed: false
}, {
  id: 'T11',
  text: 'I can trust Robin.',
  key: 'tias_11',
  isReversed: false
}, {
  id: 'T12',
  text: 'I am familiar with Robin.',
  key: 'tias_12',
  isReversed: false
}];
const SCALE_LABELS = [{
  value: 1,
  label: 'Not at all'
}, {
  value: 2,
  label: 'Slightly'
}, {
  value: 3,
  label: 'Somewhat'
}, {
  value: 4,
  label: 'Moderately'
}, {
  value: 5,
  label: 'Quite a bit'
}, {
  value: 6,
  label: 'Very'
}, {
  value: 7,
  label: 'Extremely'
}];
const tiasResponseSchema = z.object({
  tias_1: z.number().min(1).max(7).int(),
  tias_2: z.number().min(1).max(7).int(),
  tias_3: z.number().min(1).max(7).int(),
  tias_4: z.number().min(1).max(7).int(),
  tias_5: z.number().min(1).max(7).int(),
  tias_6: z.number().min(1).max(7).int(),
  tias_7: z.number().min(1).max(7).int(),
  tias_8: z.number().min(1).max(7).int(),
  tias_9: z.number().min(1).max(7).int(),
  tias_10: z.number().min(1).max(7).int(),
  tias_11: z.number().min(1).max(7).int(),
  tias_12: z.number().min(1).max(7).int(),
  tias_total: z.number(),
  tias_attention_check_1: z.number().min(1).max(7).int().optional(),
  tias_attention_check_1_expected: z.number().min(1).max(7).int().optional()
});
const TiasQuestionnaire = () => {
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
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Generate attention check question with random target value (1-7)
  const attentionCheck = useMemo((): TIASAttentionCheckItem => {
    const val = Math.floor(Math.random() * 7) + 1;
    return {
      id: 'TAC1',
      text: `For data quality purposes, please select ${val} for this question.`,
      key: 'tias_ac1' as const,
      expectedValue: val,
      isAttentionCheck: true as const
    };
  }, []);

  // Randomize items once and insert attention check randomly
  const randomizedItems = useMemo(() => {
    const allItems: TIASQuestionItem[] = [...TIAS_ITEMS];
    const shuffled = allItems.sort(() => Math.random() - 0.5);

    // Insert attention check at random position
    const position = Math.floor(Math.random() * (shuffled.length + 1));
    shuffled.splice(position, 0, attentionCheck);
    return shuffled;
  }, [attentionCheck]);
  useEffect(() => {
    const checkAccess = async () => {
      // RESEARCHER MODE BYPASS - CHECK FIRST
      if (isResearcherMode) {
        const storedId = sessionStorage.getItem('prolificId');
        const stateCallId = location.state?.callId;
        const petsDataString = sessionStorage.getItem('petsData');
        
        // Set defaults
        const defaultProlificId = storedId || 'RESEARCHER_MODE';
        const defaultCallId = stateCallId || 'researcher-call-id';
        setProlificId(defaultProlificId);
        setCallId(defaultCallId);
        sessionStorage.setItem('prolificId', defaultProlificId);
        sessionStorage.setItem('flowStep', '4');

        // Set default PETS data if missing
        if (!petsDataString) {
          sessionStorage.setItem('petsData', JSON.stringify({
            e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
            u1: 50, u2: 50, u3: 50, u4: 50,
            attention_check_1: 50, attention_check_1_expected: 50,
            prolific_id: defaultProlificId,
            call_id: defaultCallId,
            pets_er: 50, pets_ut: 50, pets_total: 50
          }));
        }
        setIsLoading(false);
        return;
      }

      // Regular validation for non-researcher mode
      const currentStep = sessionStorage.getItem('flowStep');
      const storedId = sessionStorage.getItem('prolificId');
      const stateCallId = location.state?.callId;
      const petsDataString = sessionStorage.getItem('petsData');

      if (currentStep !== '4') {
        navigate('/');
        return;
      }
      if (!storedId || !stateCallId || !petsDataString) {
        toast({
          title: "Access Denied",
          description: "Please complete the PETS questionnaire first.",
          variant: "destructive"
        });
        navigate('/questionnaire/pets');
        return;
      }
      setProlificId(storedId);
      setCallId(stateCallId);

      // Check if already submitted
      const {
        data: existingResponse,
        error
      } = await supabase.from('pets_responses').select('*').eq('prolific_id', storedId).eq('call_id', stateCallId).single();
      if (error && error.code !== 'PGRST116') {
        console.error('Error checking existing response:', error);
      }
      if (existingResponse && existingResponse.tias_1 !== null) {
        // Load existing TIAS responses
        const loadedResponses: Record<string, number> = {};
        for (let i = 1; i <= 12; i++) {
          const key = `tias_${i}`;
          loadedResponses[key] = existingResponse[key] || 0;
        }
        setResponses(loadedResponses);
      }
      setIsLoading(false);
    };
    checkAccess();
  }, [navigate, location, toast]);
  const handleRadioChange = (key: string, value: string) => {
    setResponses(prev => ({
      ...prev,
      [key]: parseInt(value)
    }));
  };
  const handleNext = () => {
    // Skip validation if researcher mode is enabled
    if (!isResearcherMode) {
      // Check all questions have been answered (including attention checks)
      const allAnswered = randomizedItems.every(item => responses[item.key] !== undefined && responses[item.key] > 0);
      if (!allAnswered) {
        toast({
          title: "Incomplete",
          description: "Please answer all questions before continuing.",
          variant: "destructive"
        });
        return;
      }
    }

    // Calculate TIAS score with reverse scoring for items 1-5 (excluding attention checks)
    const tiasScores = TIAS_ITEMS.map(item => {
      const score = responses[item.key] || 4; // Default to 4 if not answered (researcher mode)
      return item.isReversed ? 8 - score : score;
    });
    const tias_total = tiasScores.reduce((a, b) => a + b, 0) / tiasScores.length;

    // Prepare TIAS data
    const tiasData: Record<string, number> = {
      tias_total
    };
    for (let i = 1; i <= 12; i++) {
      const key = `tias_${i}`;
      tiasData[key] = responses[key] || 4; // Default to 4 if not answered
    }

    // Add attention check data
    tiasData.tias_attention_check_1 = responses.tias_ac1 || 4;
    tiasData.tias_attention_check_1_expected = attentionCheck.expectedValue;

    // Validate TIAS data
    const validationResult = tiasResponseSchema.safeParse(tiasData);
    if (!validationResult.success) {
      console.error('TIAS validation error:', validationResult.error);
      toast({
        title: "Invalid Data",
        description: "Please ensure all values are valid.",
        variant: "destructive"
      });
      return;
    }

    // Store TIAS data in sessionStorage
    sessionStorage.setItem('tiasData', JSON.stringify(validationResult.data));

    // Navigate to intention questionnaire
    navigate('/questionnaire/intention', {
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
  const allAnswered = randomizedItems.every(item => responses[item.key] !== undefined && responses[item.key] > 0);
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-4xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl text-center">Questionnaire 2</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-accent/50 rounded-lg p-6">
            <p className="text-sm text-foreground leading-relaxed">During this experiment, you had a conversation with Robin. Please indicate the extent to which you agree with each of the following statements using the scale provided (1 = Not at all, 7 = Extremely).
          </p>
          </div>

          <div className="space-y-6">
            {randomizedItems.map((item, index) => {
            return <div key={item.key} className="space-y-3 pb-6 border-b border-border last:border-b-0">
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-semibold text-muted-foreground mt-1">{index + 1}.</span>
                    <label className="text-sm flex-1 font-medium text-foreground">
                      {item.text}
                    </label>
                  </div>
                <div className="pl-6">
                  <RadioGroup value={responses[item.key]?.toString()} onValueChange={value => handleRadioChange(item.key, value)} className="flex flex-col gap-2">
                    {SCALE_LABELS.map(label => <div key={label.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={label.value.toString()} id={`${item.key}-${label.value}`} />
                        <Label htmlFor={`${item.key}-${label.value}`} className="text-sm font-normal cursor-pointer">
                          {label.value} - {label.label}
                        </Label>
                      </div>)}
                  </RadioGroup>
                </div>
              </div>;
          })}
          </div>

          <div className="flex gap-4">
            <Button variant="outline" onClick={() => navigate('/questionnaire/pets', {
            state: {
              callId
            }
          })} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button onClick={handleNext} disabled={!isResearcherMode && !allAnswered} className="flex-1" size="lg">
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>;
};
export default TiasQuestionnaire;