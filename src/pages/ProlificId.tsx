import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const ProlificId = () => {
  const [prolificId, setProlificId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prolificId.trim()) {
      toast({
        title: "Error",
        description: "Please enter your Prolific ID",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    // Generate secure session token
    const sessionToken = crypto.randomUUID();
    
    // Store both Prolific ID and session token
    sessionStorage.setItem('prolificId', prolificId.trim());
    localStorage.setItem('sessionToken', sessionToken);
    
    // Navigate to the voice conversation page
    setTimeout(() => {
      navigate('/conversation');
    }, 300);
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
