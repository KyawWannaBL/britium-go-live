import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

const getErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error_description) return error.error_description;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
};

export type UserProfile = {
  user_id?: string;
  auth_user_id?: string;
  full_name?: string;
  email?: string;
  role?: string;
  branch_code?: string;
  status?: string;
  authorized?: boolean;
  must_change_password?: boolean;
  territories?: Array<{
    scope_type: 'GLOBAL' | 'BRANCH' | 'TOWNSHIP';
    branch_id?: string | null;
    branch_code?: string | null;
    township_key?: string | null;
    can_read: boolean;
    can_create: boolean;
    can_update: boolean;
    can_delete: boolean;
  }>;
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
  const { data, error } = await supabase.rpc('be_login_access_profile');

  if (error) {
    throw new Error(`Unable to verify account access: ${getErrorMessage(error)}`);
  }

  const access = (data ?? {}) as UserProfile & { reason?: string };
  if (!access.authorized) {
    const messages: Record<string, string> = {
      ACCOUNT_NOT_REGISTERED: 'This login is not registered as a Britium Express account.',
      ACCOUNT_INACTIVE: 'This Britium Express account is inactive.',
      ROLE_NOT_ASSIGNED: 'No authorized role is assigned to this account.',
      TERRITORY_NOT_ASSIGNED: 'No active branch or township territory is assigned to this account.',
      AUTH_REQUIRED: 'Your authentication session is no longer valid.',
    };
    throw new Error(messages[access.reason ?? ''] ?? 'This account is not authorized to use Britium Express.');
  }

  return access;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    try {
      setProfile(await loadProfile(data.session?.user ?? null));
    } catch (error) {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      throw error;
    }
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      try {
        setProfile(await loadProfile(data.session?.user ?? null));
      } catch (error) {
        console.warn('Session rejected by RLS login contract:', getErrorMessage(error));
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfile(newSession?.user ?? null)
        .then(setProfile)
        .catch(async (error) => {
          console.warn('Authentication state rejected:', getErrorMessage(error));
          setSession(null);
          setProfile(null);
          await supabase.auth.signOut();
        })
        .finally(() => setLoading(false));
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
