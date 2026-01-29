import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { logActivityStandalone } from '@/hooks/useActivityLog';

type ResearcherRole = 'super_admin' | 'viewer' | null;

interface ResearcherAuthContextType {
  user: User | null;
  session: Session | null;
  role: ResearcherRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const ResearcherAuthContext = createContext<ResearcherAuthContextType | undefined>(undefined);

export const ResearcherAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<ResearcherRole>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('researcher_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching role:', error);
        return null;
      }

      return (data?.role as ResearcherRole) || null;
    } catch (err) {
      console.error('Error in fetchRole:', err);
      return null;
    }
  };

  const fetchRoleWithTimeout = async (
    userId: string,
    timeoutMs: number = 8000
  ): Promise<ResearcherRole> => {
    try {
      return await Promise.race([
        fetchRole(userId),
        new Promise<ResearcherRole>((resolve) => {
          setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
    } catch (err) {
      console.error('Error in fetchRoleWithTimeout:', err);
      return null;
    }
  };

  const refreshRole = async () => {
    if (user) {
      const fetchedRole = await fetchRoleWithTimeout(user.id);
      setRole(fetchedRole);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let requestSeq = 0;

    const handleSession = async (nextSession: Session | null) => {
      const seq = ++requestSeq;

      setIsLoading(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        setRole(null);
        if (isMounted && seq === requestSeq) setIsLoading(false);
        return;
      }

      try {
        const fetchedRole = await fetchRoleWithTimeout(nextSession.user.id);
        if (!isMounted || seq !== requestSeq) return;
        setRole(fetchedRole);
      } finally {
        if (isMounted && seq === requestSeq) setIsLoading(false);
      }
    };

    // Listen for auth changes first (prevents missing initial events)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void handleSession(nextSession);
    });

    // Then load initial session
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        void handleSession(initialSession);
      })
      .catch((err) => {
        console.error('Error getting initial session:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        const fetchedRole = await fetchRoleWithTimeout(data.user.id);
        if (!fetchedRole) {
          // User exists but is not a researcher
          await supabase.auth.signOut();
          return { error: 'You do not have researcher access. Please contact an administrator.' };
        }
        setRole(fetchedRole);
        
        // Log successful login
        await logActivityStandalone(data.user.id, data.user.email || email, 'login');
      }

      return { error: null };
    } catch (err) {
      console.error('Login error:', err);
      return { error: 'An unexpected error occurred' };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setRole(null);
  };

  const value: ResearcherAuthContextType = {
    user,
    session,
    role,
    isLoading,
    isAuthenticated: !!user && !!role,
    isSuperAdmin: role === 'super_admin',
    login,
    logout,
    refreshRole,
  };

  return (
    <ResearcherAuthContext.Provider value={value}>
      {children}
    </ResearcherAuthContext.Provider>
  );
};

export const useResearcherAuth = () => {
  const context = useContext(ResearcherAuthContext);
  if (context === undefined) {
    throw new Error('useResearcherAuth must be used within a ResearcherAuthProvider');
  }
  return context;
};
