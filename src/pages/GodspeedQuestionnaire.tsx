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

interface GodspeedItem {
  id: string;
  leftLabel: string;
  rightLabel: string;
  key: "anthro_1" | "anthro_2" | "anthro_3" | "anthro_4" | 
       "like_1" | "like_2" | "like_3" | "like_4" | "like_5" |
       "intel_1" | "intel_2" | "intel_3" | "intel_4" | "intel_5";
  category: "anthropomorphism" | "likeability" | "intelligence";
}

interface GodspeedAttentionCheckItem {
  id: string;
  text: string;
  key: "godspeed_ac1";
  expectedValue: number;
  isAttentionCheck: true;
}

type GodspeedQuestionItem = GodspeedItem | GodspeedAttentionCheckItem;

// Anthropomorphism items (4 items - removed "moving" question)
const ANTHROPOMORPHISM_ITEMS: GodspeedItem[] = [
  { id: "A1", leftLabel: "Fake", rightLabel: "Natural", key: "anthro_1", category: "anthropomorphism" },
  { id: "A2", leftLabel: "Machinelike", rightLabel: "Humanlike", key: "anthro_2", category: "anthropomorphism" },
  { id: "A3", leftLabel: "Unconscious", rightLabel: "Conscious", key: "anthro_3", category: "anthropomorphism" },
  { id: "A4", leftLabel: "Artificial", rightLabel: "Lifelike", key: "anthro_4", category: "anthropomorphism" },
];

// Likeability items (5 items)
const LIKEABILITY_ITEMS: GodspeedItem[] = [
  { id: "L1", leftLabel: "Dislike", rightLabel: "Like", key: "like_1", category: "likeability" },
  { id: "L2", leftLabel: "Unfriendly", rightLabel: "Friendly", key: "like_2", category: "likeability" },
  { id: "L3", leftLabel: "Unkind", rightLabel: "Kind", key: "like_3", category: "likeability" },
  { id: "L4", leftLabel: "Unpleasant", rightLabel: "Pleasant", key: "like_4", category: "likeability" },
  { id: "L5", leftLabel: "Awful", rightLabel: "Nice", key: "like_5", category: "likeability" },
];

// Perceived Intelligence items (5 items)
const INTELLIGENCE_ITEMS: GodspeedItem[] = [
  { id: "I1", leftLabel: "Incompetent", rightLabel: "Competent", key: "intel_1", category: "intelligence" },
  { id: "I2", leftLabel: "Ignorant", rightLabel: "Knowledgeable", key: "intel_2", category: "intelligence" },
  { id: "I3", leftLabel: "Irresponsible", rightLabel: "Responsible", key: "intel_3", category: "intelligence" },
  { id: "I4", leftLabel: "Unintelligent", rightLabel: "Intelligent", key: "intel_4", category: "intelligence" },
  { id: "I5", leftLabel: "Foolish", rightLabel: "Sensible", key: "intel_5", category: "intelligence" },
];

const ALL_GODSPEED_ITEMS: GodspeedItem[] = [
  ...ANTHROPOMORPHISM_ITEMS,
  ...LIKEABILITY_ITEMS,
  ...INTELLIGENCE_ITEMS,
];

const SCALE_OPTIONS = [1, 2, 3, 4, 5];

const godspeedResponseSchema = z.object({
  godspeed_anthro_1: z.number().min(1).max(5).int(),
  godspeed_anthro_2: z.number().min(1).max(5).int(),
  godspeed_anthro_3: z.number().min(1).max(5).int(),
  godspeed_anthro_4: z.number().min(1).max(5).int(),
  godspeed_like_1: z.number().min(1).max(5).int(),
  godspeed_like_2: z.number().min(1).max(5).int(),
  godspeed_like_3: z.number().min(1).max(5).int(),
  godspeed_like_4: z.number().min(1).max(5).int(),
  godspeed_like_5: z.number().min(1).max(5).int(),
  godspeed_intel_1: z.number().min(1).max(5).int(),
  godspeed_intel_2: z.number().min(1).max(5).int(),
  godspeed_intel_3: z.number().min(1).max(5).int(),
  godspeed_intel_4: z.number().min(1).max(5).int(),
  godspeed_intel_5: z.number().min(1).max(5).int(),
  godspeed_anthro_1_position: z.number().int(),
  godspeed_anthro_2_position: z.number().int(),
  godspeed_anthro_3_position: z.number().int(),
  godspeed_anthro_4_position: z.number().int(),
  godspeed_like_1_position: z.number().int(),
  godspeed_like_2_position: z.number().int(),
  godspeed_like_3_position: z.number().int(),
  godspeed_like_4_position: z.number().int(),
  godspeed_like_5_position: z.number().int(),
  godspeed_intel_1_position: z.number().int(),
  godspeed_intel_2_position: z.number().int(),
  godspeed_intel_3_position: z.number().int(),
  godspeed_intel_4_position: z.number().int(),
  godspeed_intel_5_position: z.number().int(),
  godspeed_anthro_total: z.number(),
  godspeed_like_total: z.number(),
  godspeed_intel_total: z.number(),
  godspeed_attention_check_1: z.number().min(1).max(5).int().optional(),
  godspeed_attention_check_1_expected: z.number().min(1).max(5).int().optional(),
  godspeed_attention_check_1_position: z.number().int().optional(),
});

