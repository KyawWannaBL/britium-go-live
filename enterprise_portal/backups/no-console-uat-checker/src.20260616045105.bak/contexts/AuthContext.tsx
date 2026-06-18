import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, getErrorMessage } from '@/lib/supabaseClient';

export type UserProfile = {
  user_id?: string;
  auth_user_id?: string;
  full_name?: string;
  email?: string;
  role?: string;
  branch_code?: string;
  status?: string;
};

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: string;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function loadProfile(user: User | null): Promise<UserProfile | null> {
  if (!user) return null;
  const { data, error } = await supabase
    .from('be_user_account_registry')
    .select('user_id,auth_user_id,full_name,email,role,branch_code,status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    console.warn('Unable to load user profile:', getErrorMessage(error));
    return { auth_user_id: user.id, email: user.email ?? undefined, role: 'guest', status: 'unknown' };
  }

  return (data as UserProfile | null) ?? {
    auth_user_id: user.id,
    email: user.email ?? undefined,
    role: 'guest',
    status: 'unregistered'
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setProfile(await loadProfile(data.session?.user ?? null));
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      setProfile(await loadProfile(data.session?.user ?? null));
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfile(newSession?.user ?? null).then(setProfile).finally(() => setLoading(false));
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? 'guest',
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await refreshProfile();
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
    },
    refreshProfile
  }), [loading, session, profile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export { getErrorMessage };
