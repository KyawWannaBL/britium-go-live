-- Production-matched branch directory and controlled account requests.
-- Direct account creation/password mutation remains at head office.
CREATE OR REPLACE FUNCTION public.be_branch_account_request_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_role text := replace(public.be_current_role(), '-', '_');
  v_branch text;
  v_email text := lower(btrim(coalesce(p_payload->>'email','')));
  v_full_name text := nullif(btrim(coalesce(p_payload->>'full_name','')),'');
  v_requested_role text := lower(replace(btrim(coalesce(p_payload->>'role_code','')),'-','_'));
  v_action text := upper(btrim(coalesce(p_payload->>'action','CREATE_ACCOUNT')));
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason','')),'');
  v_existing_role text;
  v_request text;
BEGIN
  IF v_role NOT IN ('branch_manager','branch_office_manager','branch_admin')
    THEN RAISE EXCEPTION 'BRANCH_ACCOUNT_REQUEST_DENIED' USING errcode='42501'; END IF;
  v_branch := public.be_branch_scope_v1(p_payload->>'branch_code');
  IF v_branch IS NULL OR NOT EXISTS (
     SELECT 1 FROM public.be_branch_offices b WHERE upper(b.branch_code)=v_branch
       AND coalesce(b.active,true) AND lower(coalesce(b.authority_status,''))='approved'
  ) THEN RAISE EXCEPTION 'APPROVED_BRANCH_REQUIRED' USING errcode='42501'; END IF;
  IF v_email='' OR length(v_email)>254 OR v_email NOT LIKE '%@%.%' OR v_reason IS NULL
    OR length(v_reason)<8 OR length(v_reason)>1200
    THEN RAISE EXCEPTION 'EMAIL_AND_REASON_REQUIRED' USING errcode='22023'; END IF;
  IF v_action NOT IN ('CREATE_ACCOUNT','RESET_LOGIN','DISABLE_ACCOUNT')
    THEN RAISE EXCEPTION 'INVALID_ACCOUNT_REQUEST_ACTION' USING errcode='22023'; END IF;

  SELECT lower(replace(coalesce(nullif(r.role_code,''),r.role),'-','_'))
    INTO v_existing_role
    FROM public.be_user_account_registry r
   WHERE lower(coalesce(r.email,r.login_email,r.account_email,''))=v_email
     AND upper(coalesce(r.branch_code,''))=v_branch LIMIT 1;

  IF v_action='CREATE_ACCOUNT' THEN
    IF v_full_name IS NULL OR length(v_full_name)>160
      THEN RAISE EXCEPTION 'FULL_NAME_REQUIRED' USING errcode='22023'; END IF;
    IF v_requested_role NOT IN ('rider','driver','helper','warehouse','customer_service',
                               'data_entry','finance','marketing','supervisor','branch_staff')
      THEN RAISE EXCEPTION 'REQUESTED_ROLE_NOT_ALLOWED' USING errcode='42501'; END IF;
    IF EXISTS(SELECT 1 FROM public.be_user_account_registry r
      WHERE lower(coalesce(r.email,r.login_email,r.account_email,''))=v_email)
      THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_REGISTERED' USING errcode='23505'; END IF;
  ELSE
    IF v_existing_role IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_IN_BRANCH' USING errcode='42501'; END IF;
    IF v_existing_role IN ('superadmin','super_admin','app_owner','sys','branch_manager',
                           'branch_office_manager','branch_admin','admin')
      THEN RAISE EXCEPTION 'PRIVILEGED_ACCOUNT_HQ_ONLY' USING errcode='42501'; END IF;
    v_requested_role:=v_existing_role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.be_branch_user_provisioning_requests q
    WHERE q.branch_code=v_branch AND lower(q.email)=v_email
      AND q.status IN ('pending_provisioning','PENDING','pending')
  ) THEN RAISE EXCEPTION 'ACCOUNT_REQUEST_ALREADY_PENDING' USING errcode='23505'; END IF;

  INSERT INTO public.be_branch_user_provisioning_requests
    (branch_code,email,full_name,role_code,requested_authority,status,requested_by,metadata)
  VALUES(v_branch,v_email,v_full_name,v_requested_role,'{}'::jsonb,'pending_provisioning',
         auth.uid(),jsonb_build_object('action',v_action,'reason',v_reason,'hq_review_required',true))
  RETURNING request_no INTO v_request;

  INSERT INTO public.be_governance_audit_log
    (module,action,ref_table,ref_id,actor_email,after_data,metadata)
  VALUES ('BRANCH_OFFICE','BRANCH_ACCOUNT_REQUESTED','be_branch_user_provisioning_requests',
      v_request,(select r.email from public.be_user_account_registry r
        where r.auth_user_id=auth.uid() limit 1),
      jsonb_build_object('branch_code',v_branch,'email',v_email,'role',v_requested_role,'action',v_action),
      jsonb_build_object('reason',v_reason,'direct_account_change',false));

  RETURN jsonb_build_object('ok',true,'request_no',v_request,'status','pending_provisioning',
       'provisioned',false,'hq_review_required',true);
