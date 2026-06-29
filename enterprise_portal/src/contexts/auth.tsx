import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Session, User } from '@supabase/supabase-js';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  role: string | null;
  branch: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRegistry(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // 2. Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRegistry(session.user.id);
      } else {
        setRole(null);
        setBranch(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 3. Query the Database for the User's Role
  const fetchUserRegistry = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('be_user_account_registry')
        .select('role, branch')
        .eq('auth_user_id', userId)
        .maybeSingle(); // Prevents crashing if 0 rows are returned
      
      if (data && data.role) {
        // Success: Found your role in the DB
        setRole(data.role);
        setBranch(data.branch || 'HQ');
      } else {
        // UAT FAILSAFE: Automatically grant SUPER_ADMIN if missing
        console.warn("User has no role in registry. Applying UAT Failsafe.");
        setRole('SUPER_ADMIN');
        setBranch('HQ');
      }
    } catch (error) {
      // UAT FAILSAFE: Automatically grant SUPER_ADMIN on network errors
      console.error('Error fetching role:', error);
      setRole('SUPER_ADMIN');
      setBranch('HQ');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, branch, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);