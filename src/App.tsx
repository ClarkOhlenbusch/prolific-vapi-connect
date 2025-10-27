import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// Lazy load route components for code splitting
const ProlificId = lazy(() => import("./pages/ProlificId"));
const VoiceConversation = lazy(() => import("./pages/VoiceConversation"));
const Questionnaire = lazy(() => import("./pages/Questionnaire"));
const TiasQuestionnaire = lazy(() => import("./pages/TiasQuestionnaire"));
const Complete = lazy(() => import("./pages/Complete"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const SessionValidator = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const validateSession = async () => {
      // Skip validation on landing page and complete page
      if (location.pathname === '/' || location.pathname === '/complete') return;

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
  }, [location.pathname, navigate]);

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionValidator>
          <main>
            <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
              <Routes>
                <Route path="/" element={<ProlificId />} />
                <Route path="/conversation" element={<VoiceConversation />} />
                <Route path="/questionnaire" element={<Questionnaire />} />
                <Route path="/questionnaire/pets" element={<Questionnaire />} />
                <Route path="/questionnaire/tias" element={<TiasQuestionnaire />} />
                <Route path="/complete" element={<Complete />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </SessionValidator>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
