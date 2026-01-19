import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ResearcherModeProvider, useResearcherMode } from "@/contexts/ResearcherModeContext";
import { ResearcherAuthProvider } from "@/contexts/ResearcherAuthContext";
import { ResearcherModeToggle } from "@/components/ResearcherModeToggle";
import { ResearcherProtectedRoute } from "@/components/researcher/ResearcherProtectedRoute";
import PageSkeleton from "@/components/PageSkeleton";
import { useSessionValidation } from "@/hooks/useSessionValidation";
import { useRoutePreload } from "@/hooks/useRoutePreload";

// Lazy load route components for code splitting
const ProlificId = lazy(() => import("./pages/ProlificId"));
const Consent = lazy(() => import("./pages/Consent"));
const Demographics = lazy(() => import("./pages/Demographics"));
const VoiceAssistantFamiliarity = lazy(() => import("./pages/VoiceAssistantFamiliarity"));
const NoConsent = lazy(() => import("./pages/NoConsent"));
const PracticeConversation = lazy(() => import("./pages/PracticeConversation"));
const VoiceConversation = lazy(() => import("./pages/VoiceConversation"));
const Questionnaire = lazy(() => import("./pages/Questionnaire"));
const GodspeedQuestionnaire = lazy(() => import("./pages/GodspeedQuestionnaire"));
const TiasQuestionnaire = lazy(() => import("./pages/TiasQuestionnaire"));
const IntentionQuestionnaire = lazy(() => import("./pages/IntentionQuestionnaire"));
const TipiQuestionnaire = lazy(() => import("./pages/TipiQuestionnaire"));
const FormalityQuestionnaire = lazy(() => import("./pages/FormalityQuestionnaire"));
const FeedbackQuestionnaire = lazy(() => import("./pages/FeedbackQuestionnaire"));
const Debriefing = lazy(() => import("./pages/Debriefing"));
const Complete = lazy(() => import("./pages/Complete"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResearcherLogin = lazy(() => import("./pages/ResearcherLogin"));
const ResearcherDashboard = lazy(() => import("./pages/ResearcherDashboard"));
const ResearcherUserManagement = lazy(() => import("./pages/ResearcherUserManagement"));
const FormalityBreakdown = lazy(() => import("./pages/FormalityBreakdown"));
const StatisticalAnalysis = lazy(() => import("./pages/StatisticalAnalysis"));
const ResponseDetails = lazy(() => import("./pages/ResponseDetails"));

const queryClient = new QueryClient();

const SessionValidator = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { isResearcherMode } = useResearcherMode();

  // Use cached session validation
  useSessionValidation(location.pathname, isResearcherMode);
  
  // Preload the next page in the experiment flow
  useRoutePreload(location.pathname);

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
                <Route path="/questionnaire/godspeed" element={<SessionValidator><GodspeedQuestionnaire /></SessionValidator>} />
                <Route path="/questionnaire/tias" element={<SessionValidator><TiasQuestionnaire /></SessionValidator>} />
                <Route path="/questionnaire/intention" element={<SessionValidator><IntentionQuestionnaire /></SessionValidator>} />
                <Route path="/questionnaire/tipi" element={<SessionValidator><TipiQuestionnaire /></SessionValidator>} />
                <Route path="/questionnaire/formality" element={<SessionValidator><FormalityQuestionnaire /></SessionValidator>} />
                <Route path="/questionnaire/feedback" element={<SessionValidator><FeedbackQuestionnaire /></SessionValidator>} />
                <Route path="/debriefing" element={<Debriefing />} />
                <Route path="/complete" element={<Complete />} />
                <Route path="/researcher" element={<ResearcherLogin />} />
                <Route path="/researcher/dashboard" element={<ResearcherProtectedRoute><ResearcherDashboard /></ResearcherProtectedRoute>} />
                <Route path="/researcher/users" element={<ResearcherProtectedRoute><ResearcherUserManagement /></ResearcherProtectedRoute>} />
                <Route path="/researcher/formality/:id" element={<ResearcherProtectedRoute><FormalityBreakdown /></ResearcherProtectedRoute>} />
                <Route path="/researcher/statistics" element={<ResearcherProtectedRoute><StatisticalAnalysis /></ResearcherProtectedRoute>} />
                <Route path="/researcher/response/:id" element={<ResearcherProtectedRoute><ResponseDetails /></ResearcherProtectedRoute>} />
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
