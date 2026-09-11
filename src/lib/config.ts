// ─────────────────────────────────────────────────────────────────────────────
// config.ts — Britium Express Production Configuration
// All env values come from .env (Vite: VITE_*)
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  // Supabase
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string,

  // API base (same origin for Vercel serverless functions)
  API_BASE: import.meta.env.VITE_API_BASE_URL || "",

  // App
  APP_NAME: "Britium Express",
  APP_VERSION: import.meta.env.VITE_APP_VERSION || "1.0.0",

  // Feature flags
  ENABLE_MOCK: import.meta.env.VITE_ENABLE_MOCK === "true",
};

// ─── API Route Map ────────────────────────────────────────────────────────────
export const API_ROUTES = {
  // Auth
  AUTH_LOGIN:         "/api/auth/login",
  AUTH_LOGOUT:        "/api/auth/logout",
  AUTH_ME:            "/api/auth/me",
  AUTH_RESET:         "/api/auth/reset-password",

  // Operations
  OPS_SHIPMENTS:      "/api/v1/operations/shipments",
  OPS_SHIPMENT:       (id: string) => `/api/v1/operations/shipments/${id}`,
  OPS_CREATE:         "/api/v1/operations/shipments/create",
  OPS_TRACK:          (awb: string) => `/api/v1/operations/track/${awb}`,
  OPS_EXCEPTIONS:     "/api/v1/operations/exceptions",
  OPS_PICKUPS:        "/api/v1/operations/pickups",
  OPS_TICKETS:        "/api/v1/operations/tickets",
  OPS_TICKET:         (id: string) => `/api/v1/operations/tickets/${id}`,

  // Warehouse
  WH_OVERVIEW:        "/api/v1/warehouse/overview",
  WH_INBOUND:         "/api/v1/warehouse/inbound",
  WH_STAGING:         "/api/v1/warehouse/staging",
  WH_STORAGE:         "/api/v1/warehouse/storage",
  WH_OUTBOUND:        "/api/v1/warehouse/outbound",
  WH_MANIFESTS:       "/api/v1/warehouse/manifests",
  WH_QR:              "/api/v1/warehouse/qr",

  // Finance
  FIN_OVERVIEW:       "/api/v1/finance-portal/overview",
  FIN_COD:            "/api/v1/finance-portal/cod-reconciliation",
  FIN_SETTLEMENTS:    "/api/v1/finance-portal/settlements",
  FIN_SETTLEMENT:     (id: string) => `/api/v1/finance-portal/settlements/${id}`,
  FIN_SETTLE_APPROVE: (id: string) => `/api/v1/finance-portal/settlements/${id}/approve`,
  FIN_RIDER_WALLETS:  "/api/v1/finance-portal/rider-wallets",
  FIN_VOUCHERS:       "/api/v1/finance-portal/vouchers",

  // Admin HR
  HR_EMPLOYEES:       "/api/v1/admin-hr/employees",
  HR_EMPLOYEE:        (id: string) => `/api/v1/admin-hr/employees/${id}`,
  HR_ATTENDANCE:      "/api/v1/admin-hr/attendance",
  HR_LEAVE:           "/api/v1/admin-hr/leave-requests",
  HR_LEAVE_ACT:       (id: string) => `/api/v1/admin-hr/leave-requests/${id}/action`,
  HR_ASSETS:          "/api/v1/admin-hr/assets",
  HR_APPROVALS:       "/api/v1/admin-hr/approvals",
  HR_ROLES:           "/api/v1/admin-hr/roles",

  // Marketing
  MKT_OVERVIEW:       "/api/v1/marketing-portal/overview",
  MKT_CAMPAIGNS:      "/api/v1/marketing-portal/campaigns",
  MKT_CAMPAIGN:       (id: string) => `/api/v1/marketing-portal/campaigns/${id}`,
  MKT_LEADS:          "/api/v1/marketing-portal/leads",
  MKT_LEAD:           (id: string) => `/api/v1/marketing-portal/leads/${id}`,
  MKT_PROMOS:         "/api/v1/marketing-portal/promo-codes",
  MKT_PARTNERSHIPS:   "/api/v1/marketing-portal/partnerships",
  MKT_ZONES:          "/api/v1/marketing-portal/zone-launches",

  // Notifications
  NOTIF_LIST:         "/api/v1/notifications",
  NOTIF_READ:         (id: string) => `/api/v1/notifications/${id}/read`,
  NOTIF_READ_ALL:     "/api/v1/notifications/read-all",

  // Uploads
  UPLOAD_POD:         "/api/v1/uploads/pod",
  UPLOAD_BULK:        "/api/v1/uploads/bulk",
  UPLOAD_SIGNED_URL:  "/api/v1/uploads/signed-url",

  // Branch Office
  BRANCH_OVERVIEW:    "/api/v1/branch-office/overview",
  BRANCH_MANIFESTS:   "/api/v1/branch-office/manifests",
  BRANCH_SHIPMENTS:   "/api/v1/branch-office/shipments",
  BRANCH_RIDERS:      "/api/v1/branch-office/riders",
  BRANCH_ASSIGN:      "/api/v1/branch-office/assign",

  // Super Admin
  ADMIN_OVERVIEW:     "/api/v1/admin/platform-overview",
  ADMIN_USERS:        "/api/v1/admin/users",
  ADMIN_USER:         (id: string) => `/api/v1/admin/users/${id}`,
  ADMIN_AUDIT_LOG:    "/api/v1/admin/audit-log",

  // Rider
  RIDER_TASKS:        "/api/v1/rider/tasks",
  RIDER_WALLET:       "/api/v1/rider/wallet",
  RIDER_COMPLETE:     "/api/v1/rider/complete",
  RIDER_FAIL:         "/api/v1/rider/fail",
  RIDER_HISTORY:      "/api/v1/rider/history",

  // Customer
  CUSTOMER_SHIPMENTS: "/api/v1/customer/shipments",
  CUSTOMER_ADDRESSES: "/api/v1/customer/addresses",
  CUSTOMER_TRACK:     (awb: string) => `/api/v1/customer/track/${awb}`,
} as const;

// ─── Role → Portal Route map ──────────────────────────────────────────────────
export const ROLE_PORTALS: Record<string, string> = {
  super_admin:       "/admin/dashboard",
  admin:             "/admin/dashboard",
  hr:                "/admin-hr/employees",
  manager:           "/admin/dashboard",
  finance:           "/finance/overview",
  accountant:        "/finance/overview",
  marketing:         "/marketing/overview",
  marketer:          "/marketing/overview",
  supervisor:        "/supervisor/dashboard",
  warehouse:         "/warehouse/overview",
  customer_service:  "/customer-service/dashboard",
  data_entry:        "/data-entry/shipments",
  merchant:          "/merchant/dashboard",
  branch:            "/branch-office/dashboard",
  rider:             "/rider/dashboard",
  customer:          "/customer/track",
  driver:            "/rider/dashboard",
};

export const ROLES = {
  SUPER_ADMIN:      "super_admin",
  ADMIN:            "admin",
  HR:               "hr",
  FINANCE:          "finance",
  MARKETING:        "marketing",
  SUPERVISOR:       "supervisor",
  WAREHOUSE:        "warehouse",
  CUSTOMER_SERVICE: "customer_service",
  DATA_ENTRY:       "data_entry",
  MERCHANT:         "merchant",
  BRANCH:           "branch",
  RIDER:            "rider",
  CUSTOMER:         "customer",
} as const;
