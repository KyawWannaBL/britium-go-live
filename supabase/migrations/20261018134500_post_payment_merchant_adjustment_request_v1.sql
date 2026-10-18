-- Separate post-payment merchant refund/promotion requests.
-- This migration intentionally does not mutate settled batches or pay funds.
create or replace function public.be_finance_post_payment_adjustment_request_v1(
  p_batch_id uuid,
  p_type text,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_evidence_url text default null
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_role text;
  v_actor text;
  v_batch public.be_finance_settlement_batches_v3%rowtype;
  v_id uuid;
  v_type text := upper(trim(coalesce(p_type,'')));
  v_direction text := upper(trim(coalesce(p_direction,'')));
begin
  v_role := upper(public.be_finance_assert_internal_v3());
  if v_role not in ('FINANCE_CREATOR','FINANCE','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') then
    raise exception 'Not authorized to request settlement adjustment';
  end if;
  v_actor := public.be_finance_actor_email_v3();
  if v_type not in ('REFUND','PROMOTION','GOODWILL','OTHER') then
    raise exception 'Unsupported adjustment reason category';
  end if;
  if v_direction not in ('CREDIT','DEDUCTION') then
    raise exception 'Specify CREDIT or DEDUCTION';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 or p_amount <> round(p_amount,2) then
    raise exception 'Invalid positive MMK adjustment amount';
  end if;
  if length(trim(coalesce(p_reason,''))) < 8 or length(p_reason) > 1000 then
    raise exception 'Provide an adjustment explanation (8 to 1000 characters)';
  end if;
  if p_evidence_url is not null and (length(p_evidence_url) > 2000 or p_evidence_url !~ '^https://') then
    raise exception 'Evidence URL must be HTTPS';
  end if;
  select * into v_batch from public.be_finance_settlement_batches_v3 where id=p_batch_id;
  if not found or v_batch.status <> 'PAID' then
    raise exception 'Post-payment adjustment requires a paid settlement';
  end if;
  insert into public.be_finance_settlement_adjustments_v3
    (original_batch_id, adjustment_type, previous_amount, corrected_amount, difference,
     reason, supporting_document_url, requested_by, status)
  values
    (p_batch_id, 'POST_PAYMENT_'||v_type||'_'||v_direction, v_batch.batch_net_payable,
     v_batch.batch_net_payable + case when v_direction='CREDIT' then p_amount else -p_amount end,
     case when v_direction='CREDIT' then p_amount else -p_amount end,
     trim(p_reason), p_evidence_url, v_actor, 'PENDING_APPROVAL')
  returning id into v_id;
  perform public.be_finance_audit_v3(
    'POST_PAYMENT_ADJUSTMENT_REQUEST','SETTLEMENT_ADJUSTMENT',v_id::text,
    null,jsonb_build_object('batch_id',p_batch_id,'type',v_type,'direction',v_direction,'amount',p_amount,'status','PENDING_APPROVAL'),
    trim(p_reason));
  return jsonb_build_object('ok',true,'id',v_id,'status','PENDING_APPROVAL','funds_transferred',false);
end
$$;
revoke all on function public.be_finance_post_payment_adjustment_request_v1(uuid,text,text,numeric,text,text) from public;
grant execute on function public.be_finance_post_payment_adjustment_request_v1(uuid,text,text,numeric,text,text) to authenticated;