const GodspeedQuestionnaire = () => {
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
    pageName: "godspeed",
    prolificId,
    callId,
  });

  const attentionCheck = useMemo((): GodspeedAttentionCheckItem => {
    const val = Math.floor(Math.random() * 5) + 1;
    return {
      id: "GAC1",
      text: `For data quality purposes, please select ${val} for this question.`,
      key: "godspeed_ac1" as const,
      expectedValue: val,
      isAttentionCheck: true as const,
    };
  }, []);

  // Block header type for rendering section titles
  interface BlockHeader {
    type: 'header';
    title: string;
    key: string;
  }

  type RenderItem = GodspeedQuestionItem | BlockHeader;

  const { randomizedItems, positionMap, renderItems } = useMemo(() => {
    // Shuffle items within each subscale block
    const shuffledAnthro = [...ANTHROPOMORPHISM_ITEMS].sort(() => Math.random() - 0.5);
    const shuffledLike = [...LIKEABILITY_ITEMS].sort(() => Math.random() - 0.5);
    const shuffledIntel = [...INTELLIGENCE_ITEMS].sort(() => Math.random() - 0.5);

    // Create block structure and randomize block order
    const blocks = [
      { name: 'Anthropomorphism', items: shuffledAnthro },
      { name: 'Likeability', items: shuffledLike },
      { name: 'Intelligence', items: shuffledIntel },
    ];
    
    // Shuffle block order
    const shuffledBlocks = blocks.sort(() => Math.random() - 0.5);
    
    // Flatten blocks into single array (questions only, for position tracking)
    const allItems: GodspeedQuestionItem[] = shuffledBlocks.flatMap(b => b.items);
    
    // Insert attention check at random position
    const acPosition = Math.floor(Math.random() * (allItems.length + 1));
    allItems.splice(acPosition, 0, attentionCheck);

    // Track positions
    const positions: Record<string, number> = {};
    allItems.forEach((item, index) => {
      positions[item.key] = index + 1;
    });

    // Build render items with headers
    const render: RenderItem[] = [];
    let questionIndex = 0;
    
    shuffledBlocks.forEach((block) => {
      // Add block header
      render.push({ type: 'header', title: block.name, key: `header-${block.name}` });
      
      // Add items from this block, inserting attention check at correct position
      block.items.forEach((item) => {
        // Check if attention check should come before this item
        while (questionIndex === acPosition && questionIndex < allItems.length) {
          render.push(attentionCheck);
          questionIndex++;
        }
        render.push(item);
        questionIndex++;
      });
    });
    
    // If attention check is at the very end
    if (questionIndex === acPosition) {
      render.push(attentionCheck);
    }

    return { randomizedItems: allItems, positionMap: positions, renderItems: render };
  }, [attentionCheck]);

  useEffect(() => {
    const checkAccess = async () => {
      const storedId = sessionStorage.getItem("prolificId");
      const stateCallId = location.state?.callId;
      const petsDataString = sessionStorage.getItem("petsData");

      const finalProlificId = storedId || "RESEARCHER_MODE";
      const finalCallId = stateCallId || sessionStorage.getItem("callId") || "researcher-call-id";

      setProlificId(finalProlificId);
      setCallId(finalCallId);
      sessionStorage.setItem("prolificId", finalProlificId);

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

    // Calculate subscale totals
    const anthroScores = ANTHROPOMORPHISM_ITEMS.map((item) => responses[item.key] || 3);
    const likeScores = LIKEABILITY_ITEMS.map((item) => responses[item.key] || 3);
    const intelScores = INTELLIGENCE_ITEMS.map((item) => responses[item.key] || 3);

    const godspeed_anthro_total = anthroScores.reduce((a, b) => a + b, 0) / anthroScores.length;
    const godspeed_like_total = likeScores.reduce((a, b) => a + b, 0) / likeScores.length;
    const godspeed_intel_total = intelScores.reduce((a, b) => a + b, 0) / intelScores.length;

    const godspeedData: Record<string, number> = {
      godspeed_anthro_total,
      godspeed_like_total,
      godspeed_intel_total,
    };

    // Add item responses and positions
    ANTHROPOMORPHISM_ITEMS.forEach((item, idx) => {
      godspeedData[`godspeed_anthro_${idx + 1}`] = responses[item.key] || 3;
      godspeedData[`godspeed_anthro_${idx + 1}_position`] = positionMap[item.key];
    });

    LIKEABILITY_ITEMS.forEach((item, idx) => {
      godspeedData[`godspeed_like_${idx + 1}`] = responses[item.key] || 3;
      godspeedData[`godspeed_like_${idx + 1}_position`] = positionMap[item.key];
    });

    INTELLIGENCE_ITEMS.forEach((item, idx) => {
      godspeedData[`godspeed_intel_${idx + 1}`] = responses[item.key] || 3;
      godspeedData[`godspeed_intel_${idx + 1}_position`] = positionMap[item.key];
    });

    // Add attention check
    godspeedData.godspeed_attention_check_1 = responses.godspeed_ac1 || 3;
    godspeedData.godspeed_attention_check_1_expected = attentionCheck.expectedValue;
    godspeedData.godspeed_attention_check_1_position = positionMap.godspeed_ac1;

    const validationResult = godspeedResponseSchema.safeParse(godspeedData);
    if (!validationResult.success) {
      console.error("Godspeed validation error:", validationResult.error);
      toast({
        title: "Invalid Data",
        description: "Please ensure all values are valid.",
        variant: "destructive",
      });
      return;
    }

    sessionStorage.setItem("godspeedData", JSON.stringify(validationResult.data));
    navigate("/questionnaire/tias", { state: { callId } });
  };

  const isAttentionCheck = (item: GodspeedQuestionItem): item is GodspeedAttentionCheckItem => {
    return 'isAttentionCheck' in item && item.isAttentionCheck === true;
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
          <CardTitle className="text-2xl text-center">Questionnaire 3</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-accent/50 rounded-lg p-6">
            <p className="text-sm text-foreground leading-relaxed">
              Please rate your impression of <strong>Cali</strong> on these scales. For each pair of words,
              select the number that best represents how you perceived Cali during your conversation.
            </p>
          </div>

          <div className="space-y-6">
            {renderItems.map((item, index) => {
              // Render block header
              if ('type' in item && item.type === 'header') {
                return (
                  <div key={item.key} className="pt-4 first:pt-0">
                    <h3 className="text-lg font-semibold text-foreground border-b border-border pb-2 mb-4">
                      {item.title}
                    </h3>
                  </div>
                );
              }

              const questionItem = item as GodspeedQuestionItem;
              const questionNumber = positionMap[questionItem.key];
              const hasError = showValidationErrors && (!responses[questionItem.key] || responses[questionItem.key] === 0);
              
              if (isAttentionCheck(questionItem)) {
                // Render attention check as simple radio question
                return (
                  <div key={questionItem.key} className={`space-y-3 pb-6 border-b border-border last:border-b-0 p-4 rounded-lg transition-colors ${hasError ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-sm font-semibold text-muted-foreground mt-1">{questionNumber}.</span>
                      <label className={`text-sm flex-1 font-medium ${hasError ? 'text-destructive' : 'text-foreground'}`}>
                        {questionItem.text}
                        {hasError && <span className="ml-2 text-xs font-normal">(Please answer this question)</span>}
                      </label>
                    </div>
                    <div className="pl-6">
                      <RadioGroup
                        value={responses[questionItem.key]?.toString()}
                        onValueChange={(value) => handleRadioChange(questionItem.key, value)}
                        className="flex items-center justify-start gap-2"
                      >
                        <span className="min-w-[100px]"></span>
                        {SCALE_OPTIONS.map((opt) => (
                          <div key={opt} className="flex flex-col items-center space-y-1">
                            <RadioGroupItem value={opt.toString()} id={`${questionItem.key}-${opt}`} />
                            <Label htmlFor={`${questionItem.key}-${opt}`} className="text-xs font-normal cursor-pointer">
                              {opt}
                            </Label>
                          </div>
                        ))}
                        <span className="min-w-[100px]"></span>
                      </RadioGroup>
                    </div>
                  </div>
                );
              }

              const semanticItem = questionItem as GodspeedItem;
              // Render semantic differential item
              return (
                <div key={semanticItem.key} className={`space-y-3 pb-6 border-b border-border last:border-b-0 p-4 rounded-lg transition-colors ${hasError ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-sm font-semibold text-muted-foreground mt-1">{questionNumber}.</span>
                    <div className="flex-1">
                      {hasError && <span className="text-xs text-destructive font-normal">(Please answer this question)</span>}
                    </div>
                  </div>
                  <div className="pl-6">
                    <RadioGroup
                      value={responses[semanticItem.key]?.toString()}
                      onValueChange={(value) => handleRadioChange(semanticItem.key, value)}
                      className="flex items-center justify-start gap-2"
                    >
                      <span className="text-sm font-medium text-right min-w-[100px]">{semanticItem.leftLabel}</span>
                      {SCALE_OPTIONS.map((opt) => (
                        <div key={opt} className="flex flex-col items-center space-y-1">
                          <RadioGroupItem value={opt.toString()} id={`${semanticItem.key}-${opt}`} />
                          <Label htmlFor={`${semanticItem.key}-${opt}`} className="text-xs text-muted-foreground cursor-pointer">
                            {opt}
                          </Label>
                        </div>
                      ))}
                      <span className="text-sm font-medium text-left min-w-[100px]">{semanticItem.rightLabel}</span>
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

export default GodspeedQuestionnaire;
