# Britium Go-Live Data Entry + Warehouse Patch

## Files
- `DataEntryPage.tsx` → replace `src/pages/DataEntryPage.tsx`
- `WarehousePage.tsx` → replace `src/pages/WarehousePage.tsx`
- `Britium_DataEntry_Waybill_Template.xlsx` → copy to `public/templates/`
- `Britium_Warehouse_Inventory_Template.xlsx` → copy to `public/templates/`

## Main fixes
- Removed mock/sample row generation.
- Data Entry loads real pickup requests from `be_portal_pickup_requests`.
- Data Entry loads existing waybill rows from `be_portal_pickup_request_items`.
- Data Entry saves through `be_save_data_entry_waybills`, with fallback upsert to `be_portal_pickup_request_items`.
- Data Entry writes cargo events to `be_portal_cargo_events`.
- Warehouse loads real intake batches from `be_portal_pickup_request_items`.
- Warehouse saves through `be_save_warehouse_inventory_rows`, with fallback upsert to `be_warehouse_inventory_rows`.
- Warehouse updates item status and writes cargo events.
- Upload buttons register files through backend storage/RPC.
- UI/CSS classes are kept aligned with the uploaded current pages.

## Expected backend objects
- `be_portal_pickup_requests`
- `be_portal_pickup_request_items`
- `be_calculate_tariff`
- `be_save_data_entry_waybills`
- `be_save_warehouse_inventory_rows`
- `be_warehouse_inventory_rows`
- `be_portal_cargo_events`
- `be_register_data_entry_upload`
- `be_register_warehouse_upload`
- Storage buckets:
  - `data-entry-imports`
  - `warehouse-imports`

If an RPC is not available yet, the code falls back to table writes where possible.
