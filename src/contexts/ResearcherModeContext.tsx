import { createContext, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ResearcherModeContextType {
  isResearcherMode: boolean;
  activeResearcherId: string | null;
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

export const ResearcherModeProvider = ({ children }: { children: ReactNode }) => {
  const [isResearcherMode, setIsResearcherMode] = useState(false);
  const [activeResearcherId, setActiveResearcherId] = useState<string | null>(() => sessionStorage.getItem('prolificId'));
  const startInFlightRef = useRef(false);

  const startResearcherSession = useCallback(async (): Promise<boolean> => {
    if (startInFlightRef.current) return true;
    startInFlightRef.current = true;

    try {
      const { data, error } = await supabase.functions.invoke<CreateSessionResponse>(
        'create-researcher-session',
        { body: { source: 'researcher_mode' } },
      );

      if (error || !data?.prolificId || !data?.callId || !data?.sessionToken) {
        console.error('Failed to create researcher session:', error || data);
        setActiveResearcherId(null);
        sessionStorage.removeItem('prolificId');
        sessionStorage.removeItem('callId');
        sessionStorage.setItem('flowStep', '0');
        localStorage.removeItem('sessionToken');
        toast.error('Failed to start researcher session. Please try again.');
        return false;
      }

      const { prolificId, callId, sessionToken } = data;
      sessionStorage.setItem('prolificId', prolificId);
      sessionStorage.setItem('callId', callId);
      sessionStorage.setItem('flowStep', '0');
      localStorage.setItem('sessionToken', sessionToken);
      setActiveResearcherId(prolificId);
      return true;
    } catch (err) {
      console.error('Error starting researcher session:', err);
      setActiveResearcherId(null);
      sessionStorage.removeItem('prolificId');
      sessionStorage.removeItem('callId');
      sessionStorage.setItem('flowStep', '0');
      localStorage.removeItem('sessionToken');
      toast.error('Failed to start researcher session. Please try again.');
      return false;
    } finally {
      startInFlightRef.current = false;
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
        },
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
        void startResearcherSession().then((ok) => {
          if (!ok) setIsResearcherMode(false);
        });
      }
      return next;
    });
  };

  return (
    <ResearcherModeContext.Provider
      value={{
        isResearcherMode,
        activeResearcherId,
        toggleResearcherMode,
        startResearcherSession,
        markSessionComplete,
      }}
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
