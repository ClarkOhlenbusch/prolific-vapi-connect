import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';

export function DarkModeToggle() {
  const { theme, setTheme } = useTheme();
  const { isResearcherMode } = useResearcherMode();
  const { pathname } = useLocation();
  const [mounted, setMounted] = useState(false);

  const isResearcherPage = pathname.startsWith('/researcher');
  const visible = isResearcherMode || isResearcherPage;

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), []);

  // Reset to light when leaving researcher context on participant pages
  useEffect(() => {
    if (mounted && !isResearcherMode && !isResearcherPage) setTheme('light');
  }, [isResearcherMode, isResearcherPage, mounted, setTheme]);

  if (!mounted || !visible) return null;

  const isDark = theme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      className="fixed top-2 left-2 z-50 h-8 w-8 rounded-full bg-background/80 shadow-sm backdrop-blur"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
