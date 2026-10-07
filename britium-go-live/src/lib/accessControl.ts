import { defaultPortalForRole, normalizeRole } from '@/lib/portalRegistry';

const ELEVATED_ROLES = new Set(['super-admin', 'superadmin', 'app-owner', 'sys', 'admin']);

const rule = (...roles: string[]) => new Set(roles.map(normalizeRole));

const PATH_ROLES: Array<[string, Set<string>]> = [
  ['/dashboard', rule('management','director','finance','finance-user','accountant','operation-manager','operations','operations-admin','supervisor','warehouse','warehouse-staff','sorter','dispatch','wayplan-manager','customer-service','cs','support','data-entry','encoder','marketing','business-development','biz-dev','hr-admin','branch-office','branch-manager','branch-staff','branch-admin')],
  ['/admin-hr', rule('hr-admin')],
  ['/audit-logs', rule('management', 'director')],
  ['/settings', rule('management', 'director')],
  ['/go-live-control', rule('management', 'director', 'operations-admin')],
  ['/go-live-readiness', rule('management', 'director', 'operations-admin')],
  ['/analytics', rule('management', 'director', 'operations', 'operations-admin', 'finance', 'supervisor')],
  ['/reporting', rule('management', 'director', 'operations', 'operations-admin', 'finance', 'supervisor')],

  ['/finance/data-entry-review', rule('finance', 'finance-user', 'accountant')],
  ['/finance/merchant-settlement', rule('finance', 'finance-user', 'accountant', 'finance-creator', 'finance-reviewer', 'finance-approver', 'payment-officer', 'finance-admin', 'finance-manager', 'accounts')],
  ['/finance/accounting', rule('finance', 'finance-user', 'accountant', 'management', 'director')],
  ['/finance/accounting-master', rule('finance', 'finance-user', 'accountant', 'management', 'director')],
  ['/finance', rule('finance', 'finance-user', 'accountant')],
  ['/accounts', rule('finance', 'finance-user', 'accountant')],
  ['/invoice-studio', rule('finance', 'finance-user', 'accountant')],
  ['/cod-settlement', rule('finance', 'finance-user', 'accountant')],
  ['/rider-settlement', rule('finance', 'finance-user', 'accountant')],
  ['/workforce-commission', rule('finance', 'finance-user', 'accountant')],

  ['/data-entry', rule('data-entry', 'encoder', 'supervisor', 'operations', 'operations-admin')],
  ['/waybill-studio', rule('data-entry', 'encoder', 'supervisor', 'operations', 'operations-admin', 'warehouse')],
  ['/waybill-invoice', rule('data-entry', 'encoder', 'supervisor', 'operations', 'operations-admin', 'warehouse', 'finance')],
  ['/doc-print', rule('data-entry', 'encoder', 'supervisor', 'operations', 'operations-admin', 'warehouse')],
  ['/templates', rule('data-entry', 'encoder', 'supervisor', 'operations', 'operations-admin', 'warehouse')],

  // Pickup Request is an operational Customer Service responsibility. Keep write access
  // limited by Supabase RLS; this rule only makes the screen reachable.
  ['/pickup-form', rule('customer-service', 'cs', 'support', 'data-entry', 'encoder', 'supervisor', 'operations', 'operations-admin', 'branch-office', 'branch-manager')],

  ['/warehouse', rule('warehouse', 'warehouse-staff', 'sorter', 'supervisor', 'operations', 'operations-admin', 'finance', 'finance-user', 'accountant')],
  ['/wayplan-view', rule('warehouse', 'warehouse-staff', 'sorter', 'supervisor', 'operations', 'operations-admin')],
  ['/rto-report', rule('warehouse', 'warehouse-staff', 'sorter', 'supervisor', 'operations', 'operations-admin', 'customer-service', 'cs', 'support')],
  ['/proof-gallery', rule('customer-service', 'cs', 'support', 'warehouse', 'warehouse-staff', 'supervisor', 'operations', 'operations-admin')],
  ['/exceptions', rule('customer-service', 'cs', 'support', 'warehouse', 'warehouse-staff', 'dispatch', 'supervisor', 'operations', 'operations-admin')],

  ['/ops-workflow', rule('dispatch', 'wayplan-manager', 'supervisor', 'operations', 'operations-admin', 'management', 'director')],
  ['/wayplan', rule('dispatch', 'wayplan-manager', 'supervisor', 'operations', 'operations-admin', 'management', 'director')],
  ['/dispatch-command', rule('dispatch', 'wayplan-manager', 'supervisor', 'operations', 'operations-admin', 'management', 'director')],
  ['/supervisor', rule('supervisor', 'operations', 'operations-admin')],

  ['/rider-app', rule('rider', 'driver', 'helper')],
  ['/rider', rule('rider', 'driver', 'helper', 'supervisor', 'operations', 'operations-admin')],
  ['/driver', rule('driver', 'supervisor', 'operations', 'operations-admin')],

  ['/branch', rule('branch-office', 'branch-manager', 'branch-staff', 'branch-admin')],
  ['/cs-', rule('customer-service', 'cs', 'support')],
  ['/merchant-portal', rule('merchant', 'vip-customer')],
  ['/customer-portal', rule('customer')],
  ['/marketing', rule('marketing', 'management', 'director')],
  ['/biz-dev', rule('business-development', 'biz-dev', 'management', 'director')],
  ['/tariff', rule('finance', 'finance-user', 'accountant', 'data-entry', 'encoder', 'business-development', 'biz-dev', 'management', 'director')],
];

export function isElevatedRole(rawRole: string | null | undefined): boolean {
  return ELEVATED_ROLES.has(normalizeRole(rawRole));
}

export function canRoleOpenPath(rawRole: string | null | undefined, path: string): boolean {
  const role = normalizeRole(rawRole);
  if (ELEVATED_ROLES.has(role)) return true;
  if (path === '/profile') return role !== 'guest';

  const ruleForPath = PATH_ROLES.find(([prefix]) => path.startsWith(prefix));
  if (ruleForPath) return ruleForPath[1].has(role);

  return path === defaultPortalForRole(role);
}

export function filterAuthorizedPaths<T extends { path: string }>(rawRole: string | null | undefined, links: T[]): T[] {
  return links.filter((link) => canRoleOpenPath(rawRole, link.path));
}
