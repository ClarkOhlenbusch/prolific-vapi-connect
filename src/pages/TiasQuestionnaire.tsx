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

interface TIASItem {
  id: string;
  text: string;
  key: 'tias_1' | 'tias_2' | 'tias_3' | 'tias_4' | 'tias_5' | 'tias_6' | 'tias_7' | 'tias_8' | 'tias_9' | 'tias_10' | 'tias_11' | 'tias_12';
  isReversed: boolean;
}

const TIAS_ITEMS: TIASItem[] = [
  { id: 'T1', text: 'The voice assistant is deceptive.', key: 'tias_1', isReversed: true },
  { id: 'T2', text: 'The voice assistant behaves in an underhanded manner.', key: 'tias_2', isReversed: true },
  { id: 'T3', text: 'I am suspicious of the voice assistant\'s intent, action, or output.', key: 'tias_3', isReversed: true },
  { id: 'T4', text: 'I am wary of the voice assistant.', key: 'tias_4', isReversed: true },
  { id: 'T5', text: 'The voice assistant\'s action will have a harmful or injurious outcome.', key: 'tias_5', isReversed: true },
  { id: 'T6', text: 'I am confident in the voice assistant.', key: 'tias_6', isReversed: false },
  { id: 'T7', text: 'The voice assistant provides security.', key: 'tias_7', isReversed: false },
  { id: 'T8', text: 'The voice assistant has integrity.', key: 'tias_8', isReversed: false },
  { id: 'T9', text: 'The voice assistant is dependable.', key: 'tias_9', isReversed: false },
  { id: 'T10', text: 'The voice assistant is reliable.', key: 'tias_10', isReversed: false },
  { id: 'T11', text: 'I can trust the voice assistant.', key: 'tias_11', isReversed: false },
  { id: 'T12', text: 'I am familiar with the voice assistant.', key: 'tias_12', isReversed: false },
];

const SCALE_LABELS = [
  { value: 1, label: 'Not at all' },
  { value: 2, label: 'Slightly' },
  { value: 3, label: 'Somewhat' },
  { value: 4, label: 'Moderately' },
  { value: 5, label: 'Quite a bit' },
  { value: 6, label: 'Very' },
  { value: 7, label: 'Extremely' },
];

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
});

const TiasQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Randomize items once
  const randomizedItems = useMemo(() => {
    return [...TIAS_ITEMS].sort(() => Math.random() - 0.5);
  }, []);

  useEffect(() => {
    const checkAccess = async () => {
      const storedId = sessionStorage.getItem('prolificId');
      const stateCallId = location.state?.callId;
      
      // Check if PETS data exists in sessionStorage
      const petsDataString = sessionStorage.getItem('petsData');
      
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
      const { data: existingResponse, error } = await supabase
        .from('pets_responses')
        .select('*')
        .eq('prolific_id', storedId)
        .eq('call_id', stateCallId)
        .single();

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
    setResponses(prev => ({ ...prev, [key]: parseInt(value) }));
  };

  const handleSubmit = async () => {
    // Check all questions have been answered
    const allAnswered = randomizedItems.every(item => responses[item.key] !== undefined && responses[item.key] > 0);
    
    if (!allAnswered) {
      toast({
        title: "Incomplete",
        description: "Please answer all questions before submitting.",
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

    // Get PETS data from sessionStorage
    const petsDataString = sessionStorage.getItem('petsData');
    if (!petsDataString) {
      toast({
        title: "Error",
        description: "PETS data not found. Please complete the PETS questionnaire first.",
        variant: "destructive"
      });
      navigate('/questionnaire/pets');
      return;
    }

    setIsSubmitting(true);

    try {
      const petsData = JSON.parse(petsDataString);

      // Calculate TIAS score with reverse scoring for items 1-5
      const tiasScores = randomizedItems.map(item => {
        const score = responses[item.key];
        return item.isReversed ? (8 - score) : score;
      });
      
      const tias_total = tiasScores.reduce((a, b) => a + b, 0) / tiasScores.length;

      // Prepare TIAS data
      const tiasData: Record<string, number> = {
        tias_total
      };
      
      for (let i = 1; i <= 12; i++) {
        const key = `tias_${i}`;
        tiasData[key] = responses[key];
      }

      // Validate TIAS data
      const validationResult = tiasResponseSchema.safeParse(tiasData);

      if (!validationResult.success) {
        console.error('TIAS validation error:', validationResult.error);
        toast({
          title: "Invalid Data",
          description: "Please ensure all values are valid.",
          variant: "destructive"
        });
        setIsSubmitting(false);
        return;
      }

      // Combine PETS and TIAS data
      const combinedData = {
        ...petsData,
        ...validationResult.data,
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

      toast({
        title: "Success",
        description: "Your responses have been submitted successfully.",
      });

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

  const allAnswered = randomizedItems.every(item => responses[item.key] !== undefined && responses[item.key] > 0);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-4xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl text-center">Trust in Automation Scale (TIAS)</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-accent/50 rounded-lg p-6 space-y-4">
            <p className="text-sm text-foreground leading-relaxed">
              Please indicate the extent to which you agree with each of the following statements about the voice assistant you just interacted with. Use the following scale:
            </p>
            <div className="grid grid-cols-7 gap-2 text-xs text-center">
              {SCALE_LABELS.map(label => (
                <div key={label.value} className="space-y-1">
                  <div className="font-semibold text-primary">{label.value}</div>
                  <div className="text-muted-foreground">{label.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {randomizedItems.map((item, index) => (
              <div key={item.key} className="space-y-3 pb-6 border-b border-border last:border-b-0">
                <div className="flex items-start gap-3">
                  <span className="text-sm font-semibold text-muted-foreground mt-1">{index + 1}.</span>
                  <label className="text-sm flex-1 text-foreground font-medium">
                    {item.text}
                  </label>
                </div>
                <div className="pl-6">
                  <RadioGroup
                    value={responses[item.key]?.toString()}
                    onValueChange={(value) => handleRadioChange(item.key, value)}
                    className="flex gap-4 flex-wrap"
                  >
                    {SCALE_LABELS.map(label => (
                      <div key={label.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={label.value.toString()} id={`${item.key}-${label.value}`} />
                        <Label 
                          htmlFor={`${item.key}-${label.value}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {label.value}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>Not at all</span>
                    <span>Extremely</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/questionnaire/pets', { state: { callId } })}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to PETS
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !allAnswered}
              className="flex-1"
              size="lg"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Questionnaires'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TiasQuestionnaire;
