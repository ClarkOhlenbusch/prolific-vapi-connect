import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ResearcherModeProvider, useResearcherMode } from "@/contexts/ResearcherModeContext";
import { ResearcherModeToggle } from "@/components/ResearcherModeToggle";
import { ScreenSizeWarning } from "@/components/ScreenSizeWarning";

// Lazy load route components for code splitting
const ProlificId = lazy(() => import("./pages/ProlificId"));
const Consent = lazy(() => import("./pages/Consent"));
const Demographics = lazy(() => import("./pages/Demographics"));
const VoiceAssistantFamiliarity = lazy(() => import("./pages/VoiceAssistantFamiliarity"));
const NotEligible = lazy(() => import("./pages/NotEligible"));
const PracticeConversation = lazy(() => import("./pages/PracticeConversation"));
const VoiceConversation = lazy(() => import("./pages/VoiceConversation"));
const Questionnaire = lazy(() => import("./pages/Questionnaire"));
const TiasQuestionnaire = lazy(() => import("./pages/TiasQuestionnaire"));
const FormalityQuestionnaire = lazy(() => import("./pages/FormalityQuestionnaire"));
const FeedbackQuestionnaire = lazy(() => import("./pages/FeedbackQuestionnaire"));
const Debriefing = lazy(() => import("./pages/Debriefing"));
const Complete = lazy(() => import("./pages/Complete"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const SessionValidator = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isResearcherMode } = useResearcherMode();

  useEffect(() => {
    const validateSession = async () => {
      // Skip validation if researcher mode is active
      if (isResearcherMode) return;
      
      // Skip validation on landing page, consent, demographics, voice assistant familiarity, practice page, debriefing, and complete page
      if (location.pathname === '/' || location.pathname === '/consent' || location.pathname === '/demographics' || location.pathname === '/voiceassistant-familiarity' || location.pathname === '/practice' || location.pathname === '/debriefing' || location.pathname === '/complete') return;

      const sessionToken = localStorage.getItem('sessionToken');
      
      if (!sessionToken) {
        navigate('/');
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('validate-session', {
          body: { sessionToken }
        });

      if (error || !data?.valid) {
        // Invalid token - clear everything and redirect
        localStorage.removeItem('sessionToken');
        sessionStorage.removeItem('prolificId');
        navigate('/');
        return;
      }

      // Store validated prolific ID
      sessionStorage.setItem('prolificId', data.participant.prolificId);
    } catch (error) {
      localStorage.removeItem('sessionToken');
      sessionStorage.removeItem('prolificId');
      navigate('/');
    }
  };

    validateSession();
  }, [location.pathname, navigate, isResearcherMode]);

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ResearcherModeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ScreenSizeWarning />
        <BrowserRouter>
          <ResearcherModeToggle />
          <Suspense fallback={<div>Loading...</div>}>
            <Routes>
              <Route path="/" element={<ProlificId />} />
              <Route path="/consent" element={<Consent />} />
              <Route path="/not-eligible" element={<NotEligible />} />
              <Route
                path="/demographics"
                element={
                  <SessionValidator>
                    <Demographics />
                  </SessionValidator>
                }
              />
              <Route
                path="/voiceassistant-familiarity"
                element={
                  <SessionValidator>
                    <VoiceAssistantFamiliarity />
                  </SessionValidator>
                }
              />
              <Route path="/practice" element={<PracticeConversation />} />
              <Route path="/voice-conversation" element={<VoiceConversation />} />
              <Route path="/questionnaire/pets" element={<Questionnaire />} />
              <Route path="/questionnaire/tias" element={<TiasQuestionnaire />} />
              <Route path="/questionnaire/formality" element={<FormalityQuestionnaire />} />
              <Route path="/questionnaire/feedback" element={<FeedbackQuestionnaire />} />
              <Route path="/debriefing" element={<Debriefing />} />
              <Route path="/complete" element={<Complete />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ResearcherModeProvider>
  </QueryClientProvider>
);

export default App;
