-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.complaint_messages CASCADE;
DROP TABLE IF EXISTS public.complaints CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.leave_requests CASCADE;
DROP TABLE IF EXISTS public.cod_collections CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.qr_codes CASCADE;

DROP TYPE IF EXISTS public.task_status CASCADE;
DROP TYPE IF EXISTS public.task_priority CASCADE;
DROP TYPE IF EXISTS public.complaint_status CASCADE;
DROP TYPE IF EXISTS public.complaint_category CASCADE;
DROP TYPE IF EXISTS public.leave_type CASCADE;
DROP TYPE IF EXISTS public.leave_status CASCADE;
DROP TYPE IF EXISTS public.invoice_status CASCADE;

-- Create enums
CREATE TYPE public.task_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TYPE public.task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

CREATE TYPE public.complaint_status AS ENUM (
  'open',
  'in_progress',
  'resolved',
  'closed',
  'escalated'
);

CREATE TYPE public.complaint_category AS ENUM (
  'delivery_delay',
  'damaged_package',
  'lost_package',
  'wrong_address',
  'poor_service',
  'payment_issue',
  'other'
);

CREATE TYPE public.leave_type AS ENUM (
  'annual',
  'sick',
  'emergency',
  'unpaid',
  'maternity',
  'paternity'
);

CREATE TYPE public.leave_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

CREATE TYPE public.invoice_status AS ENUM (
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled'
);

-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.user_profiles(id),
  assigned_by UUID REFERENCES public.user_profiles(id),
  status public.task_status DEFAULT 'pending',
  priority public.task_priority DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  related_shipment_id UUID REFERENCES public.shipments(id),
  related_delivery_id UUID REFERENCES public.deliveries(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Complaints table
CREATE TABLE public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  shipment_id UUID REFERENCES public.shipments(id),
  customer_id UUID REFERENCES public.user_profiles(id),
  category public.complaint_category NOT NULL,
  status public.complaint_status DEFAULT 'open',
  priority public.task_priority DEFAULT 'medium',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES public.user_profiles(id),
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Complaint messages (for chat)
CREATE TABLE public.complaint_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID REFERENCES public.complaints(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  message TEXT NOT NULL,
  attachments TEXT[],
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Attendance table
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status TEXT DEFAULT 'present',
  location JSONB,
  notes TEXT,
  approved_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Leave requests table
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  leave_type public.leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status public.leave_status DEFAULT 'pending',
  approved_by UUID REFERENCES public.user_profiles(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- COD Collections table
CREATE TABLE public.cod_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) NOT NULL,
  shipment_id UUID REFERENCES public.shipments(id) NOT NULL,
  driver_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  deposited_at TIMESTAMPTZ,
  deposit_reference TEXT,
  status public.payment_status DEFAULT 'collected',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  merchant_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax DECIMAL(10, 2) DEFAULT 0,
  discount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  status public.invoice_status DEFAULT 'draft',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  line_items JSONB NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- QR Codes table
CREATE TABLE public.qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  data JSONB,
  is_active BOOLEAN DEFAULT true,
  scanned_count INTEGER DEFAULT 0,
  last_scanned_at TIMESTAMPTZ,
  last_scanned_by UUID REFERENCES public.user_profiles(id),
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_priority ON public.tasks(priority);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);

CREATE INDEX idx_complaints_customer ON public.complaints(customer_id);
CREATE INDEX idx_complaints_shipment ON public.complaints(shipment_id);
CREATE INDEX idx_complaints_status ON public.complaints(status);
CREATE INDEX idx_complaints_assigned_to ON public.complaints(assigned_to);

CREATE INDEX idx_complaint_messages_complaint ON public.complaint_messages(complaint_id);
CREATE INDEX idx_complaint_messages_sender ON public.complaint_messages(sender_id);

CREATE INDEX idx_attendance_employee ON public.attendance(employee_id);
CREATE INDEX idx_attendance_date ON public.attendance(date DESC);

CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests(status);

CREATE INDEX idx_cod_collections_driver ON public.cod_collections(driver_id);
CREATE INDEX idx_cod_collections_status ON public.cod_collections(status);
CREATE INDEX idx_cod_collections_collected_at ON public.cod_collections(collected_at DESC);

CREATE INDEX idx_invoices_merchant ON public.invoices(merchant_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);

CREATE INDEX idx_qr_codes_code ON public.qr_codes(code);
CREATE INDEX idx_qr_codes_entity ON public.qr_codes(entity_id, entity_type);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Tasks: users see their own tasks, supervisors see all
CREATE POLICY "Users can view their tasks"
  ON public.tasks FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR assigned_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'supervisor', 'branch-office')
    )
  );

CREATE POLICY "Supervisors can manage tasks"
  ON public.tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'supervisor', 'branch-office')
    )
  );

-- Complaints: customers see their own, staff see all
CREATE POLICY "Customers can view their complaints"
  ON public.complaints FOR SELECT
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'customer-service', 'branch-office')
    )
  );

CREATE POLICY "Customers can create complaints"
  ON public.complaints FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Staff can manage complaints"
  ON public.complaints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'customer-service', 'branch-office')
    )
  );

-- Complaint messages: follow complaint permissions
CREATE POLICY "Users can view complaint messages"
  ON public.complaint_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = auth.uid()
          AND role IN ('super-admin', 'admin', 'customer-service', 'branch-office')
        )
      )
    )
  );

CREATE POLICY "Users can send complaint messages"
  ON public.complaint_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.complaints c
      WHERE c.id = complaint_id
      AND (
        c.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = auth.uid()
          AND role IN ('super-admin', 'admin', 'customer-service', 'branch-office')
        )
      )
    )
  );

-- Attendance: employees see their own, HR sees all
CREATE POLICY "Employees can view their attendance"
  ON public.attendance FOR SELECT
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'hr', 'branch-office')
    )
  );

CREATE POLICY "Employees can create attendance"
  ON public.attendance FOR INSERT
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "HR can manage attendance"
  ON public.attendance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'hr', 'branch-office')
    )
  );

-- Leave requests: employees see their own, HR sees all
CREATE POLICY "Employees can view their leave requests"
  ON public.leave_requests FOR SELECT
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'hr', 'branch-office')
    )
  );

CREATE POLICY "Employees can create leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "HR can manage leave requests"
  ON public.leave_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'hr', 'branch-office')
    )
  );

-- COD Collections: drivers see their own, finance sees all
CREATE POLICY "Drivers can view their COD collections"
  ON public.cod_collections FOR SELECT
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'finance', 'branch-office')
    )
  );

CREATE POLICY "Drivers can create COD collections"
  ON public.cod_collections FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Finance can manage COD collections"
  ON public.cod_collections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'finance', 'branch-office')
    )
  );

-- Invoices: merchants see their own, finance sees all
CREATE POLICY "Merchants can view their invoices"
  ON public.invoices FOR SELECT
  USING (
    merchant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'finance', 'branch-office')
    )
  );

CREATE POLICY "Finance can manage invoices"
  ON public.invoices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'finance', 'branch-office')
    )
  );

-- QR Codes: authenticated users can view, staff can manage
CREATE POLICY "Authenticated users can view QR codes"
  ON public.qr_codes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Staff can manage QR codes"
  ON public.qr_codes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role NOT IN ('merchant', 'customer')
    )
  );

-- Add triggers for updated_at
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_complaints_updated_at BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cod_collections_updated_at BEFORE UPDATE ON public.cod_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_qr_codes_updated_at BEFORE UPDATE ON public.qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();