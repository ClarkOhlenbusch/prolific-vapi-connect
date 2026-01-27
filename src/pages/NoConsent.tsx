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
            <Label htmlFor="feedback">
              Please share why you chose not to participate <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground italic">
              Your response is completely anonymous.
            </p>
            <Textarea
              id="feedback"
              placeholder="Your feedback helps us improve our research..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[100px]"
              required
            />
          </div>

          {feedback.trim() && feedback.trim().split(/\s+/).length < 10 && (
            <p className="text-sm text-destructive text-center">Please provide at least 10 words.</p>
          )}

          <div className="text-center">
            <Button onClick={handleSubmit} disabled={isSubmitting || feedback.trim().split(/\s+/).length < 10}>
              {isSubmitting ? 'Submitting...' : 'Submit and return to Prolific'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NoConsent;
