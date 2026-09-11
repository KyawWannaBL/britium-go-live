-- 1. Create a table for parcels if it doesn't exist (adjust columns to match your schema)
CREATE TABLE IF NOT EXISTS public.parcels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create an audit log for all physical scans
CREATE TABLE IF NOT EXISTS public.parcel_scan_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_number TEXT NOT NULL,
    scan_status TEXT NOT NULL,
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. The Intake RPC Function
CREATE OR REPLACE FUNCTION public.be_warehouse_intake_action(tracking_no TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Allows the function to bypass RLS for internal logging
AS $$
DECLARE
  parcel_record RECORD;
BEGIN
  -- Check if the parcel exists
  SELECT * INTO parcel_record FROM public.parcels WHERE tracking_number = tracking_no;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'INVALID: Tracking number not found in system.');
  END IF;

  -- Prevent duplicate intakes if it's already marked as received
  IF parcel_record.status = 'warehouse_received' THEN
    RETURN json_build_object('success', false, 'message', 'DUPLICATE: Parcel already in warehouse.');
  END IF;

  -- Update the master parcel status
  UPDATE public.parcels 
  SET status = 'warehouse_received', 
      updated_at = NOW() 
  WHERE tracking_number = tracking_no;

  -- Write to the immutable audit log
  INSERT INTO public.parcel_scan_history (tracking_number, scan_status)
  VALUES (tracking_no, 'warehouse_received');

  RETURN json_build_object('success', true, 'message', 'SUCCESS: Parcel received.');
END;
$$;
