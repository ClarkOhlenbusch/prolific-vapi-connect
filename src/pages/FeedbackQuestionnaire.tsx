import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { useResearcherMode } from "@/contexts/ResearcherModeContext";
const FeedbackQuestionnaire = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [voiceAssistantFeedback, setVoiceAssistantFeedback] = useState("");
  const [experimentFeedback, setExperimentFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const MAX_CHARS = 1000;
  useEffect(() => {
    const checkAccess = async () => {
      // Load IDs from sessionStorage/state, no validation/redirects
      const storedId = sessionStorage.getItem("prolificId");
      const stateCallId = location.state?.callId;
      const petsDataString = sessionStorage.getItem("petsData");
      const tiasDataString = sessionStorage.getItem("tiasData");
      const intentionDataString = sessionStorage.getItem("intentionData");
      const formalityDataString = sessionStorage.getItem("formalityData");

      const finalProlificId = storedId || "RESEARCHER_MODE";
      const finalCallId = stateCallId || "researcher-call-id";

      setProlificId(finalProlificId);
      setCallId(finalCallId);
      sessionStorage.setItem("prolificId", finalProlificId);
      sessionStorage.setItem("flowStep", "4");

      // Set default PETS data if missing
      if (!petsDataString) {
        sessionStorage.setItem(
          "petsData",
          JSON.stringify({
            e1: 50,
            e2: 50,
            e3: 50,
            e4: 50,
            e5: 50,
            e6: 50,
            u1: 50,
            u2: 50,
            u3: 50,
            u4: 50,
            prolific_id: finalProlificId,
            call_id: finalCallId,
            pets_er: 50,
            pets_ut: 50,
            pets_total: 50,
          }),
        );
      }

      // Set default TIAS data if missing
      if (!tiasDataString) {
        sessionStorage.setItem(
          "tiasData",
          JSON.stringify({
            tias_1: 4,
            tias_2: 4,
            tias_3: 4,
            tias_4: 4,
            tias_5: 4,
            tias_6: 4,
            tias_7: 4,
            tias_8: 4,
            tias_9: 4,
            tias_10: 4,
            tias_11: 4,
            tias_12: 4,
            tias_total: 4,
          }),
        );
      }

      // Set default intention data if missing
      if (!intentionDataString) {
        sessionStorage.setItem(
          "intentionData",
          JSON.stringify({
            intention_1: 4,
            intention_2: 4,
          }),
        );
      }

      // Set default formality data if missing
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
  const handleSubmit = async () => {
    // Skip validation if researcher mode is enabled
    if (!isResearcherMode) {
      // Validate that both feedback fields are filled
      if (!voiceAssistantFeedback.trim() || !experimentFeedback.trim()) {
        setShowValidationErrors(true);
        toast({
          title: "Incomplete",
          description: "Please answer both highlighted feedback questions before submitting.",
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

    // Get all previous data from sessionStorage
    const petsDataString = sessionStorage.getItem("petsData");
    const tiasDataString = sessionStorage.getItem("tiasData");
    const intentionDataString = sessionStorage.getItem("intentionData");
    const formalityDataString = sessionStorage.getItem("formalityData");
    if (!petsDataString || !tiasDataString || !intentionDataString || !formalityDataString) {
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
      const tiasData = JSON.parse(tiasDataString);
      const intentionData = JSON.parse(intentionDataString);
      const formalityData = JSON.parse(formalityDataString);

      // Combine PETS and TIAS questionnaire data
      const questionnaireData = {
        prolific_id: prolificId,
        call_id: callId,
        ...petsData,
        ...tiasData,
      };

      // Create feedback data object
      const feedbackPayload = {
        prolific_id: prolificId,
        call_id: callId,
        formality: formalityData.formality,
        voice_assistant_feedback: voiceAssistantFeedback || "Not provided",
        experiment_feedback: experimentFeedback || "Not provided",
      };

      // Submit via secure edge function
      const { data, error } = await supabase.functions.invoke("submit-questionnaire", {
        body: {
          sessionToken,
          questionnaireData,
          intentionData,
          feedbackData: feedbackPayload,
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

      // Clear stored data
      sessionStorage.removeItem("petsData");
      sessionStorage.removeItem("tiasData");
      sessionStorage.removeItem("formalityData");
      toast({
        title: "Success",
        description: "Your responses have been submitted successfully.",
      });

      // Advance to final step
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
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl text-center">Final Feedback</CardTitle>
          <CardDescription className="text-center">
            Participant ID: <span className="font-mono font-semibold text-foreground">{prolificId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Voice Assistant Experience */}
          <div className={`space-y-3 p-4 rounded-lg transition-colors ${showValidationErrors && !voiceAssistantFeedback.trim() ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
            <p className="text-base text-foreground mb-2 text-center">
              During this experiment, you had a conversation with Cali.
            </p>
            <label className={`text-lg font-medium block ${showValidationErrors && !voiceAssistantFeedback.trim() ? 'text-destructive' : 'text-foreground'}`}>
              Please describe your experience when talking to Cali.
              {showValidationErrors && !voiceAssistantFeedback.trim() && <span className="ml-2 text-xs font-normal">(Please answer this question)</span>}
            </label>
            <div className="bg-accent/50 rounded-lg p-4">
              <Textarea
                value={voiceAssistantFeedback}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) {
                    setVoiceAssistantFeedback(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  // Ensure spaces work
                  if (e.key === " ") {
                    e.stopPropagation();
                  }
                }}
                className={`min-h-[120px] resize-none bg-background ${showValidationErrors && !voiceAssistantFeedback.trim() ? 'border-destructive' : ''}`}
                placeholder="Share your thoughts about Cali..."
              />
              <div className="mt-2 text-sm text-muted-foreground text-right">
                {voiceAssistantFeedback.length} / {MAX_CHARS} characters
              </div>
            </div>
          </div>

          {/* Overall Experiment Feedback */}
          <div className={`space-y-3 p-4 rounded-lg transition-colors ${showValidationErrors && !experimentFeedback.trim() ? 'bg-destructive/10 border border-destructive/50' : ''}`}>
            <label className={`text-lg font-medium block ${showValidationErrors && !experimentFeedback.trim() ? 'text-destructive' : 'text-foreground'}`}>
              How was your overall experience doing the experiment? Any feedback, comments, or questions on the
              experiment?
              {showValidationErrors && !experimentFeedback.trim() && <span className="ml-2 text-xs font-normal">(Please answer this question)</span>}
            </label>
            <div className="bg-accent/50 rounded-lg p-4">
              <Textarea
                value={experimentFeedback}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) {
                    setExperimentFeedback(e.target.value);
                  }
                }}
                onKeyDown={(e) => {
                  // Ensure spaces work
                  if (e.key === " ") {
                    e.stopPropagation();
                  }
                }}
                placeholder="Share your thoughts about the experiment..."
                className={`min-h-[120px] resize-none bg-background ${showValidationErrors && !experimentFeedback.trim() ? 'border-destructive' : ''}`}
              />
              <div className="mt-2 text-sm text-muted-foreground text-right">
                {experimentFeedback.length} / {MAX_CHARS} characters
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={() =>
                navigate("/questionnaire/intention", {
                  state: {
                    callId,
                  },
                })
              }
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
