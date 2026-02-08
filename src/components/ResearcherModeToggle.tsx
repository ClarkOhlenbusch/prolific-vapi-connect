import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
import { FlaskConical, LogIn } from 'lucide-react';

const RESEARCHER_PREVIEW_SESSION_TOKEN = '00000000-0000-0000-0000-000000000000';

const PARTICIPANT_PAGE_LINKS = [
  { label: 'Prolific ID', to: '/', match: '/' },
  { label: 'Consent', to: `/consent?sessionToken=${RESEARCHER_PREVIEW_SESSION_TOKEN}&prolificId=RESEARCHER_MODE`, match: '/consent' },
  { label: 'No Consent', to: '/no-consent', match: '/no-consent' },
  { label: 'Demographics', to: `/demographics?sessionToken=${RESEARCHER_PREVIEW_SESSION_TOKEN}&prolificId=RESEARCHER_MODE`, match: '/demographics' },
  { label: 'Familiarity', to: `/voiceassistant-familiarity?sessionToken=${RESEARCHER_PREVIEW_SESSION_TOKEN}&prolificId=RESEARCHER_MODE`, match: '/voiceassistant-familiarity' },
  { label: 'Practice', to: `/practice?sessionToken=${RESEARCHER_PREVIEW_SESSION_TOKEN}&prolificId=RESEARCHER_MODE`, match: '/practice' },
  { label: 'Conversation', to: '/voice-conversation', match: '/voice-conversation' },
  { label: 'Formality', to: '/questionnaire/formality', match: '/questionnaire/formality' },
  { label: 'PETS', to: '/questionnaire/pets', match: '/questionnaire/pets' },
  { label: 'Godspeed', to: '/questionnaire/godspeed', match: '/questionnaire/godspeed' },
  { label: 'TIAS', to: '/questionnaire/tias', match: '/questionnaire/tias' },
  { label: 'Intention', to: '/questionnaire/intention', match: '/questionnaire/intention' },
  { label: 'TIPI', to: '/questionnaire/tipi', match: '/questionnaire/tipi' },
  { label: 'Feedback', to: '/questionnaire/feedback', match: '/questionnaire/feedback' },
  { label: 'Debriefing', to: '/debriefing', match: '/debriefing' },
  { label: 'Complete', to: '/complete', match: '/complete' },
];

export const ResearcherModeToggle = () => {
  const [showButton, setShowButton] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const { isResearcherMode, toggleResearcherMode } = useResearcherMode();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable on no-consent page to allow normal typing
      if (location.pathname === '/no-consent') return;
      // Disable and hide on researcher pages unless mode is already active
      if (location.pathname.startsWith('/researcher') && !isResearcherMode) {
        setShowButton(false);
        return;
      }
      
      if (e.code === 'Space') {
        e.preventDefault();
        setSpacePressed(true);
      }
      
      // Check if both spacebar and 'r' are pressed
      if (spacePressed && e.key.toLowerCase() === 'r') {
        setShowButton(prev => !prev);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [spacePressed, location.pathname, isResearcherMode]);

  if (!showButton && !isResearcherMode) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {isResearcherMode && (
        <div className="max-h-[55vh] w-64 overflow-y-auto rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur">
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Participant Pages
          </p>
          <div className="flex flex-col gap-1">
            {PARTICIPANT_PAGE_LINKS.map((item) => (
              <Button
                key={item.to}
                onClick={() => navigate(item.to)}
                variant={location.pathname === item.match ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 justify-start px-2 text-xs"
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      )}
      {isResearcherMode && (
        <Button
          onClick={() => navigate('/researcher')}
          variant="default"
          size="lg"
          className="shadow-lg"
        >
          <LogIn className="w-5 h-5 mr-2" />
          Login as Researcher
        </Button>
      )}
      <Button
        onClick={toggleResearcherMode}
        variant={isResearcherMode ? "default" : "outline"}
        size="lg"
        className="shadow-lg"
      >
        <FlaskConical className="w-5 h-5 mr-2" />
        {isResearcherMode ? 'Researcher Mode: ON' : 'Researcher Mode: OFF'}
      </Button>
    </div>
  );
};
