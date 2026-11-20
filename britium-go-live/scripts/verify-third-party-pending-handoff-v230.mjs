import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pending=readFileSync(new URL("../src/pages/WarehousePendingParcelsPage.tsx",import.meta.url),"utf8");
const command=readFileSync(new URL("../src/pages/WayplanCommandCenterPage.tsx",import.meta.url),"utf8");
const warehouse=readFileSync(new URL("../src/pages/WarehousePage.tsx",import.meta.url),"utf8");

for(const term of [
  "be_warehouse_mark_delivery_ready_v150",
  "WAREHOUSE_READY",
  "NEW INBOUND",
  "RETURNED_WAITING_REPLAN",
  "physical_return_scan_count",
  "be_warehouse_scan_lifecycle_snapshot_v211",
  "be_warehouse_provider_transfer_preview_v1",
  "provider_planning_gate",
  "providerMetadataReady",
  "Provider classification RPC is not installed",
  "REGIONAL_WAYPLAN_REVIEW",
  "Service provider",
  "exportTransferManifest",
  "Transfer Candidates",
  "Handover Verified",
  "Snapshot Warehouse Status",
  "PROVIDER_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN",
  "Select / clear eligible",
  "handoffBusy",
  "selectedIds.slice(0,100)",
  "be_wayplan_handoff_ids_v150",
  "Open Wayplan Command",
  "Mark Ready for Wayplan"
])assert.ok(pending.includes(term),"Pending handoff missing: "+term);

assert.match(command,/be_wayplan_visible_queue_v124/);
assert.match(command,/be_warehouse_ack_wayplan_handoff_v150/);
assert.match(command,/be_wayplan_handoff_ids_v150/);
assert.match(command,/unmatched.length/);
assert.match(command,/Outside-core third-party parcels require/);
assert.match(warehouse,/be_warehouse_return_scan_v71/);
const sql=readFileSync(new URL("../sql/candidates/warehouse_provider_transfer_preview_v1.sql",import.meta.url),"utf8");
assert.match(sql,/security definer/);
assert.match(sql,/revoke all on function.*from public, anon/);
assert.match(sql,/be_warehouse_assert_internal/);
assert.match(sql,/NEEDS_PROVIDER_TRANSFER_WAYPLAN/);
assert.match(sql,/NEEDS_BRANCH_TRANSFER_WAYPLAN/);
assert.match(sql,/PROVIDER_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN/);
assert.match(sql,/BRANCH_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN/);
assert.match(sql,/PROVIDER_TRANSFER_REQUIRED/);
assert.match(sql,/handover_location_verified/);
assert.match(sql,/authoritative_receipt_status/);
assert.match(sql,/reported_warehouse_status/);
assert.match(sql,/authoritative_receipt_status=\x27UNSET\x27/);
assert.match(sql,/TERMINAL_PARCEL/);
assert.match(sql,/be_provider_handover_sites_v1/);
const siteSql=readFileSync(new URL("../sql/candidates/provider_handover_sites_v1.sql",import.meta.url),"utf8");
assert.match(siteSql,/enable row level security/);
assert.match(siteSql,/revoke all on table.*from public, anon, authenticated/);
assert.match(siteSql,/verified_at is not null/);
assert.match(siteSql,/verified_by is not null/);
const approvalSql=readFileSync(new URL("../sql/candidates/provider_handover_site_approve_v1.sql",import.meta.url),"utf8");
assert.match(approvalSql,/v_role not in/);
assert.match(approvalSql,/auth.uid\(\)/);
assert.match(approvalSql,/v_site.location_name/);
assert.match(approvalSql,/be_audit_events/);
assert.match(approvalSql,/dispatch_created',false/);
assert.match(approvalSql,/custody_transfer_created',false/);
assert.match(approvalSql,/revoke all on function.*from public,anon/);
assert.doesNotMatch(siteSql,/insert into public\.be_provider_handover_sites_v1/i);
const draftSql=readFileSync(new URL("../sql/candidates/provider_transfer_wayplan_draft_v1.sql",import.meta.url),"utf8");
for(const term of [
  "be_provider_transfer_wayplan_draft_v1",
  "verified_at is not null",
  "WAREHOUSE_READY",
  "financial_validation_status",
  "be_warehouse_return_scans_v39",
  "be_dispatch_scans_v39",
  "be_wayplan_membership_v40",
  "be_wayplan_review_v43",
  "DEFERRED_PROVIDER",
  "dispatch_created',false",
  "handover_recorded',false",
  "customer_delivery_confirmed',false"
])assert.ok(draftSql.includes(term),"Draft Wayplan guard missing: "+term);
assert.doesNotMatch(draftSql,/be_warehouse_dispatch_scan\s*\(/);
assert.doesNotMatch(draftSql,/be_cs_thirdparty_confirm_v1\s*\(/);
const custodySql=readFileSync(new URL("../sql/candidates/provider_transfer_custody_v1.sql",import.meta.url),"utf8");
for(const term of [
  "be_provider_transfer_confirm_handover_v1",
  "be_dispatch_scans_v39",
  "scan_status='SCANNED'",
  "be_warehouse_return_scans_v39",
  "DISPATCH_READY",
  "provider_receipt_ref",
  "proof_reference",
  "customer_delivery_confirmed',false",
  "settlement_posted',false",
  "enable row level security",
  "revoke all on table"
])assert.ok(custodySql.includes(term),"Custody safety contract missing: "+term);
assert.match(warehouse,/DISPATCH_SCAN_REQUIRED/);
assert.doesNotMatch(pending,/be_warehouse_dispatch_scan\s*\(/);
assert.doesNotMatch(pending,/be_warehouse_return_scan_v71\s*\(/);
console.log("PASS: pending handoff keeps dispatch/return scans in warehouse and only stages received or verified returned parcels");
