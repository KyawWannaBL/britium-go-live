
-- Enable RLS on tables that may not have it yet, and add read policies for authenticated users

-- WAREHOUSES: all authenticated users can view
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouses_read_auth" ON public.warehouses;
CREATE POLICY "warehouses_read_auth" ON public.warehouses
  FOR SELECT TO authenticated USING (true);

-- VEHICLES: all authenticated users can view
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicles_read_auth" ON public.vehicles;
CREATE POLICY "vehicles_read_auth" ON public.vehicles
  FOR SELECT TO authenticated USING (true);

-- SHIPMENTS: all authenticated users can view (staff need to see all)
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipments_read_auth" ON public.shipments;
CREATE POLICY "shipments_read_auth" ON public.shipments
  FOR SELECT TO authenticated USING (true);

-- Allow insert for authenticated users (data entry)
DROP POLICY IF EXISTS "shipments_insert_auth" ON public.shipments;
CREATE POLICY "shipments_insert_auth" ON public.shipments
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow update for authenticated users (status changes)
DROP POLICY IF EXISTS "shipments_update_auth" ON public.shipments;
CREATE POLICY "shipments_update_auth" ON public.shipments
  FOR UPDATE TO authenticated USING (true);

-- MANIFESTS
ALTER TABLE public.manifests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manifests_read_auth" ON public.manifests;
CREATE POLICY "manifests_read_auth" ON public.manifests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "manifests_insert_auth" ON public.manifests;
CREATE POLICY "manifests_insert_auth" ON public.manifests
  FOR INSERT TO authenticated WITH CHECK (true);

-- COMPLAINTS
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "complaints_read_auth" ON public.complaints;
CREATE POLICY "complaints_read_auth" ON public.complaints
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "complaints_update_auth" ON public.complaints;
CREATE POLICY "complaints_update_auth" ON public.complaints
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "complaints_insert_auth" ON public.complaints;
CREATE POLICY "complaints_insert_auth" ON public.complaints
  FOR INSERT TO authenticated WITH CHECK (true);

-- ATTENDANCE
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance_read_auth" ON public.attendance;
CREATE POLICY "attendance_read_auth" ON public.attendance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "attendance_insert_auth" ON public.attendance;
CREATE POLICY "attendance_insert_auth" ON public.attendance
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "attendance_update_auth" ON public.attendance;
CREATE POLICY "attendance_update_auth" ON public.attendance
  FOR UPDATE TO authenticated USING (true);

-- LEAVE REQUESTS
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leave_requests_read_auth" ON public.leave_requests;
CREATE POLICY "leave_requests_read_auth" ON public.leave_requests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "leave_requests_insert_auth" ON public.leave_requests;
CREATE POLICY "leave_requests_insert_auth" ON public.leave_requests
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "leave_requests_update_auth" ON public.leave_requests;
CREATE POLICY "leave_requests_update_auth" ON public.leave_requests
  FOR UPDATE TO authenticated USING (true);

-- COD COLLECTIONS
ALTER TABLE public.cod_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cod_collections_read_auth" ON public.cod_collections;
CREATE POLICY "cod_collections_read_auth" ON public.cod_collections
  FOR SELECT TO authenticated USING (true);

-- INVOICES
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_read_auth" ON public.invoices;
CREATE POLICY "invoices_read_auth" ON public.invoices
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "invoices_update_auth" ON public.invoices;
CREATE POLICY "invoices_update_auth" ON public.invoices
  FOR UPDATE TO authenticated USING (true);

-- USER PROFILES: authenticated users can read all profiles (for HR)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_profiles_read_auth" ON public.user_profiles;
CREATE POLICY "user_profiles_read_auth" ON public.user_profiles
  FOR SELECT TO authenticated USING (true);
