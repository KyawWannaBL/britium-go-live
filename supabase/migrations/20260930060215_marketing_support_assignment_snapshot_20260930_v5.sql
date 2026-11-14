
begin;

create or replace function public.be_marketing_support_assignment_snapshot_v1(
  p_search text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
begin
  if not (
    public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('financial_reports')
    or exists(
      select 1 from public.be_user_account_registry u
      where u.auth_user_id=auth.uid()
        and upper(coalesce(u.role,'')) in ('MARKETING','MARKETER','SUPER_ADMIN','MANAGER')
    )
  ) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  return jsonb_build_object(
    'ok',true,
    'rows',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.active desc,q.merchant_name,q.referrer_name)
      from (
        select
          a.id,a.merchant_id,a.merchant_code,a.merchant_name,
          a.referrer_employee_id,a.referrer_email,a.referrer_name,
          a.effective_from,a.effective_to,a.active,a.notes,a.updated_at,
          public.be_is_employee_employed_on(a.referrer_email,current_date) as employee_eligible,
          exists(
            select 1 from public.merchants m
            where upper(coalesce(m.merchant_code,''))=upper(coalesce(a.merchant_code,a.merchant_id))
              and coalesce(m.is_active,true)
          ) as merchant_eligible,
          100::numeric as rate_mmk_per_parcel
        from public.be_merchant_referral_assignments a
        where nullif(btrim(coalesce(p_search,'')),'') is null
           or coalesce(a.merchant_code,'') ilike '%'||p_search||'%'
           or coalesce(a.merchant_name,'') ilike '%'||p_search||'%'
           or coalesce(a.referrer_name,'') ilike '%'||p_search||'%'
           or coalesce(a.referrer_email,'') ilike '%'||p_search||'%'
        order by a.active desc,a.merchant_name,a.referrer_name
        limit greatest(1,least(coalesce(p_limit,1000),5000))
      ) q
    ),'[]'::jsonb),
    'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

revoke all on function public.be_marketing_support_assignment_snapshot_v1(text,integer)
from public,anon;
grant execute on function public.be_marketing_support_assignment_snapshot_v1(text,integer)
to authenticated,service_role;

commit;
