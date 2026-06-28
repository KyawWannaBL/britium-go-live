# Britium Frontend Operational Wire-up Patch

Backend smoke test is complete:

P0619-APA-001 → WB0619-APA-001 → WP0619-APA-001 → D0619-APA-001 → INV0619-APA-001
DELIVERED / COD_SETTLED / SETTLED

## Install

Copy:

src/lib/britiumOperationalApi.ts

into your enterprise portal project.

## Required page bindings

### CustomerServicePortalPage.tsx
Use:
```ts
loadOperationalQueue("cs")
```

### SupervisorPickupPage.tsx
Use:
```ts
loadOperationalQueue("supervisor")
assignPickup()
```

### Rider app jobs page
Use:
```ts
loadOperationalQueue("rider")
riderMarkCollected()
```

### DataEntryPage.tsx
Use:
```ts
loadOperationalQueue("dataEntry")
createWaybill()
```

### WarehousePage.tsx
Use:
```ts
loadOperationalQueue("warehouse")
warehouseReceive()
```

### SupervisorWayplanReviewPage.tsx / Wayplan page
Use:
```ts
loadOperationalQueue("wayplan")
createWayplanForWaybill()
```

Do not call the old `be_wayplan_create()` for operational wayplans. It creates route-style IDs. Use `be_wayplan_create_for_waybill()`.

### Dispatch page
Use:
```ts
loadOperationalQueue("dispatch")
dispatchStart()
markDelivered()
```

### Finance page
Use:
```ts
loadOperationalQueue("finance")
settleCod()
```

## Build checks

Run:

```bash
npm run build
```

Then deploy.

## UAT SQL check

```sql
select
  pickup_id,
  waybill_no,
  wayplan_id,
  delivery_way_id,
  invoice_no,
  pickup_status,
  workflow_stage,
  warehouse_status,
  wayplan_status,
  dispatch_status,
  finance_status,
  cod_settlement_status,
  cod_amount,
  cod_collected_amount,
  cod_settled_amount
from public.be_v_operational_chain
order by updated_at desc
limit 20;
```

Completed COD shipment must show:

DELIVERED / DELIVERED / RECEIVED / ASSIGNED / DELIVERED / COD_SETTLED / SETTLED.
