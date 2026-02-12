import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UsePageTrackingOptions {
  pageName: string;
  prolificId: string | null;
  callId: string | null;
}

export const usePageTracking = ({ pageName, prolificId, callId }: UsePageTrackingOptions) => {
  const startTimeRef = useRef<number>(Date.now());

  // Keep experiment_responses draft lifecycle metadata in sync with current page progress.
  useEffect(() => {
    if (!prolificId) return;

    const sessionToken = localStorage.getItem("sessionToken");
    if (!sessionToken) return;

    supabase.functions
      .invoke("upsert-experiment-draft", {
        body: {
          sessionToken,
          prolificId,
          callId: callId || "",
          lastStep: pageName,
        },
      })
      .catch((error) => {
        console.error("Error updating experiment response draft step:", error);
      });
  }, [pageName, prolificId, callId]);

  // Track time on page when user leaves
  useEffect(() => {
    startTimeRef.current = Date.now();
    
    const trackPageLeave = async () => {
      if (!prolificId) return;
      
      const timeOnPage = (Date.now() - startTimeRef.current) / 1000;
      
      try {
        await supabase.from("navigation_events" as any).insert({
          prolific_id: prolificId,
          call_id: callId || null,
          page_name: pageName,
          event_type: "page_leave",
          time_on_page_seconds: timeOnPage,
          metadata: {},
        });
      } catch (error) {
        console.error("Error tracking page leave:", error);
      }
    };

    // Track on unmount
    return () => {
      trackPageLeave();
    };
  }, [pageName, prolificId, callId]);

  const trackBackButtonClick = useCallback(async (metadata: Record<string, unknown> = {}) => {
    if (!prolificId) return;
    
    const timeOnPage = (Date.now() - startTimeRef.current) / 1000;
    
    try {
      await supabase.from("navigation_events" as any).insert({
        prolific_id: prolificId,
        call_id: callId || null,
        page_name: pageName,
        event_type: "back_button_click",
        time_on_page_seconds: timeOnPage,
        metadata,
      });
    } catch (error) {
      console.error("Error tracking back button click:", error);
    }
  }, [pageName, prolificId, callId]);

  return { trackBackButtonClick };
};
