-- Complete V33 reconciliation for accepted location rows that were validated before parcel save.
UPDATE public.be_delivery_location_registry l
SET delivery_way_id=a.canonical_way_id,
    updated_at=now()
FROM public.be_delivery_way_id_aliases_v33 a
WHERE upper(l.delivery_way_id)=upper(a.alias_way_id)
  AND a.pickup_id='P0914-BLK-275'
  AND NOT EXISTS (
    SELECT 1
    FROM public.be_delivery_location_registry c
    WHERE upper(c.delivery_way_id)=upper(a.canonical_way_id)
  );
