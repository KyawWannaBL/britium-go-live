create table if not exists public.be_direct_rto_requests_v1 (
 id uuid primary key default gen_random_uuid(),
 delivery_way_id text not null,
 reason_code text not null references public.be_delivery_failure_reasons(reason_code),
 evidence_note text not null,
 evidence_url text,
 requested_by uuid not null,
 requested_at timestamptz not null default now(),
 decision text not null default 'PENDING' check (decision in ('PENDING','APPROVED','REJECTED')),
 decided_by uuid,
 decided_at timestamptz,
 decision_note text,
 constraint direct_rto_evidence_required check (length(btrim(evidence_note)) >= 20 or nullif(btrim(evidence_url),'') is not null)
);
create unique index if not exists be_direct_rto_requests_one_pending_idx on public.be_direct_rto_requests_v1(delivery_way_id) where decision='PENDING';
alter table public.be_direct_rto_requests_v1 enable row level security;
revoke all on public.be_direct_rto_requests_v1 from anon,authenticated;
create or replace function public.be_submit_direct_rto_request_v1(p_way_id text,p_reason_code text,p_evidence_note text,p_evidence_url text default null)
returns jsonb language plpgsql security definer set search_path='public','auth','pg_temp' as $$
declare v_id uuid; v_role text; v_way text := upper(btrim(coalesce(p_way_id,''))); v_reason text := upper(btrim(coalesce(p_reason_code,'')));
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('rider','driver','helper') then raise exception 'FIELD_TEAM_ROLE_REQUIRED'; end if;
 if not exists(select 1 from public.be_delivery_failure_reasons where reason_code=v_reason and failure_category='DIRECT_RTO') then raise exception 'NOT_A_DIRECT_RTO_REASON'; end if;
 if length(btrim(coalesce(p_evidence_note,'')))<20 and nullif(btrim(coalesce(p_evidence_url,'')),'') is null then raise exception 'DIRECT_RTO_EVIDENCE_REQUIRED'; end if;
 if not exists(select 1 from public.be_data_entry_parcel_details where delivery_way_id=v_way) then raise exception 'WAY_NOT_FOUND'; end if;
 insert into public.be_direct_rto_requests_v1(delivery_way_id,reason_code,evidence_note,evidence_url,requested_by)
 values(v_way,v_reason,coalesce(p_evidence_note,''),nullif(btrim(coalesce(p_evidence_url,'')),''),auth.uid())
 returning id into v_id;
 return jsonb_build_object('ok',true,'request_id',v_id,'status','PENDING_OPERATION_MANAGER_APPROVAL','rto',false);
end $$;
revoke all on function public.be_submit_direct_rto_request_v1(text,text,text,text) from public,anon;
grant execute on function public.be_submit_direct_rto_request_v1(text,text,text,text) to authenticated;