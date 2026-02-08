import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ResearcherModeContextType {
  isResearcherMode: boolean;
  toggleResearcherMode: () => void;
  startResearcherSession: () => Promise<void>;
}

const ResearcherModeContext = createContext<ResearcherModeContextType | undefined>(undefined);

const RESEARCHER_COUNTER_KEY = 'researcher-mode-counter';

const nextResearcherId = () => {
  const currentRaw = localStorage.getItem(RESEARCHER_COUNTER_KEY);
  const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
  const next = Number.isFinite(current) && current >= 0 ? current + 1 : 1;
  localStorage.setItem(RESEARCHER_COUNTER_KEY, String(next));
  return `researcher${next}`;
};

const buildDraftExperimentResponse = (prolificId: string, callId: string) => ({
  prolific_id: prolificId,
  call_id: callId,
  call_attempt_number: 1,
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
  e1_position: 1,
  e2_position: 2,
  e3_position: 3,
  e4_position: 4,
  e5_position: 5,
  e6_position: 6,
  u1_position: 7,
  u2_position: 8,
  u3_position: 9,
  u4_position: 10,
  pets_er: 50,
  pets_ut: 50,
  pets_total: 50,
  intention_1: 4,
  intention_2: 4,
  formality: 4,
  voice_assistant_feedback: 'Researcher mode draft session',
  communication_style_feedback: 'Researcher mode draft session',
  experiment_feedback: 'Researcher mode draft session',
});

export const ResearcherModeProvider = ({ children }: { children: ReactNode }) => {
  const [isResearcherMode, setIsResearcherMode] = useState(false);

  const startResearcherSession = useCallback(async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const prolificId = nextResearcherId();
      const sessionToken = crypto.randomUUID();
      const callId = `researcher-call-${crypto.randomUUID()}`;

      // Persist immediately so pages never fall back to RESEARCHER_MODE during async setup.
      sessionStorage.setItem('prolificId', prolificId);
      sessionStorage.setItem('callId', callId);
      sessionStorage.setItem('flowStep', '0');
      localStorage.setItem('sessionToken', sessionToken);

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error: callInsertError } = await supabase
        .from('participant_calls')
        .insert({
          prolific_id: prolificId,
          call_id: callId,
          session_token: sessionToken,
          expires_at: expiresAt,
          token_used: false,
        });

      if (callInsertError) {
        console.error('Failed to create researcher participant_calls row:', callInsertError);
        continue;
      }

      const { error: responseInsertError } = await supabase
        .from('experiment_responses')
        .insert(buildDraftExperimentResponse(prolificId, callId));

      if (responseInsertError) {
        console.error('Failed to create researcher draft experiment_responses row:', responseInsertError);
        continue;
      }
      return;
    }

    const fallbackId = nextResearcherId();
    const fallbackCallId = `researcher-call-${crypto.randomUUID()}`;
    sessionStorage.setItem('prolificId', fallbackId);
    sessionStorage.setItem('callId', fallbackCallId);
    sessionStorage.setItem('flowStep', '0');
    localStorage.setItem('sessionToken', crypto.randomUUID());
  }, []);

  const toggleResearcherMode = () => {
    setIsResearcherMode((prev) => {
      const next = !prev;
      if (next) {
        void startResearcherSession();
      }
      return next;
    });
  };

  return (
    <ResearcherModeContext.Provider value={{ isResearcherMode, toggleResearcherMode, startResearcherSession }}>
      {children}
    </ResearcherModeContext.Provider>
  );
};

export const useResearcherMode = () => {
  const context = useContext(ResearcherModeContext);
  if (context === undefined) {
    throw new Error('useResearcherMode must be used within a ResearcherModeProvider');
  }
  return context;
};
