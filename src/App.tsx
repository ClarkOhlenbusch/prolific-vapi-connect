import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ProlificId from "./pages/ProlificId";
import VoiceConversation from "./pages/VoiceConversation";
import Questionnaire from "./pages/Questionnaire";
import Complete from "./pages/Complete";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const SessionValidator = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const validateSession = async () => {
      // Skip validation on landing page
      if (location.pathname === '/') return;

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
        console.error('Session validation error:', error);
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
          <Routes>
            <Route path="/" element={<ProlificId />} />
            <Route path="/conversation" element={<VoiceConversation />} />
            <Route path="/questionnaire" element={<Questionnaire />} />
            <Route path="/complete" element={<Complete />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionValidator>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
