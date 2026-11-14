
do $$
declare f text;
begin
  select pg_get_functiondef(p.oid) into f
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_rider_arrive_stop_v46'
  limit 1;
  if f is not null then
    f := replace(
      f,
      '  if v_sequence <> v_current then
    raise exception ''Stop order enforced. Complete or fail stop % before stop %'', v_current, v_sequence;
  end if;
',
      ''
    );
    execute f;
  end if;

  select pg_get_functiondef(p.oid) into f
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_rider_record_stop_result_v46'
  limit 1;
  if f is not null then
    f := replace(
      f,
      '  if v_sequence <> v_current then
    raise exception ''Stop order enforced. Current stop is %, submitted stop is %'', v_current, v_sequence;
  end if;
',
      ''
    );
    execute f;
  end if;
end $$;
