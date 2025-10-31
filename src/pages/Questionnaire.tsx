import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PetsSlider } from '@/components/ui/pets-slider';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';

interface PETSItem {
  id: string;
  text: string;
  key: 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'u1' | 'u2' | 'u3' | 'u4';
}

interface AttentionCheckItem {
  id: string;
  text: string;
  key: 'ac1';
  expectedValue: number;
  isAttentionCheck: true;
}

type QuestionItem = PETSItem | AttentionCheckItem;

const PETS_ITEMS: PETSItem[] = [
  { id: 'E1', text: 'The voice assistant considered my mental state.', key: 'e1' },
  { id: 'E2', text: 'The voice assistant seemed emotionally intelligent.', key: 'e2' },
  { id: 'E3', text: 'The voice assistant expressed emotions.', key: 'e3' },
  { id: 'E4', text: 'The voice assistant sympathized with me.', key: 'e4' },
  { id: 'E5', text: 'The voice assistant showed interest in me.', key: 'e5' },
  { id: 'E6', text: 'The voice assistant supported me in coping with an emotional situation.', key: 'e6' },
  { id: 'U1', text: 'The voice assistant understood my goals.', key: 'u1' },
  { id: 'U2', text: 'The voice assistant understood my needs.', key: 'u2' },
  { id: 'U3', text: 'I trusted the voice assistant.', key: 'u3' },
  { id: 'U4', text: 'The voice assistant understood my intentions.', key: 'u4' },
];

const petsResponseSchema = z.object({
  e1: z.number().min(0).max(100).int(),
  e2: z.number().min(0).max(100).int(),
  e3: z.number().min(0).max(100).int(),
  e4: z.number().min(0).max(100).int(),
  e5: z.number().min(0).max(100).int(),
  e6: z.number().min(0).max(100).int(),
  u1: z.number().min(0).max(100).int(),
  u2: z.number().min(0).max(100).int(),
  u3: z.number().min(0).max(100).int(),
  u4: z.number().min(0).max(100).int(),
  attention_check_1: z.number().min(0).max(100).int().optional(),
  attention_check_1_expected: z.number().min(0).max(100).int().optional(),
  prolific_id: z.string().trim().min(1).max(100),
  call_id: z.string().trim().min(1).max(255),
  pets_er: z.number(),
  pets_ut: z.number(),
  pets_total: z.number(),
});

const Questionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({
    e1: 0, e2: 0, e3: 0, e4: 0, e5: 0, e6: 0,
    u1: 0, u2: 0, u3: 0, u4: 0,
    ac1: 0
  });
  const [interacted, setInteracted] = useState<Record<string, boolean>>({
    e1: false, e2: false, e3: false, e4: false, e5: false, e6: false,
    u1: false, u2: false, u3: false, u4: false,
    ac1: false
  });
  const [exampleValue, setExampleValue] = useState(50);
  const [isLoading, setIsLoading] = useState(true);

  // Generate attention check question with random target value
  const attentionCheck = useMemo((): AttentionCheckItem => {
    const val = Math.floor(Math.random() * 101);
    
    return { id: 'AC1', text: `Please select ${val}`, key: 'ac1' as const, expectedValue: val, isAttentionCheck: true as const };
  }, []);

  // Randomize items once and insert attention check randomly
  const randomizedItems = useMemo(() => {
    const allItems: QuestionItem[] = [...PETS_ITEMS];
    const shuffled = allItems.sort(() => Math.random() - 0.5);
    
    // Insert attention check at random position
    const position = Math.floor(Math.random() * (shuffled.length + 1));
    shuffled.splice(position, 0, attentionCheck);
    
    return shuffled;
  }, [attentionCheck]);

  useEffect(() => {
    const checkAccess = async () => {
      // Enforce flow: must be at step 3
      const currentStep = sessionStorage.getItem('flowStep');
      if (currentStep !== '3') {
        navigate('/');
        return;
      }

      // Get state from location or sessionStorage
      const stateCallId = location.state?.callId;
      const storedId = sessionStorage.getItem('prolificId');
      
      if (!storedId) {
        toast({
          title: "Access Denied",
          description: "Please start from the beginning.",
          variant: "destructive"
        });
        navigate('/');
        return;
      }

      if (!stateCallId) {
        toast({
          title: "Access Denied",
          description: "Please complete the conversation first.",
          variant: "destructive"
        });
        navigate('/conversation');
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

      if (existingResponse) {
        // Load existing responses
        const loadedResponses: Record<string, number> = {
          e1: existingResponse.e1,
          e2: existingResponse.e2,
          e3: existingResponse.e3,
          e4: existingResponse.e4,
          e5: existingResponse.e5,
          e6: existingResponse.e6,
          u1: existingResponse.u1,
          u2: existingResponse.u2,
          u3: existingResponse.u3,
          u4: existingResponse.u4,
          ac1: existingResponse.attention_check_1 || 0,
        };
        setResponses(loadedResponses);
        
        // Mark all as interacted since they have saved values
        const loadedInteracted: Record<string, boolean> = {};
        Object.keys(loadedResponses).forEach(key => {
          loadedInteracted[key] = true;
        });
        setInteracted(loadedInteracted);
      }

      setIsLoading(false);
    };

    checkAccess();
  }, [navigate, location, toast]);

  const handleSliderChange = (key: string, value: number[]) => {
    setResponses(prev => ({ ...prev, [key]: value[0] }));
  };

  const handleInteract = (key: string) => {
    setInteracted(prev => ({ ...prev, [key]: true }));
  };

  const handleNext = () => {
    // Check all questions have been interacted with
    const allAnswered = Object.values(interacted).every(val => val === true);
    
    if (!allAnswered) {
      toast({
        title: "Incomplete",
        description: "Please answer all questions before continuing.",
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

    // Calculate scores
    const erItems = [responses.e1, responses.e2, responses.e3, responses.e4, responses.e5, responses.e6];
    const utItems = [responses.u1, responses.u2, responses.u3, responses.u4];
    
    const pets_er = erItems.reduce((a, b) => a + b, 0) / erItems.length;
    const pets_ut = utItems.reduce((a, b) => a + b, 0) / utItems.length;
    const pets_total = pets_er * 0.6 + pets_ut * 0.4;

    // Prepare questionnaire data
    const questionnaireData = {
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
      attention_check_1: responses.ac1,
      attention_check_1_expected: attentionCheck.expectedValue,
      prolific_id: prolificId,
      call_id: callId,
      pets_er,
      pets_ut,
      pets_total,
    };

    // Validate response data client-side
    const validationResult = petsResponseSchema.safeParse(questionnaireData);

    if (!validationResult.success) {
      toast({
        title: "Invalid Data",
        description: "Please ensure all values are valid.",
        variant: "destructive"
      });
      return;
    }

    // Store PETS data in sessionStorage
    sessionStorage.setItem('petsData', JSON.stringify(validationResult.data));

    // Advance to next step
    sessionStorage.setItem('flowStep', '4');

    // Navigate to TIAS questionnaire
    navigate('/questionnaire/tias', { state: { callId } });
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

  const allAnswered = Object.values(interacted).every(val => val === true);

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
          <div className="bg-accent/50 rounded-lg p-6 space-y-4">
            <p className="text-sm text-foreground leading-relaxed">
              The following questions ask about how empathic you found the system (ie. the voice AI assistant) you just interacted with. 
              Please rate each statement on a scale from 0 (strongly disagree) to 100 (strongly agree). 
              There are no right or wrong answers.
            </p>
            
            {/* Example slider */}
            <div className="border-t border-border/50 pt-4 mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Example: How to use the slider</p>
              <div className="space-y-2">
                <p className="text-xs text-foreground italic">
                  Drag the slider to select your rating. Try it below:
                </p>
                <PetsSlider
                  value={[exampleValue]}
                  onValueChange={(value) => setExampleValue(value[0])}
                  onInteract={() => {}}
                  hasInteracted={true}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0</span>
                  <span className="font-semibold text-primary">{exampleValue}</span>
                  <span>100</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            {randomizedItems.map((item, index) => {
              return (
                <div key={item.key} className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-semibold text-muted-foreground mt-1">{index + 1}.</span>
                    <label className="text-sm flex-1 text-foreground">
                      {item.text}
                    </label>
                  </div>
                  <div className="pl-6">
                    <PetsSlider
                      value={[responses[item.key]]}
                      onValueChange={(value) => handleSliderChange(item.key, value)}
                      onInteract={() => handleInteract(item.key)}
                      hasInteracted={interacted[item.key]}
                      min={0}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>Strongly disagree (0)</span>
                      {interacted[item.key] && (
                        <span className="font-semibold text-primary">{responses[item.key]}</span>
                      )}
                      <span>Strongly agree (100)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() => navigate('/conversation')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Conversation
            </Button>
            <Button
              onClick={handleNext}
              disabled={!allAnswered}
              className="flex-1"
              size="lg"
            >
              Next: Trust Scale
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Questionnaire;
