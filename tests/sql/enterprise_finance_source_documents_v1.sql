insert into public.finance_daily_logs (
  entry_date, department_code, fuel_and_tolls_spent, is_locked
) values (date '2099-01-02', 'FINANCE', 1000, false);

do $$
declare
  v_id uuid;
  v_locked boolean;
begin
  select id, is_locked into v_id, v_locked
  from public.finance_daily_logs
  where entry_date=date '2099-01-02' and department_code='FINANCE'
  order by created_at desc limit 1;

  if v_locked is distinct from true then
    raise exception 'submission was not forced locked';
  end if;

  begin
    update public.finance_daily_logs
    set fuel_and_tolls_spent=2000
    where id=v_id;
    raise exception 'locked finance row update unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm='locked finance row update unexpectedly succeeded' then
        raise;
      end if;
  end;
end $$;

insert into public.admin_assets_and_hr_logs (
  entry_date,
  department_code,
  asset_name,
  asset_category,
  acquisition_cost,
  useful_life_months,
  warehouse_overtime,
  base_payroll_accrual,
  facility_rent,
  utilities_admin_cost,
  is_locked
) values (
  date '2099-01-02',
  'ADMIN_HR',
  'Test Laptop',
  'IT_INFRASTRUCTURE',
  1200000,
  36,
  50000,
  100000,
  250000,
  80000,
  false
);

do $$
declare
  v_locked boolean;
begin
  select is_locked into v_locked
  from public.admin_assets_and_hr_logs
  where entry_date=date '2099-01-02' and department_code='ADMIN_HR'
  order by created_at desc limit 1;

  if v_locked is distinct from true then
    raise exception 'admin/hr submission was not forced locked';
  end if;
end $$;
