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

const RESEARCHER_SESSION_RESET_KEYS = [
  'petsData',
  'godspeedData',
  'tiasData',
  'tipiData',
  'intentionData',
  'formalityData',
  'assistantType',
  'assistantId',
  'isRestarting',
] as const;

const RESEARCHER_SESSION_STATE_KEY = 'researcher-session-state';

const isResearcherSessionState = (value: unknown): value is ResearcherSessionState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    prolificId?: unknown;
    callId?: unknown;
    sessionToken?: unknown;
  };
  return (
    typeof candidate.prolificId === 'string' &&
    candidate.prolificId.length > 0 &&
    typeof candidate.callId === 'string' &&
    candidate.callId.length > 0 &&
    typeof candidate.sessionToken === 'string' &&
    candidate.sessionToken.length > 0
  );
};

interface ResearcherSessionState {
  prolificId: string;
  callId: string;
  sessionToken: string;
}

const getStoredResearcherSessionState = (): ResearcherSessionState | null => {
  try {
    const raw = localStorage.getItem(RESEARCHER_SESSION_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isResearcherSessionState(parsed) ? parsed : null;
  } catch {
    localStorage.removeItem(RESEARCHER_SESSION_STATE_KEY);
    return null;
  }
};

const persistResearcherSessionState = (state: ResearcherSessionState) => {
  localStorage.setItem(
    RESEARCHER_SESSION_STATE_KEY,
    JSON.stringify({
      prolificId: state.prolificId,
      callId: state.callId,
      sessionToken: state.sessionToken,
    }),
  );
};

const clearResearcherSessionState = () => {
  localStorage.removeItem(RESEARCHER_SESSION_STATE_KEY);
  localStorage.removeItem('sessionToken');
};

const applyResearcherSessionState = (state: ResearcherSessionState) => {
  RESEARCHER_SESSION_RESET_KEYS.forEach((key) => sessionStorage.removeItem(key));
  sessionStorage.setItem('prolificId', state.prolificId);
  sessionStorage.setItem('callId', state.callId);
  sessionStorage.setItem('flowStep', '0');
  localStorage.setItem('sessionToken', state.sessionToken);
  persistResearcherSessionState(state);
};

export const ResearcherModeProvider = ({ children }: { children: ReactNode }) => {
  const [isResearcherMode, setIsResearcherMode] = useState(false);
  const [activeResearcherId, setActiveResearcherId] = useState<string | null>(() => {
    const storedSession = getStoredResearcherSessionState();
    return storedSession?.prolificId || sessionStorage.getItem('prolificId');
  });
  const startInFlightRef = useRef(false);

  const startResearcherSession = useCallback(async (): Promise<boolean> => {
    if (startInFlightRef.current) return true;
    startInFlightRef.current = true;

    try {
      const storedSession = getStoredResearcherSessionState();

      const { data, error } = await supabase.functions.invoke<CreateSessionResponse>(
        'create-researcher-session',
        {
          body: {
            source: 'researcher_mode',
            ...(storedSession ? { existingSessionToken: storedSession.sessionToken } : {}),
          },
        },
      );

      if (error || !data?.prolificId || !data?.callId || !data?.sessionToken) {
        console.error('Failed to create researcher session:', error || data);
        clearResearcherSessionState();
        setActiveResearcherId(null);
        RESEARCHER_SESSION_RESET_KEYS.forEach((key) => sessionStorage.removeItem(key));
        sessionStorage.removeItem('prolificId');
        sessionStorage.removeItem('callId');
        sessionStorage.setItem('flowStep', '0');
        toast.error('Failed to start researcher session. Please try again.');
        return false;
      }

      const { prolificId, callId, sessionToken } = data;
      applyResearcherSessionState({ prolificId, callId, sessionToken });
      setActiveResearcherId(prolificId);
      return true;
    } catch (err) {
      console.error('Error starting researcher session:', err);
      clearResearcherSessionState();
      setActiveResearcherId(null);
      RESEARCHER_SESSION_RESET_KEYS.forEach((key) => sessionStorage.removeItem(key));
      sessionStorage.removeItem('prolificId');
      sessionStorage.removeItem('callId');
      sessionStorage.setItem('flowStep', '0');
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

      const succeeded = data?.success ?? false;
      if (succeeded) {
        setActiveResearcherId(null);
        clearResearcherSessionState();
      }
      return succeeded;
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
