// src/lib/portalRegistry.ts
export function normalizeRole(role?: string | null): string {
  if (!role) return "USER";
  
  const upper = role.toUpperCase();
  if (upper === "SYS" || upper === "ADMIN") return "SUPER_ADMIN";
  if (upper === "OPERATION_MANAGER") return "OPS_MANAGER";
  
  return upper;
}