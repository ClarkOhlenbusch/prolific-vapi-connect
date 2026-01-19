import { useLocation } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';

const EXPERIMENT_STEPS = [
  { path: '/demographics', label: 'Demographics' },
  { path: '/voiceassistant-familiarity', label: 'Familiarity' },
  { path: '/practice', label: 'Practice' },
  { path: '/voice-conversation', label: 'Conversation' },
  { path: '/questionnaire/formality', label: 'Formality' },
  { path: '/questionnaire/pets', label: 'PETS' },
  { path: '/questionnaire/tias', label: 'TIAS' },
  { path: '/questionnaire/intention', label: 'Intention' },
  { path: '/questionnaire/tipi', label: 'TIPI' },
  { path: '/questionnaire/feedback', label: 'Feedback' },
  { path: '/debriefing', label: 'Debriefing' },
  { path: '/complete', label: 'Complete' },
];

export const ExperimentProgress = () => {
  const location = useLocation();
  
  const currentStepIndex = EXPERIMENT_STEPS.findIndex(
    step => location.pathname === step.path
  );
  
  // If not found, don't render anything
  if (currentStepIndex === -1) {
    return null;
  }
  
  const currentStep = currentStepIndex + 1;
  const totalSteps = EXPERIMENT_STEPS.length;
  const percentage = Math.round((currentStep / totalSteps) * 100);
  
  return (
    <div className="w-full space-y-2 mb-4">
      <Progress value={percentage} className="h-2" />
      <p className="text-xs text-muted-foreground text-center">
        Step {currentStep} of {totalSteps} — {percentage}% complete
      </p>
    </div>
  );
};
