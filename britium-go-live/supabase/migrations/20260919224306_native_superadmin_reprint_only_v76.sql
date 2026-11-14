-- V76: reprint is a non-delegable native-Superadmin authority.
-- Operational SUPERADMIN delegation does not grant reprint rights.

create or replace function public.be_is_native_superadmin_v76()
returns boolean
language sql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
  select exists(
    select 1
    from auth.users u
    where u.id=auth.uid()
      and regexp_replace(
        lower(coalesce(
          nullif(u.raw_app_meta_data->>'role',''),
          nullif(u.raw_user_meta_data->>'role',''),
          ''
        )),
        '[^a-z]','','g'
      )='superadmin'
  );
$function$;

grant execute on function public.be_is_native_superadmin_v76() to authenticated;

create or replace function public.be_waybill_reprint_status_v2(p_way_ids text[] default null::text[])
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ctx jsonb;
  native_admin boolean;
  requests jsonb:='[]'::jsonb;
  logs jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  ctx:=public.be_data_entry_require_access_v57('view',true);
  native_admin:=public.be_is_native_superadmin_v76();

  if native_admin then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into requests
    from (
      select *
      from public.be_document_print_approval_requests
      where document_type='WAYBILL'
        and (p_way_ids is null or document_no=any(p_way_ids))
      order by (approval_status='PENDING') desc,created_at desc
      limit 500
    ) q;

    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into logs
    from (
      select document_no,printed_by,created_at,print_count,approved_by,reason,id
      from public.be_document_print_log
      where document_type='WAYBILL'
        and (p_way_ids is null or document_no=any(p_way_ids))
      order by created_at desc
      limit 500
    ) q;
  end if;

  return jsonb_build_object(
    'can_approve',native_admin,
    'can_reprint',native_admin,
    'native_superadmin_required',true,
    'delegated_superadmin_allowed',false,
    'requests',requests,
    'logs',logs,
    'build','REPRINT_NATIVE_SUPERADMIN_ONLY_V76'
  );
end;
$function$;

grant execute on function public.be_waybill_reprint_status_v2(text[]) to authenticated;

