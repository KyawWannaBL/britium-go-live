export function normalizeRole(value?: string | null): string {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export function defaultPortalForRole(role?: string | null): string {
  const r = normalizeRole(role);

  if (
    [
      "SYS",
      "APP_OWNER",
      "SUPER_ADMIN",
      "SUPER_A",
      "ADMIN",
      "ADM",
      "MGR",
    ].includes(r)
  ) {
    return "/admin-hr/admin";
  }

  if (
    [
      "FINANCE",
      "FIN",
      "FINM",
      "ACCOUNTING",
      "ACCOUNTANT",
      "FINANCE_ADMIN",
      "FINANCE_MANAGER",
      "FINANCE_ANALYST",
      "FINANCE_STAFF",
    ].includes(r)
  ) {
    return "/finance";
  }

  if (
    [
      "MARKETING",
      "MARKETING_ADMIN",
      "MARKETING_MANAGER",
      "MARKETING_STAFF",
      "GROWTH",
      "BRAND",
      "DIGITAL_MARKETING",
    ].includes(r)
  ) {
    return "/marketing";
  }

  if (["HR", "HR_ADMIN", "HR_MANAGER"].includes(r)) {
    return "/admin-hr/employees";
  }

  if (["SUPERVISOR", "SUP", "OPS_SUPERVISOR"].includes(r)) {
    return "/supervisor";
  }

  if (["DATA_ENTRY", "DATAENTRY", "DEO"].includes(r)) {
    return "/data-entry";
  }

  if (["CUSTOMER_SERVICE", "CS"].includes(r)) {
    return "/customer-service";
  }

  if (["CUSTOMER", "CUSTOMER_PORTAL"].includes(r)) {
    return "/customer";
  }

  if (
    [
      "MERCHANT",
      "MERCHANT_ADMIN",
      "MERCHANT_OWNER",
      "MERCHANT_MANAGER",
      "MERCHANT_STAFF",
    ].includes(r)
  ) {
    return "/merchant";
  }

  if (
    ["WAREHOUSE", "WH", "WAREHOUSE_MANAGER", "WAREHOUSE_STAFF"].includes(r)
  ) {
    return "/warehouse";
  }

  if (["BRANCH", "BRANCH_OFFICE", "BRANCH_MANAGER"].includes(r)) {
    return "/branch-office";
  }

  if (["DELIVERYMAN", "DELIVERYMEN", "RIDER", "DRIVER"].includes(r)) {
    return "/deliverymen";
  }

  return "/dashboard";
}