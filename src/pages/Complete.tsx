import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const Complete = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Enforce flow: must be at step 5 (final)
    const currentStep = sessionStorage.getItem('flowStep');
    if (currentStep !== '5') {
      navigate('/');
      return;
    }

    const storedId = sessionStorage.getItem('prolificId');
    if (!storedId) {
      navigate('/');
    }
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <div className="w-16 h-16 mx-auto bg-primary rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-primary-foreground" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <CardTitle className="text-2xl text-center">Study Complete!</CardTitle>
          <CardDescription className="text-center">
            Thank you for your participation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-accent/50 rounded-lg p-6 space-y-4 text-center">
            <p className="text-foreground font-semibold">Please use one of the options below to complete your submission:</p>
            
            <Button
              onClick={() => window.location.href = 'https://app.prolific.com/submissions/complete?cc=CWJF4IWH'}
              className="w-full"
              size="lg"
            >
              Click here to complete on Prolific
            </Button>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-2">Or copy and paste this completion code:</p>
              <div className="bg-background rounded-md p-3 border border-border">
                <code className="text-lg font-mono font-bold text-primary">CWJF4IWH</code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Complete;
