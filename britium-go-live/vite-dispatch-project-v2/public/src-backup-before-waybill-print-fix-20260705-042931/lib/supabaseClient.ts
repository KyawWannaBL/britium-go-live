import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
export const SUPABASE_READY = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const fallbackUrl = 'https://example.supabase.co';
const fallbackKey = 'missing-anon-key';

export const supabase = createClient(
  SUPABASE_URL || fallbackUrl,
  SUPABASE_ANON_KEY || fallbackKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

export function getSupabaseEnvStatus() {
  return {
    ready: SUPABASE_READY,
    urlPresent: Boolean(SUPABASE_URL),
    anonKeyPresent: Boolean(SUPABASE_ANON_KEY),
    appEnv: import.meta.env.VITE_APP_ENV ?? 'development'
  };
}

export function getErrorMessage(error: unknown): string {
  if (!error) return 'Unexpected error. Please try again.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || 'Unexpected error. Please try again.';
  if (typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return 'Unexpected error. Please try again.';
}
