-- Manual confirmation of an already-executed post-payment refund/recovery.
-- Never initiates transfers or changes original settlement ledger balances.
create table if not exists public.be_finance_post_payment_adjustment_disbursements_v1 (
 id uuid primary key default gen_random_uuid(),
 adjustment_id uuid not null unique references public.be_finance_settlement_adjustments_v3(id),
 amount numeric(16,2) not null check(amount>0),
 payment_method text not null,
 payment_reference text not null unique,
 evidence_url text not null,
 confirmed_by text not null,
 confirmed_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
alter table public.be_finance_post_payment_adjustment_disbursements_v1 enable row level security;
revoke all on public.be_finance_post_payment_adjustment_disbursements_v1 from anon,authenticated;
create or replace function public.be_finance_post_payment_adjustment_confirm_v1(
 p_adjustment_id uuid,p_amount numeric,p_payment_method text,p_payment_reference text,p_evidence_url text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_role text;v_actor text;v_before public.be_finance_settlement_adjustments_v3%rowtype;
 v_after public.be_finance_settlement_adjustments_v3%rowtype;v_id uuid;
begin
 v_role:=upper(public.be_finance_assert_internal_v3());
 if v_role not in ('PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE_MANAGER','ADMIN','SUPERADMIN') then raise exception 'Payment officer authorization required'; end if;
 v_actor:=public.be_finance_actor_email_v3();
 if coalesce(trim(p_payment_reference),'')='' or length(trim(p_payment_reference))>200 then raise exception 'Payment reference required'; end if;
 if coalesce(trim(p_payment_method),'')='' or length(trim(p_payment_method))>60 then raise exception 'Payment method required'; end if;
 if coalesce(p_evidence_url,'') !~ '^https://' or length(p_evidence_url)>2000 then raise exception 'HTTPS receipt evidence required'; end if;
 select * into v_before from public.be_finance_settlement_adjustments_v3 where id=p_adjustment_id for update;
 if not found or v_before.adjustment_type not like 'POST_PAYMENT_%' or v_before.status<>'APPROVED_UNPAID' then raise exception 'Only approved unpaid post-payment requests may be confirmed'; end if;
 if lower(coalesce(v_before.requested_by,''))=lower(v_actor) or lower(coalesce(v_before.approved_by,''))=lower(v_actor) then raise exception 'Separation of duties: requester and approver cannot confirm disbursement'; end if;
 if p_amount is null or p_amount<>abs(v_before.difference) then raise exception 'Confirmed amount must equal the approved adjustment'; end if;
 insert into public.be_finance_post_payment_adjustment_disbursements_v1(adjustment_id,amount,payment_method,payment_reference,evidence_url,confirmed_by)
 values(p_adjustment_id,p_amount,trim(p_payment_method),trim(p_payment_reference),p_evidence_url,v_actor) returning id into v_id;
 update public.be_finance_settlement_adjustments_v3 set status='PAID',updated_at=now() where id=p_adjustment_id returning * into v_after;
 perform public.be_finance_audit_v3('POST_PAYMENT_ADJUSTMENT_PAID','SETTLEMENT_ADJUSTMENT',p_adjustment_id::text,to_jsonb(v_before),to_jsonb(v_after),'Confirmed external payment '||trim(p_payment_reference));
 return jsonb_build_object('ok',true,'id',v_id,'status','PAID','payment_recorded',true,'external_transfer_initiated',false);
end $$;
revoke all on function public.be_finance_post_payment_adjustment_confirm_v1(uuid,numeric,text,text,text) from public;
grant execute on function public.be_finance_post_payment_adjustment_confirm_v1(uuid,numeric,text,text,text) to authenticated;
