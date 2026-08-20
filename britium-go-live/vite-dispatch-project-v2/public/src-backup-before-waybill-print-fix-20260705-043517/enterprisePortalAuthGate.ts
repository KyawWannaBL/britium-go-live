import { supabase } from "@/integrations/supabase/client";

const PUBLIC_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

function hashPath() {
  const raw = window.location.hash.replace(/^#/, "") || window.location.pathname || "/";
  const path = raw.split("?")[0] || "/";
  return path === "/" ? "/login" : path;
}

function isPublic(path: string) {
  return PUBLIC_PATHS.has(path) || path.startsWith("/reset-password");
}

function hasLocalSession() {
  return localStorage.getItem("be_enterprise_session") === "1" || sessionStorage.getItem("be_enterprise_session") === "1";
}

function redirectToLogin(path: string) {
  if (isPublic(path)) return;
  window.location.hash = `/login?next=${encodeURIComponent(path)}`;
}

export async function checkEnterpriseAuthGate() {
  const path = hashPath();
  if (isPublic(path)) return;
  if (hasLocalSession()) return;

  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      localStorage.setItem("be_enterprise_session", "1");
      return;
    }
  } catch (error) {
    console.warn("Auth session check failed", error);
  }

  redirectToLogin(path);
}

function start() {
  void checkEnterpriseAuthGate();
  window.addEventListener("hashchange", () => void checkEnterpriseAuthGate());
  window.addEventListener("storage", () => void checkEnterpriseAuthGate());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
