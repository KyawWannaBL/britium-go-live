
do $$
declare f text;
begin
  select pg_get_functiondef(p.oid) into f
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_rider_arrive_customer_v77'
  limit 1;

  f := replace(
    f,
    '  if v_sequence<>v_current then
    raise exception ''STOP_ORDER_ENFORCED: complete or fail stop % before stop %'',v_current,v_sequence using errcode=''22023'';
  end if;
',
    ''
  );

  execute f;
end $$;
