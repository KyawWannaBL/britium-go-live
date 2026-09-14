-- V35: Customer Service owns Pickup Request management, branch-scoped.
-- Keep Data Entry, Finance, Warehouse, parcels and Waybill authority unchanged.

UPDATE public.be_role_authority_matrix
SET rights = jsonb_set(
      coalesce(rights,'{}'::jsonb),
      '{modules,pickup_request}',
      coalesce(rights #> '{modules,pickup_request}','{}'::jsonb)
        || jsonb_build_object(
             'view',true,
             'create',true,
             'update',true,
             'assign',true,
             'export',true,
             'delete',false
           ),
      true
    ),
    updated_at = now()
WHERE lower(role_id)='customer_service';

UPDATE public.be_employee_territory_assignments a
SET can_read=true,
    can_create=true,
    can_update=true,
    can_delete=false,
    updated_at=now()
WHERE a.active
  AND EXISTS (
    SELECT 1
    FROM public.be_user_account_registry r
    WHERE r.auth_user_id=a.user_id
      AND r.is_active
      AND lower(replace(coalesce(r.role,''),'-','_'))='customer_service'
  );

CREATE OR REPLACE FUNCTION public.be_customer_service_can_manage_pickup_request(
  p_branch_code text,
  p_township text,
  p_action text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_action text := lower(btrim(coalesce(p_action,'read')));
  v_matrix_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT lower(replace(coalesce(r.role,''),'-','_'))
    INTO v_role
    FROM public.be_user_account_registry r
   WHERE r.auth_user_id=v_uid
     AND r.is_active
     AND lower(coalesce(r.status,'active'))='active'
   LIMIT 1;

  IF v_role <> 'customer_service' THEN RETURN false; END IF;
  IF v_action NOT IN ('read','create','update','assign','export') THEN RETURN false; END IF;

  SELECT CASE v_action
           WHEN 'read' THEN coalesce((m.rights #>> '{modules,pickup_request,view}')::boolean,false)
           WHEN 'create' THEN coalesce((m.rights #>> '{modules,pickup_request,create}')::boolean,false)
           WHEN 'update' THEN coalesce((m.rights #>> '{modules,pickup_request,update}')::boolean,false)
           WHEN 'assign' THEN coalesce((m.rights #>> '{modules,pickup_request,assign}')::boolean,false)
           WHEN 'export' THEN coalesce((m.rights #>> '{modules,pickup_request,export}')::boolean,false)
           ELSE false
         END
    INTO v_matrix_allowed
    FROM public.be_role_authority_matrix m
   WHERE lower(m.role_id)='customer_service' AND m.is_active
   LIMIT 1;

  IF NOT coalesce(v_matrix_allowed,false) THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.be_employee_territory_assignments a
     WHERE a.user_id=v_uid
       AND a.active
       AND CASE v_action
             WHEN 'create' THEN a.can_create
             WHEN 'update' THEN a.can_update
             WHEN 'assign' THEN a.can_update
             ELSE a.can_read
           END
       AND (
         a.scope_type='GLOBAL'
         OR (a.scope_type='BRANCH'
             AND nullif(btrim(p_branch_code),'') IS NOT NULL
             AND lower(btrim(a.branch_code))=lower(btrim(p_branch_code)))
         OR (a.scope_type='TOWNSHIP'
             AND public.be_normalize_territory_key(a.township_key)=public.be_normalize_territory_key(p_township))
       )
  );
END;
$$;

DROP POLICY IF EXISTS pickup_requests_employee_territory_insert ON public.be_portal_pickup_requests;
CREATE POLICY pickup_requests_employee_territory_insert
ON public.be_portal_pickup_requests
FOR INSERT
TO authenticated
WITH CHECK (
  public.be_employee_can_access_territory(NULL::uuid,branch_code,coalesce(delivery_township,pickup_township),'create')
  OR public.be_customer_service_can_manage_pickup_request(branch_code,coalesce(delivery_township,pickup_township),'create')
  OR created_by=auth.uid()
);

DROP POLICY IF EXISTS pickup_requests_employee_territory_select ON public.be_portal_pickup_requests;
CREATE POLICY pickup_requests_employee_territory_select
ON public.be_portal_pickup_requests
FOR SELECT
TO authenticated
USING (
  public.be_employee_can_access_territory(NULL::uuid,branch_code,coalesce(delivery_township,pickup_township),'read')
  OR public.be_customer_service_can_manage_pickup_request(branch_code,coalesce(delivery_township,pickup_township),'read')
  OR created_by=auth.uid()
);

DROP POLICY IF EXISTS pickup_requests_employee_territory_update ON public.be_portal_pickup_requests;
CREATE POLICY pickup_requests_employee_territory_update
ON public.be_portal_pickup_requests
FOR UPDATE
TO authenticated
USING (
  public.be_employee_can_access_territory(NULL::uuid,branch_code,coalesce(delivery_township,pickup_township),'update')
  OR public.be_customer_service_can_manage_pickup_request(branch_code,coalesce(delivery_township,pickup_township),'update')
)
WITH CHECK (
  public.be_employee_can_access_territory(NULL::uuid,branch_code,coalesce(delivery_township,pickup_township),'update')
  OR public.be_customer_service_can_manage_pickup_request(branch_code,coalesce(delivery_township,pickup_township),'update')
);

CREATE OR REPLACE FUNCTION public.be_assign_pickup_request(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_temp'
AS $$
DECLARE
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id')),'');
  v_role text := lower(replace(coalesce(public.be_current_user_role(),public.be_current_role(),''),'-','_'));
  v_pickup record;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING errcode='42501';
  END IF;
  IF v_pickup_id IS NULL THEN
    RAISE EXCEPTION 'Pickup ID is required.' USING errcode='22023';
  END IF;

  SELECT p.branch_code,coalesce(p.delivery_township,p.pickup_township,p.township) AS township
    INTO v_pickup
    FROM public.be_portal_pickup_requests p
   WHERE p.pickup_id=v_pickup_id OR p.pickup_way_id=v_pickup_id OR p.canonical_pickup_id=v_pickup_id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pickup ID not found: %',v_pickup_id USING errcode='P0002';
  END IF;

  IF v_role='customer_service' AND NOT public.be_customer_service_can_manage_pickup_request(
       v_pickup.branch_code,v_pickup.township,'assign'
     ) THEN
    RAISE EXCEPTION 'Customer Service Pickup Request assignment permission is required for this branch.' USING errcode='42501';
  END IF;

  v_result := public.be_supervisor_assign_job(p_payload);
  RETURN v_result || jsonb_build_object(
    'pickup_request_managed_by',CASE WHEN v_role='customer_service' THEN 'CUSTOMER_SERVICE' ELSE upper(v_role) END,
    'actor_role',v_role
  );
END;
$$;

-- No DELETE policy is added for Customer Service.
