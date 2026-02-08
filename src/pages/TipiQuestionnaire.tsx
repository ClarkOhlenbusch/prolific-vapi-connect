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
import { ExperimentProgress } from "@/components/ExperimentProgress";

interface TIPIItem {
  id: string;
  text: string;
  key: "tipi_1" | "tipi_2" | "tipi_3" | "tipi_4" | "tipi_5" | "tipi_6" | "tipi_7" | "tipi_8" | "tipi_9" | "tipi_10";
  subscale: "extraversion" | "agreeableness" | "conscientiousness" | "emotional_stability" | "openness";
  isReversed: boolean;
}

interface TIPIAttentionCheckItem {
  id: string;
  text: string;
  key: "tipi_ac1";
  expectedValue: number;
  isAttentionCheck: true;
}

type TIPIQuestionItem = TIPIItem | TIPIAttentionCheckItem;

// TIPI items based on the Ten-Item Personality Inventory
// Reverse-scored items: 2, 4, 6, 8, 10
const TIPI_ITEMS: TIPIItem[] = [
  { id: "TIPI1", text: "Extraverted, enthusiastic", key: "tipi_1", subscale: "extraversion", isReversed: false },
  { id: "TIPI2", text: "Critical, quarrelsome", key: "tipi_2", subscale: "agreeableness", isReversed: true },
  { id: "TIPI3", text: "Dependable, self-disciplined", key: "tipi_3", subscale: "conscientiousness", isReversed: false },
  { id: "TIPI4", text: "Anxious, easily upset", key: "tipi_4", subscale: "emotional_stability", isReversed: true },
  { id: "TIPI5", text: "Open to new experiences, complex", key: "tipi_5", subscale: "openness", isReversed: false },
  { id: "TIPI6", text: "Reserved, quiet", key: "tipi_6", subscale: "extraversion", isReversed: true },
  { id: "TIPI7", text: "Sympathetic, warm", key: "tipi_7", subscale: "agreeableness", isReversed: false },
  { id: "TIPI8", text: "Disorganized, careless", key: "tipi_8", subscale: "conscientiousness", isReversed: true },
  { id: "TIPI9", text: "Calm, emotionally stable", key: "tipi_9", subscale: "emotional_stability", isReversed: false },
  { id: "TIPI10", text: "Conventional, uncreative", key: "tipi_10", subscale: "openness", isReversed: true },
];

const SCALE_LABELS = [
  { value: 1, label: "Disagree strongly" },
  { value: 2, label: "Disagree moderately" },
  { value: 3, label: "Disagree a little" },
  { value: 4, label: "Neither agree nor disagree" },
  { value: 5, label: "Agree a little" },
  { value: 6, label: "Agree moderately" },
  { value: 7, label: "Agree strongly" },
];

const tipiResponseSchema = z.object({
  tipi_1: z.number().min(1).max(7).int(),
  tipi_2: z.number().min(1).max(7).int(),
  tipi_3: z.number().min(1).max(7).int(),
  tipi_4: z.number().min(1).max(7).int(),
  tipi_5: z.number().min(1).max(7).int(),
  tipi_6: z.number().min(1).max(7).int(),
  tipi_7: z.number().min(1).max(7).int(),
  tipi_8: z.number().min(1).max(7).int(),
  tipi_9: z.number().min(1).max(7).int(),
  tipi_10: z.number().min(1).max(7).int(),
  tipi_1_position: z.number().int(),
  tipi_2_position: z.number().int(),
  tipi_3_position: z.number().int(),
  tipi_4_position: z.number().int(),
  tipi_5_position: z.number().int(),
  tipi_6_position: z.number().int(),
  tipi_7_position: z.number().int(),
  tipi_8_position: z.number().int(),
  tipi_9_position: z.number().int(),
  tipi_10_position: z.number().int(),
  tipi_extraversion: z.number(),
  tipi_agreeableness: z.number(),
  tipi_conscientiousness: z.number(),
  tipi_emotional_stability: z.number(),
  tipi_openness: z.number(),
  tipi_attention_check_1: z.number().min(1).max(7).int().optional(),
  tipi_attention_check_1_expected: z.number().min(1).max(7).int().optional(),
  tipi_attention_check_1_position: z.number().int().optional(),
});

