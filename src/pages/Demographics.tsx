import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';

const Demographics = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const sessionToken = searchParams.get('sessionToken');
  const prolificId = searchParams.get('prolificId');

  const [formData, setFormData] = useState({
    age: '',
    gender: '',
    ethnicity: [] as string[],
    ethnicityOther: '',
    native_english: ''
  });

  const handleEthnicityChange = (option: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      ethnicity: checked 
        ? [...prev.ethnicity, option]
        : prev.ethnicity.filter(item => item !== option)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.age || !formData.gender || formData.ethnicity.length === 0 || !formData.native_english) {
      toast({
        title: "Missing Information",
        description: "Please answer all required questions.",
        variant: "destructive"
      });
      return;
    }

    // Check age eligibility
    if (formData.age !== '60+') {
      navigate('/not-eligible');
      return;
    }

    if (formData.ethnicity.includes('Other') && !formData.ethnicityOther.trim()) {
      toast({
        title: "Missing Information",
        description: "Please specify 'Other' for ethnicity.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const ethnicityData = formData.ethnicity.map(item => 
        item === 'Other' ? `Other: ${formData.ethnicityOther}` : item
      );

      const { error } = await supabase
        .from('demographics')
        .insert({
          session_token: sessionToken,
          prolific_id: prolificId,
          age: formData.age,
          gender: formData.gender,
          ethnicity: ethnicityData,
          native_english: formData.native_english
        });

      if (error) throw error;

      navigate(`/chatbot-familiarity?sessionToken=${sessionToken}&prolificId=${prolificId}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save responses. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const ageOptions = ['Under 18', '18-29', '30-49', '50-59', '60+'];
  const genderOptions = ['Male', 'Female', 'Other', 'Prefer not to say'];
  const ethnicityOptions = [
    'Hispanic or Latino',
    'Native American/Alaska Native',
    'Asian',
    'Native Hawaiian or Other Pacific Islander',
    'Black or African American',
    'White or Caucasian',
    'Prefer not to say',
    'Other'
  ];
  const englishOptions = ['Yes', 'No'];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent via-background to-secondary p-4">
      <Card className="w-full max-w-2xl shadow-xl border-border">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl text-center">Demographics</CardTitle>
          <CardDescription className="text-center">
            Please answer the following questions about yourself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-3">
              <Label className="text-base font-semibold">What is your age group?</Label>
              <RadioGroup value={formData.age} onValueChange={(value) => setFormData(prev => ({ ...prev, age: value }))}>
                {ageOptions.map(option => (
                  <div key={option} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`age-${option}`} />
                    <Label htmlFor={`age-${option}`} className="font-normal cursor-pointer">{option}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">What's your gender?</Label>
              <RadioGroup value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                {genderOptions.map(option => (
                  <div key={option} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`gender-${option}`} />
                    <Label htmlFor={`gender-${option}`} className="font-normal cursor-pointer">{option}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">
                Please check all of the following ethnic or racial categories that best describe you.
              </Label>
              <div className="space-y-2">
                {ethnicityOptions.map(option => (
                  <div key={option} className="flex items-start space-x-2">
                    <Checkbox 
                      id={`ethnicity-${option}`}
                      checked={formData.ethnicity.includes(option)}
                      onCheckedChange={(checked) => handleEthnicityChange(option, checked as boolean)}
                    />
                    <Label htmlFor={`ethnicity-${option}`} className="font-normal cursor-pointer leading-tight">
                      {option}
                    </Label>
                  </div>
                ))}
                {formData.ethnicity.includes('Other') && (
                  <div className="ml-6 mt-2">
                    <Input
                      placeholder="Please specify"
                      value={formData.ethnicityOther}
                      onChange={(e) => setFormData(prev => ({ ...prev, ethnicityOther: e.target.value }))}
                      className="max-w-md"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Are you a native speaker of English?</Label>
              <RadioGroup value={formData.native_english} onValueChange={(value) => setFormData(prev => ({ ...prev, native_english: value }))}>
                {englishOptions.map(option => (
                  <div key={option} className="flex items-center space-x-2">
                    <RadioGroupItem value={option} id={`native-${option}`} />
                    <Label htmlFor={`native-${option}`} className="font-normal cursor-pointer">{option}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Submitting...' : 'Continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Demographics;
