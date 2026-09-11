// ─────────────────────────────────────────────────────────────────────────────
// apiClient.ts — Britium Express Production API Client
// Wraps fetch with:  auth headers · retry · error normalisation · timeouts
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "./supabaseClient";
import { CONFIG } from "./config";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
  error?: string;
  status: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Core fetch with retry ─────────────────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  backoff = 400
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000); // 20 s timeout
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      // Retry on transient server errors
      if (res.status >= 500 && attempt < retries) {
        await sleep(backoff * Math.pow(2, attempt));
        continue;
      }
      return res;
    } catch (err: unknown) {
      if (attempt < retries && (err as Error)?.name !== "AbortError") {
        await sleep(backoff * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw new ApiError("Request failed after retries", 503);
}

// ── Request builder ───────────────────────────────────────────────────────────
async function request<T>(
  method: string,
  endpoint: string,
  body?: unknown,
  customHeaders?: Record<string, string>
): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders,
    ...customHeaders,
  };

  const url = `${CONFIG.API_BASE}${endpoint}`;
  const options: RequestInit = {
    method,
    headers,
    credentials: "same-origin",
    ...(body !== undefined && { body: JSON.stringify(body) }),
  };

  const res = await fetchWithRetry(url, options);

  // Handle 401 – session expired
  if (res.status === 401) {
    await supabase.auth.signOut();
    window.location.href = "/login?reason=session_expired";
    throw new ApiError("Session expired. Please log in again.", 401, "SESSION_EXPIRED");
  }

  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Non-JSON response from ${endpoint}`, res.status);
  }

  if (!res.ok || json.ok === false) {
    throw new ApiError(
      json.error || `Request failed: ${res.statusText}`,
      res.status
    );
  }

  return json.data;
}

// ── Public API ────────────────────────────────────────────────────────────────
export const api = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean>) => {
    const qs = params
      ? "?" + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : "";
    return request<T>("GET", endpoint + qs);
  },

  post: <T>(endpoint: string, body?: unknown) =>
    request<T>("POST", endpoint, body),

  put: <T>(endpoint: string, body?: unknown) =>
    request<T>("PUT", endpoint, body),

  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>("PATCH", endpoint, body),

  delete: <T>(endpoint: string) =>
    request<T>("DELETE", endpoint),

  /** Upload a file (multipart/form-data) */
  upload: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithRetry(`${CONFIG.API_BASE}${endpoint}`, {
      method: "POST",
      headers: authHeaders, // no Content-Type; browser sets boundary automatically
      body: formData,
    });
    const json: ApiResponse<T> = await res.json();
    if (!res.ok || json.ok === false) {
      throw new ApiError(json.error || "Upload failed", res.status);
    }
    return json.data;
  },
};

export default api;
