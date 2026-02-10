import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useResearcherMode } from '@/contexts/ResearcherModeContext';
import { FlaskConical, LogIn, X } from 'lucide-react';

const RESEARCHER_ROTATE_PENDING_KEY = 'researcher-session-rotate-pending';

const PARTICIPANT_PAGE_LINKS = [
  { label: 'Prolific ID', to: '/', match: '/' },
  { label: 'Consent', to: '/consent', match: '/consent', withSession: true },
  { label: 'No Consent', to: '/no-consent', match: '/no-consent' },
  { label: 'Demographics', to: '/demographics', match: '/demographics', withSession: true },
  { label: 'Familiarity', to: '/voiceassistant-familiarity', match: '/voiceassistant-familiarity', withSession: true },
  { label: 'Practice', to: '/practice', match: '/practice', withSession: true },
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
  const [showControls, setShowControls] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [showParticipantPages, setShowParticipantPages] = useState(true);
  const [showResearcherLogin, setShowResearcherLogin] = useState(true);
  const [showModeToggle, setShowModeToggle] = useState(true);
  const { isResearcherMode, activeResearcherId, toggleResearcherMode, startResearcherSession } = useResearcherMode();
  const location = useLocation();
  const navigate = useNavigate();
  const displayedResearcherId = activeResearcherId || sessionStorage.getItem('prolificId');
  const showRestoreHidden =
    !showParticipantPages || (isResearcherMode && !showResearcherLogin) || !showModeToggle;

  const restoreHiddenControls = () => {
    setShowParticipantPages(true);
    setShowResearcherLogin(true);
    setShowModeToggle(true);
  };

  const getPathWithSession = (path: string) => {
    const sessionToken = localStorage.getItem('sessionToken');
    const prolificId = sessionStorage.getItem('prolificId');
    const params = new URLSearchParams();
    if (sessionToken) params.set('sessionToken', sessionToken);
    if (prolificId) params.set('prolificId', prolificId);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture keys when user is typing in an input, textarea, or contenteditable
      // (e.g. batch notes, feedback fields) so Space and R work normally there
      const target = e.target as Node | null;
      const isEditable =
        target &&
        ((target instanceof HTMLInputElement) ||
          (target instanceof HTMLTextAreaElement) ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (isEditable) return;

      // Disable on no-consent page to allow normal typing
      if (location.pathname === '/no-consent') return;
      // Disable and hide on researcher pages unless mode is already active
      if (location.pathname.startsWith('/researcher') && !isResearcherMode) {
        setShowControls(false);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setSpacePressed(true);
      }

      // Check if both spacebar and 'r' are pressed
      if (spacePressed && e.key.toLowerCase() === 'r') {
        setShowControls((prev) => {
          const next = !prev;
          if (next) {
            restoreHiddenControls();
          }
          return next;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as Node | null;
      const isEditable =
        target &&
        ((target instanceof HTMLInputElement) ||
          (target instanceof HTMLTextAreaElement) ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (isEditable) return;
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

  useEffect(() => {
    if (!isResearcherMode) return;
    if (location.pathname.startsWith('/researcher')) return;
    if (location.pathname === '/debriefing' || location.pathname === '/complete') return;
    if (sessionStorage.getItem(RESEARCHER_ROTATE_PENDING_KEY) !== '1') return;

    void startResearcherSession().then((success) => {
      if (success) {
        sessionStorage.removeItem(RESEARCHER_ROTATE_PENDING_KEY);
      }
    });
  }, [isResearcherMode, location.pathname, startResearcherSession]);

  const handleModeToggle = () => {
    toggleResearcherMode();
    setShowControls(true);
    setShowModeToggle(true);
    if (!isResearcherMode) {
      setShowParticipantPages(true);
      setShowResearcherLogin(true);
    }
  };

  if (!showControls) return null;

  return (
    <>
      {isResearcherMode && !location.pathname.startsWith('/researcher') && (
        <div className="fixed left-4 top-4 z-50 rounded-lg border bg-background/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Researcher ID</p>
          <p className="font-mono font-semibold">{displayedResearcherId || 'initializing...'}</p>
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {isResearcherMode && showParticipantPages && (
        <div className="max-h-[55vh] w-64 overflow-y-auto rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Participant Pages
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowParticipantPages(false)}
              aria-label="Hide participant pages"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {PARTICIPANT_PAGE_LINKS.map((item) => (
              <Button
                key={item.to}
                onClick={() => navigate(item.withSession ? getPathWithSession(item.to) : item.to)}
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
      {isResearcherMode && showResearcherLogin && (
        <div className="relative">
          <Button
            onClick={() => navigate('/researcher')}
            variant="default"
            size="lg"
            className="w-full pr-10 shadow-lg"
          >
            <LogIn className="w-5 h-5 mr-2" />
            Login as Researcher
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-8 w-8"
            onClick={() => setShowResearcherLogin(false)}
            aria-label="Hide researcher login button"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {showModeToggle && (
        <div className="relative">
          <Button
            onClick={handleModeToggle}
            variant={isResearcherMode ? "default" : "outline"}
            size="lg"
            className="w-full pr-10 shadow-lg"
          >
            <FlaskConical className="w-5 h-5 mr-2" />
            {isResearcherMode ? 'Researcher Mode: ON' : 'Researcher Mode: OFF'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-8 w-8"
            onClick={() => setShowModeToggle(false)}
            aria-label="Hide researcher mode button"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {showRestoreHidden && (
        <Button
          onClick={restoreHiddenControls}
          variant="ghost"
          size="sm"
          className="h-8 self-end text-xs"
        >
          Restore Hidden Controls
        </Button>
      )}
      </div>
    </>
  );
};
