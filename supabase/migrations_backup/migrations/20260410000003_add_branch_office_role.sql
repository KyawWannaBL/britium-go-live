-- Add branch-office role to the enum
ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'branch-office';

-- Insert permissions for branch-office role
INSERT INTO public.role_permissions (role, permission) VALUES
  ('branch-office', 'view:dashboard'),
  ('branch-office', 'view:deliveries'),
  ('branch-office', 'create:deliveries'),
  ('branch-office', 'update:deliveries'),
  ('branch-office', 'view:team'),
  ('branch-office', 'view:routes'),
  ('branch-office', 'create:routes'),
  ('branch-office', 'update:routes'),
  ('branch-office', 'view:inventory'),
  ('branch-office', 'update:inventory'),
  ('branch-office', 'scan:qr'),
  ('branch-office', 'manage:inbound'),
  ('branch-office', 'manage:outbound'),
  ('branch-office', 'view:customers'),
  ('branch-office', 'handle:complaints'),
  ('branch-office', 'bulk:upload'),
  ('branch-office', 'view:analytics'),
  ('branch-office', 'view:transactions'),
  ('branch-office', 'manage:cod'),
  ('branch-office', 'create:invoices'),
  ('branch-office', 'view:attendance'),
  ('branch-office', 'view:employees')
ON CONFLICT (role, permission) DO NOTHING;

-- Create a comment to document the role
COMMENT ON TYPE employee_role IS 'Employee roles: super-admin (full access), admin (system-wide operations), branch-office (branch-level operations without admin rights), supervisor, wayplan-manager, driver, rider, warehouse-staff, customer-service, data-entry, marketing, hr-admin, finance, merchant, customer';