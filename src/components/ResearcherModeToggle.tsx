import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
import { FlaskConical, LogIn } from 'lucide-react';

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
      // Disable and hide on researcher pages
      if (location.pathname.startsWith('/researcher')) {
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
  }, [spacePressed, location.pathname]);

  if (!showButton) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
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
