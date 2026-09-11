import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

type EnhancedAuthResult = {
  user: any;
  loading: boolean;
  roleCode: string;
};

function normalizeRoleCode(user: any): string {
  const direct =
    user?.roleCode ??
    user?.role_code ??
    user?.app_role ??
    user?.user_role ??
    user?.role;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim().toUpperCase();
  }

  if (Array.isArray(user?.roles) && user.roles.length > 0) {
    const first = user.roles.find(
      (value: unknown) => typeof value === "string" && String(value).trim()
    );
    if (first) return String(first).trim().toUpperCase();
  }

  return "";
}

export function useEnhancedAuth(): EnhancedAuthResult {
  const { user, loading } = useAuth();

  const roleCode = useMemo(() => normalizeRoleCode(user), [user]);

  return {
    user,
    loading,
    roleCode,
  };
}

export default useEnhancedAuth;