import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ResearcherModeContextType {
  isResearcherMode: boolean;
  toggleResearcherMode: () => void;
  startResearcherSession: () => Promise<boolean>;
  markSessionComplete: () => Promise<boolean>;
}

const ResearcherModeContext = createContext<ResearcherModeContextType | undefined>(undefined);

interface CreateSessionResponse {
  prolificId: string;
  callId: string;
  sessionToken: string;
  expiresAt: string;
}

interface MarkCompleteResponse {
  success: boolean;
  alreadyCompleted: boolean;
}

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

  const startResearcherSession = useCallback(async (): Promise<boolean> => {
    try {
      // Call the edge function to get a unique researcher session
      const { data, error } = await supabase.functions.invoke<CreateSessionResponse>(
        'create-researcher-session',
        { body: { source: 'researcher_mode' } }
      );

      if (error || !data) {
        console.error('Failed to create researcher session:', error);
        toast.error('Failed to start researcher session. Please try again.');
        return false;
      }

      const { prolificId, callId, sessionToken } = data;

      // Persist to storage
      sessionStorage.setItem('prolificId', prolificId);
      sessionStorage.setItem('callId', callId);
      sessionStorage.setItem('flowStep', '0');
      localStorage.setItem('sessionToken', sessionToken);

      // Create draft experiment response row
      const { error: responseInsertError } = await supabase
        .from('experiment_responses')
        .insert(buildDraftExperimentResponse(prolificId, callId));

      if (responseInsertError) {
        console.error('Failed to create draft experiment_responses row:', responseInsertError);
        // Non-fatal - session still works
      }

      return true;
    } catch (err) {
      console.error('Error starting researcher session:', err);
      toast.error('Failed to start researcher session. Please try again.');
      return false;
    }
  }, []);

  const markSessionComplete = useCallback(async (): Promise<boolean> => {
    try {
      const sessionToken = localStorage.getItem('sessionToken');
      const prolificId = sessionStorage.getItem('prolificId');
      const callId = sessionStorage.getItem('callId');

      if (!sessionToken) {
        console.warn('No session token found for marking complete');
        return false;
      }

      const { data, error } = await supabase.functions.invoke<MarkCompleteResponse>(
        'mark-session-complete',
        {
          body: {
            sessionToken,
            prolificId: prolificId || undefined,
            callId: callId || undefined,
          },
        }
      );

      if (error) {
        console.error('Failed to mark session complete:', error);
        return false;
      }

      return data?.success ?? false;
    } catch (err) {
      console.error('Error marking session complete:', err);
      return false;
    }
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
    <ResearcherModeContext.Provider
      value={{ isResearcherMode, toggleResearcherMode, startResearcherSession, markSessionComplete }}
    >
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
