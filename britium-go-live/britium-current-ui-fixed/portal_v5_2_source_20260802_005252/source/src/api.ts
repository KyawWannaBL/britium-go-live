// src/api.ts

// Replace with your actual Supabase local/remote URL and Anon Key
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://dltavabvjwocknkyvwgz.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdGF2YWJ2andvY2tua3l2d2d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTMxOTQsImV4cCI6MjA4NjY4OTE5NH0.7-9BK6L9dpCYIB-pp1WOeQxCI1DVxnSykoTRXNUHYIo";

const API_BASE_URL = `${SUPABASE_URL}/rest/v1/rpc`;

export interface RpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function invokeBackend<T>(
  rpcName: string, 
  payload: Record<string, any> = {}
): Promise<RpcResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}/${rpcName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}` // Replace with auth.uid() token when ready for live auth
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RPC Error] ${rpcName} HTTP ${response.status}:`, errorText);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };

  } catch (error) {
    console.error(`[RPC Network Error] ${rpcName}:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}