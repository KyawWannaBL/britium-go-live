// @ts-nocheck
export type Lang = 'en' | 'my';
export const LANG: Record<string, Lang> = { EN: 'en', MY: 'my' };

export function t(key: string, lang: Lang = 'en'): string { return key; }

export const ROUTE_PATHS = {
  DASHBOARD: '/dashboard', RIDER: '/rider',
  RIDER_SETTLEMENT: '/rider-settlement', DRIVER: '/driver', WAREHOUSE: '/warehouse',
  DISPATCH: '/dispatch', DELIVERY_DISPATCH: '/delivery-dispatch',
  DELIVERY_WORKFLOW: '/delivery-workflow', EXCEPTIONS: '/exceptions',
  OPS_COMMAND: '/ops-command', OPS_MANAGER: '/ops-manager',
  EXECUTIVE_OPS: '/executive-ops', FINANCE: '/finance',
  COD_SETTLEMENT: '/cod-settlement', TARIFF: '/tariff', ACCOUNTS: '/accounts',
  INVOICE_STUDIO: '/invoice-studio', WORKFORCE_COMMISSION: '/workforce-commission',
  MERCHANT_PORTAL: '/merchant-portal', CUSTOMER_PORTAL: '/customer-portal',
  CS_PORTAL: '/cs-portal', CS_COMMAND: '/cs-command',
  BRANCH_ADMIN: '/branch-admin', BRANCH_OFFICE: '/branch-office',
  ADMIN_HR: '/admin-hr', WAYPLAN_COMMAND: '/wayplan-command',
  WAYPLAN_ZONE: '/wayplan-zone', WAYBILL_STUDIO: '/waybill-studio',
  DOCUMENT_STUDIO: '/document-studio', PICKUP_FORM: '/pickup-form',
  SUPERVISOR: '/supervisor', SUPERVISOR_PICKUP: '/supervisor-pickup',
  DATA_ENTRY: '/data-entry', MASTER_DATA: '/master-data',
  ANALYTICS: '/analytics', AUDIT_LOGS: '/audit-logs',
  MARKETING: '/marketing', MARKETING_PORTAL: '/marketing-portal',
  BIZ_DEV: '/biz-dev', PROFILE: '/profile', SETTINGS: '/settings',
  LOGIN: '/login', SIGNUP: '/signup', FORGOT_PASSWORD: '/forgot-password',
};

export type UserRole = 'admin'|'supervisor'|'rider'|'driver'|'helper'|'finance'|'cs'|'branch_admin'|'ops_manager'|'executive'|'merchant'|'customer'|'data_entry'|'marketing';

export interface RiderUser { id: string; full_name: string; phone: string; zone: string; is_active: boolean; }
export interface DriverUser { id: string; full_name: string; phone: string; vehicle_id: string; is_active: boolean; }
export interface HelperUser { id: string; full_name: string; phone: string; is_active: boolean; }
