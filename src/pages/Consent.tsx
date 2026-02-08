import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePageTracking } from '@/hooks/usePageTracking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const Consent = () => {
  const [consent, setConsent] = useState<string>('');
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const prolificId = searchParams.get('prolificId') || sessionStorage.getItem('prolificId');
  
  usePageTracking({
    pageName: 'consent',
    prolificId,
    callId: null,
  });

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 20;
    setIsScrolledToBottom(isAtBottom);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (consent === 'agree') {
      const sessionToken = searchParams.get('sessionToken') || localStorage.getItem('sessionToken');
      const nextProlificId = searchParams.get('prolificId') || sessionStorage.getItem('prolificId');
      if (!sessionToken || !nextProlificId) {
        navigate('/');
        return;
      }
      navigate(`/demographics?sessionToken=${sessionToken}&prolificId=${nextProlificId}`);
    } else if (consent === 'disagree') {
      setShowConfirmDialog(true);
    }
  };

  const handleConfirmNoConsent = () => {
    setShowConfirmDialog(false);
    navigate('/no-consent');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-4xl shadow-xl border-border">
        <CardHeader>
          <CardTitle className="text-3xl text-center">Welcome to this research study</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <ScrollArea className="h-[60vh] pr-4" onScrollCapture={handleScroll}>
              <div className="space-y-6 text-foreground pb-8">
              <p>
                You are being invited to take part in scientific research. By participating, you will help us improve how voice assistants interact with people. Before you decide whether to participate, please read the information below.
              </p>

              <div>
                <h2 className="text-xl font-semibold mb-2">What will you be asked to do?</h2>
                <p className="mb-2">
                  You will answer demographic questions. Then, you will have a warm-up conversation to practice and test your mic and speakers, followed by a 7-8 minute conversation with a voice-based assistant. Afterwards, you will answer several short questionnaires. Total participation time is around 15 minutes.
                </p>
                <p>
                  You will be compensated for your time upon completion.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">What is the purpose of this study?</h2>
                <p className="mb-2">
                  This study looks at how people interact with a voice-based digital assistant during a short conversation. Our goal is to improve the design of voice assistants.
                </p>
                <p>
                  The voice assistant will ask you questions about your well-being, which may feel personal.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">Who is carrying out this study?</h2>
                <p className="mb-2">
                  This study is conducted by Olivier Vroom (o.f.e.vroom@students.uu.nl) as part of a Master's thesis.
                </p>
                <p className="font-medium mb-1">Supervisors:</p>
                <ul className="list-disc list-inside mb-2 ml-4">
                  <li>Smit Desai (sm.desai@northeastern.edu)</li>
                  <li>Chris Janssen (C.P.Janssen@uu.nl)</li>
                </ul>
                <p className="font-medium mb-1">Technical support:</p>
                <ul className="list-disc list-inside ml-4">
                  <li>Clark Ohlenbusch (clark.ohlenbusch001@umb.edu)</li>
                </ul>
                <p className="mt-2">
                  This study is partially funded by CalicoCare (www.calico.care).
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">What data will be collected?</h2>
                <p className="mb-2">
                  We will collect age group, gender, ethnicity or racial background, language background, audio recordings of your interaction, and questionnaire responses.
                </p>
                <p className="mb-2">
                  Your data will be pseudonymized and stored on a secure server of Utrecht University. Data will be kept for 10 years. Deidentified data may be shared with other researchers after the study. Audio recordings will be stored long term unless deletion is requested before data analysis.
                </p>
                <p>
                  We also collect session interaction analytics (internal replay logs) to understand navigation patterns and improve study usability. These logs may include interaction metadata such as clicks, scrolling, page flow, and cursor movement.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">Your rights</h2>
                <p className="mb-2">
                  Participation is voluntary. You can stop at any time by closing the study page. If you stop during the study, all data collected up to that point will be deleted.
                </p>
                <p className="mb-2">
                  At the end of the study, you will be given the option to withdraw and delete your data.
                </p>
                <p>
                  For more information, see the{' '}
                  <a 
                    href="https://www.uu.nl/en/organisation/practical-matters/privacy/privacy-statements-utrecht-university/privacy-statement-participants-scientific-research"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:text-primary/80"
                  >
                    privacy policy page
                  </a>.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">Ethical review</h2>
                <p className="mb-2">
                  This study has been allowed to proceed on the basis of an Ethics and Privacy QuickScan by the Research Institute of Information and Computing Sciences.
                </p>
                <p className="mb-1">For complaints about study conduct: ics-ethics@uu.nl</p>
                <p>For questions or complaints about personal data processing: privacy-beta@uu.nl</p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">Questions</h2>
                <p>
                  You may contact Olivier Vroom (o.f.e.vroom@students.uu.nl) or supervisor Chris Janssen (C.P.Janssen@uu.nl).
                </p>
              </div>
              </div>
            </ScrollArea>
            {!isScrolledToBottom && (
              <>
                <div className="absolute bottom-0 left-0 right-4 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                <p className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-muted-foreground pointer-events-none">↓ Scroll for more</p>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-3">Consent</h2>
              <p className="mb-3 text-foreground">Please choose one option:</p>
              <RadioGroup value={consent} onValueChange={setConsent} className="space-y-3">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="agree" id="agree" />
                  <Label htmlFor="agree" className="cursor-pointer">
                    I agree and consent to participate in this study.
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="disagree" id="disagree" />
                  <Label htmlFor="disagree" className="cursor-pointer">
                    I do not consent and withdraw from the experiment.
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={!consent}
            >
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you do not consent?</AlertDialogTitle>
            <AlertDialogDescription>
              By confirming, you will withdraw from the experiment and will not be able to participate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmNoConsent}>
              Yes, I do not consent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Consent;
