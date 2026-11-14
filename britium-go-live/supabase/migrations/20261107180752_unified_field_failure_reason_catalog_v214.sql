-- Unified authenticated exception reason read API, shared by all field roles.
-- This is additive. It does not modify parcel status, attempts, RTO, or settlement.
create or replace function public.be_field_delivery_failure_reasons_v214()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'AUTHENTICATION_REQUIRED', 'reasons', '[]'::jsonb);
  end if;

  select jsonb_build_object(
    'ok', true,
    'catalog_version', 'FIELD_EXCEPTION_UNIFIED_V214',
    'reasons', coalesce(jsonb_agg(jsonb_build_object(
      'code', r.exception_code,
      'name_en', r.exception_name_en,
      'name_mm', r.exception_name_mm,
      'mapped_status', r.mapped_status,
      'severity', r.severity,
      'require_photo', r.require_photo,
      'require_remark', r.require_remark,
      'next_action', r.next_action,
      'customer_message_en', r.customer_message_en,
      'customer_message_mm', r.customer_message_mm,
      'failure_category', coalesce(
        nullif(upper(c.failure_category),''),
        case
          when upper(r.exception_code) in ('CUSTOMER_REFUSED','CUSTOMER_REJECTED','WRONG_ITEM')
            then 'DIRECT_RTO'
          when upper(r.exception_code) in (
            'PHONE_OFF','PHONE_OUT_OF_COVERAGE','NO_ANSWER',
            'PHONE_UNREACHABLE','CUSTOMER_NOT_AVAILABLE','ADDRESS_NOT_FOUND'
          ) then 'VALID_REASON'
          else 'INVALID_REASON'
        end
      )
    ) order by r.exception_code), '[]'::jsonb)
  )
  into v_result
  from public.be_exception_rules r
  left join public.be_delivery_failure_reasons c
    on upper(c.reason_code) = upper(r.exception_code)
   and coalesce(c.active, true)
  where upper(coalesce(r.process_type, '')) = 'DELIVERY'
    and coalesce(r.active, true);

  return coalesce(v_result, jsonb_build_object('ok',true,'reasons','[]'::jsonb));
end;
$function$;

revoke all on function public.be_field_delivery_failure_reasons_v214() from public;
revoke all on function public.be_field_delivery_failure_reasons_v214() from anon;
grant execute on function public.be_field_delivery_failure_reasons_v214() to authenticated;
