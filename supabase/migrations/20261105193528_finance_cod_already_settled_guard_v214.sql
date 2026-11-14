do $patch$
declare
  v_def text;
  v_anchor text := '  if exists(select 1 from public.be_wayplan_cod_settlements w';
  v_guard text := $guard$
  -- Idempotent settled-state check after locking; no financial row is changed.
  if not exists(
    select 1 from public.be_wayplan_cod_settlements w
    where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
      and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
  ) then
    return jsonb_build_object('ok',false,'error','COD_WAY_NOT_FOUND');
  end if;
  if not exists(
    select 1 from public.be_wayplan_cod_settlements w
    where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
      and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
      and upper(coalesce(w.settlement_status,'')) <> 'SETTLED'
  ) then
    return jsonb_build_object('ok',true,'status','ALREADY_SETTLED','settled_count',0,'finance_v48_settled_count',0,'message','Previously settled COD records were left unchanged.');
  end if;
$guard$;
begin
  select pg_get_functiondef('public.be_finance_settle_wayplan_cod(jsonb)'::regprocedure) into v_def;
  if position('COD_WAY_NOT_FOUND' in v_def)>0 then
    raise notice 'COD settled guard already installed';
    return;
  end if;
  if position(v_anchor in v_def)=0 then
    raise exception 'Known settlement function anchor not present; refusing modification';
  end if;
  v_def:=replace(v_def,v_anchor,v_guard||E'\n'||v_anchor);
  execute v_def;
end;
$patch$;