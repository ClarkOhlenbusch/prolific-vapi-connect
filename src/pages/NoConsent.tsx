import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const NoConsent = () => {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('no_consent_feedback')
        .insert({ feedback: feedback || null });

      if (error) {
        console.error('Error saving feedback:', error);
      }
    } catch (err) {
      console.error('Error:', err);
    }
    
    // Redirect regardless of save success
    window.location.href = 'https://www.prolific.com';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl text-center">Thank You for Your Time</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-center text-foreground">
            We respect your decision not to participate in this study. Thank you for considering it.
          </p>

          <div className="space-y-2">
            <Label htmlFor="feedback" className="text-muted-foreground">
              (Optional) Would you like to share why you chose not to participate?
            </Label>
            <Textarea
              id="feedback"
              placeholder="Your feedback helps us improve our research..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="text-center">
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit and return to Prolific'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NoConsent;
