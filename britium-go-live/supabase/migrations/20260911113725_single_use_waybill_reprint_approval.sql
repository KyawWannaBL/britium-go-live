
-- One authorized release per waybill; subsequent releases require explicit single-use approval.
alter table public.be_document_print_approval_requests add column if not exists requested_print_count integer;
create index if not exists be_print_log_document_lookup on public.be_document_print_log(document_type,document_no);
create unique index if not exists be_waybill_reprint_open_generation on public.be_document_print_approval_requests(document_no,requested_by,requested_print_count)
 where document_type='WAYBILL' and approval_status in ('PENDING','APPROVED') and consumed_at is null and requested_print_count is not null;
alter table public.be_document_print_log enable row level security;
alter table public.be_document_print_approval_requests enable row level security;
revoke insert,update,delete,truncate on public.be_document_print_log,public.be_document_print_approval_requests from public,anon,authenticated;

create or replace function public.be_waybill_print_release_v2(p_way_ids text[],p_paper_size text default '4x6',p_label_size text default '4x6',p_reason text default null,p_request_only boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ctx jsonb; who text; role_name text; ids text[]; way text; n integer;
 approval public.be_document_print_approval_requests%rowtype;
 log_id uuid; request_id uuid; releases jsonb:='[]'; blocked jsonb:='[]'; why text:=nullif(btrim(p_reason),'');
begin
 if auth.uid() is null then raise exception 'Sign in to print waybills.' using errcode='42501'; end if;
 ctx:=public.be_data_entry_require_access_v57('export',true);
 who:=ctx->>'actor_email';role_name:=ctx->>'actor_role';
 if nullif(who,'') is null then raise exception 'Verified account email required.'; end if;
 select array_agg(distinct btrim(x) order by btrim(x)) into ids from unnest(p_way_ids) x where nullif(btrim(x),'') is not null;
 if coalesce(cardinality(ids),0)=0 or cardinality(ids)>500 then raise exception 'Select 1 to 500 waybills.'; end if;
 if p_request_only and (why is null or length(why)>2000) then raise exception 'Enter a reprint reason (1–2000 characters).'; end if;
 foreach way in array ids loop
  perform pg_advisory_xact_lock(hashtextextended('WAYBILL_PRINT:'||way,0));
  if not exists(select 1 from public.be_v32_parcels p join public.be_data_entry_parcel_details d on d.delivery_way_id=p.waybill_no
    where p.waybill_no=way and d.saved_at is not null and d.financial_validation_status='OK') then
   blocked:=blocked||jsonb_build_array(jsonb_build_object('waybill_no',way,'message','Generated waybill with valid saved financial details required.'));
   continue;
  end if;
  select greatest(count(*),coalesce(max(print_count),0),(
 select count(*) from public.be_waybill_print_audit_v38 a join public.be_v32_parcels p on p.pickup_id=a.pickup_id
 where p.waybill_no=way and upper(a.document_type)='WAYBILL'
))::integer into n from public.be_document_print_log where document_type='WAYBILL' and document_no=way;
  if p_request_only then
   if n=0 then
    blocked:=blocked||jsonb_build_array(jsonb_build_object('waybill_no',way,'message','First print is available; no reprint approval needed.'));
   else
    insert into public.be_document_print_approval_requests(document_type,document_no,requested_by,requested_by_role,department,request_reason,requested_print_count)
    values('WAYBILL',way,who,role_name,'data_entry',why,n)
    on conflict(document_no,requested_by,requested_print_count)
      where document_type='WAYBILL' and approval_status in ('PENDING','APPROVED') and consumed_at is null and requested_print_count is not null
      do nothing returning id into request_id;
    blocked:=blocked||jsonb_build_array(jsonb_build_object('waybill_no',way,'message','Reprint request recorded or already pending/approved.'));
   end if;
   continue;
  end if;
  approval:=null;
  if n>0 then
   select * into approval from public.be_document_print_approval_requests
    where document_type='WAYBILL' and document_no=way and requested_by=who
      and requested_print_count=n and approval_status='APPROVED' and consumed_at is null
      and approved_by is not null and approved_at is not null and nullif(btrim(request_reason),'') is not null
    order by approved_at,id limit 1 for update;
   if approval.id is null then
    blocked:=blocked||jsonb_build_array(jsonb_build_object('waybill_no',way,'approval_required',true,'message','Reprint blocked: request Superadmin approval with a reason.'));
    continue;
   end if;
  end if;
  insert into public.be_document_print_log(document_type,document_no,printed_by,printed_by_role,department,print_count,approval_required,approval_status,approved_by,approved_at,reason,metadata)
   values('WAYBILL',way,who,role_name,'data_entry',n+1,n>0,case when n=0 then 'NOT_REQUIRED' else 'APPROVED' end,
   approval.approved_by,approval.approved_at,approval.request_reason,
   jsonb_build_object('audit_stage','AUTHORIZED_RELEASE','output','PAPER_OR_PDF','paper_size',p_paper_size,'label_size',p_label_size,'approval_request_id',approval.id,'actor_user_id',auth.uid()))
   returning id into log_id;
  if approval.id is not null then
   update public.be_document_print_approval_requests set consumed_at=now(),consumed_by=who,consumed_print_log_id=log_id,updated_at=now() where id=approval.id;
  end if;
  releases:=releases||jsonb_build_array(jsonb_build_object('waybill_no',way,'release_id',log_id,'print_count',n+1));
 end loop;
 return jsonb_build_object('allowed',jsonb_array_length(releases)>0,'authorized_count',jsonb_array_length(releases),'releases',releases,'blocked',blocked);
end; $$;

create or replace function public.be_waybill_reprint_decide_v2(p_request_id uuid,p_decision text,p_note text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; r public.be_document_print_approval_requests%rowtype; n integer;
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
 ctx:=public.be_data_entry_require_access_v57('view',false);
 if regexp_replace(lower(coalesce(ctx->>'actor_role','')),'[^a-z]','','g')<>'superadmin' then
 raise exception 'Only Superadmin can decide reprint requests.' using errcode='42501'; end if;
 if p_decision not in ('APPROVED','REJECTED') then raise exception 'Invalid decision.'; end if;
 select * into r from public.be_document_print_approval_requests where id=p_request_id and document_type='WAYBILL';
 if not found then raise exception 'Request not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('WAYBILL_PRINT:'||r.document_no,0));
 select * into r from public.be_document_print_approval_requests where id=p_request_id for update;
 if r.approval_status<>'PENDING' or r.consumed_at is not null then raise exception 'Request already decided or used. Refresh requests.'; end if;
 select greatest(count(*),coalesce(max(print_count),0),(
 select count(*) from public.be_waybill_print_audit_v38 a join public.be_v32_parcels p on p.pickup_id=a.pickup_id
 where p.waybill_no=r.document_no and upper(a.document_type)='WAYBILL'
))::integer into n from public.be_document_print_log where document_type='WAYBILL' and document_no=r.document_no;
 if p_decision='APPROVED' and (r.requested_print_count is distinct from n or nullif(btrim(r.request_reason),'') is null) then
 raise exception 'Request is outdated or has no reason. Submit a fresh request.'; end if;
 update public.be_document_print_approval_requests set approval_status=p_decision,approved_by=ctx->>'actor_email',
 approved_at=now(),decision_note=nullif(btrim(p_note),''),updated_at=now() where id=r.id;
 perform public.be_write_governance_audit('PRINT_APPROVAL',p_decision,'be_document_print_approval_requests',r.document_no,
 ctx->>'actor_email',to_jsonb(r),jsonb_build_object('request_id',r.id,'decision',p_decision,'reason',r.request_reason),jsonb_build_object('actor_user_id',auth.uid()));
 return jsonb_build_object('ok',true,'request_id',r.id,'decision',p_decision);
end; $$;

create or replace function public.be_waybill_reprint_status_v2(p_way_ids text[] default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; admin_user boolean; requests jsonb; logs jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
 ctx:=public.be_data_entry_require_access_v57('view',true);
 admin_user:=regexp_replace(lower(coalesce(ctx->>'actor_role','')),'[^a-z]','','g')='superadmin';
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into requests from (
  select * from public.be_document_print_approval_requests where document_type='WAYBILL'
   and (admin_user or requested_by=ctx->>'actor_email')
   and (p_way_ids is null or document_no=any(p_way_ids))
   order by (approval_status='PENDING') desc,created_at desc limit 500
 ) q;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into logs from (
  select document_no,printed_by,created_at,print_count,approved_by,reason,id from public.be_document_print_log
   where document_type='WAYBILL' and (admin_user or printed_by=ctx->>'actor_email')
   and (p_way_ids is null or document_no=any(p_way_ids)) order by created_at desc limit 500
 ) q;
 return jsonb_build_object('can_approve',admin_user,'requests',requests,'logs',logs);
end; $$;

CREATE OR REPLACE FUNCTION public.be_document_print_guard(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type text := upper(coalesce(p_payload->>'document_type', 'WAYBILL'));
  v_no text := nullif(coalesce(p_payload->>'document_no', p_payload->>'waybill_no', p_payload->>'invoice_no'), '');
  v_actor text := nullif(p_payload->>'actor_email', '');
  v_role text := lower(coalesce(p_payload->>'actor_role', 'operator'));
  v_department text := lower(coalesce(p_payload->>'department', 'operation'));
  v_reason text := nullif(p_payload->>'reason', '');
  v_existing integer := 0;
  v_has_approval boolean := false;
begin
  if upper(coalesce(p_payload->>'document_type','WAYBILL'))='WAYBILL'
     or exists(select 1 from public.be_v32_parcels where waybill_no=v_no) then
    return public.be_waybill_print_release_v2(array[v_no],
      coalesce(p_payload->>'paper_size','4x6'),coalesce(p_payload->>'label_size','4x6'),
      p_payload->>'reason',coalesce((p_payload->>'request_only')::boolean,false));
  end if;
  if v_no is null then
    raise exception 'document_no is required';
  end if;

  select count(*)
  into v_existing
  from public.be_document_print_log
  where document_type = v_type
    and document_no = v_no;

  if v_existing = 0 then
    if v_type = 'WAYBILL' and v_department not in ('operation','warehouse','data entry','data_entry','superadmin') and v_role <> 'superadmin' then
      raise exception 'Waybill first print is allowed only for operator/warehouse/data-entry or superadmin';
    end if;

    if v_type = 'INVOICE' and v_department not in ('finance','superadmin') and v_role <> 'superadmin' then
      raise exception 'Invoice first print is allowed only for finance or superadmin';
    end if;

    insert into public.be_document_print_log (
      document_type,
      document_no,
      document_ref,
      printed_by,
      printed_by_role,
      department,
      print_count,
      approval_required,
      approval_status,
      reason,
      metadata
    )
    values (
      v_type,
      v_no,
      p_payload->>'document_ref',
      v_actor,
      v_role,
      v_department,
      1,
      false,
      'NOT_REQUIRED',
      v_reason,
      p_payload
    );

    return jsonb_build_object(
      'ok', true,
      'allowed', true,
      'document_type', v_type,
      'document_no', v_no,
      'print_count_before', 0,
      'message', 'First print allowed and recorded.'
    );
  end if;

  select exists (
    select 1
    from public.be_document_print_approval_requests
    where document_type = v_type
      and document_no = v_no
      and approval_status = 'APPROVED'
  )
  into v_has_approval;

  if v_role = 'superadmin' or v_has_approval then
    insert into public.be_document_print_log (
      document_type,
      document_no,
      document_ref,
      printed_by,
      printed_by_role,
      department,
      print_count,
      approval_required,
      approval_status,
      approved_by,
      approved_at,
      reason,
      metadata
    )
    values (
      v_type,
      v_no,
      p_payload->>'document_ref',
      v_actor,
      v_role,
      v_department,
      v_existing + 1,
      true,
      'APPROVED',
      case when v_role = 'superadmin' then v_actor else null end,
      case when v_role = 'superadmin' then now() else null end,
      v_reason,
      p_payload
    );

    return jsonb_build_object(
      'ok', true,
      'allowed', true,
      'document_type', v_type,
      'document_no', v_no,
      'print_count_before', v_existing,
      'message', 'Reprint allowed by approval/superadmin.'
    );
  end if;

  insert into public.be_document_print_approval_requests (
    document_type,
    document_no,
    requested_by,
    requested_by_role,
    department,
    request_reason
  )
  values (
    v_type,
    v_no,
    v_actor,
    v_role,
    v_department,
    coalesce(v_reason, 'Reprint request')
  );

  return jsonb_build_object(
    'ok', true,
    'allowed', false,
    'approval_required', true,
    'document_type', v_type,
    'document_no', v_no,
    'print_count_before', v_existing,
    'message', 'Reprint blocked. Superadmin approval request created.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.be_document_print_approve(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_email text := nullif(p_payload->>'actor_email', '');
  v_actor_role text := nullif(p_payload->>'actor_role', '');
  v_ctx jsonb;
  v_document_type text := upper(nullif(p_payload->>'document_type', ''));
  v_document_no text := nullif(p_payload->>'document_no', '');
  v_note text := nullif(p_payload->>'decision_note', '');
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  v_ctx:=public.be_data_entry_require_access_v57('view',false);
  if regexp_replace(lower(coalesce(v_ctx->>'actor_role','')),'[^a-z]','','g')<>'superadmin' then
    raise exception 'Only Superadmin can approve reprints.' using errcode='42501'; end if;
  v_actor_email:=v_ctx->>'actor_email'; v_actor_role:='superadmin';
  if v_document_type='WAYBILL' then
    if nullif(p_payload->>'request_id','') is null then raise exception 'Select a specific reprint request.'; end if;
    return public.be_waybill_reprint_decide_v2((p_payload->>'request_id')::uuid,'APPROVED',coalesce(v_note,''));
  end if;
  v_ctx := public.be_require_admin(v_actor_email, v_actor_role);

  update public.be_document_print_approval_requests
  set
    approval_status = 'APPROVED',
    approved_by = coalesce(v_actor_email, v_ctx->>'email'),
    approved_at = now(),
    decision_note = coalesce(v_note, decision_note),
    updated_at = now()
  where document_type = v_document_type
    and document_no = v_document_no
    and approval_status = 'PENDING'
    and consumed_at is null;

  get diagnostics v_count = row_count;

  perform public.be_write_governance_audit(
    'PRINT_APPROVAL',
    'REPRINT_APPROVED',
    'be_document_print_approval_requests',
    v_document_no,
    coalesce(v_actor_email, v_ctx->>'email'),
    '{}'::jsonb,
    jsonb_build_object(
      'document_type', v_document_type,
      'document_no', v_document_no,
      'approved_requests', v_count
    ),
    jsonb_build_object(
      'actor', v_ctx,
      'decision_note', v_note
    )
  );

  return jsonb_build_object(
    'ok', true,
    'approved_requests', v_count,
    'document_type', v_document_type,
    'document_no', v_document_no,
    'actor', v_ctx
  );
end;
$function$
;

create or replace function public.be_superadmin_waybill_pdf_authorize_v1(p_way_ids text[],p_paper_size text default '4x6',p_label_size text default '4x6')
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; result jsonb; n integer;
begin
 ctx:=public.be_data_entry_require_access_v57('view',false);
 if regexp_replace(lower(coalesce(ctx->>'actor_role','')),'[^a-z]','','g')<>'superadmin' then raise exception 'Superadmin required.' using errcode='42501'; end if;
 result:=public.be_waybill_print_release_v2(p_way_ids,p_paper_size,p_label_size);
 select count(distinct btrim(x)) into n from unnest(p_way_ids) x where nullif(btrim(x),'') is not null;
 if (result->>'authorized_count')::integer<>n then raise exception 'Reprint requires a specific Superadmin approval. Refresh Waybill Studio and request approval with a reason.'; end if;
 return result;
end; $$;
revoke all on function public.be_waybill_print_release_v2(text[],text,text,text,boolean),public.be_waybill_reprint_decide_v2(uuid,text,text),public.be_waybill_reprint_status_v2(text[]),public.be_document_print_guard(jsonb),public.be_document_print_approve(jsonb),public.be_superadmin_waybill_pdf_authorize_v1(text[],text,text) from public,anon;
grant execute on function public.be_waybill_print_release_v2(text[],text,text,text,boolean),public.be_waybill_reprint_decide_v2(uuid,text,text),public.be_waybill_reprint_status_v2(text[]),public.be_document_print_guard(jsonb),public.be_document_print_approve(jsonb),public.be_superadmin_waybill_pdf_authorize_v1(text[],text,text) to authenticated;

-- Legacy batch endpoint cannot identify selected parcel numbers; fail closed.
create or replace function public.be_waybill_authorize_batch_print_v38(p_pickup_id text,p_waybill_no text,p_document_type text default 'WAYBILL',p_row_count integer default 0,p_paper_size text default null,p_label_size text default null,p_reason text default '',p_actor_email text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('allowed',false,'message','Use Waybill Studio: each waybill number requires its own print release and single-use reprint approval.');
$$;
