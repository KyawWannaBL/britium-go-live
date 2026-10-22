import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createAccountHandler } from './handler.mjs';
Deno.serve(createAccountHandler({createClient,env:{SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_ANON_KEY:Deno.env.get('SUPABASE_ANON_KEY'),SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}}));
