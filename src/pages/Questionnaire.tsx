import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PetsSlider } from "@/components/ui/pets-slider";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { useResearcherMode } from "@/contexts/ResearcherModeContext";
import { usePageTracking } from "@/hooks/usePageTracking";
import { ExperimentProgress } from "@/components/ExperimentProgress";

interface PETSItem {
  id: string;
  text: string;
  key: "e1" | "e2" | "e3" | "e4" | "e5" | "e6" | "u1" | "u2" | "u3" | "u4";
}

interface AttentionCheckItem {
  id: string;
  text: string;
  key: "ac1";
  expectedValue: number;
  isAttentionCheck: true;
}

type QuestionItem = PETSItem | AttentionCheckItem;

const PETS_ITEMS: PETSItem[] = [
  { id: "E1", text: "Cali considered my mental state.", key: "e1" },
  { id: "E2", text: "Cali seemed emotionally intelligent.", key: "e2" },
  { id: "E3", text: "Cali expressed emotions.", key: "e3" },
  { id: "E4", text: "Cali sympathized with me.", key: "e4" },
  { id: "E5", text: "Cali showed interest in me.", key: "e5" },
  { id: "E6", text: "Cali supported me in coping with an emotional situation.", key: "e6" },
  { id: "U1", text: "Cali understood my goals.", key: "u1" },
  { id: "U2", text: "Cali understood my needs.", key: "u2" },
  { id: "U3", text: "I trusted Cali.", key: "u3" },
  { id: "U4", text: "Cali understood my intentions.", key: "u4" },
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
  e1_position: z.number().int(),
  e2_position: z.number().int(),
  e3_position: z.number().int(),
  e4_position: z.number().int(),
  e5_position: z.number().int(),
  e6_position: z.number().int(),
  u1_position: z.number().int(),
  u2_position: z.number().int(),
  u3_position: z.number().int(),
  u4_position: z.number().int(),
  attention_check_1: z.number().min(0).max(100).int().optional(),
  attention_check_1_expected: z.number().min(0).max(100).int().optional(),
  attention_check_1_position: z.number().int().optional(),
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
  const { isResearcherMode } = useResearcherMode();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({
    e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
    u1: 50, u2: 50, u3: 50, u4: 50, ac1: 50,
  });
  const [interacted, setInteracted] = useState<Record<string, boolean>>({
    e1: false, e2: false, e3: false, e4: false, e5: false, e6: false,
    u1: false, u2: false, u3: false, u4: false, ac1: false,
  });
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { trackBackButtonClick } = usePageTracking({
    pageName: "pets",
    prolificId,
    callId,
  });

  const attentionCheck = useMemo((): AttentionCheckItem => {
    const val = Math.floor(Math.random() * 101);
    return {
      id: "AC1",
      text: `Please select ${val}`,
      key: "ac1" as const,
      expectedValue: val,
      isAttentionCheck: true as const,
    };
  }, []);

  const { randomizedItems, positionMap } = useMemo(() => {
    const allItems: QuestionItem[] = [...PETS_ITEMS];
    const shuffled = allItems.sort(() => Math.random() - 0.5);
    const acPosition = Math.floor(Math.random() * (shuffled.length + 1));
    shuffled.splice(acPosition, 0, attentionCheck);

    const positions: Record<string, number> = {};
    shuffled.forEach((item, index) => {
      positions[item.key] = index + 1;
    });

    return { randomizedItems: shuffled, positionMap: positions };
  }, [attentionCheck]);

  useEffect(() => {
    const checkAccess = async () => {
      const storedId = sessionStorage.getItem("prolificId");
      const stateCallId = location.state?.callId;

      const finalProlificId = storedId || "RESEARCHER_MODE";
      const finalCallId = stateCallId || "researcher-call-id";

      setProlificId(finalProlificId);
      setCallId(finalCallId);
      sessionStorage.setItem("prolificId", finalProlificId);
      sessionStorage.setItem("flowStep", "3");

      const { data: existingResponse, error } = await supabase
        .from("experiment_responses")
        .select("prolific_id")
        .eq("prolific_id", storedId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error checking existing response:", error);
      }

      if (existingResponse) {
        navigate("/complete");
        return;
      }
      
      setIsLoading(false);
    };
    checkAccess();
  }, [navigate, location, toast]);

  const handleSliderChange = (key: string, value: number[]) => {
    setResponses((prev) => ({ ...prev, [key]: value[0] }));
  };

  const handleInputChange = (key: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setResponses((prev) => ({ ...prev, [key]: numValue }));
      setInteracted((prev) => ({ ...prev, [key]: true }));
    } else if (value === "") {
      setResponses((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  const handleInteract = (key: string) => {
    setInteracted((prev) => ({ ...prev, [key]: true }));
  };

  const handleBackClick = async () => {
    await trackBackButtonClick({
      responses,
      interactedCount: Object.values(interacted).filter(Boolean).length,
    });
    navigate("/questionnaire/formality", { state: { callId } });
  };

  const handleNext = () => {
    if (!isResearcherMode) {
      const allAnswered = Object.values(interacted).every((val) => val === true);
      if (!allAnswered) {
        setShowValidationErrors(true);
        toast({
          title: "Incomplete",
          description: "Please answer all highlighted questions before continuing.",
          variant: "destructive",
        });
        return;
      }
    }

    if (!prolificId || !callId) {
      toast({
        title: "Error",
        description: "Missing required data.",
        variant: "destructive",
      });
      return;
    }

    const erItems = [responses.e1, responses.e2, responses.e3, responses.e4, responses.e5, responses.e6];
    const utItems = [responses.u1, responses.u2, responses.u3, responses.u4];
    const pets_er = erItems.reduce((a, b) => a + b, 0) / erItems.length;
    const pets_ut = utItems.reduce((a, b) => a + b, 0) / utItems.length;
    const pets_total = pets_er * 0.6 + pets_ut * 0.4;

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
      e1_position: positionMap.e1,
      e2_position: positionMap.e2,
      e3_position: positionMap.e3,
      e4_position: positionMap.e4,
      e5_position: positionMap.e5,
      e6_position: positionMap.e6,
      u1_position: positionMap.u1,
      u2_position: positionMap.u2,
      u3_position: positionMap.u3,
      u4_position: positionMap.u4,
      attention_check_1: responses.ac1,
      attention_check_1_expected: attentionCheck.expectedValue,
      attention_check_1_position: positionMap.ac1,
      prolific_id: prolificId,
      call_id: callId,
      pets_er,
      pets_ut,
      pets_total,
    };

    const validationResult = petsResponseSchema.safeParse(questionnaireData);
    if (!validationResult.success) {
      toast({
        title: "Invalid Data",
        description: "Please ensure all values are valid.",
        variant: "destructive",
      });
      return;
    }

    sessionStorage.setItem("petsData", JSON.stringify(validationResult.data));
    sessionStorage.setItem("flowStep", "4");

    navigate("/questionnaire/tias", { state: { callId } });
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
      <Card className="w-full max-w-3xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <ExperimentProgress />
          <CardTitle className="text-2xl text-center">Questionnaire 2</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-accent/50 rounded-lg p-6">
            <p className="text-sm text-foreground leading-relaxed">
              During this experiment, you had a conversation with Cali. Please rate each statement on a scale from 0
              (strongly disagree) to 100 (strongly agree). Use the slider or type in the number to adjust your rating.
              There are no right or wrong answers.
            </p>
          </div>

          <div className="space-y-8">
            {randomizedItems.map((item, index) => {
              const hasError = showValidationErrors && !interacted[item.key];
              return (
                <div key={item.key} className={`space-y-3 p-4 rounded-lg transition-colors ${hasError ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-semibold text-muted-foreground mt-1">{index + 1}.</span>
                    <label className={`text-sm flex-1 ${hasError ? 'text-destructive font-medium' : 'text-foreground'}`}>
                      {item.text}
                      {hasError && <span className="ml-2 text-xs">(Please answer this question)</span>}
                    </label>
                  </div>
                  <div className="pl-6 space-y-2">
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
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>Strongly disagree (0)</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={responses[item.key]}
                        onChange={(e) => handleInputChange(item.key, e.target.value)}
                        onFocus={() => handleInteract(item.key)}
                        className={`w-20 text-center ${hasError ? 'border-destructive' : ''}`}
                      />
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
              onClick={handleBackClick}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button onClick={handleNext} className="flex-1" size="lg">
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Questionnaire;
