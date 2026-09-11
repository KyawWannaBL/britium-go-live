-- Drop the old function signature
DROP FUNCTION IF EXISTS public.be_warehouse_intake_action(TEXT);

-- Create the updated function with exception handling
CREATE OR REPLACE FUNCTION public.be_warehouse_intake_action(
  tracking_no TEXT, 
  override_status TEXT DEFAULT 'warehouse_received',
  reason_code TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  parcel_record RECORD;
BEGIN
  SELECT * INTO parcel_record FROM public.parcels WHERE tracking_number = tracking_no;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'INVALID: Tracking number not found.');
  END IF;

  IF parcel_record.status = override_status THEN
    RETURN json_build_object('success', false, 'message', 'DUPLICATE: Parcel already marked as ' || override_status);
  END IF;

  -- Update master record
  UPDATE public.parcels 
  SET status = override_status, 
      updated_at = NOW() 
  WHERE tracking_number = tracking_no;

  -- Write to audit log with the reason code if provided
  -- (Requires adding a reason_code column to parcel_scan_history if not already present)
  INSERT INTO public.parcel_scan_history (tracking_number, scan_status)
  VALUES (tracking_no, override_status || COALESCE(' - ' || reason_code, ''));

  RETURN json_build_object('success', true, 'message', 'SUCCESS: Parcel flagged as ' || override_status);
END;
$$;
