import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';

const Debriefing = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isResearcherMode } = useResearcherMode();
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    const currentStep = sessionStorage.getItem('flowStep');
    const storedId = sessionStorage.getItem('prolificId');
    
    // Check if researcher mode is active and data is missing
    if (isResearcherMode && (!storedId || currentStep !== '5')) {
      // Use default values for researcher mode
      if (!storedId) {
        sessionStorage.setItem('prolificId', 'RESEARCHER_MODE');
      }
      sessionStorage.setItem('flowStep', '5');
      return;
    }
    
    // Enforce flow: must be at step 5 (only for non-researcher mode)
    if (!isResearcherMode && currentStep !== '5') {
      navigate('/');
      return;
    }

    if (!isResearcherMode && !storedId) {
      navigate('/');
    }
  }, [navigate, isResearcherMode]);

  const handleWithdraw = async () => {
    const prolificId = sessionStorage.getItem('prolificId');
    const sessionToken = localStorage.getItem('sessionToken');
    const callId = localStorage.getItem('callId');

    if (!prolificId || !sessionToken || !callId) {
      toast({
        title: "Error",
        description: "Missing required data for withdrawal.",
        variant: "destructive"
      });
      return;
    }

    setIsWithdrawing(true);

    try {
      const { error } = await supabase
        .from('data_withdrawal_requests')
        .insert({
          prolific_id: prolificId,
          session_token: sessionToken,
          call_id: callId
        });

      if (error) {
        console.error('Error submitting withdrawal request:', error);
        toast({
          title: "Error",
          description: "Failed to submit withdrawal request. Please contact the researcher.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Withdrawal Request Submitted",
        description: "Your data withdrawal request has been recorded.",
      });

      // Redirect to Prolific after a brief delay
      setTimeout(() => {
        window.location.href = 'https://app.prolific.com/submissions/complete?cc=CWJF4IWH';
      }, 2000);

    } catch (err) {
      console.error('Unexpected error submitting withdrawal:', err);
      toast({
        title: "Error",
        description: "An error occurred. Please contact the researcher.",
        variant: "destructive"
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleContinue = () => {
    window.location.href = 'https://app.prolific.com/submissions/complete?cc=CWJF4IWH';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-3xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-3xl text-center">Debriefing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-6 text-foreground">
              <p className="text-lg">
                Thank you for contributing to this research.
                The study is now complete, and the information below explains the full purpose of the experiment.
              </p>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold">What this study was really about</h2>
                <p>
                  This study examined how people respond to two different conversational styles used by a voice based assistant. 
                  Some participants interacted with a more formal assistant, and others interacted with a more informal one. 
                  We studied how these styles influenced trust and perceived empathy during the short interaction.
                </p>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold">What data we collected</h2>
                <p>We collected:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Demographical information</li>
                  <li>Audio recordings of your interaction</li>
                  <li>Questionnaire responses</li>
                </ul>
                <p className="mt-3">
                  All data is stored securely and handled under GDPR and Utrecht University policy.
                </p>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Your right to withdraw your data</h2>
                <p>
                  Now that you know the full purpose of the study, you may choose to withdraw all your data.
                  If you decide to withdraw, all data associated with you will be permanently deleted, including audio recordings, 
                  transcripts, and questionnaire responses.
                </p>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Questions or concerns</h2>
                <div className="space-y-2">
                  <p><strong>Researcher:</strong></p>
                  <ul className="list-disc list-inside ml-4">
                    <li>Olivier Vroom, o.f.e.vroom@students.uu.nl</li>
                  </ul>
                  
                  <p className="mt-3"><strong>Supervisors:</strong></p>
                  <ul className="list-disc list-inside ml-4">
                    <li>Smit Desai, sm.desai@northeastern.edu</li>
                    <li>Chris Janssen, C.P.Janssen@uu.nl</li>
                  </ul>
                  
                  <p className="mt-3"><strong>Ethics and data protection:</strong></p>
                  <ul className="list-disc list-inside ml-4">
                    <li>For questions or complaints about the conduct of the study: ics-ethics@uu.nl</li>
                    <li>For questions or complaints about personal data handling: privacy-beta@uu.nl</li>
                  </ul>
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="flex flex-col gap-4 pt-4 border-t border-border">
            <Button
              onClick={handleWithdraw}
              disabled={isWithdrawing}
              variant="destructive"
              size="lg"
              className="w-full"
            >
              {isWithdrawing ? 'Submitting Request...' : 'Withdraw my data'}
            </Button>
            
            <Button
              onClick={handleContinue}
              disabled={isWithdrawing}
              size="lg"
              className="w-full"
            >
              Continue to Prolific
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Debriefing;