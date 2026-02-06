import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { useResearcherMode } from "@/contexts/ResearcherModeContext";
import { usePageTracking } from "@/hooks/usePageTracking";
import { FeedbackProgressBar } from "@/components/FeedbackProgressBar";
import { ExperimentProgress } from "@/components/ExperimentProgress";
import { VoiceDictation } from "@/components/VoiceDictation";

const FeedbackQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [voiceAssistantExperience, setVoiceAssistantExperience] = useState("");
  const [communicationStyleFeedback, setCommunicationStyleFeedback] = useState("");
  const [experimentFeedback, setExperimentFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  
  const MAX_CHARS = 2500;
  const MIN_WORDS = 35;

  const { trackBackButtonClick } = usePageTracking({
    pageName: "feedback",
    prolificId,
    callId,
  });

  const countWords = (text: string): number => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const getWordCountStatus = (text: string): { count: number; isValid: boolean } => {
    const count = countWords(text);
    return { count, isValid: count >= MIN_WORDS };
  };

  useEffect(() => {
    const checkAccess = async () => {
      const storedId = sessionStorage.getItem("prolificId");
      const stateCallId = location.state?.callId;
      const petsDataString = sessionStorage.getItem("petsData");
      const tiasDataString = sessionStorage.getItem("tiasData");
      const tipiDataString = sessionStorage.getItem("tipiData");
      const intentionDataString = sessionStorage.getItem("intentionData");
      const formalityDataString = sessionStorage.getItem("formalityData");

      const finalProlificId = storedId || "RESEARCHER_MODE";
      const finalCallId = stateCallId || "researcher-call-id";

      setProlificId(finalProlificId);
      setCallId(finalCallId);
      sessionStorage.setItem("prolificId", finalProlificId);
      sessionStorage.setItem("flowStep", "4");

      if (!petsDataString) {
        sessionStorage.setItem(
          "petsData",
          JSON.stringify({
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
          }),
        );
      }

      if (!tiasDataString) {
        sessionStorage.setItem(
          "tiasData",
          JSON.stringify({
            tias_1: 4, tias_2: 4, tias_3: 4, tias_4: 4, tias_5: 4, tias_6: 4,
            tias_7: 4, tias_8: 4, tias_9: 4, tias_10: 4, tias_11: 4, tias_12: 4,
            tias_1_position: 1, tias_2_position: 2, tias_3_position: 3, tias_4_position: 4,
            tias_5_position: 5, tias_6_position: 6, tias_7_position: 7, tias_8_position: 8,
            tias_9_position: 9, tias_10_position: 10, tias_11_position: 11, tias_12_position: 12,
            tias_attention_check_1: 4,
            tias_attention_check_1_expected: 4,
            tias_attention_check_1_position: 13,
            tias_total: 4,
          }),
        );
      }

      if (!tipiDataString) {
        sessionStorage.setItem(
          "tipiData",
          JSON.stringify({
            tipi_1: 4, tipi_2: 4, tipi_3: 4, tipi_4: 4, tipi_5: 4,
            tipi_6: 4, tipi_7: 4, tipi_8: 4, tipi_9: 4, tipi_10: 4,
            tipi_1_position: 1, tipi_2_position: 2, tipi_3_position: 3, tipi_4_position: 4, tipi_5_position: 5,
            tipi_6_position: 6, tipi_7_position: 7, tipi_8_position: 8, tipi_9_position: 9, tipi_10_position: 10,
            tipi_attention_check_1: 4,
            tipi_attention_check_1_expected: 4,
            tipi_attention_check_1_position: 11,
            tipi_extraversion: 4,
            tipi_agreeableness: 4,
            tipi_conscientiousness: 4,
            tipi_emotional_stability: 4,
            tipi_openness: 4,
          }),
        );
      }

      // Check if intentionData exists AND has valid non-null values
      const needsIntentionDefaults = !intentionDataString || (() => {
        try {
          const parsed = JSON.parse(intentionDataString);
          return parsed.intention_1 === null || parsed.intention_2 === null;
        } catch {
          return true;
        }
      })();

      if (needsIntentionDefaults) {
        sessionStorage.setItem(
          "intentionData",
          JSON.stringify({
            intention_1: 4,
            intention_2: 4,
          }),
        );
      }

      if (!formalityDataString) {
        sessionStorage.setItem(
          "formalityData",
          JSON.stringify({
            formality: 4,
          }),
        );
      }
      setIsLoading(false);
    };
    checkAccess();
  }, [navigate, location, toast, isResearcherMode]);

  const handleBackClick = async () => {
    await trackBackButtonClick({
      voiceAssistantExperienceWordCount: countWords(voiceAssistantExperience),
      communicationStyleWordCount: countWords(communicationStyleFeedback),
      experimentFeedbackWordCount: countWords(experimentFeedback),
    });
    
    navigate("/questionnaire/tipi", {
      state: {
        callId,
      },
    });
  };

  const handleSubmit = async () => {
    const experienceStatus = getWordCountStatus(voiceAssistantExperience);
    const styleStatus = getWordCountStatus(communicationStyleFeedback);
    const experimentStatus = getWordCountStatus(experimentFeedback);

    if (!isResearcherMode) {
      if (!experienceStatus.isValid || !styleStatus.isValid || !experimentStatus.isValid) {
        setShowValidationErrors(true);
        toast({
          title: "Minimum Word Count Required",
          description: `Please write at least ${MIN_WORDS} words for each question before submitting.`,
          variant: "destructive",
          duration: 3000,
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
    const sessionToken = localStorage.getItem("sessionToken");
    if (!sessionToken) {
      toast({
        title: "Error",
        description: "Session token not found. Please start over.",
        variant: "destructive",
      });
      navigate("/");
      return;
    }

    const petsDataString = sessionStorage.getItem("petsData");
    const godspeedDataString = sessionStorage.getItem("godspeedData");
    const tiasDataString = sessionStorage.getItem("tiasData");
    const tipiDataString = sessionStorage.getItem("tipiData");
    const intentionDataString = sessionStorage.getItem("intentionData");
    const formalityDataString = sessionStorage.getItem("formalityData");
    if (!petsDataString || !godspeedDataString || !tiasDataString || !tipiDataString || !intentionDataString || !formalityDataString) {
      toast({
        title: "Error",
        description: "Previous questionnaire data not found.",
        variant: "destructive",
      });
      navigate("/questionnaire/pets");
      return;
    }
    setIsSubmitting(true);
    try {
      const petsData = JSON.parse(petsDataString);
      const godspeedData = JSON.parse(godspeedDataString);
      const tiasData = JSON.parse(tiasDataString);
      const tipiData = JSON.parse(tipiDataString);
      const intentionData = JSON.parse(intentionDataString);
      const formalityData = JSON.parse(formalityDataString);

      const feedbackPayload = {
        formality: formalityData.formality,
        voice_assistant_feedback: voiceAssistantExperience || "Not provided",
        communication_style_feedback: communicationStyleFeedback || "Not provided",
        experiment_feedback: experimentFeedback || "Not provided",
      };

      // Get assistant type from session storage (set during VoiceConversation)
      const assistantType = sessionStorage.getItem("assistantType") || null;

      const { data, error } = await supabase.functions.invoke("submit-questionnaire", {
        body: {
          sessionToken,
          petsData,
          godspeedData,
          tiasData,
          tipiData,
          intentionData,
          feedbackData: feedbackPayload,
          assistantType,
        },
      });
      if (error) {
        console.error("Error submitting questionnaire:", error);
        const errorMessage = error.message || "";
        if (errorMessage.includes("already submitted") || errorMessage.includes("409")) {
          toast({
            title: "Already Submitted",
            description: "You have already completed this questionnaire.",
          });
          navigate("/complete");
          return;
        }
        if (errorMessage.includes("Invalid or expired session") || errorMessage.includes("401")) {
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please start over.",
            variant: "destructive",
          });
          navigate("/");
          return;
        }
        toast({
          title: "Error",
          description: "Failed to submit questionnaire. Please try again.",
          variant: "destructive",
        });
        return;
      }

      sessionStorage.removeItem("petsData");
      sessionStorage.removeItem("tiasData");
      sessionStorage.removeItem("formalityData");
      toast({
        title: "Success",
        description: "Your responses have been submitted successfully.",
      });

      sessionStorage.setItem("flowStep", "5");
      navigate("/debriefing");
    } catch (err) {
      console.error("Unexpected error submitting questionnaire:", err);
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
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

  const experienceStatus = getWordCountStatus(voiceAssistantExperience);
  const styleStatus = getWordCountStatus(communicationStyleFeedback);
  const experimentStatus = getWordCountStatus(experimentFeedback);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-3xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <ExperimentProgress />
          <CardTitle className="text-2xl text-center">Final Feedback</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
          {/* Bonus motivation message */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 mt-4">
            <p className="text-sm text-foreground text-center font-medium whitespace-nowrap">
              The more detail you provide, the more helpful your feedback and the higher your bonus payout may be.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Question 1: Voice Assistant Experience */}
          <div className={`space-y-3 p-4 rounded-lg transition-colors ${showValidationErrors && !experienceStatus.isValid ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">
                Experience with Cali
              </p>
              <label className={`text-lg font-medium block ${showValidationErrors && !experienceStatus.isValid ? 'text-destructive' : 'text-foreground'}`}>
                Describe your experience interacting with Cali during the conversation.
              </label>
              <p className="text-sm text-foreground/70">
                You may consider aspects such as:
              </p>
              <ul className="text-sm text-foreground/70 list-disc list-inside ml-2 space-y-1">
                <li>How Cali communicated overall</li>
                <li>How well Cali understood and responded to you</li>
                <li>Anything that stood out positively or negatively during the interaction</li>
                <li>Any technical issues during the call (audio quality, delays, pauses, voice changes, or glitches)</li>
              </ul>
            </div>
            <div className="bg-accent/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Textarea
                  value={voiceAssistantExperience}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_CHARS) {
                      setVoiceAssistantExperience(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                  className={`min-h-[150px] resize-none bg-background flex-1 ${showValidationErrors && !experienceStatus.isValid ? 'border-destructive' : ''}`}
                  placeholder="Describe your experience with Cali..."
                />
                <VoiceDictation
                  onTranscript={(text) => {
                    setVoiceAssistantExperience((prev) => {
                      const newValue = prev + (prev && !prev.endsWith(" ") ? " " : "") + text;
                      return newValue.length <= MAX_CHARS ? newValue : prev;
                    });
                  }}
                  disabled={isSubmitting}
                />
              </div>
              <FeedbackProgressBar 
                wordCount={experienceStatus.count} 
                minWords={MIN_WORDS} 
                showValidationError={showValidationErrors && !experienceStatus.isValid}
              />
            </div>
          </div>

          {/* Question 2: Communication Style and Formality */}
          <div className={`space-y-3 p-4 rounded-lg transition-colors ${showValidationErrors && !styleStatus.isValid ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">
                Communication Style (Formality)
              </p>
              <label className={`text-lg font-medium block ${showValidationErrors && !styleStatus.isValid ? 'text-destructive' : 'text-foreground'}`}>
                How would you describe Cali's communication style?
              </label>
              <p className="text-sm text-foreground/70">
                Please include:
              </p>
              <ul className="text-sm text-foreground/70 list-disc list-inside ml-2 space-y-1">
                <li>Whether Cali felt more formal or more informal (and what gave you that impression)</li>
                <li>How appropriate that style felt for this conversation</li>
                <li>Whether the style affected your comfort, engagement, or trust</li>
              </ul>
            </div>
            <div className="bg-accent/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Textarea
                  value={communicationStyleFeedback}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_CHARS) {
                      setCommunicationStyleFeedback(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                  className={`min-h-[150px] resize-none bg-background flex-1 ${showValidationErrors && !styleStatus.isValid ? 'border-destructive' : ''}`}
                  placeholder="Describe Cali's communication style..."
                />
                <VoiceDictation
                  onTranscript={(text) => {
                    setCommunicationStyleFeedback((prev) => {
                      const newValue = prev + (prev && !prev.endsWith(" ") ? " " : "") + text;
                      return newValue.length <= MAX_CHARS ? newValue : prev;
                    });
                  }}
                  disabled={isSubmitting}
                />
              </div>
              <FeedbackProgressBar 
                wordCount={styleStatus.count} 
                minWords={MIN_WORDS} 
                showValidationError={showValidationErrors && !styleStatus.isValid}
              />
            </div>
          </div>

          {/* Question 3: Experiment Feedback */}
          <div className={`space-y-3 p-4 rounded-lg transition-colors ${showValidationErrors && !experimentStatus.isValid ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground/70 uppercase tracking-wide">
                Feedback on the Experiment
              </p>
              <p className="text-xs text-foreground/60 italic -mt-1">
                This question is about the study setup and experience, not about Cali.
              </p>
              <label className={`text-lg font-medium block ${showValidationErrors && !experimentStatus.isValid ? 'text-destructive' : 'text-foreground'}`}>
                Please share any feedback on the experiment itself, such as:
              </label>
              <ul className="text-sm text-foreground/70 list-disc list-inside ml-2 space-y-1">
                <li>Clarity of instructions and tasks</li>
                <li>Technical issues with the study platform (navigation problems, issues replying to survey questions, page loading issues)</li>
                <li>Flow and pacing of the study</li>
                <li>Anything that could be improved for future participants</li>
              </ul>
            </div>
            <div className="bg-accent/50 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Textarea
                  value={experimentFeedback}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_CHARS) {
                      setExperimentFeedback(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " ") {
                      e.stopPropagation();
                    }
                  }}
                  placeholder="Share your feedback on the experiment..."
                  className={`min-h-[150px] resize-none bg-background flex-1 ${showValidationErrors && !experimentStatus.isValid ? 'border-destructive' : ''}`}
                />
                <VoiceDictation
                  onTranscript={(text) => {
                    setExperimentFeedback((prev) => {
                      const newValue = prev + (prev && !prev.endsWith(" ") ? " " : "") + text;
                      return newValue.length <= MAX_CHARS ? newValue : prev;
                    });
                  }}
                  disabled={isSubmitting}
                />
              </div>
              <FeedbackProgressBar 
                wordCount={experimentStatus.count} 
                minWords={MIN_WORDS} 
                showValidationError={showValidationErrors && !experimentStatus.isValid}
              />
            </div>
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
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1"
              size="lg"
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeedbackQuestionnaire;
