-- ============================================================
-- BRITIUM EXPRESS - CORE TABLES MIGRATION
-- ============================================================

-- -------------------------------------------------------
-- 1. CLEANUP (Drop existing objects if they exist)
-- -------------------------------------------------------
DROP TABLE IF EXISTS public.delivery_history CASCADE;
DROP TABLE IF EXISTS public.deliveries CASCADE;
DROP TABLE IF EXISTS public.manifest_items CASCADE;
DROP TABLE IF EXISTS public.manifests CASCADE;
DROP TABLE IF EXISTS public.shipments CASCADE;
DROP TABLE IF EXISTS public.branches CASCADE;
DROP TABLE IF EXISTS public.warehouses CASCADE;
DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP TABLE IF EXISTS public.routes CASCADE;
DROP TYPE IF EXISTS public.shipment_status CASCADE;
DROP TYPE IF EXISTS public.delivery_status CASCADE;
DROP TYPE IF EXISTS public.service_type CASCADE;
DROP TYPE IF EXISTS public.payment_method CASCADE;
DROP TYPE IF EXISTS public.payment_status CASCADE;
DROP TYPE IF EXISTS public.warehouse_type CASCADE;
DROP TYPE IF EXISTS public.vehicle_type CASCADE;
DROP TYPE IF EXISTS public.manifest_status CASCADE;

CREATE TYPE public.shipment_status AS ENUM (
  'draft', 'pending', 'in_transit', 'out_for_delivery', 
  'delivered', 'failed', 'returned', 'cancelled'
);

CREATE TYPE public.delivery_status AS ENUM (
  'pending', 'assigned', 'picked_up', 'in_transit', 
  'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled'
);

CREATE TYPE public.service_type AS ENUM (
  'standard', 'express', 'same_day', 'next_day', 'economy'
);

CREATE TYPE public.payment_method AS ENUM (
  'cod', 'prepaid', 'credit', 'bank_transfer'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending', 'collected', 'deposited', 'verified', 'failed'
);

CREATE TYPE public.warehouse_type AS ENUM (
  'hub', 'branch', 'depot', 'transit', 'outpost'
);

CREATE TYPE public.vehicle_type AS ENUM (
  'bike', 'van', 'truck', 'car'
);

CREATE TYPE public.manifest_status AS ENUM (
  'draft', 'assigned', 'in_progress', 'completed', 'cancelled'
);

-- -------------------------------------------------------
-- 3. CORE TABLES
-- -------------------------------------------------------

-- Warehouses
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type public.warehouse_type NOT NULL,
  address JSONB NOT NULL,
  capacity JSONB,
  operating_hours JSONB,
  contact_person JSONB,
  status TEXT DEFAULT 'operational',
  facilities TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Branches
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id),
  address JSONB NOT NULL,
  manager_id UUID REFERENCES public.user_profiles(id),
  contact JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vehicles
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number TEXT UNIQUE NOT NULL,
  type public.vehicle_type NOT NULL,
  capacity JSONB,
  current_driver_id UUID REFERENCES public.user_profiles(id),
  warehouse_id UUID REFERENCES public.warehouses(id),
  status TEXT DEFAULT 'available',
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Shipments
CREATE TABLE public.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  awb TEXT UNIQUE NOT NULL,
  merchant_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  service_type public.service_type NOT NULL,
  status public.shipment_status DEFAULT 'pending',
  
  -- Entity Info
  sender JSONB NOT NULL,
  recipient JSONB NOT NULL,
  package_details JSONB NOT NULL,
  
  -- Financials
  declared_value DECIMAL(10, 2),
  cod_amount DECIMAL(10, 2),
  shipping_fee DECIMAL(10, 2),
  payment_method public.payment_method,
  payment_status public.payment_status DEFAULT 'pending',
  
  -- Routing
  origin_warehouse_id UUID REFERENCES public.warehouses(id),
  destination_warehouse_id UUID REFERENCES public.warehouses(id),
  current_location JSONB,
  
  -- Timestamps
  pickup_date TIMESTAMPTZ,
  expected_delivery_date TIMESTAMPTZ,
  actual_delivery_date TIMESTAMPTZ,
  
  -- Metadata
  special_instructions TEXT,
  proof_of_delivery JSONB,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Manifests
CREATE TABLE public.manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_number TEXT UNIQUE NOT NULL,
  driver_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id),
  warehouse_id UUID REFERENCES public.warehouses(id) NOT NULL,
  status public.manifest_status DEFAULT 'draft',
  
  -- Route Info
  route_data JSONB,
  planned_route JSONB,
  actual_route JSONB,
  
  -- Timing
  scheduled_date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  
  -- Aggregates
  total_shipments INTEGER DEFAULT 0,
  completed_shipments INTEGER DEFAULT 0,
  failed_shipments INTEGER DEFAULT 0,
  total_distance DECIMAL(10, 2),
  
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Manifest Items
CREATE TABLE public.manifest_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID REFERENCES public.manifests(id) ON DELETE CASCADE NOT NULL,
  shipment_id UUID REFERENCES public.shipments(id) NOT NULL,
  sequence_number INTEGER NOT NULL,
  status public.delivery_status DEFAULT 'pending',
  estimated_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(manifest_id, shipment_id)
);

