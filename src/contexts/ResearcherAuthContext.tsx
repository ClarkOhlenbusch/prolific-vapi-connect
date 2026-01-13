import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

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

      return data?.role as ResearcherRole || null;
    } catch (err) {
      console.error('Error in fetchRole:', err);
      return null;
    }
  };

  const refreshRole = async () => {
    if (user) {
      const fetchedRole = await fetchRole(user.id);
      setRole(fetchedRole);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const fetchedRole = await fetchRole(session.user.id);
        setRole(fetchedRole);
      }
      
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const fetchedRole = await fetchRole(session.user.id);
        setRole(fetchedRole);
      } else {
        setRole(null);
      }
      
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
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
        const fetchedRole = await fetchRole(data.user.id);
        if (!fetchedRole) {
          // User exists but is not a researcher
          await supabase.auth.signOut();
          return { error: 'You do not have researcher access. Please contact an administrator.' };
        }
        setRole(fetchedRole);
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