create or replace function public.be_waybill_reprint_decide_v2(
  p_request_id uuid,
  p_decision text,
  p_note text default ''::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ctx jsonb;
  r public.be_document_print_approval_requests%rowtype;
  n integer;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  ctx:=public.be_data_entry_require_access_v57('view',false);

  if not public.be_is_native_superadmin_v76() then
    raise exception 'Reprint decisions are restricted to native Superadmin accounts. Delegated operational authority is not valid for reprints.' using errcode='42501';
  end if;

  if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid decision.'; end if;

  select * into r
  from public.be_document_print_approval_requests
  where id=p_request_id and document_type='WAYBILL';

  if not found then raise exception 'Request not found.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('WAYBILL_PRINT:'||r.document_no,0));

  select * into r
  from public.be_document_print_approval_requests
  where id=p_request_id
  for update;

  if r.approval_status<>'PENDING' or r.consumed_at is not null then
    raise exception 'Request already decided or used. Refresh requests.';
  end if;

  select greatest(
    count(*),
    coalesce(max(print_count),0),
    (
      select count(*)
      from public.be_waybill_print_audit_v38 a
      join public.be_v32_parcels p on p.pickup_id=a.pickup_id
      where p.waybill_no=r.document_no
        and upper(a.document_type)='WAYBILL'
    )
  )::integer
  into n
  from public.be_document_print_log
  where document_type='WAYBILL'
    and document_no=r.document_no;

  if p_decision='APPROVED'
     and (r.requested_print_count is distinct from n or nullif(btrim(r.request_reason),'') is null) then
    raise exception 'Request is outdated or has no reason. Submit a fresh request.';
  end if;

  update public.be_document_print_approval_requests
  set approval_status=p_decision,
      approved_by=ctx->>'actor_email',
      approved_at=now(),
      decision_note=nullif(btrim(p_note),''),
      updated_at=now()
  where id=r.id;

  perform public.be_write_governance_audit(
    'PRINT_APPROVAL',
    p_decision,
    'be_document_print_approval_requests',
    r.document_no,
    ctx->>'actor_email',
    to_jsonb(r),
    jsonb_build_object(
      'request_id',r.id,
      'decision',p_decision,
      'reason',r.request_reason,
      'native_superadmin_only',true
    ),
    jsonb_build_object('actor_user_id',auth.uid(),'build','V76')
  );

  return jsonb_build_object(
    'ok',true,
    'request_id',r.id,
    'decision',p_decision,
    'native_superadmin',true,
    'build','REPRINT_DECISION_V76'
  );
end;
$function$;

grant execute on function public.be_waybill_reprint_decide_v2(uuid,text,text) to authenticated;

create or replace function public.be_waybill_print_release_v2(
  p_way_ids text[],
  p_paper_size text default '4x6'::text,
  p_label_size text default '4x6'::text,
  p_reason text default null::text,
  p_request_only boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
begin
  if auth.uid() is null then raise exception 'Sign in to print waybills.' using errcode='42501'; end if;

  ctx:=public.be_data_entry_require_access_v57('export',true);
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
$function$;

grant execute on function public.be_waybill_print_release_v2(text[],text,text,text,boolean) to authenticated;

create or replace function public.be_document_print_guard(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_type text:=upper(coalesce(p_payload->>'document_type','WAYBILL'));
  v_no text:=nullif(coalesce(p_payload->>'document_no',p_payload->>'waybill_no',p_payload->>'invoice_no'),'');
  v_actor text;
  v_role text;
  v_department text:=lower(coalesce(p_payload->>'department','operation'));
  v_reason text:=nullif(p_payload->>'reason','');
  v_existing integer:=0;
  v_native_admin boolean:=false;
  v_ctx jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;

  v_ctx:=public.be_data_entry_require_access_v57('view',true);
  v_actor:=v_ctx->>'actor_email';
  v_role:=lower(coalesce(v_ctx->>'actor_role','operator'));
  v_native_admin:=public.be_is_native_superadmin_v76();

  if v_type='WAYBILL'
     or exists(select 1 from public.be_v32_parcels where waybill_no=v_no) then
    return public.be_waybill_print_release_v2(
      array[v_no],
      coalesce(p_payload->>'paper_size','4x6'),
      coalesce(p_payload->>'label_size','4x6'),
      p_payload->>'reason',
      coalesce((p_payload->>'request_only')::boolean,false)
    );
  end if;

  if v_no is null then raise exception 'document_no is required'; end if;

  select count(*) into v_existing
  from public.be_document_print_log
  where document_type=v_type and document_no=v_no;

  if v_existing=0 then
    if v_type='INVOICE'
       and v_department not in ('finance','superadmin')
       and not v_native_admin then
      raise exception 'Invoice first print is allowed only for finance or native Superadmin';
    end if;

    insert into public.be_document_print_log(
      document_type,document_no,document_ref,printed_by,printed_by_role,
      department,print_count,approval_required,approval_status,reason,metadata
    )
    values(
      v_type,v_no,p_payload->>'document_ref',v_actor,v_role,v_department,
      1,false,'NOT_REQUIRED',v_reason,
      p_payload||jsonb_build_object(
        'actor_user_id',auth.uid(),
        'native_superadmin_reprint_only',true,
        'build','V76'
      )
    );

    return jsonb_build_object(
      'ok',true,'allowed',true,'document_type',v_type,'document_no',v_no,
      'print_count_before',0,'message','First print allowed and recorded.',
      'can_reprint',v_native_admin,'build','DOCUMENT_PRINT_GUARD_V76'
    );
  end if;

  if not v_native_admin then
    return jsonb_build_object(
      'ok',true,
      'allowed',false,
      'approval_required',false,
      'native_superadmin_required',true,
      'document_type',v_type,
      'document_no',v_no,
      'print_count_before',v_existing,
      'message','Reprint blocked: only a native Superadmin account may reprint this document.',
      'build','DOCUMENT_PRINT_GUARD_V76'
    );
  end if;

  insert into public.be_document_print_log(
    document_type,document_no,document_ref,printed_by,printed_by_role,
    department,print_count,approval_required,approval_status,
    approved_by,approved_at,reason,metadata
  )
  values(
    v_type,v_no,p_payload->>'document_ref',v_actor,'superadmin','superadmin',
    v_existing+1,true,'APPROVED',
    v_actor,now(),v_reason,
    p_payload||jsonb_build_object(
      'actor_user_id',auth.uid(),
      'native_superadmin_only',true,
      'build','V76'
    )
  );

  return jsonb_build_object(
    'ok',true,
    'allowed',true,
    'document_type',v_type,
    'document_no',v_no,
    'print_count_before',v_existing,
    'message','Native Superadmin reprint allowed and recorded.',
    'can_reprint',true,
    'build','DOCUMENT_PRINT_GUARD_V76'
  );
end;
$function$;

grant execute on function public.be_document_print_guard(jsonb) to authenticated;

create or replace function public.be_document_print_approve(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_actor_email text;
  v_document_type text:=upper(nullif(p_payload->>'document_type',''));
  v_document_no text:=nullif(p_payload->>'document_no','');
  v_note text:=nullif(p_payload->>'decision_note','');
  v_ctx jsonb;
  v_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;

  v_ctx:=public.be_data_entry_require_access_v57('view',false);

  if not public.be_is_native_superadmin_v76() then
    raise exception 'Only a native Superadmin account can approve or authorize reprints. Delegated operational Superadmin authority is excluded.' using errcode='42501';
  end if;

  v_actor_email:=v_ctx->>'actor_email';

  if v_document_type='WAYBILL' then
    if nullif(p_payload->>'request_id','') is null then
      raise exception 'Select a specific reprint request.';
    end if;
    return public.be_waybill_reprint_decide_v2(
      (p_payload->>'request_id')::uuid,
      'APPROVED',
      coalesce(v_note,'')
    );
  end if;

  update public.be_document_print_approval_requests
  set approval_status='APPROVED',
      approved_by=v_actor_email,
      approved_at=now(),
      decision_note=coalesce(v_note,decision_note),
      updated_at=now()
  where document_type=v_document_type
    and document_no=v_document_no
    and approval_status='PENDING'
    and consumed_at is null;

  get diagnostics v_count=row_count;

  perform public.be_write_governance_audit(
    'PRINT_APPROVAL','REPRINT_APPROVED',
    'be_document_print_approval_requests',
    v_document_no,v_actor_email,'{}'::jsonb,
    jsonb_build_object(
      'document_type',v_document_type,
      'document_no',v_document_no,
      'approved_requests',v_count,
      'native_superadmin_only',true
    ),
    jsonb_build_object('actor_user_id',auth.uid(),'build','V76')
  );

  return jsonb_build_object(
    'ok',true,
    'approved_requests',v_count,
    'document_type',v_document_type,
    'document_no',v_document_no,
    'native_superadmin',true,
    'build','DOCUMENT_PRINT_APPROVE_V76'
  );
end;
$function$;

grant execute on function public.be_document_print_approve(jsonb) to authenticated;
