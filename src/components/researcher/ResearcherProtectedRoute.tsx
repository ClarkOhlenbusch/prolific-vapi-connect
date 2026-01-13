import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Loader2 } from 'lucide-react';

interface ResearcherProtectedRouteProps {
  children: ReactNode;
  requireSuperAdmin?: boolean;
}

export const ResearcherProtectedRoute = ({ 
  children, 
  requireSuperAdmin = false 
}: ResearcherProtectedRouteProps) => {
  const { isAuthenticated, isSuperAdmin, isLoading } = useResearcherAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/researcher" replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return <Navigate to="/researcher/dashboard" replace />;
  }

  return <>{children}</>;
};