END
$function$


CREATE OR REPLACE FUNCTION public.be_branch_team_directory_v1(p_branch text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_role text := replace(public.be_current_role(), '-', '_');
  v_branch text;
  v_accounts jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
BEGIN
  IF v_role NOT IN ('branch_manager','branch_office_manager','branch_admin','superadmin','super_admin','app_owner','sys')
  THEN RAISE EXCEPTION 'BRANCH_TEAM_READ_DENIED' USING errcode='42501'; END IF;
  v_branch := public.be_branch_scope_v1(p_branch);
  IF v_branch IS NULL OR NOT EXISTS (SELECT 1 FROM public.be_branch_offices b
      WHERE upper(b.branch_code)=v_branch AND coalesce(b.active,true))
  THEN RAISE EXCEPTION 'ACTIVE_BRANCH_REQUIRED' USING errcode='42501'; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.role_code,x.email), '[]'::jsonb)
    INTO v_accounts
  FROM (
    SELECT
      lower(coalesce(nullif(r.email,''),nullif(r.login_email,''),nullif(r.account_email,''))) AS email,
      coalesce(nullif(r.full_name,''),nullif(r.display_name,''),nullif(r.email,'')) AS full_name,
      lower(replace(coalesce(nullif(r.role_code,''),r.role,'unknown'),'-','_')) AS role_code,
      r.status,
      coalesce(r.active,true) AND coalesce(r.is_active,true)
        AND lower(coalesce(r.status,'active')) IN ('active','enabled') AS is_active,
      EXISTS (
        SELECT 1 FROM public.be_employee_territory_assignments t
         WHERE t.user_id=r.auth_user_id AND t.scope_type='BRANCH'
           AND upper(t.branch_code)=v_branch AND t.active AND t.can_read
      ) AS territory_assigned,
      EXISTS (
        SELECT 1 FROM public.be_mobile_workforce_accounts w
         WHERE w.auth_user_id=r.auth_user_id AND upper(coalesce(w.branch_code,''))=v_branch
           AND coalesce(w.active,w.is_active,true)
      ) AS mobile_account_linked
    FROM public.be_user_account_registry r
    WHERE upper(coalesce(r.branch_code,''))=v_branch AND r.auth_user_id IS NOT NULL
    ORDER BY r.role_code,r.email
    LIMIT 500
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC),'[]'::jsonb)
    INTO v_requests
  FROM (
    SELECT q.request_no, q.email, q.full_name, q.role_code, q.status,
           q.requested_at, q.metadata->>'action' AS action,
           q.metadata->>'reason' AS reason
    FROM public.be_branch_user_provisioning_requests q
    WHERE upper(q.branch_code)=v_branch
    ORDER BY q.requested_at DESC NULLS LAST LIMIT 100
  ) x;

  RETURN jsonb_build_object('ok',true,'branch_code',v_branch,'accounts',v_accounts,
    'account_count',jsonb_array_length(v_accounts),
    'requests',v_requests,'as_of',now(),
    'account_changes_require_hq_approval',true);
END
$function$

REVOKE ALL ON FUNCTION public.be_branch_team_directory_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_branch_team_directory_v1(text) TO authenticated;
REVOKE ALL ON FUNCTION public.be_branch_account_request_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.be_branch_account_request_v1(jsonb) TO authenticated;
