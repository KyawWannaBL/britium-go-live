-- Explicit highway handoff selections must win over legacy township-provider matches.
-- Preserve the existing no-item-price address rule; do not infer handoff from an
-- ordinary COD delivery address merely mentioning a highway station.
do $migration$
declare
  definition text := pg_get_functiondef('public.be_data_entry_delivery_route_v26(text,numeric,text,text)'::regprocedure);
  old_clause text := $old$  v_explicit_station boolean := (
    coalesce(p_item_price,0) <= 0
    and lower(coalesce(p_delivery_address,'')) ~ '(ဂိတ်ချပေးရန်|အဝေးပြေးကားဝင်း|highway bus station|highway station)'
  );$old$;
  new_clause text := $new$  v_explicit_station boolean := (
    -- EXPLICIT_HIGHWAY_SELECTION_20261022: mirror the Data Entry selector.
    lower(btrim(coalesce(p_township,''))) in ('ဂိတ်ချ','h.terminal drop-off','highway terminal drop-off')
    or upper(btrim(coalesce(p_requested_provider,'')))='H.TERMINAL DROP-OFF'
    or (coalesce(p_item_price,0) <= 0
      and lower(coalesce(p_delivery_address,'')) ~ '(ဂိတ်ချပေးရန်|အဝေးပြေးကားဝင်း|highway bus station|highway station)')
  );$new$;
begin
  if position('EXPLICIT_HIGHWAY_SELECTION_20261022' in definition)>0 then return; end if;
  if position(old_clause in definition)=0 then
    raise exception 'Expected explicit highway routing clause missing; no change applied';
  end if;
  execute replace(definition,old_clause,new_clause);
end
$migration$;
