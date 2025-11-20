import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
import { FlaskConical } from 'lucide-react';

export const ResearcherModeToggle = () => {
  const [showButton, setShowButton] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const { isResearcherMode, toggleResearcherMode } = useResearcherMode();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setSpacePressed(true);
      }
      
      // Check if both spacebar and 'r' are pressed
      if (spacePressed && e.key.toLowerCase() === 'r') {
        setShowButton(true);
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
  }, [spacePressed]);

  if (!showButton) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
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
