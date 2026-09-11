ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'super-admin';
ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'warehouse-staff';
ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'customer-service';
ALTER TYPE public.employee_role ADD VALUE IF NOT EXISTS 'branch-office';