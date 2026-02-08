import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
import { ExperimentProgress } from '@/components/ExperimentProgress';
import { usePageTracking } from '@/hooks/usePageTracking';

const VoiceAssistantFamiliarity = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { isResearcherMode } = useResearcherMode();
  
  const sessionToken = searchParams.get('sessionToken')
    || localStorage.getItem('sessionToken')
    || (isResearcherMode ? '00000000-0000-0000-0000-000000000000' : null);
  const prolificId = searchParams.get('prolificId')
    || sessionStorage.getItem('prolificId')
    || (isResearcherMode ? 'RESEARCHER_MODE' : null);

  usePageTracking({
    pageName: 'voice-assistant-familiarity',
    prolificId,
    callId: null,
  });

  const [formData, setFormData] = useState({
    familiarity: '',
    usage_frequency: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Skip validation if researcher mode is enabled
    if (!isResearcherMode) {
      if (!formData.familiarity || !formData.usage_frequency) {
        toast({
          title: "Missing Information",
          description: "Please answer all required questions.",
          variant: "destructive"
        });
        return;
      }
    }

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('demographics')
        .update({
          voice_assistant_familiarity: formData.familiarity ? parseInt(formData.familiarity) : null,
          voice_assistant_usage_frequency: formData.usage_frequency ? parseInt(formData.usage_frequency) : null
        })
        .eq('session_token', sessionToken)
        .eq('prolific_id', prolificId);

      if (error) throw error;

      navigate(`/practice?sessionToken=${sessionToken}&prolificId=${prolificId}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save responses. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const familiarityOptions = [
    { value: '1', label: 'Not familiar at all' },
    { value: '2', label: 'Somewhat familiar' },
    { value: '3', label: 'Moderately familiar' },
    { value: '4', label: 'Very familiar' },
    { value: '5', label: 'Completely familiar' }
  ];

  const usageOptions = [
    { value: '1', label: 'Never' },
    { value: '2', label: 'More than once a year' },
    { value: '3', label: 'More than once a month' },
    { value: '4', label: 'More than once a week' },
    { value: '5', label: 'More than once a day' }
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <ExperimentProgress />
          <CardTitle className="text-2xl text-center">Voice Assistant Familiarity</CardTitle>
          <CardDescription className="text-center">
            Please answer the following questions about your experience with voice assistants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Familiarity Question */}
            <div className="space-y-4">
              <Label className="text-base font-medium">
                How familiar are you with voice assistants (e.g., Alexa, Siri)?
              </Label>
              <RadioGroup
                value={formData.familiarity}
                onValueChange={(value) => setFormData({ ...formData, familiarity: value })}
                className="space-y-3"
              >
                {familiarityOptions.map((option) => (
                  <div key={option.value} className="flex items-center space-x-3">
                    <RadioGroupItem value={option.value} id={`familiarity-${option.value}`} />
                    <Label 
                      htmlFor={`familiarity-${option.value}`} 
                      className="font-normal cursor-pointer"
                    >
                      {option.value}. {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Usage Frequency Question */}
            <div className="space-y-4">
              <Label className="text-base font-medium">
                How often do you use voice assistants (e.g., Alexa, Siri)?
              </Label>
              <RadioGroup
                value={formData.usage_frequency}
                onValueChange={(value) => setFormData({ ...formData, usage_frequency: value })}
                className="space-y-3"
              >
                {usageOptions.map((option) => (
                  <div key={option.value} className="flex items-center space-x-3">
                    <RadioGroupItem value={option.value} id={`usage-${option.value}`} />
                    <Label 
                      htmlFor={`usage-${option.value}`} 
                      className="font-normal cursor-pointer"
                    >
                      {option.value}. {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Submitting..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default VoiceAssistantFamiliarity;
