// @ts-nocheck
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthContextValue = {
  session: any | null;
  user: any | null;
  profile: any | null;
  accessProfile: any | null;
  loading: boolean;
  authLoading: boolean;
  isAuthenticated: boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  accessProfile: null,
  loading: false,
  authLoading: false,
  isAuthenticated: false,
  refreshSession: async () => {},
  signOut: async () => {},
  logout: async () => {},
});

function readProfile() {
  try {
    return JSON.parse(localStorage.getItem("be_user_access_profile") || "null");
  } catch {
    return null;
  }
}

function clearAuthStorage() {
  try {
    Object.keys(localStorage).forEach((key) => {
      const k = key.toLowerCase();
      if (
        key.startsWith("sb-") ||
        key.startsWith("be_") ||
        k.includes("supabase") ||
        k.includes("auth-token")
      ) {
        localStorage.removeItem(key);
      }
    });

    Object.keys(sessionStorage).forEach((key) => {
      const k = key.toLowerCase();
      if (
        key.startsWith("sb-") ||
        key.startsWith("be_") ||
        k.includes("supabase") ||
        k.includes("auth-token")
      ) {
        sessionStorage.removeItem(key);
      }
    });
  } catch {}
}

async function getSessionFast() {
  return Promise.race([
    supabase.auth.getSession(),
    new Promise((resolve) =>
      window.setTimeout(
        () => resolve({ data: { session: null }, error: null, timedOut: true }),
        2500
      )
    ),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(() => readProfile());
  const [loading, setLoading] = useState(false);

  const refreshSession = async () => {
    setLoading(true);
    try {
      const result: any = await getSessionFast();
      setSession(result?.data?.session || null);
      setProfile(readProfile());
    } catch (err) {
      console.warn("Session check failed, but login UI is not blocked.", err);
      setSession(null);
      setProfile(readProfile());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSession();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setProfile(readProfile());
    });

    return () => {
      data?.subscription?.unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    clearAuthStorage();
    setSession(null);
    setProfile(null);
    try {
      await supabase.auth.signOut();
    } catch {}
    window.location.href = "/#/login?signout=1";
  };

  const value = useMemo(
    () => ({
      session,
      user: session?.user || null,
      profile,
      accessProfile: profile,
      loading,
      authLoading: loading,
      isAuthenticated: !!session,
      refreshSession,
      signOut,
      logout: signOut,
    }),
    [session, profile, loading]
  );

  // Critical: never block children. Login page must always render.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