const TipiQuestionnaire = () => {
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
    pageName: "tipi",
    prolificId,
    callId,
  });

  const attentionCheck = useMemo((): TIPIAttentionCheckItem => {
    const val = Math.floor(Math.random() * 7) + 1;
    return {
      id: "TIPIAC1",
      text: `For data quality purposes, please select ${val} for this question.`,
      key: "tipi_ac1" as const,
      expectedValue: val,
      isAttentionCheck: true as const,
    };
  }, []);

  const { randomizedItems, positionMap } = useMemo(() => {
    const allItems: TIPIQuestionItem[] = [...TIPI_ITEMS];
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
      const intentionDataString = sessionStorage.getItem("intentionData");

      const finalProlificId = storedId || "RESEARCHER_MODE";
      const finalCallId = stateCallId || sessionStorage.getItem("callId") || "researcher-call-id";

      setProlificId(finalProlificId);
      setCallId(finalCallId);
      sessionStorage.setItem("prolificId", finalProlificId);
      sessionStorage.setItem("flowStep", "4");

      if (!intentionDataString) {
        sessionStorage.setItem(
          "intentionData",
          JSON.stringify({
            intention_1: 4,
            intention_2: 4,
          }),
        );
      }

      const isLikelyProlificParticipant = storedId?.length === 24;
      if (!isResearcherMode && isLikelyProlificParticipant) {
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
      }

      setIsLoading(false);
    };
    checkAccess();
  }, [navigate, location, toast, isResearcherMode]);

  const handleRadioChange = (key: string, value: string) => {
    setResponses((prev) => ({ ...prev, [key]: parseInt(value) }));
  };

  const handleBackClick = async () => {
    await trackBackButtonClick({
      answeredCount: Object.keys(responses).length,
    });
    navigate("/questionnaire/intention", { state: { callId } });
  };

  const calculateBigFiveScores = (resp: Record<string, number>) => {
    // Helper to get score with reverse scoring
    const getScore = (key: string, isReversed: boolean): number => {
      const rawScore = resp[key] || 4;
      return isReversed ? 8 - rawScore : rawScore;
    };

    // Calculate each subscale as average of 2 items
    // Extraversion: 1, 6R
    const extraversion = (getScore("tipi_1", false) + getScore("tipi_6", true)) / 2;
    // Agreeableness: 2R, 7
    const agreeableness = (getScore("tipi_2", true) + getScore("tipi_7", false)) / 2;
    // Conscientiousness: 3, 8R
    const conscientiousness = (getScore("tipi_3", false) + getScore("tipi_8", true)) / 2;
    // Emotional Stability: 4R, 9
    const emotional_stability = (getScore("tipi_4", true) + getScore("tipi_9", false)) / 2;
    // Openness: 5, 10R
    const openness = (getScore("tipi_5", false) + getScore("tipi_10", true)) / 2;

    return {
      tipi_extraversion: extraversion,
      tipi_agreeableness: agreeableness,
      tipi_conscientiousness: conscientiousness,
      tipi_emotional_stability: emotional_stability,
      tipi_openness: openness,
    };
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

    const bigFiveScores = calculateBigFiveScores(responses);

    const tipiData: Record<string, number> = { ...bigFiveScores };
    
    for (let i = 1; i <= 10; i++) {
      const key = `tipi_${i}`;
      tipiData[key] = responses[key] || 4;
      tipiData[`${key}_position`] = positionMap[key];
    }

    tipiData.tipi_attention_check_1 = responses.tipi_ac1 || 4;
    tipiData.tipi_attention_check_1_expected = attentionCheck.expectedValue;
    tipiData.tipi_attention_check_1_position = positionMap.tipi_ac1;

    const validationResult = tipiResponseSchema.safeParse(tipiData);
    if (!validationResult.success) {
      console.error("TIPI validation error:", validationResult.error);
      toast({
        title: "Invalid Data",
        description: "Please ensure all values are valid.",
        variant: "destructive",
      });
      return;
    }

    sessionStorage.setItem("tipiData", JSON.stringify(validationResult.data));
    navigate("/questionnaire/feedback", { state: { callId } });
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
          <ExperimentProgress />
          <CardTitle className="text-2xl text-center">Questionnaire 5</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-accent/50 rounded-lg p-6">
            <p className="text-sm text-foreground leading-relaxed">
              Here are a number of personality traits that may or may not apply to you. Please write a number next to each statement to indicate the extent to which you agree or disagree with that statement. You should rate the extent to which the pair of traits applies to you, even if one characteristic applies more strongly than the other.
            </p>
            <p className="text-sm text-foreground leading-relaxed mt-3 font-medium">
              I see myself as:
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

export default TipiQuestionnaire;
