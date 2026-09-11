import { supabase } from '@/integrations/supabase/client';

export async function rpcJson<T = any>(fnName: string, payload?: any): Promise<T | null> {
  const { data, error } = await supabase.rpc(fnName, payload);
  if (error) {
    console.error(`RPC Error [${fnName}]:`, error.message);
    throw error;
  }
  return data as T;
}
