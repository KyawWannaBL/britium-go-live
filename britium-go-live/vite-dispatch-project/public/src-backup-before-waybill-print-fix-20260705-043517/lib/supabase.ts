// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Fallback to placeholder if env vars aren't loaded locally yet
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);