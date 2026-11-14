-- Authenticated, audited review of post-payment requests. Never transfer funds here.
create or replace function public.be_finance_post_payment_adjustments_list_v1()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text; begin
 v_role:=upper(public.be_finance_assert_internal_v3());
 if v_role not in ('FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','FINANCE','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN','PAYMENT_OFFICER') then
   raise exception 'Finance permission required';
 end if;
 return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('batch_number',b.batch_number,'merchant_id',b.merchant_id) order by a.created_at desc)
 from public.be_finance_settlement_adjustments_v3 a
 join public.be_finance_settlement_batches_v3 b on b.id=a.original_batch_id
 where a.adjustment_type like 'POST_PAYMENT_%'), '[]'::jsonb);
end $$;
create or replace function public.be_finance_post_payment_adjustment_review_v1(p_adjustment_id uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text;v_actor text;v_action text:=upper(trim(coalesce(p_action,'')));v_before public.be_finance_settlement_adjustments_v3%rowtype;v_after public.be_finance_settlement_adjustments_v3%rowtype;
begin
 v_role:=upper(public.be_finance_assert_internal_v3());
 if v_role not in ('FINANCE_APPROVER','FINANCE_ADMIN','FINANCE_MANAGER','ADMIN','SUPERADMIN') then raise exception 'Finance approver required'; end if;
 if v_action not in ('APPROVE','REJECT') then raise exception 'Only APPROVE or REJECT allowed'; end if;
 if length(trim(coalesce(p_note,'')))<8 then raise exception 'Approval or rejection note must contain at least 8 characters'; end if;
 v_actor:=public.be_finance_actor_email_v3();
 select * into v_before from public.be_finance_settlement_adjustments_v3 where id=p_adjustment_id for update;
 if not found or v_before.adjustment_type not like 'POST_PAYMENT_%' or v_before.status<>'PENDING_APPROVAL' then raise exception 'Adjustment request unavailable for review'; end if;
 if lower(trim(coalesce(v_before.requested_by,'')))=lower(trim(coalesce(v_actor,''))) then raise exception 'Maker-checker: requester cannot approve or reject own adjustment'; end if;
 update public.be_finance_settlement_adjustments_v3 set status=case when v_action='APPROVE' then 'APPROVED_UNPAID' else 'REJECTED' end, approved_by=v_actor, updated_at=now() where id=p_adjustment_id returning * into v_after;
 perform public.be_finance_audit_v3('POST_PAYMENT_ADJUSTMENT_'||v_action,'SETTLEMENT_ADJUSTMENT',p_adjustment_id::text,to_jsonb(v_before),to_jsonb(v_after),trim(p_note));
 return jsonb_build_object('ok',true,'id',p_adjustment_id,'status',v_after.status,'funds_transferred',false);
end $$;
revoke all on function public.be_finance_post_payment_adjustments_list_v1() from public;
revoke all on function public.be_finance_post_payment_adjustment_review_v1(uuid,text,text) from public;
grant execute on function public.be_finance_post_payment_adjustments_list_v1() to authenticated;
grant execute on function public.be_finance_post_payment_adjustment_review_v1(uuid,text,text) to authenticated;
