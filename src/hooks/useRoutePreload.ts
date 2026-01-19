import { useEffect } from 'react';

// Define the experiment flow order for preloading
const EXPERIMENT_FLOW: Record<string, string> = {
  '/': '/consent',
  '/consent': '/demographics',
  '/demographics': '/voiceassistant-familiarity',
  '/voiceassistant-familiarity': '/practice',
  '/practice': '/voice-conversation',
  '/voice-conversation': '/questionnaire/pets',
  '/questionnaire/pets': '/questionnaire/godspeed',
  '/questionnaire/godspeed': '/questionnaire/tias',
  '/questionnaire/tias': '/questionnaire/intention',
  '/questionnaire/intention': '/questionnaire/tipi',
  '/questionnaire/tipi': '/questionnaire/formality',
  '/questionnaire/formality': '/questionnaire/feedback',
  '/questionnaire/feedback': '/debriefing',
  '/debriefing': '/complete',
};

// Map routes to their lazy import functions
const ROUTE_IMPORTS: Record<string, () => Promise<unknown>> = {
  '/consent': () => import('@/pages/Consent'),
  '/demographics': () => import('@/pages/Demographics'),
  '/voiceassistant-familiarity': () => import('@/pages/VoiceAssistantFamiliarity'),
  '/practice': () => import('@/pages/PracticeConversation'),
  '/voice-conversation': () => import('@/pages/VoiceConversation'),
  '/questionnaire/pets': () => import('@/pages/Questionnaire'),
  '/questionnaire/godspeed': () => import('@/pages/GodspeedQuestionnaire'),
  '/questionnaire/tias': () => import('@/pages/TiasQuestionnaire'),
  '/questionnaire/intention': () => import('@/pages/IntentionQuestionnaire'),
  '/questionnaire/tipi': () => import('@/pages/TipiQuestionnaire'),
  '/questionnaire/formality': () => import('@/pages/FormalityQuestionnaire'),
  '/questionnaire/feedback': () => import('@/pages/FeedbackQuestionnaire'),
  '/debriefing': () => import('@/pages/Debriefing'),
  '/complete': () => import('@/pages/Complete'),
};

/**
 * Preloads the next page in the experiment flow for faster navigation
 */
export const useRoutePreload = (currentPath: string) => {
  useEffect(() => {
    const nextPath = EXPERIMENT_FLOW[currentPath];
    
    if (nextPath && ROUTE_IMPORTS[nextPath]) {
      // Delay preload slightly to not interfere with current page load
      const timer = setTimeout(() => {
        ROUTE_IMPORTS[nextPath]();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [currentPath]);
};

/**
 * Manually preload a specific route
 */
export const preloadRoute = (path: string) => {
  if (ROUTE_IMPORTS[path]) {
    ROUTE_IMPORTS[path]();
  }
};
