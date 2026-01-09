import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { useResearcherMode } from "@/contexts/ResearcherModeContext";
import { usePageTracking } from "@/hooks/usePageTracking";

interface TIASItem {
  id: string;
  text: string;
  key: "tias_1" | "tias_2" | "tias_3" | "tias_4" | "tias_5" | "tias_6" | "tias_7" | "tias_8" | "tias_9" | "tias_10" | "tias_11" | "tias_12";
  isReversed: boolean;
}

interface TIASAttentionCheckItem {
  id: string;
  text: string;
  key: "tias_ac1";
  expectedValue: number;
  isAttentionCheck: true;
}

type TIASQuestionItem = TIASItem | TIASAttentionCheckItem;

const TIAS_ITEMS: TIASItem[] = [
  { id: "T1", text: "Cali is deceptive.", key: "tias_1", isReversed: true },
  { id: "T2", text: "Cali behaves in an underhanded manner.", key: "tias_2", isReversed: true },
  { id: "T3", text: "I am suspicious of Cali's intent, action, or output.", key: "tias_3", isReversed: true },
  { id: "T4", text: "I am wary of Cali.", key: "tias_4", isReversed: true },
  { id: "T5", text: "Cali's action will have a harmful or injurious outcome.", key: "tias_5", isReversed: true },
  { id: "T6", text: "I am confident in Cali.", key: "tias_6", isReversed: false },
  { id: "T7", text: "Cali provides security.", key: "tias_7", isReversed: false },
  { id: "T8", text: "Cali has integrity.", key: "tias_8", isReversed: false },
  { id: "T9", text: "Cali is dependable.", key: "tias_9", isReversed: false },
  { id: "T10", text: "Cali is reliable.", key: "tias_10", isReversed: false },
  { id: "T11", text: "I can trust Cali.", key: "tias_11", isReversed: false },
  { id: "T12", text: "I am familiar with Cali.", key: "tias_12", isReversed: false },
];

const SCALE_LABELS = [
  { value: 1, label: "Not at all" },
  { value: 2, label: "Slightly" },
  { value: 3, label: "Somewhat" },
  { value: 4, label: "Moderately" },
  { value: 5, label: "Quite a bit" },
  { value: 6, label: "Very" },
  { value: 7, label: "Extremely" },
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
  tias_1_position: z.number().int(),
  tias_2_position: z.number().int(),
  tias_3_position: z.number().int(),
  tias_4_position: z.number().int(),
  tias_5_position: z.number().int(),
  tias_6_position: z.number().int(),
  tias_7_position: z.number().int(),
  tias_8_position: z.number().int(),
  tias_9_position: z.number().int(),
  tias_10_position: z.number().int(),
  tias_11_position: z.number().int(),
  tias_12_position: z.number().int(),
  tias_total: z.number(),
  tias_attention_check_1: z.number().min(1).max(7).int().optional(),
  tias_attention_check_1_expected: z.number().min(1).max(7).int().optional(),
  tias_attention_check_1_position: z.number().int().optional(),
});

const TiasQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  const { trackBackButtonClick } = usePageTracking({
    pageName: "tias",
    prolificId,
    callId,
  });

  const attentionCheck = useMemo((): TIASAttentionCheckItem => {
    const val = Math.floor(Math.random() * 7) + 1;
    return {
      id: "TAC1",
      text: `For data quality purposes, please select ${val} for this question.`,
      key: "tias_ac1" as const,
      expectedValue: val,
      isAttentionCheck: true as const,
    };
  }, []);

  const { randomizedItems, positionMap } = useMemo(() => {
    const allItems: TIASQuestionItem[] = [...TIAS_ITEMS];
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
      const petsDataString = sessionStorage.getItem("petsData");

      const finalProlificId = storedId || "RESEARCHER_MODE";
      const finalCallId = stateCallId || "researcher-call-id";

      setProlificId(finalProlificId);
      setCallId(finalCallId);
      sessionStorage.setItem("prolificId", finalProlificId);
      sessionStorage.setItem("flowStep", "4");

      if (!petsDataString) {
        const defaultPetsData = {
          e1: 50, e2: 50, e3: 50, e4: 50, e5: 50, e6: 50,
          u1: 50, u2: 50, u3: 50, u4: 50,
          e1_position: 1, e2_position: 2, e3_position: 3, e4_position: 4, e5_position: 5, e6_position: 6,
          u1_position: 7, u2_position: 8, u3_position: 9, u4_position: 10,
          attention_check_1: 50,
          attention_check_1_expected: 50,
          attention_check_1_position: 11,
          prolific_id: finalProlificId,
          call_id: finalCallId,
          pets_er: 50,
          pets_ut: 50,
          pets_total: 50,
        };
        sessionStorage.setItem("petsData", JSON.stringify(defaultPetsData));
      }

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

  const handleRadioChange = (key: string, value: string) => {
    setResponses((prev) => ({ ...prev, [key]: parseInt(value) }));
  };

  const handleBackClick = async () => {
    await trackBackButtonClick({
      answeredCount: Object.keys(responses).length,
    });
    navigate("/questionnaire/pets", { state: { callId } });
  };

  const handleNext = () => {
    if (!isResearcherMode) {
      const allAnswered = randomizedItems.every((item) => responses[item.key] !== undefined && responses[item.key] > 0);
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

    const tiasScores = TIAS_ITEMS.map((item) => {
      const score = responses[item.key] || 4;
      return item.isReversed ? 8 - score : score;
    });
    const tias_total = tiasScores.reduce((a, b) => a + b, 0) / tiasScores.length;

    const tiasData: Record<string, number> = { tias_total };
    
    for (let i = 1; i <= 12; i++) {
      const key = `tias_${i}`;
      tiasData[key] = responses[key] || 4;
      tiasData[`${key}_position`] = positionMap[key];
    }

    tiasData.tias_attention_check_1 = responses.tias_ac1 || 4;
    tiasData.tias_attention_check_1_expected = attentionCheck.expectedValue;
    tiasData.tias_attention_check_1_position = positionMap.tias_ac1;

    const validationResult = tiasResponseSchema.safeParse(tiasData);
    if (!validationResult.success) {
      console.error("TIAS validation error:", validationResult.error);
      toast({
        title: "Invalid Data",
        description: "Please ensure all values are valid.",
        variant: "destructive",
      });
      return;
    }

    sessionStorage.setItem("tiasData", JSON.stringify(validationResult.data));
    navigate("/questionnaire/intention", { state: { callId } });
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
      <Card className="w-full max-w-4xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl text-center">Questionnaire 3</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-accent/50 rounded-lg p-6">
            <p className="text-sm text-foreground leading-relaxed">
              During this experiment, you had a conversation with Cali. Please indicate the extent to which you agree
              with each of the following statements using the scale provided (1 = Not at all, 7 = Extremely).
            </p>
          </div>

          <div className="space-y-6">
            {randomizedItems.map((item, index) => {
              const hasError = showValidationErrors && (!responses[item.key] || responses[item.key] === 0);
              return (
                <div key={item.key} className={`space-y-3 pb-6 border-b border-border last:border-b-0 p-4 rounded-lg transition-colors ${hasError ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-semibold text-muted-foreground mt-1">{index + 1}.</span>
                    <label className={`text-sm flex-1 font-medium ${hasError ? 'text-destructive' : 'text-foreground'}`}>
                      {item.text}
                      {hasError && <span className="ml-2 text-xs font-normal">(Please answer this question)</span>}
                    </label>
                  </div>
                  <div className="pl-6">
                    <RadioGroup
                      value={responses[item.key]?.toString()}
                      onValueChange={(value) => handleRadioChange(item.key, value)}
                      className="flex flex-col gap-2"
                    >
                      {SCALE_LABELS.map((label) => (
                        <div key={label.value} className="flex items-center space-x-2">
                          <RadioGroupItem value={label.value.toString()} id={`${item.key}-${label.value}`} />
                          <Label htmlFor={`${item.key}-${label.value}`} className="text-sm font-normal cursor-pointer">
                            {label.value} - {label.label}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
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

export default TiasQuestionnaire;
