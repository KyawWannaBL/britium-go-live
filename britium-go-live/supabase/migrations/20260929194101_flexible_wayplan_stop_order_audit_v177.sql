
do $$
declare f text;
begin
  select pg_get_functiondef(p.oid) into f
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_rider_arrive_customer_v77'
  limit 1;

  f := replace(
    f,
    '''override_id'',v_override_id,''source'',''V173_ACCEPTED_TOWNSHIP_FALLBACK'')',
    '''override_id'',v_override_id,
      ''planned_stop_sequence'',v_sequence,
      ''previous_planned_current_stop'',v_current,
      ''served_out_of_planned_order'',coalesce(v_sequence<>v_current,false),
      ''source'',''V177_FLEXIBLE_STOP_ORDER'')'
  );

  f := replace(
    f,
    '''location_match'',v_location_match,
    ''override_used'',v_override_id is not null,''override_id'',v_override_id,
    ''build'',''RIDER_ARRIVE_CUSTOMER_V173''',
    '''location_match'',v_location_match,
    ''planned_stop_sequence'',v_sequence,
    ''previous_planned_current_stop'',v_current,
    ''served_out_of_planned_order'',coalesce(v_sequence<>v_current,false),
    ''override_used'',v_override_id is not null,''override_id'',v_override_id,
    ''build'',''RIDER_ARRIVE_CUSTOMER_V177'''
  );

  execute f;
end $$;
