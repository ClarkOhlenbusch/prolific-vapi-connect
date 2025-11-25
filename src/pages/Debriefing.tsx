import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
const Debriefing = () => {
  const navigate = useNavigate();
  const { isResearcherMode } = useResearcherMode();
  useEffect(() => {
    // Load IDs from sessionStorage, no validation/redirects
    const storedId = sessionStorage.getItem('prolificId');
    
    if (!storedId) {
      sessionStorage.setItem('prolificId', 'RESEARCHER_MODE');
    }
    sessionStorage.setItem('flowStep', '5');
  }, []);
  const handleContinue = () => {
    navigate('/complete');
  };
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
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
                  Now that you know the full purpose of the study, you may choose to withdraw all your data by sending an email to o.f.e.vroom@students.uu.nl. If you decide to withdraw, all data associated with you will be permanently deleted, including audio recordings, transcripts, and questionnaire responses.                                                     
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

              <div className="space-y-3">
                <h2 className="text-xl font-semibold">Support resources</h2>
                <p>
                  If you are experiencing any form of distress or emotional difficulty, please know that support is available. You can visit the CDC's mental health resources at:{' '}
                  <a href="https://www.cdc.gov/mental-health/caring/index.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                    https://www.cdc.gov/mental-health/caring/index.html
                  </a>.
                </p>
              </div>
            </div>
          </ScrollArea>

          <div className="flex flex-col gap-4 pt-4 border-t border-border">
            <Button onClick={handleContinue} size="lg" className="w-full bg-green-600 hover:bg-green-700 text-white">
              Finish Study
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>;
};
export default Debriefing;