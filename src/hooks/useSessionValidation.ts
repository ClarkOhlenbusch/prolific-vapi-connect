import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// Cache validation result for 5 minutes
const CACHE_DURATION_MS = 5 * 60 * 1000;

interface CachedValidation {
  valid: boolean;
  prolificId: string;
  timestamp: number;
}

let validationCache: CachedValidation | null = null;

const SKIP_VALIDATION_PATHS = [
  '/',
  '/consent',
  '/no-consent',
  '/demographics',
  '/voiceassistant-familiarity',
  '/practice',
  '/early-access',
  '/debriefing',
  '/complete',
];

export const useSessionValidation = (
  pathname: string,
  isResearcherMode: boolean
) => {
  const navigate = useNavigate();
  const isValidating = useRef(false);

  useEffect(() => {
    const validateSession = async () => {
      // Skip validation if researcher mode is active
      if (isResearcherMode) return;

      // Skip validation on certain pages
      if (SKIP_VALIDATION_PATHS.includes(pathname)) return;

      const sessionToken = localStorage.getItem('sessionToken');

      if (!sessionToken) {
        navigate('/');
        return;
      }

      // Check cache first
      if (validationCache) {
        const cacheAge = Date.now() - validationCache.timestamp;
        if (cacheAge < CACHE_DURATION_MS && validationCache.valid) {
          sessionStorage.setItem('prolificId', validationCache.prolificId);
          return;
        }
      }

      // Prevent duplicate validation calls
      if (isValidating.current) return;
      isValidating.current = true;

      try {
        const { data, error } = await supabase.functions.invoke('validate-session', {
          body: { sessionToken },
        });

        if (error || !data?.valid) {
          // Invalid token - clear everything and redirect
          localStorage.removeItem('sessionToken');
          sessionStorage.removeItem('prolificId');
          validationCache = null;
          navigate('/');
          return;
        }

        // Cache the validation result
        validationCache = {
          valid: true,
          prolificId: data.participant.prolificId,
          timestamp: Date.now(),
        };

        // Store validated prolific ID
        sessionStorage.setItem('prolificId', data.participant.prolificId);
      } catch (error) {
        localStorage.removeItem('sessionToken');
        sessionStorage.removeItem('prolificId');
        validationCache = null;
        navigate('/');
      } finally {
        isValidating.current = false;
      }
    };

    validateSession();
  }, [pathname, navigate, isResearcherMode]);
};

// Clear cache on logout or session end
export const clearValidationCache = () => {
  validationCache = null;
};
