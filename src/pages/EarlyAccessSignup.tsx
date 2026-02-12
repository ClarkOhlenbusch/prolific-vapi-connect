import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ExperimentProgress } from '@/components/ExperimentProgress';
import { usePageTracking } from '@/hooks/usePageTracking';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';

const RESEARCHER_ROTATE_PENDING_KEY = 'researcher-session-rotate-pending';

const EarlyAccessSignup = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
  const [prolificId, setProlificId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [notifyWhenReady, setNotifyWhenReady] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const storedProlificId = sessionStorage.getItem('prolificId');
    const storedCallId = sessionStorage.getItem('callId') || (window.history.state?.usr as { callId?: string } | undefined)?.callId;
    const storedSessionToken = localStorage.getItem('sessionToken');
    setProlificId(storedProlificId);
    setCallId(storedCallId);
    setSessionToken(storedSessionToken);
    sessionStorage.setItem('flowStep', '5');
  }, []);

  usePageTracking({
    pageName: 'early-access',
    prolificId,
    callId: callId ?? undefined,
  });

  const handleSubmit = async () => {
    if (!prolificId || !callId || !sessionToken) {
      toast({
        title: 'Session missing',
        description: 'We could not find your session. Please return to the start of the study.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('submit-early-access', {
      body: {
        sessionToken,
        notifyWhenReady,
        notes: notes.trim() || null,
      },
    });

    setSubmitting(false);

    if (error) {
      toast({
        title: 'Error',
        description: 'Could not save your response. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    const maybeError = data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;
    if (typeof maybeError === 'string' && maybeError) {
      toast({
        title: 'Error',
        description: maybeError,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Thank you',
      description: notifyWhenReady ? "We'll notify you when Cali is ready." : 'Your response has been saved.',
    });

    if (isResearcherMode) {
      sessionStorage.setItem(RESEARCHER_ROTATE_PENDING_KEY, '1');
    }
    navigate('/debriefing');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <ExperimentProgress />
          <CardTitle className="text-2xl text-center">Get early access before everyone else</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 text-foreground">
            <p className="text-base">
              You just tested an early version of Cali, our voice AI assistant.
            </p>
            <p className="text-base">
              In the future, Cali will be available for you to interact with whenever you want.
            </p>
            <p className="text-base">
              As one of our early testers, you can choose to get notified on Prolific when Cali launches publicly.
            </p>

            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors">
                <Checkbox
                  checked={notifyWhenReady}
                  onCheckedChange={(checked) => setNotifyWhenReady(checked === true)}
                  className="mt-0.5"
                />
                <span className="text-sm font-medium">
                  I&apos;d like early access — notify me on Prolific when Cali launches.
                </span>
              </label>
              <p className="text-xs text-muted-foreground pl-1">
                Your payment is not affected by your choice.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="early-access-notes" className="text-sm font-medium">
                Anything you&apos;d like to add? <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                id="early-access-notes"
                placeholder="e.g. how you'd use it, what you'd hope for, or leave blank"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4 border-t border-border">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              size="lg"
              className="w-full"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EarlyAccessSignup;
