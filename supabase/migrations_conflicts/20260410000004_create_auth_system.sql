-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing types if they exist
DROP TYPE IF EXISTS employee_role CASCADE;

-- Create enum types for roles
CREATE TYPE employee_role AS ENUM (
  'super-admin',
  'admin',
  'supervisor',
  'wayplan-manager',
  'driver',
  'rider',
  'warehouse-staff',
  'customer-service',
  'data-entry',
  'marketing',
  'hr-admin',
  'finance',
  'merchant',
  'customer'
);

-- Create branches table first (no dependencies)
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Myanmar',
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role employee_role NOT NULL DEFAULT 'customer',
  branch_id UUID REFERENCES public.branches(id),
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  preferences JSONB DEFAULT '{
    "language": "en",
    "theme": "auto",
    "notifications": {
      "email": true,
      "push": true,
      "sms": false
    }
  }'::jsonb,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role employee_role NOT NULL,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, permission)
);

-- Insert default permissions for each role
INSERT INTO public.role_permissions (role, permission) VALUES
  -- Super Admin - all permissions
  ('super-admin', 'view:all'),
  ('super-admin', 'create:all'),
  ('super-admin', 'update:all'),
  ('super-admin', 'delete:all'),
  ('super-admin', 'manage:users'),
  ('super-admin', 'manage:settings'),
  
  -- Admin
  ('admin', 'view:dashboard'),
  ('admin', 'view:deliveries'),
  ('admin', 'create:deliveries'),
  ('admin', 'update:deliveries'),
  ('admin', 'view:analytics'),
  ('admin', 'manage:warehouse'),
  
  -- Supervisor
  ('supervisor', 'view:dashboard'),
  ('supervisor', 'view:deliveries'),
  ('supervisor', 'view:team'),
  ('supervisor', 'view:analytics'),
  
  -- Wayplan Manager
  ('wayplan-manager', 'view:dashboard'),
  ('wayplan-manager', 'view:routes'),
  ('wayplan-manager', 'create:routes'),
  ('wayplan-manager', 'update:routes'),
  ('wayplan-manager', 'optimize:routes'),
  
  -- Driver/Rider
  ('driver', 'view:deliveries'),
  ('driver', 'update:delivery-status'),
  ('driver', 'scan:qr'),
  ('rider', 'view:deliveries'),
  ('rider', 'update:delivery-status'),
  ('rider', 'scan:qr'),
  
  -- Warehouse Staff
  ('warehouse-staff', 'view:inventory'),
  ('warehouse-staff', 'update:inventory'),
  ('warehouse-staff', 'scan:qr'),
  ('warehouse-staff', 'manage:inbound'),
  ('warehouse-staff', 'manage:outbound'),
  
  -- Customer Service
  ('customer-service', 'view:deliveries'),
  ('customer-service', 'create:deliveries'),
  ('customer-service', 'view:customers'),
  ('customer-service', 'handle:complaints'),
  
  -- Data Entry
  ('data-entry', 'create:deliveries'),
  ('data-entry', 'bulk:upload'),
  ('data-entry', 'update:deliveries'),
  
  -- Marketing
  ('marketing', 'view:dashboard'),
  ('marketing', 'view:analytics'),
  ('marketing', 'view:customers'),
  ('marketing', 'create:campaigns'),
  
  -- HR Admin
  ('hr-admin', 'view:employees'),
  ('hr-admin', 'create:employees'),
  ('hr-admin', 'update:employees'),
  ('hr-admin', 'view:attendance'),
  ('hr-admin', 'manage:leave'),
  
  -- Finance
  ('finance', 'view:transactions'),
  ('finance', 'view:analytics'),
  ('finance', 'manage:cod'),
  ('finance', 'create:invoices'),
  
  -- Merchant
  ('merchant', 'view:shipments'),
  ('merchant', 'create:shipments'),
  ('merchant', 'view:reports'),
  
  -- Customer
  ('customer', 'view:orders'),
  ('customer', 'track:shipments'),
  ('customer', 'create:support-ticket')
ON CONFLICT (role, permission) DO NOTHING;

-- Insert default branches
INSERT INTO public.branches (name, code, city, country) VALUES
  ('Yangon Main Branch', 'YGN-001', 'Yangon', 'Myanmar'),
  ('Mandalay Branch', 'MDY-001', 'Mandalay', 'Myanmar')
ON CONFLICT (code) DO NOTHING;

-- Create function to handle user profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::employee_role, 'customer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Super admins can view all profiles"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'super-admin'
    )
  );

DROP POLICY IF EXISTS "Super admins and HR can manage profiles" ON public.user_profiles;
CREATE POLICY "Super admins and HR can manage profiles"
  ON public.user_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('super-admin', 'hr-admin')
    )
  );

-- RLS Policies for branches
DROP POLICY IF EXISTS "Authenticated users can view branches" ON public.branches;
CREATE POLICY "Authenticated users can view branches"
  ON public.branches FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
CREATE POLICY "Admins can manage branches"
  ON public.branches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role IN ('super-admin', 'admin')
    )
  );

-- RLS Policies for role_permissions
DROP POLICY IF EXISTS "Authenticated users can view permissions" ON public.role_permissions;
CREATE POLICY "Authenticated users can view permissions"
  ON public.role_permissions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_branch ON public.user_profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_branches_code ON public.branches(code);