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
  const profileUserRef = useRef<string | null>(null);
  const activeRef = useRef(true);

  const isCurrentRequest = (requestId: number) =>
    activeRef.current && requestId === profileRequestRef.current;

  const commitProfile = (nextProfile: UserProfile | null, userId: string | null = null) => {
    profileRef.current = nextProfile;
    profileUserRef.current = nextProfile ? userId : null;
    setProfile(nextProfile);
  };

  const acceptSession = (nextSession: Session | null) => {
    setSession(nextSession);
    // Approval belongs to the UUID that was checked, never to a new session's
    // account. Keep an approved same-user view mounted during JWT renewal.
    if (!nextSession || profileUserRef.current !== nextSession.user.id) {
      commitProfile(null);
      setLoading(Boolean(nextSession));
    }
  };

  const clearSession = () => {
    ++profileRequestRef.current;
    setSession(null);
    commitProfile(null);
    setLoading(false);
  };

  const rejectSession = async (error: unknown) => {
    console.warn('Session rejected by RLS login contract:', getErrorMessage(error));
    clearSession();
    await supabase.auth.signOut();
  };

  const verifyProfile = async (requestId: number, user: User | null) => {
    if (!isCurrentRequest(requestId)) return;
    try {
      const nextProfile = await loadProfile(user);
      if (isCurrentRequest(requestId)) commitProfile(nextProfile, user?.id ?? null);
    } catch (error) {
      if (!isCurrentRequest(requestId)) return;
      if (error instanceof AccountAccessDeniedError) await rejectSession(error);
      throw error;
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  };

  const refreshProfile = async () => {
    const requestId = ++profileRequestRef.current;
    const { data } = await supabase.auth.getSession();
    if (!isCurrentRequest(requestId)) return;
    acceptSession(data.session);
    await verifyProfile(requestId, data.session?.user ?? null);
  };

  useEffect(() => {
    activeRef.current = true;
    const requestId = ++profileRequestRef.current;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isCurrentRequest(requestId)) return;
      acceptSession(data.session);
      try {
        await verifyProfile(requestId, data.session?.user ?? null);
      } catch (error) {
        if (!(error instanceof AccountAccessDeniedError)) {
          console.warn('Profile verification was temporarily unavailable; preserving the active session:', getErrorMessage(error));
        }
      }
    }).catch((error) => {
      if (!isCurrentRequest(requestId)) return;
      console.warn('Unable to restore authentication session:', getErrorMessage(error));
      clearSession();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!activeRef.current) return;
      if (event === 'SIGNED_OUT' || !newSession) {
        clearSession();
        return;
      }

      acceptSession(newSession);

      // A file-picker focus change can coincide with Supabase refreshing the JWT.
      // Only an approved profile belonging to this UUID can skip verification.
      if (event === 'TOKEN_REFRESHED' && profileRef.current?.authorized &&
          profileUserRef.current === newSession.user.id) {
        setLoading(false);
        return;
      }

      // Same-account JWT renewal must not cancel an access check already in
      // flight: that check may authoritatively revoke the current approval.
      const requestId = ++profileRequestRef.current;

      // Keep auth callbacks non-blocking, and check ownership before starting
      // queued RPCs as well as after they resolve.
      globalThis.setTimeout(() => {
        if (!isCurrentRequest(requestId)) return;
        loadProfile(newSession.user)
          .then((nextProfile) => {
            if (isCurrentRequest(requestId)) commitProfile(nextProfile, newSession.user.id);
          })
          .catch(async (error) => {
            if (!isCurrentRequest(requestId)) return;
            if (error instanceof AccountAccessDeniedError) {
              await rejectSession(error);
            } else {
              console.warn('Profile refresh was temporarily unavailable; preserving the active session:', getErrorMessage(error));
            }
          })
          .finally(() => {
            if (isCurrentRequest(requestId)) setLoading(false);
          });
      }, 0);
    });

    return () => {
      activeRef.current = false;
      ++profileRequestRef.current;
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
      clearSession();
      await supabase.auth.signOut();
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
