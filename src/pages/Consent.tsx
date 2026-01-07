import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

const Consent = () => {
  const [consent, setConsent] = useState<string>('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (consent === 'agree') {
      const sessionToken = searchParams.get('sessionToken');
      const prolificId = searchParams.get('prolificId');
      navigate(`/demographics?sessionToken=${sessionToken}&prolificId=${prolificId}`);
    } else if (consent === 'disagree') {
      navigate('/not-eligible');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-4xl shadow-xl border-border">
        <CardHeader>
          <CardTitle className="text-3xl text-center">Welcome to this research study</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6 text-foreground">
              <p>
                You are being invited to take part in scientific research. By participating, you will help us improve how voice assistants interact with people. Before you decide whether to participate, please read the information below.
              </p>

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
                <h2 className="text-xl font-semibold mb-2">What will you be asked to do?</h2>
                <p className="mb-2">
                  You will answer demographic questions. Then, you will have a warm-up conversation to practice and test your mic and speakers, followed by a 7-8 minute conversation with a voice-based assistant. Afterwards, you will answer several short questionnaires. Total participation time is around 15 minutes.
                </p>
                <p>
                  You will be compensated for your time upon completion.
                </p>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-2">What data will be collected?</h2>
                <p className="mb-2">
                  We will collect age group, gender, ethnicity or racial background, language background, audio recordings of your interaction, and questionnaire responses.
                </p>
                <p>
                  Your data will be pseudonymized and stored on a secure server of Utrecht University. Data will be kept for 10 years. Deidentified data may be shared with other researchers after the study. Audio recordings will be stored long term unless deletion is requested before data analysis.
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
    </div>
  );
};

export default Consent;
