import { supabase } from "@/integrations/supabase/client";

export type BackendAccessProfile = {
  ok: boolean;
  email: string;
  display_name?: string;
  role: string;
  portal: string;
  branch_code?: string;
  permissions?: string[];
  redirect_path?: string;
  registry_profile?: any;
  workforce_profile?: any;
};

export async function loginWithBackendEmailRole(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  if (!password) {
    throw new Error("Password is required.");
  }

  const auth = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (auth.error) {
    throw auth.error;
  }

  const userEmail = auth.data.user?.email?.toLowerCase() || normalizedEmail;

  const access = await supabase.rpc("be_resolve_user_access_by_email", {
    p_email: userEmail,
  });

  if (access.error) {
    await supabase.auth.signOut();
    throw access.error;
  }

  const profile = access.data as BackendAccessProfile;

  if (!profile?.ok || !profile.role) {
    await supabase.auth.signOut();
    throw new Error("Backend did not return a valid access role.");
  }

  localStorage.setItem("be_user_authenticated", "YES");
  localStorage.setItem("be_user_email", profile.email);
  localStorage.setItem("be_user_role", profile.role);
  localStorage.setItem("be_user_portal", profile.portal || profile.role);
  localStorage.setItem("be_branch_code", profile.branch_code || "HQ");
  localStorage.setItem("be_user_access_profile", JSON.stringify(profile));

  return profile;
}

export function getBackendAccessProfile(): BackendAccessProfile | null {
  try {
    const raw = localStorage.getItem("be_user_access_profile");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function currentBackendRole() {
  return getBackendAccessProfile()?.role || localStorage.getItem("be_user_role") || "";
}

export function hasBackendRole(allowed: string[]) {
  const role = currentBackendRole().toLowerCase();
  return allowed.map((x) => x.toLowerCase()).includes(role);
}

export function clearBackendAccess() {
  localStorage.removeItem("be_user_authenticated");
  localStorage.removeItem("be_user_email");
  localStorage.removeItem("be_user_role");
  localStorage.removeItem("be_user_portal");
  localStorage.removeItem("be_branch_code");
  localStorage.removeItem("be_user_access_profile");
}
