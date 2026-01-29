import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import type { Json } from '@/integrations/supabase/types';

export type ActivityAction = 
  | 'login'
  | 'download_experiment_responses'
  | 'download_demographics'
  | 'download_participant_calls'
  | 'download_formality_scores'
  | 'download_formality_per_turn';

interface LogActivityOptions {
  action: ActivityAction;
  details?: Json;
}

export const useActivityLog = () => {
  const { user } = useResearcherAuth();

  const logActivity = async ({ action, details = {} }: LogActivityOptions) => {
    if (!user?.id || !user?.email) {
      console.warn('Cannot log activity: no authenticated user');
      return;
    }

    try {
      const { error } = await supabase
        .from('researcher_activity_logs')
        .insert([{
          user_id: user.id,
          user_email: user.email,
          action,
          details,
        }]);

      if (error) {
        console.error('Failed to log activity:', error);
      }
    } catch (err) {
      console.error('Error logging activity:', err);
    }
  };

  return { logActivity };
};

// Standalone function for logging outside of React components (e.g., during login)
export const logActivityStandalone = async (
  userId: string,
  userEmail: string,
  action: ActivityAction,
  details: Json = {}
) => {
  try {
    const { error } = await supabase
      .from('researcher_activity_logs')
      .insert([{
        user_id: userId,
        user_email: userEmail,
        action,
        details,
      }]);

    if (error) {
      console.error('Failed to log activity:', error);
    }
  } catch (err) {
    console.error('Error logging activity:', err);
  }
};
