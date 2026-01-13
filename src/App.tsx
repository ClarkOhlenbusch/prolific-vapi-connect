import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ResearcherModeProvider, useResearcherMode } from "@/contexts/ResearcherModeContext";
import { ResearcherAuthProvider } from "@/contexts/ResearcherAuthContext";
import { ResearcherModeToggle } from "@/components/ResearcherModeToggle";
import { ResearcherProtectedRoute } from "@/components/researcher/ResearcherProtectedRoute";
import PageSkeleton from "@/components/PageSkeleton";

// Lazy load route components for code splitting
const ProlificId = lazy(() => import("./pages/ProlificId"));
const Consent = lazy(() => import("./pages/Consent"));
const Demographics = lazy(() => import("./pages/Demographics"));
const VoiceAssistantFamiliarity = lazy(() => import("./pages/VoiceAssistantFamiliarity"));
const NoConsent = lazy(() => import("./pages/NoConsent"));
const PracticeConversation = lazy(() => import("./pages/PracticeConversation"));
const VoiceConversation = lazy(() => import("./pages/VoiceConversation"));
const Questionnaire = lazy(() => import("./pages/Questionnaire"));
const TiasQuestionnaire = lazy(() => import("./pages/TiasQuestionnaire"));
const IntentionQuestionnaire = lazy(() => import("./pages/IntentionQuestionnaire"));
const FormalityQuestionnaire = lazy(() => import("./pages/FormalityQuestionnaire"));
const FeedbackQuestionnaire = lazy(() => import("./pages/FeedbackQuestionnaire"));
const Debriefing = lazy(() => import("./pages/Debriefing"));
const Complete = lazy(() => import("./pages/Complete"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResearcherLogin = lazy(() => import("./pages/ResearcherLogin"));
const ResearcherDashboard = lazy(() => import("./pages/ResearcherDashboard"));
const ResearcherUserManagement = lazy(() => import("./pages/ResearcherUserManagement"));

const queryClient = new QueryClient();

const SessionValidator = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isResearcherMode } = useResearcherMode();

  useEffect(() => {
    const validateSession = async () => {
      // Skip validation if researcher mode is active
      if (isResearcherMode) return;
      
      // Skip validation on landing page, consent, not-eligible, demographics, voice assistant familiarity, practice page, debriefing, and complete page
      if (
        location.pathname === '/' || 
        location.pathname === '/consent' || 
        location.pathname === '/no-consent' ||
        location.pathname === '/demographics' || 
        location.pathname === '/voiceassistant-familiarity' || 
        location.pathname === '/practice' || 
        location.pathname === '/debriefing' || 
        location.pathname === '/complete'
      ) return;

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
      <ResearcherAuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <ResearcherModeToggle />
            <Suspense fallback={<PageSkeleton />}>
              <Routes>
                <Route path="/" element={<ProlificId />} />
                <Route path="/consent" element={<Consent />} />
                <Route path="/no-consent" element={<NoConsent />} />
                <Route path="/demographics" element={<SessionValidator><Demographics /></SessionValidator>} />
                <Route path="/voiceassistant-familiarity" element={<SessionValidator><VoiceAssistantFamiliarity /></SessionValidator>} />
                <Route path="/practice" element={<SessionValidator><PracticeConversation /></SessionValidator>} />
                <Route path="/voice-conversation" element={<SessionValidator><VoiceConversation /></SessionValidator>} />
                <Route path="/questionnaire/pets" element={<SessionValidator><Questionnaire /></SessionValidator>} />
                <Route path="/questionnaire/tias" element={<SessionValidator><TiasQuestionnaire /></SessionValidator>} />
                <Route path="/questionnaire/intention" element={<SessionValidator><IntentionQuestionnaire /></SessionValidator>} />
                <Route path="/questionnaire/formality" element={<SessionValidator><FormalityQuestionnaire /></SessionValidator>} />
                <Route path="/questionnaire/feedback" element={<SessionValidator><FeedbackQuestionnaire /></SessionValidator>} />
                <Route path="/debriefing" element={<Debriefing />} />
                <Route path="/complete" element={<Complete />} />
                <Route path="/researcher" element={<ResearcherLogin />} />
                <Route path="/researcher/dashboard" element={<ResearcherProtectedRoute><ResearcherDashboard /></ResearcherProtectedRoute>} />
                <Route path="/researcher/users" element={<ResearcherProtectedRoute><ResearcherUserManagement /></ResearcherProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ResearcherAuthProvider>
    </ResearcherModeProvider>
  </QueryClientProvider>
);

export default App;
