import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';

// Validation schema for Prolific ID
const prolificIdSchema = z.string()
  .trim()
  .min(1, 'Prolific ID is required')
  .max(100, 'Prolific ID is too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Prolific ID can only contain letters, numbers, hyphens, and underscores');

const ProlificId = () => {
  const [prolificId, setProlificId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Initialize flow at step 0
    sessionStorage.setItem('flowStep', '0');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate Prolific ID format
    const validationResult = prolificIdSchema.safeParse(prolificId);
    
    if (!validationResult.success) {
      toast({
        title: "Invalid Prolific ID",
        description: validationResult.error.errors[0].message,
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    const validatedId = validationResult.data;
    
    try {
      // Generate secure session token
      const sessionToken = crypto.randomUUID();
      
      // Insert session token into database immediately
      const { error } = await supabase
        .from('participant_calls')
        .insert({
          prolific_id: validatedId,
          call_id: '',
          session_token: sessionToken,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });

      if (error) {
        // Check if it's a duplicate prolific_id error
        if (error.code === '23505' && error.message.includes('unique_prolific_call')) {
          toast({
            title: "Duplicate Entry",
            description: "This Prolific ID has already been used. Each participant can only join once.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Error",
            description: "Failed to create session. Please try again.",
            variant: "destructive"
          });
        }
        setIsLoading(false);
        return;
      }

      // Store both Prolific ID and session token
      sessionStorage.setItem('prolificId', validatedId);
      localStorage.setItem('sessionToken', sessionToken);
      
      // Advance to next step
      sessionStorage.setItem('flowStep', '1');
      
      // Navigate to practice conversation page
      navigate(`/practice?sessionToken=${sessionToken}&prolificId=${validatedId}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-md shadow-xl border-border">
        <CardHeader className="space-y-3">
          <div className="w-16 h-16 mx-auto bg-primary rounded-full flex items-center justify-center">
            <svg 
              className="w-8 h-8 text-primary-foreground" 
              fill="none" 
              strokeWidth="2" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <CardTitle className="text-2xl text-center">Research Study</CardTitle>
          <CardDescription className="text-center">
            Welcome! Please enter your Prolific ID to begin the voice conversation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="prolific-id" className="text-foreground">
                Prolific ID
              </Label>
              <Input
                id="prolific-id"
                type="text"
                placeholder="Enter your Prolific ID"
                value={prolificId}
                onChange={(e) => setProlificId(e.target.value)}
                className="border-input focus:ring-primary"
                disabled={isLoading}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This ID helps us track your participation in the study.
              </p>
            </div>
            
            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : 'Continue to Conversation'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProlificId;
