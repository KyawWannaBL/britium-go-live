CREATE OR REPLACE FUNCTION public.be_waybill_print_release_v2(p_way_ids text[], p_paper_size text DEFAULT '4x6'::text, p_label_size text DEFAULT '4x6'::text, p_reason text DEFAULT NULL::text, p_request_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ctx jsonb;
  who text;
  role_name text;
  native_admin boolean;
  ids text[];
  way text;
  n integer;
  approval public.be_document_print_approval_requests%rowtype;
  log_id uuid;
  request_id uuid;
  releases jsonb:='[]';
  blocked jsonb:='[]';
  why text:=nullif(btrim(p_reason),'');
  branch_actor boolean:=replace(public.be_current_role(),'-','_') in ('branch_manager','branch_office_manager');
  branch_scope text;
begin
  if auth.uid() is null then raise exception 'Sign in to print waybills.' using errcode='42501'; end if;

  -- Branch managers gain first-release printing only, not Data Entry authority.
  if branch_actor then
    branch_scope:=public.be_branch_scope_v1(null);
    select jsonb_build_object('actor_email',lower(email),'actor_role','branch_manager')
      into ctx from public.be_user_account_registry where auth_user_id=auth.uid() limit 1;
  else
    ctx:=public.be_data_entry_require_access_v57('export',true);
  end if;
  who:=ctx->>'actor_email';
  role_name:=ctx->>'actor_role';
  native_admin:=public.be_is_native_superadmin_v76();

  if nullif(who,'') is null then raise exception 'Verified account email required.'; end if;

  select array_agg(distinct btrim(x) order by btrim(x))
    into ids
  from unnest(p_way_ids) x
  where nullif(btrim(x),'') is not null;

  if coalesce(cardinality(ids),0)=0 or cardinality(ids)>500 then
    raise exception 'Select 1 to 500 waybills.';
  end if;

  if p_request_only and not native_admin then
    raise exception 'Reprint authority is restricted to native Superadmin accounts. Operation Manager and delegated Superadmin accounts cannot request or release reprints.' using errcode='42501';
  end if;

  if p_request_only and (why is null or length(why)>2000) then
    raise exception 'Enter a reprint reason (1–2000 characters).';
  end if;

  -- Share transfer dispatch's parcel locks; custody cannot change during release.
  perform 1 from public.be_data_entry_parcel_details d where d.delivery_way_id=any(ids) order by d.delivery_way_id for update;
  if branch_actor and exists(select 1 from unnest(ids) w where not public.be_branch_parcel_at_v1(w,branch_scope)) then
    raise exception 'BRANCH_WAYBILL_DENIED' using errcode='42501';
  end if;

  foreach way in array ids loop
    perform pg_advisory_xact_lock(hashtextextended('WAYBILL_PRINT:'||way,0));

    if not exists(
      select 1
      from public.be_v32_parcels p
      join public.be_data_entry_parcel_details d on d.delivery_way_id=p.waybill_no
      where p.waybill_no=way
        and d.saved_at is not null
        and d.financial_validation_status='OK'
    ) then
      blocked:=blocked||jsonb_build_array(jsonb_build_object(
        'waybill_no',way,
        'message','Generated waybill with valid saved financial details required.'
      ));
      continue;
    end if;

    select greatest(
      count(*),
      coalesce(max(print_count),0),
      (
        select count(*)
        from public.be_waybill_print_audit_v38 a
        join public.be_v32_parcels p on p.pickup_id=a.pickup_id
        where p.waybill_no=way
          and upper(a.document_type)='WAYBILL'
      )
    )::integer
    into n
    from public.be_document_print_log
    where document_type='WAYBILL'
      and document_no=way;

    -- First print remains under normal print permissions.
    if n=0 and not p_request_only then
      insert into public.be_document_print_log(
        document_type,document_no,printed_by,printed_by_role,department,
        print_count,approval_required,approval_status,approved_by,approved_at,
        reason,metadata
      )
      values(
        'WAYBILL',way,who,role_name,'data_entry',
        1,false,'NOT_REQUIRED',null,null,null,
        jsonb_build_object(
          'audit_stage','AUTHORIZED_FIRST_RELEASE',
          'output','PAPER_OR_PDF',
          'paper_size',p_paper_size,
          'label_size',p_label_size,
          'actor_user_id',auth.uid(),
          'native_superadmin_reprint_only',true,
          'build','V76'
        )
      )
      returning id into log_id;

      releases:=releases||jsonb_build_array(jsonb_build_object(
        'waybill_no',way,
        'release_id',log_id,
        'print_count',1,
        'first_print',true
      ));
      continue;
    end if;

    -- Anything after first print is native-Superadmin only.
    if n>0 and not native_admin then
      blocked:=blocked||jsonb_build_array(jsonb_build_object(
        'waybill_no',way,
        'reprint',true,
        'native_superadmin_required',true,
        'message','Reprint blocked: only a native Superadmin account may reprint this waybill.'
      ));
      continue;
    end if;

    if p_request_only then
      if n=0 then
        blocked:=blocked||jsonb_build_array(jsonb_build_object(
          'waybill_no',way,
          'message','First print is available; no reprint action is needed.'
        ));
      else
        insert into public.be_document_print_approval_requests(
          document_type,document_no,requested_by,requested_by_role,department,
          request_reason,requested_print_count
        )
        values(
          'WAYBILL',way,who,'superadmin','superadmin',why,n
        )
        on conflict(document_no,requested_by,requested_print_count)
          where document_type='WAYBILL'
            and approval_status in ('PENDING','APPROVED')
            and consumed_at is null
            and requested_print_count is not null
          do nothing
        returning id into request_id;

        blocked:=blocked||jsonb_build_array(jsonb_build_object(
          'waybill_no',way,
          'message','Native Superadmin reprint request recorded or already pending/approved.'
        ));
      end if;
      continue;
    end if;

    approval:=null;

    select * into approval
    from public.be_document_print_approval_requests
    where document_type='WAYBILL'
      and document_no=way
      and requested_by=who
      and requested_print_count=n
      and approval_status='APPROVED'
      and consumed_at is null
      and approved_by is not null
      and approved_at is not null
      and nullif(btrim(request_reason),'') is not null
    order by approved_at,id
    limit 1
    for update;

    if approval.id is null then
      blocked:=blocked||jsonb_build_array(jsonb_build_object(
        'waybill_no',way,
        'approval_required',true,
        'native_superadmin_required',true,
        'message','Reprint blocked: native Superadmin must record a reason and approve the one-time reprint.'
      ));
      continue;
    end if;

    insert into public.be_document_print_log(
      document_type,document_no,printed_by,printed_by_role,department,
      print_count,approval_required,approval_status,approved_by,approved_at,
      reason,metadata
    )
    values(
      'WAYBILL',way,who,'superadmin','superadmin',
      n+1,true,'APPROVED',
      approval.approved_by,approval.approved_at,approval.request_reason,
      jsonb_build_object(
        'audit_stage','AUTHORIZED_REPRINT_RELEASE',
        'output','PAPER_OR_PDF',
        'paper_size',p_paper_size,
        'label_size',p_label_size,
        'approval_request_id',approval.id,
        'actor_user_id',auth.uid(),
        'native_superadmin_only',true,
        'build','V76'
      )
    )
    returning id into log_id;

    update public.be_document_print_approval_requests
    set consumed_at=now(),
        consumed_by=who,
        consumed_print_log_id=log_id,
        updated_at=now()
    where id=approval.id;

    releases:=releases||jsonb_build_array(jsonb_build_object(
      'waybill_no',way,
      'release_id',log_id,
      'print_count',n+1,
      'reprint',true,
      'native_superadmin',true
    ));
  end loop;

  return jsonb_build_object(
    'allowed',jsonb_array_length(releases)>0,
    'authorized_count',jsonb_array_length(releases),
    'releases',releases,
    'blocked',blocked,
    'can_reprint',native_admin,
    'native_superadmin_required_for_reprint',true,
    'delegated_superadmin_allowed',false,
    'build','WAYBILL_PRINT_RELEASE_V76'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.be_branch_waybill_snapshot_v1(p_branch text DEFAULT NULL,p_pickup text DEFAULT NULL,p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_rows jsonb;
  b text;
  r text:=replace(public.be_current_role(),'-','_');
begin
  if r not in ('branch_manager','branch_office_manager','superadmin','super_admin','app_owner','sys') then
    raise exception 'BRANCH_PRINT_DENIED' using errcode='42501';
  end if;
  b:=public.be_branch_scope_v1(p_branch);
  if b is null then raise exception 'SELECT_ONE_BRANCH';end if;

  select coalesce(jsonb_agg(x.row_json order by x.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select
      p.created_at,
      to_jsonb(p) ||
      case when d.id is null then '{}'::jsonb else
        jsonb_strip_nulls(jsonb_build_object(
          'delivery_way_id', p.waybill_no,
          'recipient_name', nullif(btrim(d.recipient_name), ''),
          'recipient_phone', nullif(btrim(d.contact_no_1), ''),
          'recipient_phone_2', nullif(btrim(d.contact_no_2), ''),
          'township', nullif(btrim(d.township), ''),
          'township_key', nullif(btrim(d.township_key), ''),
          'township_mm', nullif(btrim(t.label_mm), ''),
          'township_name', nullif(btrim(t.label_en), ''),
          'city', nullif(btrim(d.city), ''),
          'region_state', nullif(btrim(d.region_state), ''),
          'recipient_address', nullif(btrim(d.recipient_address), ''),
          'customer_tier', nullif(btrim(d.customer_tier), ''),
          'item_price', d.item_price,
          'weight_kg', d.weight_kg,
          'surcharge', d.surcharge,
          'delivery_fee', coalesce(d.effective_declared_delivery_charge,d.delivery_charges,d.delivery_fee),
          'source_waybill_no',nullif(d.financial_quote->>'source_waybill_no',''),
          'cod_amount', d.cod_amount,
          'actual_collect', d.actual_collect,
          'destination', nullif(btrim(d.destination), ''),
          'remarks', nullif(btrim(d.remark), ''),
          'data_entry_saved_at', d.saved_at,
          'data_entry_updated_at', d.updated_at,
          'waybill_data_source', 'DATA_ENTRY_AUTHORITATIVE_TOWNSHIP_MASTER_V12_5_1'
        ))
      end as row_json
    from public.be_v32_parcels p
    left join lateral (
      select d0.*
      from public.be_data_entry_parcel_details d0
      where upper(nullif(btrim(d0.delivery_way_id), '')) = upper(nullif(btrim(p.waybill_no), ''))
         or (
          nullif(btrim(d0.pickup_id), '') = nullif(btrim(p.pickup_id), '')
          and nullif(to_jsonb(p)->>'parcel_sequence', '') is not null
          and d0.parcel_sequence::text = nullif(to_jsonb(p)->>'parcel_sequence', '')
        )
      order by
        case when upper(nullif(btrim(d0.delivery_way_id), '')) = upper(nullif(btrim(p.waybill_no), '')) then 0 else 1 end,
        coalesce(d0.updated_at, d0.saved_at, d0.created_at) desc nulls last
      limit 1
    ) d on true
    left join lateral (
      select a.label_en, a.label_mm, a.township_code
      from public.v_address_township_options a
      where coalesce(a.is_selectable_for_address, true)
        and (
          lower(btrim(a.label_en)) = lower(btrim(coalesce(d.township, '')))
          or btrim(a.label_mm) = btrim(coalesce(d.township, ''))
          or lower(btrim(a.township_code)) = lower(btrim(coalesce(d.township_key, '')))
        )
      order by
        case
          when lower(btrim(a.township_code)) = lower(btrim(coalesce(d.township_key, ''))) then 0
          when btrim(a.label_mm) = btrim(coalesce(d.township, '')) then 1
          else 2
        end
      limit 1
    ) t on d.id is not null
    where nullif(btrim(p.waybill_no), '') is not null
      and d.saved_at is not null and d.financial_validation_status='OK'
      and public.be_branch_parcel_at_v1(p.waybill_no,b)
      and (nullif(btrim(p_pickup),'') is null or p.pickup_id=btrim(p_pickup))
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) x;

  return jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'row_count', jsonb_array_length(v_rows),
    'branch_code',b,
    'logs',coalesce((select jsonb_agg(to_jsonb(l)) from (
      select document_no,print_count,printed_by,created_at,approved_by,reason
      from public.be_document_print_log
      where document_type='WAYBILL' and public.be_branch_parcel_at_v1(document_no,b)
      order by created_at desc limit 500
    )l),'[]'::jsonb),
    'requests','[]'::jsonb,'can_reprint',false,'can_approve',false,
    'source', 'BRANCH_CUSTODY_DATA_ENTRY_PRINT_V1'
  );
end;
$function$
;
revoke all on function public.be_branch_waybill_snapshot_v1(text,text,integer) from public,anon;
grant execute on function public.be_branch_waybill_snapshot_v1(text,text,integer) to authenticated;


-- Commission attribution follows the work source, never current workforce location.
create or replace function public.be_branch_workforce_snapshot_v1(p_branch text default null,p_day date default null)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare b text; day date:=coalesce(p_day,public.be_business_date()); crew jsonb; events jsonb; total numeric; n integer;
begin
 b:=public.be_branch_control_scope_v1(p_branch);
 if b is null then raise exception 'SELECT_ONE_BRANCH';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'code',a.workforce_code,'role',a.role_code,'name',a.display_name,'active',a.active,
  'mobile_auth_ready',exists(select 1 from be_mobile_workforce_accounts m
    where upper(coalesce(nullif(m.worker_code,''),nullif(m.workforce_code,''),nullif(m.account_code,''),nullif(m.rider_code,''),nullif(m.driver_code,''),nullif(m.helper_code,'')))=upper(a.workforce_code)
    and upper(m.role)=a.role_code and upper(m.branch_code)=b and m.auth_user_id is not null and coalesce(m.active,true) and coalesce(m.is_active,true)),
  'busy',exists(select 1 from be_wayplan_dispatches w where upper(coalesce(w.wayplan_status,'')) in ('DISPATCHED','ON_HOLD')
    and case a.role_code when 'RIDER' then w.rider_code when 'DRIVER' then w.driver_code when 'HELPER' then w.helper_code end=a.workforce_code)
 ) order by a.role_code,a.display_name),'[]'::jsonb) into crew
 from be_wayplan_roster_allowlist_v68 a where upper(a.branch_code)=b and a.active;
 with attributed as (
  select e.*,coalesce(r.decision,'NOT_REVIEWED') finance_decision
  from be_commission_events e
  left join be_workforce_commission_finance_reviews_v210 r on r.commission_event_id=e.id
  where e.work_date=day and e.role_code in ('RIDER','DRIVER','HELPER') and (
   (e.operation_type='PICKUP' and exists(select 1 from be_portal_pickup_requests p where p.pickup_id=e.source_key and upper(p.branch_code)=b))
   or (e.operation_type='DELIVERY' and exists(select 1 from be_wayplan_dispatches w where w.wayplan_id=coalesce(nullif(e.wayplan_code,''),nullif(e.metadata->>'wayplan_id','')) and upper(w.branch_code)=b))
  )
 ), numbered as (
  select id,work_date,source_key,operation_type,role_code,assignee_name,assignee_email,unit_count,rate_mmk,commission_mmk,event_status,finance_decision,
   row_number() over(order by created_at desc nulls last,id) rn from attributed
 )
 select coalesce(jsonb_agg(to_jsonb(x)-'rn' order by rn) filter(where rn<=500),'[]'::jsonb),coalesce(sum(commission_mmk) filter(where event_status in ('READY','PENDING','APPROVED','PAID')),0),count(*)::integer
 into events,total,n from numbered x;
 return jsonb_build_object('ok',true,'branch_code',b,'business_date',day,'roster',crew,'commissions',events,'commission_total',total,'event_count',n,'detail_limit',500,
 'commission_scope','SOURCE_BRANCH_PICKUP_AND_DELIVERY','rates',jsonb_build_array(
   public.be_commission_calculate_v2('PICKUP','RIDER',1,day),public.be_commission_calculate_v2('PICKUP','DRIVER',1,day),public.be_commission_calculate_v2('PICKUP','HELPER',1,day),
   public.be_commission_calculate_v2('DELIVERY','RIDER',1,day),public.be_commission_calculate_v2('DELIVERY','DRIVER',1,day),public.be_commission_calculate_v2('DELIVERY','HELPER',1,day)),
 'payouts_initiated',0,'as_of',now());
end $$;
revoke all on function public.be_branch_workforce_snapshot_v1(text,date) from public,anon;
grant execute on function public.be_branch_workforce_snapshot_v1(text,date) to authenticated;
