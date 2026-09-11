import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

class AccountAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountAccessDeniedError';
  }
}

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
    throw new AccountAccessDeniedError(
      messages[access.reason ?? ''] ?? 'This account is not authorized to use Britium Express.'
    );
  }

  return access;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  const profileRequestRef = useRef(0);

  const commitProfile = (nextProfile: UserProfile | null) => {
    profileRef.current = nextProfile;
    setProfile(nextProfile);
  };

  const rejectSession = async (error: unknown) => {
    console.warn('Session rejected by RLS login contract:', getErrorMessage(error));
    setSession(null);
    commitProfile(null);
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    try {
      commitProfile(await loadProfile(data.session?.user ?? null));
    } catch (error) {
      if (error instanceof AccountAccessDeniedError) {
        await rejectSession(error);
      }
      throw error;
    }
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      try {
        commitProfile(await loadProfile(data.session?.user ?? null));
      } catch (error) {
        if (error instanceof AccountAccessDeniedError) {
          await rejectSession(error);
        } else {
          console.warn('Profile verification was temporarily unavailable; preserving the active session:', getErrorMessage(error));
        }
      }
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        commitProfile(null);
        setLoading(false);
        return;
      }

      setSession(newSession);

      // A file-picker focus change can coincide with Supabase refreshing the JWT.
      // The existing authorized profile remains valid; do not turn a transient
      // profile RPC failure into an application sign-out.
      if (event === 'TOKEN_REFRESHED' && profileRef.current?.authorized) {
        setLoading(false);
        return;
      }

      const requestId = ++profileRequestRef.current;
      // Supabase advises keeping auth callbacks non-blocking. Deferring the RPC
      // also prevents a file-picker focus event and token refresh from racing
      // two profile requests that can overwrite each other.
      globalThis.setTimeout(() => {
        loadProfile(newSession.user)
          .then((nextProfile) => {
            if (requestId === profileRequestRef.current) commitProfile(nextProfile);
          })
          .catch(async (error) => {
            if (requestId !== profileRequestRef.current) return;
            if (error instanceof AccountAccessDeniedError) {
              await rejectSession(error);
            } else {
              console.warn('Profile refresh was temporarily unavailable; preserving the active session:', getErrorMessage(error));
            }
          })
          .finally(() => {
            if (requestId === profileRequestRef.current) setLoading(false);
          });
      }, 0);
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
      commitProfile(null);
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
