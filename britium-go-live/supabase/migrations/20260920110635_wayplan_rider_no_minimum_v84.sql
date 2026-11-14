-- V84: Rider-selected Wayplans are exempt from the delivery-van minimum parcel rule.
-- Driver/van-only routes retain the existing 50-75 operating band and approval controls.
do $$
declare
  v_def text;
  old_count text := 'if n>75 then raise exception ''A delivery route cannot exceed 75 parcels.''; end if; total_count:=total_count+n; if n<50 then short_count:=short_count+1; end if;';
  new_count text := 'if n>75 then raise exception ''A delivery route cannot exceed 75 parcels.''; end if; total_count:=total_count+n; if n<50 and not ((crew_mode=''ROSTER'' and coalesce(p->>''rider_code'','''')<>'''') or (crew_mode=''EMERGENCY_MANUAL'' and coalesce(btrim(p->>''rider_name''),'''')<>'''')) then short_count:=short_count+1; end if;';
  old_meta text := '''below_minimum'',jsonb_array_length(p->''delivery_way_ids'')<50,''below_minimum_reason'',reason,''emergency_substitution_reason'',p->>''emergency_substitution_reason''';
  new_meta text := '''below_minimum'',jsonb_array_length(p->''delivery_way_ids'')<50 and not ((crew_mode=''ROSTER'' and coalesce(p->>''rider_code'','''')<>'''') or (crew_mode=''EMERGENCY_MANUAL'' and coalesce(btrim(p->>''rider_name''),'''')<>'''')),''rider_minimum_exempt'',jsonb_array_length(p->''delivery_way_ids'')<50 and ((crew_mode=''ROSTER'' and coalesce(p->>''rider_code'','''')<>'''') or (crew_mode=''EMERGENCY_MANUAL'' and coalesce(btrim(p->>''rider_name''),'''')<>'''')),''below_minimum_reason'',reason,''emergency_substitution_reason'',p->>''emergency_substitution_reason''';
  old_audit text := 'if jsonb_array_length(p->''delivery_way_ids'')<50 then';
  new_audit text := 'if jsonb_array_length(p->''delivery_way_ids'')<50 and not ((crew_mode=''ROSTER'' and coalesce(p->>''rider_code'','''')<>'''') or (crew_mode=''EMERGENCY_MANUAL'' and coalesce(btrim(p->>''rider_name''),'''')<>'''')) then';
  old_build text := '''build'',''WAYPLAN_MULTI_VAN_GENERATE_V77'',''rider_optional'',true';
  new_build text := '''build'',''WAYPLAN_RIDER_NO_MINIMUM_V84'',''rider_optional'',true,''rider_minimum_parcels'',0,''van_minimum_parcels'',50';
begin
  select pg_get_functiondef('public.be_generate_multi_van_v43(jsonb)'::regprocedure) into v_def;

  if position(old_count in v_def)=0 then raise exception 'V84 count patch anchor not found'; end if;
  if position(old_meta in v_def)=0 then raise exception 'V84 metadata patch anchor not found'; end if;
  if position(old_audit in v_def)=0 then raise exception 'V84 audit patch anchor not found'; end if;
  if position(old_build in v_def)=0 then raise exception 'V84 build patch anchor not found'; end if;

  v_def := replace(v_def, old_count, new_count);
  v_def := replace(v_def, old_meta, new_meta);
  v_def := replace(v_def, old_audit, new_audit);
  v_def := replace(v_def, old_build, new_build);

  execute v_def;
end $$;

grant execute on function public.be_generate_multi_van_v43(jsonb) to authenticated;
