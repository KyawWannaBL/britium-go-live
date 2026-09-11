-- 1. Ensure the base type exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_role') THEN
        CREATE TYPE employee_role AS ENUM ('admin', 'operator', 'driver');
    END IF;
END $$;

-- 2. Add all missing roles required for your RLS policies
-- Note: These must be separate statements
ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'branch-office';
ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'wayplan';
ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'super-admin';
ALTER TYPE employee_role ADD VALUE IF NOT EXISTS 'SYS';