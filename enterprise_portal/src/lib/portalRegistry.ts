// src/lib/portalRegistry.ts

/**
 * Safely normalizes a role string from the database/auth token
 */
export function normalizeRole(role: string | null | undefined): string {
  if (!role) return 'guest';
  // Convert "SUPER_ADMIN" or "Super Admin" to "super-admin"
  return role.toLowerCase().trim().replace(/_/g, '-').replace(/\s+/g, '-');
}

/**
 * Returns the correct default landing page path based on the user's role
 */
export function defaultPortalForRole(role: string | null | undefined): string {
  const normalized = normalizeRole(role);
  
  switch (normalized) {
    // 👑 Management & Admins
    case 'admin':
    case 'superadmin':
    case 'super-admin':
    case 'management':
    case 'director':
      return '/dashboard';
      
    // 🏢 Branch & Regional Nodes
    case 'branch-manager':
    case 'branch-staff':
    case 'branch-admin':
      return '/branch-office';
      
    // 📦 Operations & Fleet
    case 'supervisor':
    case 'fleet-manager':
      return '/supervisor';
    case 'rider':
    case 'driver':
      return '/rider-app'; // Directs to their mobile sandbox
    case 'warehouse':
    case 'warehouse-staff':
    case 'sorter':
      return '/warehouse';
      
    // 💼 Commercial & Support
    case 'merchant':
    case 'vip-customer':
      return '/merchant-portal';
    case 'cs':
    case 'customer-service':
    case 'support':
      return '/cs-command';
      
    // 💰 Finance & Data
    case 'finance':
    case 'accountant':
      return '/finance-portal';
    case 'data-entry':
    case 'encoder':
      return '/data-entry';
      
    // 🛡️ Fallback for undefined/new roles
    default:
      return '/ops-workflow'; 
  }
}