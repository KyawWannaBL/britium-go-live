
create table if not exists public.be_corporate_service_finance_review_events_v1(
 id bigint generated always as identity primary key,
 delivery_way_id text not null references public.be_corporate_service_way_rate_v1(delivery_way_id),
 action text not null,
 review_status text not null,
 note text not null,
 reviewer_user_id uuid not null,
 reviewed_at timestamptz not null default now()
);
alter table public.be_corporate_service_finance_review_events_v1 enable row level security;
revoke all on public.be_corporate_service_finance_review_events_v1 from public,anon,authenticated;

create or replace function public.be_corporate_finance_review_action_v1(
 p_delivery_way_id text,p_action text,p_note text)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp
as $fn$
declare v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
 v_record public.be_corporate_service_way_rate_v1%rowtype;
 v_status text;
begin
 if auth.uid() is null or v_role not in ('superadmin','super_admin','finance','finance_manager','accountant') then
  raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';
 end if;
 if p_action not in ('APPROVE_FOR_INVOICING','REQUIRES_CORRECTION','REOPEN') then
  raise exception 'INVALID_REVIEW_ACTION';
 end if;
 if length(trim(coalesce(p_note,'')))<12 then
  raise exception 'DETAILED_FINANCE_REVIEW_NOTE_REQUIRED';
 end if;
 v_status:=case p_action
  when 'APPROVE_FOR_INVOICING' then 'APPROVED_FOR_INVOICING'
  when 'REQUIRES_CORRECTION' then 'REQUIRES_CORRECTION'
  else 'PENDING_FINANCE_REVIEW' end;
 update public.be_corporate_service_way_rate_v1
 set finance_review_status=v_status,
 finance_note=trim(p_note),finance_reviewed_by=auth.uid(),finance_reviewed_at=now()
 where delivery_way_id=trim(p_delivery_way_id)
 returning * into v_record;
 if not found then raise exception 'CORPORATE_WAY_RATE_NOT_FOUND';end if;
 insert into public.be_corporate_service_finance_review_events_v1
 (delivery_way_id,action,review_status,note,reviewer_user_id)
 values(v_record.delivery_way_id,p_action,v_status,trim(p_note),auth.uid());
 return jsonb_build_object('ok',true,'delivery_way_id',v_record.delivery_way_id,
 'finance_review_status',v_record.finance_review_status,
 'corporate_receivable_mmk',v_record.corporate_receivable_mmk,
 'recipient_fee_mmk',v_record.recipient_fee_mmk,
 'invoice_or_payment_posted',false,'audit_recorded',true);
end $fn$;
revoke all on function public.be_corporate_finance_review_action_v1(text,text,text) from public,anon;
grant execute on function public.be_corporate_finance_review_action_v1(text,text,text) to authenticated;
