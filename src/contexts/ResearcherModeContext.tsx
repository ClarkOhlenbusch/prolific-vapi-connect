import { createContext, useContext, useState, ReactNode } from 'react';

interface ResearcherModeContextType {
  isResearcherMode: boolean;
  toggleResearcherMode: () => void;
}

const ResearcherModeContext = createContext<ResearcherModeContextType | undefined>(undefined);

export const ResearcherModeProvider = ({ children }: { children: ReactNode }) => {
  const [isResearcherMode, setIsResearcherMode] = useState(false);

  const toggleResearcherMode = () => {
    setIsResearcherMode(prev => !prev);
  };

  return (
    <ResearcherModeContext.Provider value={{ isResearcherMode, toggleResearcherMode }}>
      {children}
    </ResearcherModeContext.Provider>
  );
};

export const useResearcherMode = () => {
  const context = useContext(ResearcherModeContext);
  if (context === undefined) {
    throw new Error('useResearcherMode must be used within a ResearcherModeProvider');
  }
  return context;
};
