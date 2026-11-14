-- Allow the approved Yangon 3/5/9 master plan to use up to nine active routes
-- and to use volume-driven zone sizes below 50 parcels. The standard planner
-- retains its existing 1-7 route and 50-75 parcel controls.
do $$
declare
  v_def text;
  v_mode text := 'upper(coalesce(nullif(p_payload->>''planning_mode'',''''),''STANDARD_50_75''))';
begin
  select pg_get_functiondef('public.be_generate_multi_van_v2(jsonb)'::regprocedure) into v_def;

  if position('YANGON_MASTER' in v_def) > 0 then
    return;
  end if;

  v_def := replace(
    v_def,
    'jsonb_array_length(plans) not between 1 and 7',
    'jsonb_array_length(plans) not between 1 and (case when ' || v_mode || '=''YANGON_MASTER'' then 9 else 7 end)'
  );

  v_def := replace(
    v_def,
    'if short_count>1 then raise exception ''Only one delivery van may be below 50 parcels.''; end if;',
    'if ' || v_mode || '<>''YANGON_MASTER'' and short_count>1 then raise exception ''Only one delivery van may be below 50 parcels.''; end if;'
  );

  v_def := replace(
    v_def,
    'if short_count=1 and (coalesce((p_payload->>''approve_below_minimum'')::boolean,false) is not true or length(reason)<5) then raise exception ''Operator approval and a reason are required for the van below 50 parcels.''; end if;',
    'if ' || v_mode || '<>''YANGON_MASTER'' and short_count=1 and (coalesce((p_payload->>''approve_below_minimum'')::boolean,false) is not true or length(reason)<5) then raise exception ''Operator approval and a reason are required for the van below 50 parcels.''; end if;'
  );

  if v_def not like '%YANGON_MASTER%' then
    raise exception 'Could not patch be_generate_multi_van_v2 for Yangon master planning.';
  end if;

  execute v_def;
end
$$;
