
do $$
declare f text;
begin
  select pg_get_functiondef(p.oid) into f
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_rider_dropoff_pin_v147'
  limit 1;

  f := replace(f, 'elsif v_role in (''rider'',''driver'') then', 'elsif v_role in (''rider'',''driver'',''helper'') then');
  f := replace(
    f,
    '(v_role=''driver'' and upper(coalesce(d.driver_code,''''))=v_worker)',
    '(v_role=''driver'' and upper(coalesce(d.driver_code,''''))=v_worker)
          or
          (v_role=''helper'' and upper(coalesce(d.helper_code,''''))=v_worker)'
  );
  execute f;
end $$;
