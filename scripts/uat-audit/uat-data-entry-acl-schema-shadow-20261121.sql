-- BRITIUM ISOLATED UAT: Data Entry V57 ACL and read-only V2 schema / runtime metadata.
-- Production definitions, UAT-specific role matrix. NO financial mutations enabled.
BEGIN;
SET LOCAL statement_timeout = '60s';
DO $gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not verified hosted UAT'; END IF;
IF (SELECT count(*) FROM public.be_wayplan_dispatches)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 THEN RAISE EXCEPTION 'Unexpected fixture counts'; END IF;
IF to_regclass('public.be_data_entry_access_grants_v57') IS NOT NULL THEN RAISE EXCEPTION 'Already present: be_data_entry_access_grants_v57'; END IF;
IF to_regclass('public.be_data_entry_access_mode_v57') IS NOT NULL THEN RAISE EXCEPTION 'Already present: be_data_entry_access_mode_v57'; END IF;
IF to_regclass('public.be_role_authority_matrix') IS NOT NULL THEN RAISE EXCEPTION 'Already present: be_role_authority_matrix'; END IF;
IF to_regclass('public.be_data_entry_financial_v2_runtime_v58') IS NOT NULL THEN RAISE EXCEPTION 'Already present: be_data_entry_financial_v2_runtime_v58'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_actor_access_v57') THEN RAISE EXCEPTION 'Function already present: be_data_entry_actor_access_v57'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_require_access_v57') THEN RAISE EXCEPTION 'Function already present: be_data_entry_require_access_v57'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_schema') THEN RAISE EXCEPTION 'Function already present: be_data_entry_financial_v2_schema'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_runtime_state') THEN RAISE EXCEPTION 'Function already present: be_data_entry_financial_v2_runtime_state'; END IF;
END $gate$;
CREATE TABLE public."be_data_entry_access_grants_v57" (
  "grant_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "registry_user_id" text,
  "email_snapshot" text NOT NULL,
  "branch_code" text,
  "grant_status" text NOT NULL,
  "allowed_actions" text[] DEFAULT ARRAY['view'::text, 'create'::text, 'update'::text, 'upload'::text, 'export'::text] NOT NULL,
  "waybill_allowed_actions" text[] DEFAULT ARRAY['view'::text, 'create'::text, 'update'::text, 'upload'::text, 'export'::text] NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "approved_by" uuid,
  "approval_reason" text NOT NULL,
  "request_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_data_entry_access_grants_v57_check" CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT "be_data_entry_access_grants_v57_grant_status_check" CHECK (grant_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'DENIED'::text, 'REVOKED'::text])),
  CONSTRAINT "be_data_entry_access_grants_v57_pkey" PRIMARY KEY (grant_id)
);
ALTER TABLE public."be_data_entry_access_grants_v57" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_access_grants_v57" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_data_entry_access_mode_v57" (
  "singleton" boolean DEFAULT true NOT NULL,
  "enforcement_mode" text DEFAULT 'MATRIX_SHADOW'::text NOT NULL,
  "note" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid,
  CONSTRAINT "be_data_entry_access_mode_v57_enforcement_mode_check" CHECK (enforcement_mode = ANY (ARRAY['MATRIX_SHADOW'::text, 'EXPLICIT_ONLY'::text])),
  CONSTRAINT "be_data_entry_access_mode_v57_singleton_check" CHECK (singleton),
  CONSTRAINT "be_data_entry_access_mode_v57_pkey" PRIMARY KEY (singleton)
);
ALTER TABLE public."be_data_entry_access_mode_v57" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_access_mode_v57" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_role_authority_matrix" (
  "role_id" text NOT NULL,
  "role_name" text NOT NULL,
  "authority_level" integer NOT NULL,
  "user_type" text DEFAULT 'PORTAL'::text NOT NULL,
  "default_landing_path" text DEFAULT '/'::text NOT NULL,
  "can_access_portal" boolean DEFAULT true NOT NULL,
  "can_access_mobile" boolean DEFAULT false NOT NULL,
  "rights" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "module_rights" jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT "be_role_authority_matrix_authority_level_check" CHECK (authority_level >= 0 AND authority_level <= 100),
  CONSTRAINT "be_role_authority_matrix_user_type_check" CHECK (user_type = ANY (ARRAY['PORTAL'::text, 'MOBILE'::text, 'EXTERNAL'::text])),
  CONSTRAINT "be_role_authority_matrix_pkey" PRIMARY KEY (role_id)
);
ALTER TABLE public."be_role_authority_matrix" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_role_authority_matrix" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_data_entry_financial_v2_runtime_v58" (
  "singleton" boolean DEFAULT true NOT NULL,
  "mutation_mode" text NOT NULL,
  "build" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid,
  "change_reason" text NOT NULL,
  CONSTRAINT "be_data_entry_financial_v2_runtime_v58_mutation_mode_check" CHECK (mutation_mode = ANY (ARRAY['MUTATION_SHADOW'::text, 'ACTIVE'::text])),
  CONSTRAINT "be_data_entry_financial_v2_runtime_v58_singleton_check" CHECK (singleton),
  CONSTRAINT "be_data_entry_financial_v2_runtime_v58_pkey" PRIMARY KEY (singleton)
);
ALTER TABLE public."be_data_entry_financial_v2_runtime_v58" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."be_data_entry_financial_v2_runtime_v58" FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX be_data_entry_access_grants_v57_active_uidx ON public.be_data_entry_access_grants_v57 (auth_user_id) WHERE effective_to IS NULL AND grant_status IN ('PENDING','APPROVED','DENIED');
CREATE INDEX be_data_entry_access_grants_v57_status_idx ON public.be_data_entry_access_grants_v57 (grant_status,branch_code,updated_at DESC);
INSERT INTO public.be_data_entry_access_mode_v57(singleton,enforcement_mode,note) VALUES(true,'MATRIX_SHADOW','UAT matrix permissions; no explicit grants; registration RPC unavailable');
INSERT INTO public.be_data_entry_financial_v2_runtime_v58(singleton,mutation_mode,build,change_reason) VALUES(true,'MUTATION_SHADOW','UAT_METADATA_ONLY_V58','Hold mutations until original save/calculate/waybill chain restored and verified');
INSERT INTO public.be_role_authority_matrix(role_id,role_name,authority_level,user_type,can_access_portal,can_access_mobile,rights,is_active) VALUES('super_admin','UAT Super Admin',95,'PORTAL',true,false,'{"modules":{"data_entry":{"view":true,"create":true,"update":true,"upload":true,"export":true},"waybill":{"view":true,"create":true,"update":true,"upload":true,"export":true}}}'::jsonb,true);
INSERT INTO public.be_role_authority_matrix(role_id,role_name,authority_level,user_type,can_access_portal,can_access_mobile,rights,is_active) VALUES('branch_manager','UAT Branch Manager',72,'PORTAL',true,false,'{"modules":{"data_entry":{"view":false},"waybill":{"view":true}}}'::jsonb,true);
INSERT INTO public.be_role_authority_matrix(role_id,role_name,authority_level,user_type,can_access_portal,can_access_mobile,rights,is_active) VALUES('warehouse_staff','UAT Warehouse Staff',45,'PORTAL',true,false,'{"modules":{"data_entry":{"view":false},"waybill":{"view":false}}}'::jsonb,true);
INSERT INTO public.be_role_authority_matrix(role_id,role_name,authority_level,user_type,can_access_portal,can_access_mobile,rights,is_active) VALUES('finance_user','UAT Finance User',50,'PORTAL',true,false,'{"modules":{"data_entry":{"view":false},"waybill":{"view":false}}}'::jsonb,true);
INSERT INTO public.be_role_authority_matrix(role_id,role_name,authority_level,user_type,can_access_portal,can_access_mobile,rights,is_active) VALUES('rider','UAT Rider',25,'MOBILE',false,true,'{"modules":{}}'::jsonb,true);
INSERT INTO public.be_role_authority_matrix(role_id,role_name,authority_level,user_type,can_access_portal,can_access_mobile,rights,is_active) VALUES('driver','UAT Driver',25,'MOBILE',false,true,'{"modules":{}}'::jsonb,true);
INSERT INTO public.be_role_authority_matrix(role_id,role_name,authority_level,user_type,can_access_portal,can_access_mobile,rights,is_active) VALUES('helper','UAT Helper',20,'MOBILE',false,true,'{"modules":{}}'::jsonb,true);
CREATE FUNCTION public.be_data_entry_actor_access_v57(p_action text DEFAULT 'view'::text, p_require_waybill boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_auth_role text := lower(coalesce(auth.role(), ''));
  v_action text := lower(btrim(coalesce(p_action, 'view')));
  v_registry record;
  v_matrix record;
  v_grant public.be_data_entry_access_grants_v57%rowtype;
  v_mode text := 'MATRIX_SHADOW';
  v_role text;
  v_data_entry_rights jsonb := '{}'::jsonb;
  v_waybill_rights jsonb := '{}'::jsonb;
  v_all_rights jsonb := '{}'::jsonb;
  v_module_allowed boolean := false;
  v_waybill_allowed boolean := true;
  v_matrix_allowed boolean := false;
  v_explicit_module_allowed boolean := true;
  v_explicit_waybill_allowed boolean := true;
  v_allowed boolean := false;
  v_reason text := null;
begin
  if v_action not in (
    'view', 'create', 'update', 'upload', 'export', 'approve', 'delete', 'admin'
  ) then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'reason_code', 'INVALID_ACTION',
      'message', 'Unsupported Data Entry permission action.'
    );
  end if;

  if v_auth_role = 'service_role' then
    return jsonb_build_object(
      'ok', true,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', true,
      'action', v_action,
      'require_waybill', coalesce(p_require_waybill, false),
      'actor_user_id', v_uid,
      'actor_role', 'service_role',
      'branch_code', null,
      'access_mode', 'SERVICE_ROLE',
      'source', 'service_role'
    );
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'reason_code', 'AUTHENTICATION_REQUIRED',
      'message', 'An authenticated production user is required.'
    );
  end if;

  select enforcement_mode
  into v_mode
  from public.be_data_entry_access_mode_v57
  where singleton
  limit 1;

  v_mode := coalesce(v_mode, 'MATRIX_SHADOW');

  select
    r.user_id::text as user_id,
    r.auth_user_id,
    lower(btrim(r.email)) as email,
    r.full_name,
    lower(replace(btrim(r.role), '-', '_')) as normalized_role,
    r.branch_code,
    lower(btrim(r.status)) as account_status
  into v_registry
  from public.be_user_account_registry r
  where r.auth_user_id = v_uid
  order by
    case when lower(btrim(r.status)) = 'active' then 0 else 1 end,
    r.user_id::text
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'access_mode', v_mode,
      'reason_code', 'ACCOUNT_REGISTRY_ROW_MISSING',
      'message', 'No production account-registry row is linked to the authenticated user.'
    );
  end if;

  if v_registry.account_status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'actor_employee_id', v_registry.user_id,
      'actor_email', v_registry.email,
      'actor_role', v_registry.normalized_role,
      'branch_code', v_registry.branch_code,
      'access_mode', v_mode,
      'reason_code', 'ACCOUNT_NOT_ACTIVE',
      'message', 'The production account is not active.'
    );
  end if;

  select g.*
  into v_grant
  from public.be_data_entry_access_grants_v57 g
  where g.auth_user_id = v_uid
    and g.effective_from <= now()
    and (g.effective_to is null or g.effective_to > now())
    and g.grant_status in ('PENDING', 'APPROVED', 'DENIED')
  order by
    case g.grant_status
      when 'DENIED' then 0
      when 'PENDING' then 1
      when 'APPROVED' then 2
      else 3
    end,
    g.updated_at desc
  limit 1;

  if found and v_grant.grant_status = 'DENIED' then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'actor_employee_id', v_registry.user_id,
      'actor_email', v_registry.email,
      'actor_role', v_registry.normalized_role,
      'branch_code', v_registry.branch_code,
      'access_mode', v_mode,
      'explicit_grant_status', v_grant.grant_status,
      'explicit_grant_id', v_grant.grant_id,
      'reason_code', 'EXPLICIT_DATA_ENTRY_DENIAL',
      'message', 'This production identity is explicitly denied Data Entry access.'
    );
  end if;

  if v_mode = 'EXPLICIT_ONLY'
     and (v_grant.grant_status is distinct from 'APPROVED') then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'actor_employee_id', v_registry.user_id,
      'actor_email', v_registry.email,
      'actor_role', v_registry.normalized_role,
      'branch_code', v_registry.branch_code,
      'access_mode', v_mode,
      'explicit_grant_status', v_grant.grant_status,
      'reason_code', 'EXPLICIT_DATA_ENTRY_APPROVAL_REQUIRED',
      'message', 'An active approved Data Entry access grant is required.'
    );
  end if;

  v_role := v_registry.normalized_role;

  select
    m.role_id,
    m.role_name,
    m.authority_level,
    m.user_type,
    m.can_access_portal,
    m.is_active,
    coalesce(m.rights, '{}'::jsonb) as rights,
    coalesce(m.module_rights, '{}'::jsonb) as module_rights
  into v_matrix
  from public.be_role_authority_matrix m
  where lower(replace(btrim(m.role_id), '-', '_')) = v_role
    and m.is_active
    and m.can_access_portal
  order by m.authority_level desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'actor_employee_id', v_registry.user_id,
      'actor_email', v_registry.email,
      'actor_role', v_role,
      'branch_code', v_registry.branch_code,
      'access_mode', v_mode,
      'explicit_grant_status', v_grant.grant_status,
      'reason_code', 'ACTIVE_ROLE_MATRIX_ROW_MISSING',
      'message', 'The account role has no active portal authority profile.'
    );
  end if;

  v_all_rights := coalesce(v_matrix.rights #> '{modules,all}', '{}'::jsonb)
    || coalesce(v_matrix.module_rights #> '{modules,all}', '{}'::jsonb);
  v_data_entry_rights := coalesce(v_matrix.rights #> '{modules,data_entry}', '{}'::jsonb)
    || coalesce(v_matrix.module_rights #> '{modules,data_entry}', '{}'::jsonb);
  v_waybill_rights := coalesce(v_matrix.rights #> '{modules,waybill}', '{}'::jsonb)
    || coalesce(v_matrix.module_rights #> '{modules,waybill}', '{}'::jsonb);

  v_module_allowed :=
       coalesce((v_all_rights ->> 'admin')::boolean, false)
    or coalesce((v_all_rights ->> v_action)::boolean, false)
    or coalesce((v_data_entry_rights ->> 'admin')::boolean, false)
    or coalesce((v_data_entry_rights ->> v_action)::boolean, false);

  if coalesce(p_require_waybill, false) then
    v_waybill_allowed :=
         coalesce((v_all_rights ->> 'admin')::boolean, false)
      or coalesce((v_all_rights ->> v_action)::boolean, false)
      or coalesce((v_waybill_rights ->> 'admin')::boolean, false)
      or coalesce((v_waybill_rights ->> v_action)::boolean, false);
  end if;

  v_matrix_allowed := v_module_allowed and v_waybill_allowed;

  if v_mode = 'EXPLICIT_ONLY' then
    v_explicit_module_allowed :=
      v_action = any(coalesce(v_grant.allowed_actions, array[]::text[]))
      or 'admin' = any(coalesce(v_grant.allowed_actions, array[]::text[]));

    if coalesce(p_require_waybill, false) then
      v_explicit_waybill_allowed :=
        v_action = any(coalesce(v_grant.waybill_allowed_actions, array[]::text[]))
        or 'admin' = any(coalesce(v_grant.waybill_allowed_actions, array[]::text[]));
    end if;
  end if;

  v_allowed := v_matrix_allowed
    and v_explicit_module_allowed
    and v_explicit_waybill_allowed;

  if not v_module_allowed then
    v_reason := 'DATA_ENTRY_ACTION_NOT_ALLOWED';
  elsif not v_waybill_allowed then
    v_reason := 'WAYBILL_ACTION_NOT_ALLOWED';
  elsif not v_explicit_module_allowed then
    v_reason := 'EXPLICIT_DATA_ENTRY_ACTION_NOT_ALLOWED';
  elsif not v_explicit_waybill_allowed then
    v_reason := 'EXPLICIT_WAYBILL_ACTION_NOT_ALLOWED';
  end if;

  return jsonb_build_object(
    'ok', v_allowed,
    'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
    'generated_at', now(),
    'allowed', v_allowed,
    'action', v_action,
    'require_waybill', coalesce(p_require_waybill, false),
    'actor_user_id', v_uid,
    'actor_employee_id', v_registry.user_id,
    'actor_email', v_registry.email,
    'actor_name', v_registry.full_name,
    'actor_role', v_role,
    'role_name', v_matrix.role_name,
    'authority_level', v_matrix.authority_level,
    'branch_code', v_registry.branch_code,
    'account_status', v_registry.account_status,
    'access_mode', v_mode,
    'explicit_grant_status', v_grant.grant_status,
    'explicit_grant_id', v_grant.grant_id,
    'data_entry_rights', v_data_entry_rights,
    'waybill_rights', v_waybill_rights,
    'all_rights', v_all_rights,
    'reason_code', v_reason,
    'source', case
      when v_mode = 'EXPLICIT_ONLY'
        then 'be_user_account_registry+be_role_authority_matrix+be_data_entry_access_grants_v57'
      else 'be_user_account_registry+be_role_authority_matrix+explicit_deny_override'
    end
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_actor_access_v57(text,boolean) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_require_access_v57(p_action text DEFAULT 'view'::text, p_require_waybill boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access jsonb;
begin
  v_access := public.be_data_entry_actor_access_v57(
    p_action,
    p_require_waybill
  );

  if not coalesce((v_access ->> 'allowed')::boolean, false) then
    raise exception using
      errcode = '42501',
      message = coalesce(
        v_access ->> 'message',
        'Data Entry permission denied: ' || coalesce(v_access ->> 'reason_code', 'UNKNOWN')
      ),
      detail = v_access::text;
  end if;

  return v_access;
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_require_access_v57(text,boolean) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_schema()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access jsonb;
  v_fields jsonb;
begin
  v_access := public.be_data_entry_require_access_v57('view', false);
  v_fields := jsonb_build_array(
      jsonb_build_object('name','id','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','uuid','required',false,'source','parcels.id'),
      jsonb_build_object('name','way_id','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','text','required',false,'source','parcels.way_id'),
      jsonb_build_object('name','customer_id','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',false,'source','client selection; validated on mutation'),
      jsonb_build_object('name','merchant_id','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client selection; profile resolved by backend'),
      jsonb_build_object('name','status','section','Parcel Identity','ownership','INPUT','editable',true,'data_type','text','required',false,'source','operational status when permitted'),
      jsonb_build_object('name','recipient_name','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','recipient_phone','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','township','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input; deterministic normalized township tariff lookup'),
      jsonb_build_object('name','delivery_address','section','Recipient & Address','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client input'),
      jsonb_build_object('name','item_price','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input by amount-entry type'),
      jsonb_build_object('name','delivery_charges','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','merchant-declared delivery charge'),
      jsonb_build_object('name','cod_amount','section','Collection Instructions','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend amount-entry calculation'),
      jsonb_build_object('name','weight_kg','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','numeric','required',true,'source','client input'),
      jsonb_build_object('name','created_at','section','Audit Information','ownership','SERVER','editable',false,'data_type','timestamptz','required',false,'source','database timestamp'),
      jsonb_build_object('name','updated_at','section','Audit Information','ownership','SERVER','editable',false,'data_type','timestamptz','required',false,'source','database timestamp'),
      jsonb_build_object('name','environment','section','Parcel Identity','ownership','SERVER','editable',false,'data_type','text','required',true,'source','PRODUCTION'),
      jsonb_build_object('name','customer_tier','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','text','required',true,'source','registered merchant: active approved profile overrides; truly unregistered merchant: operator selects STANDARD, ROYAL, or COMMITMENT'),
      jsonb_build_object('name','monthly_ways','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','integer','required',true,'source','backend parcel count'),
      jsonb_build_object('name','amount_entry_type','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','text','required',true,'source','client selection'),
      jsonb_build_object('name','merchant_stated_total_amount','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input by amount-entry type'),
      jsonb_build_object('name','additional_customer_charge','section','Collection Instructions','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','cbm_surcharge','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','other_surcharge','section','Weight & Tariff','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','client input'),
      jsonb_build_object('name','merchant_payable_charges','section','Merchant Settlement','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','approved client input'),
      jsonb_build_object('name','other_merchant_credits','section','Merchant Settlement','ownership','INPUT','editable',true,'data_type','bigint','required',false,'source','approved client input'),
      jsonb_build_object('name','remarks','section','Audit Information','ownership','INPUT','editable',true,'data_type','text','required',false,'source','client input'),
      jsonb_build_object('name','entered_by','section','Audit Information','ownership','SERVER','editable',false,'data_type','uuid','required',true,'source','auth.uid()'),
      jsonb_build_object('name','authorized_by','section','Audit Information','ownership','SERVER','editable',false,'data_type','uuid','required',false,'source','set by authorized mutation'),
      jsonb_build_object('name','tariff_zone','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','text','required',true,'source','active tariff'),
      jsonb_build_object('name','tariff_zone_code','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','text','required',true,'source','active tariff'),
      jsonb_build_object('name','base_tariff','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','included_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','active tariff'),
      jsonb_build_object('name','extra_per_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','commitment_min_ways','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','integer','required',true,'source','active tariff'),
      jsonb_build_object('name','commitment_refund_per_way','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','active tariff'),
      jsonb_build_object('name','chargeable_weight_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','backend calculation'),
      jsonb_build_object('name','extra_kg','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','numeric','required',true,'source','backend calculation'),
      jsonb_build_object('name','weight_surcharge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','gross_system_delivery_charge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','commitment_refund','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','net_system_delivery_charge','section','Weight & Tariff','ownership','SERVER','editable',false,'data_type','bigint','required',true,'source','backend calculation'),
      jsonb_build_object('name','effective_declared_delivery_charge','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','delivery_difference','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','settlement_direction','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend calculation'),
      jsonb_build_object('name','merchant_settlement_adjustment','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','merchant_final_settlement_amount','section','Merchant Settlement','ownership','SERVER','editable',false,'data_type','bigint','required',false,'source','backend calculation'),
      jsonb_build_object('name','validation_status','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend validation'),
      jsonb_build_object('name','validation_message','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend validation'),
      jsonb_build_object('name','calculation_version','section','Validation','ownership','SERVER','editable',false,'data_type','text','required',true,'source','backend version'),
      jsonb_build_object('name','calculated_at','section','Validation','ownership','SERVER','editable',false,'data_type','timestamptz','required',true,'source','backend timestamp')
  );

  return jsonb_build_object(
    'ok', true,
    'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_3_2026_08_02',
    'generated_at', now(),
    'data', jsonb_build_object(
      'schema_version', 'FINANCIAL_V2_SCHEMA_V61_3_3_2026_08_02',
      'field_count', jsonb_array_length(v_fields),
      'environment', 'PRODUCTION',
      'mutation_rpcs_activated', false,
      'fields', v_fields
    ),
    'access', v_access
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_financial_v2_schema() TO authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_runtime_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access jsonb;
  v_mode text := 'MUTATION_SHADOW';
  v_updated_at timestamptz;
  v_updated_by uuid;
  v_reason text;
begin
  v_access := public.be_data_entry_require_access_v57('create',false);

  select
    coalesce(nullif(upper(btrim(mutation_mode)),''),'MUTATION_SHADOW'),
    updated_at,
    updated_by,
    change_reason
  into v_mode, v_updated_at, v_updated_by, v_reason
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'mutation_mode', v_mode,
    'mutation_rpcs_activated', v_mode = 'ACTIVE',
    'data', jsonb_build_object(
      'mutation_mode', v_mode,
      'mutation_rpcs_activated', v_mode = 'ACTIVE',
      'updated_at', v_updated_at,
      'updated_by', v_updated_by,
      'change_reason', v_reason
    ),
    'access', v_access
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_runtime_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_financial_v2_runtime_state() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