-- Deliveries
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES public.shipments(id) NOT NULL,
  manifest_id UUID REFERENCES public.manifests(id),
  driver_id UUID REFERENCES public.user_profiles(id),
  status public.delivery_status DEFAULT 'pending',
  
  -- Attempt State
  attempt_number INTEGER DEFAULT 1,
  max_attempts INTEGER DEFAULT 3,
  
  -- Timing State
  assigned_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Resolution State
  failure_reason TEXT,
  failure_category TEXT,
  ndr_case JSONB,
  
  -- Spatial State
  current_location JSONB,
  delivery_location JSONB,
  
  -- Verification
  signature JSONB,
  photos TEXT[],
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Delivery History
CREATE TABLE public.delivery_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE CASCADE NOT NULL,
  shipment_id UUID REFERENCES public.shipments(id) NOT NULL,
  status public.delivery_status NOT NULL,
  location JSONB,
  notes TEXT,
  changed_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Routes
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id) NOT NULL,
  route_data JSONB NOT NULL,
  zones TEXT[],
  estimated_duration INTEGER,
  estimated_distance DECIMAL(10, 2),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- -------------------------------------------------------
-- 4. INDEXES
-- -------------------------------------------------------
CREATE INDEX idx_shipments_merchant ON public.shipments(merchant_id);
CREATE INDEX idx_shipments_status ON public.shipments(status);
CREATE INDEX idx_shipments_awb ON public.shipments(awb);
CREATE INDEX idx_shipments_created_at ON public.shipments(created_at DESC);

CREATE INDEX idx_deliveries_shipment ON public.deliveries(shipment_id);
CREATE INDEX idx_deliveries_driver ON public.deliveries(driver_id);
CREATE INDEX idx_deliveries_status ON public.deliveries(status);
CREATE INDEX idx_deliveries_manifest ON public.deliveries(manifest_id);

CREATE INDEX idx_manifests_driver ON public.manifests(driver_id);
CREATE INDEX idx_manifests_warehouse ON public.manifests(warehouse_id);
CREATE INDEX idx_manifests_status ON public.manifests(status);
CREATE INDEX idx_manifests_scheduled_date ON public.manifests(scheduled_date);

CREATE INDEX idx_manifest_items_manifest ON public.manifest_items(manifest_id);
CREATE INDEX idx_manifest_items_shipment ON public.manifest_items(shipment_id);

CREATE INDEX idx_delivery_history_delivery ON public.delivery_history(delivery_id);
CREATE INDEX idx_delivery_history_shipment ON public.delivery_history(shipment_id);

-- -------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- -------------------------------------------------------
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manifest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- Warehouses Policies
CREATE POLICY "Authenticated users can view warehouses"
  ON public.warehouses FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage warehouses"
  ON public.warehouses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin')
    )
  );

-- Branches Policies
CREATE POLICY "Authenticated users can view branches"
  ON public.branches FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage branches"
  ON public.branches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'branch-office')
    )
  );

-- Vehicles Policies
CREATE POLICY "Authenticated users can view vehicles"
  ON public.vehicles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Supervisors can manage vehicles"
  ON public.vehicles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'supervisor', 'branch-office')
    )
  );

-- Shipments Policies
CREATE POLICY "Merchants can view their own shipments"
  ON public.shipments FOR SELECT
  USING (
    merchant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role NOT IN ('merchant', 'customer')
    )
  );

CREATE POLICY "Merchants can create shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (
    merchant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'data-entry', 'branch-office')
    )
  );

CREATE POLICY "Staff can update shipments"
  ON public.shipments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role NOT IN ('merchant', 'customer')
    )
  );

-- Manifests Policies
CREATE POLICY "Drivers can view their manifests"
  ON public.manifests FOR SELECT
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'supervisor', 'wayplan', 'branch-office')
    )
  );

CREATE POLICY "Supervisors can manage manifests"
  ON public.manifests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'supervisor', 'wayplan', 'branch-office')
    )
  );

-- Manifest Items Policies
CREATE POLICY "Users can view manifest items"
  ON public.manifest_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manifests m
      WHERE m.id = manifest_id
      AND (
        m.driver_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = auth.uid()
          AND role IN ('super-admin', 'admin', 'supervisor', 'wayplan', 'branch-office')
        )
      )
    )
  );

CREATE POLICY "Supervisors can manage manifest items"
  ON public.manifest_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'supervisor', 'wayplan', 'branch-office')
    )
  );

-- Deliveries Policies
CREATE POLICY "Drivers can view their deliveries"
  ON public.deliveries FOR SELECT
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role NOT IN ('merchant', 'customer')
    )
  );

CREATE POLICY "Drivers can update their deliveries"
  ON public.deliveries FOR UPDATE
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'supervisor', 'branch-office')
    )
  );

CREATE POLICY "Staff can create deliveries"
  ON public.deliveries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role NOT IN ('merchant', 'customer')
    )
  );

-- Delivery History Policies
CREATE POLICY "Authorized users can view delivery history"
  ON public.delivery_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = delivery_id
      AND (
        d.driver_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = auth.uid()
          AND role NOT IN ('merchant', 'customer')
        )
      )
    )
  );

CREATE POLICY "System can insert delivery history"
  ON public.delivery_history FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Routes Policies
CREATE POLICY "Authenticated users can view routes"
  ON public.routes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Supervisors can manage routes"
  ON public.routes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'supervisor', 'wayplan', 'branch-office')
    )
  );

-- -------------------------------------------------------
-- 6. TRIGGERS & FUNCTIONS
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_manifests_updated_at BEFORE UPDATE ON public.manifests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();