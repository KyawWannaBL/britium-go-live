
DO $fix$
DECLARE fn text;
 needle text:='    begin perform public.be_rider_prepare_route_v77(v_wayplan,v_code); exception when others then null; end;';
 anchor text:='    update public.be_rider_route_stop_state_v46';
 guard text:='    if coalesce((v_result->>''ok'')::boolean,false) is distinct from true then
      return coalesce(v_result,''{}''::jsonb)||jsonb_build_object(''ok'',false,''error'',
        coalesce(nullif(v_result->>''error'',''''),''DELIVERY_FAILURE_NOT_RECORDED''));
    end if;

';
 before_action text; after_action text;
BEGIN
 SELECT pg_get_functiondef(oid) into fn FROM pg_proc WHERE proname='be_field_team_delivery_action_v77' LIMIT 1;
 IF fn IS NULL OR strpos(fn,needle)=0 THEN RAISE EXCEPTION 'V77 function changed, stop migration';END IF;
 fn:=replace(fn,needle,'    -- Previously prepared route is retained; reporting a failure does not rerun route optimization.');
 before_action:=split_part(fn,'    v_result:=public.be_field_team_delivery_action_v71(',1);
 after_action:=substr(fn,length(before_action)+1);
 IF strpos(after_action,anchor)=0 THEN RAISE EXCEPTION 'Exception route update anchor missing';END IF;
 after_action:=replace(after_action,anchor,guard||anchor);
 fn:=before_action||after_action;
 EXECUTE fn;
END $fix$;