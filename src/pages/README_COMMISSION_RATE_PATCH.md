
# Britium Commission Rate Patch

This patch fixes the commission rates for Rider, Driver, and Helper.

## Rates applied

| Operation | Rider | Driver | Helper | Unit |
|---|---:|---:|---:|---|
| Parcel pickup | 150 MMK | 75 MMK | 75 MMK | per parcel |
| Parcel delivery | 300 MMK | 150 MMK | 150 MMK | per parcel |
| Highway station drop-off | 1000 MMK | 1000 MMK | 1000 MMK | per bag |

Assumption used: “1000 MMK per bag for all” means the same 1000 MMK/bag rate applies to Rider, Driver, and Helper when they are assigned to a highway drop-off job.

## Install

Run:

```sql
rollback;
```

Then run the full SQL file:

```text
commission_rate_sync.sql
```

## Verify rates

```sql
select operation_type, role_code, unit_type, rate_mmk
from public.be_commission_rate_master
where active
order by operation_type, role_code;
```

Expected:

```text
PICKUP            RIDER   PARCEL  150
PICKUP            DRIVER  PARCEL   75
PICKUP            HELPER  PARCEL   75
DELIVERY          RIDER   PARCEL  300
DELIVERY          DRIVER  PARCEL  150
DELIVERY          HELPER  PARCEL  150
HIGHWAY_DROPOFF   RIDER   BAG    1000
HIGHWAY_DROPOFF   DRIVER  BAG    1000
HIGHWAY_DROPOFF   HELPER  BAG    1000
```

## Rebuild and check today’s settlement

```sql
select public.be_commission_settlement_snapshot(current_date, 'system', true);
```

## Rider settlement

```sql
select public.be_rider_settlement_snapshot(null, current_date);
```

## Driver/helper settlement

```sql
select public.be_driver_helper_settlement_snapshot(current_date, 'system');
```

## Register highway station drop-off bags

Use this when a van/rider drops sacks at a highway station.

```sql
select public.be_record_highway_dropoff_bags(
  p_wayplan_code => 'WP0620-APA-030',
  p_bag_count => 3,
  p_asset_code => 'PICKUP-VAN-1',
  p_rider_email => null,
  p_driver_email => 'testdriver@britiumexpress.com',
  p_helper_email => 'testhelper@britiumexpress.com',
  p_actor_email => 'testwarehouse@britiumexpress.com',
  p_work_date => current_date
);
```

Then verify:

```sql
select public.be_commission_settlement_snapshot(current_date, 'system', true);
```

Manual highway drop-off entries are preserved when auto commission is rebuilt.

## Frontend wiring

Existing Rider Settlement page should call:

```ts
supabase.rpc("be_rider_settlement_snapshot", {
  p_rider_email: null,
  p_work_date: new Date().toISOString().slice(0, 10),
});
```

Driver/helper settlement or Finance screen can call:

```ts
supabase.rpc("be_driver_helper_settlement_snapshot", {
  p_work_date: new Date().toISOString().slice(0, 10),
  p_actor_email: currentUserEmail,
});
```

A general commission dashboard can call:

```ts
supabase.rpc("be_commission_settlement_snapshot", {
  p_work_date: new Date().toISOString().slice(0, 10),
  p_actor_email: currentUserEmail,
  p_rebuild: true,
});
```
