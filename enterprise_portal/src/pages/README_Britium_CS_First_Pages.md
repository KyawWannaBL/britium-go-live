# Britium Express CS-first portal pages

This package replaces the old generic ticket/case workflow with the CS-first logistics workflow:

1. CS creates an Order Pickup Request.
2. One request can contain multiple delivery item rows.
3. Supervisor manually assigns pickup rider with suggestions.
4. Warehouse marks parcels received/sorted/bagged/ready for wayplan.
5. Operation generates a draft Wayplan only after warehouse-ready.
6. Supervisor reviews, adjusts, and confirms delivery assignment.

## Files

- `CustomerServicePortalPage.tsx`  
  CS order pickup request form, merchant auto-fill, multi-item grid, CSV template download/upload, submitted queue.

- `CustomerServiceCommandCenterPage.tsx`  
  CS KPI dashboard and activity feed based on `be_portal_pickup_requests`.

- `DataEntryPage.tsx`  
  Search/correction/bulk correction for pickup request records.

- `SupervisorPickupAssignmentGoLivePage.tsx`  
  Supervisor pickup rider assignment with suggested riders.

- `SupervisorPortalPage.tsx`  
  Supervisor overview/hub for pickup assignment and wayplan review.

- `WarehousePage.tsx`  
  Warehouse receive/sort/bag/ready-for-wayplan scan page.

- `WarehouseOperationPage.tsx`  
  Same warehouse workflow page under the previously proposed page name.

- `OpsCommandPage.tsx`  
  Operation wayplan generation and route grouping control.

- `SupervisorWayplanReviewPage.tsx`  
  New page for wayplan review, adjustment, inclusion/exclusion, sequencing, and confirmation.

- `00_required_schema_patch_for_pages.sql`  
  Safe schema patch for child item table, wayplan tables, and required columns.

## Deployment order

1. Run `00_required_schema_patch_for_pages.sql` in Supabase SQL Editor.
2. Replace your existing TSX files with the versions in this package.
3. Add the two new pages to your router:
   - `SupervisorWayplanReviewPage.tsx`
   - `WarehouseOperationPage.tsx`
4. Confirm routes in your app menu/sidebar.
5. Test the workflow:
   - Create request in CS page.
   - Assign pickup rider in Supervisor Pickup Assignment.
   - Mark ready in Warehouse.
   - Generate draft wayplan in Operation.
   - Review/confirm in Supervisor Wayplan Review.

## Notes

These pages first try to use the RPC names defined in the architecture plan. If an RPC is not available yet, the page falls back to direct Supabase table operations where safe.

Recommended production RPCs:
- `be_master_dropdown_snapshot(p_branch_code text)`
- `be_cs_create_pickup_request(p_header jsonb, p_items jsonb)`
- `be_supervisor_pickup_assignment_queue(p_branch_code text)`
- `be_suggest_pickup_riders(p_pickup_id text)`
- `be_assign_pickup_rider(p_pickup_id text, p_worker_code text)`
- `be_warehouse_scan_event(p_pickup_id text, p_event_type text, p_location text)`
- `be_generate_delivery_wayplan(p_branch_code text, p_delivery_date date)`
- `be_supervisor_update_wayplan(p_wayplan_id uuid, p_items jsonb)`
- `be_confirm_delivery_wayplan(p_wayplan_id uuid)`
