-- RUN FIRST: READ-ONLY production or UAT parcel backlog classification.
-- No UPDATE/INSERT/DELETE. Repeat after any controlled deployment.
-- Snapshot age and provider status can change between executions.
with candidate as (
 select d.delivery_way_id,d.pickup_id,d.parcel_sequence,d.parcel_status,
    d.delivery_region,
    upper(coalesce(nullif(d.financial_quote->>'service_provider_code',''),'UNSET')) provider_code,
    upper(coalesce(d.financial_validation_status,'')) finance_status,
    upper(coalesce(r.warehouse_status,'')) receipt_status,
    r.warehouse_code,r.discrepancy_code,
    coalesce(
      (select max(ds.scanned_at) from public.be_dispatch_scans_v39 ds
       where ds.delivery_way_id=d.delivery_way_id and ds.scan_status='SCANNED'),
      '-infinity'::timestamptz
    ) last_dispatch_at,
    coalesce(
      (select max(rs.scanned_at) from public.be_warehouse_return_scans_v39 rs
       where rs.delivery_way_id=d.delivery_way_id),
      '-infinity'::timestamptz
    ) last_return_at,
    exists(
      select 1 from public.be_wayplan_membership_v40 m
      join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
      where m.delivery_way_id=d.delivery_way_id
        and upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED')
        and upper(coalesce(m.membership_status,'')) not in ('COMPLETED','CANCELLED','RTO')
    ) active_wayplan,
    exists (
      select 1 from public.be_delivery_reschedules_v71 x
      where x.delivery_way_id=d.delivery_way_id and x.status='ACTIVE'
      and x.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
    ) future_hold,
    exists (
      select 1 from public.be_thirdparty_cs_current_v1 cs
      where cs.delivery_way_id=d.delivery_way_id and upper(cs.outcome) in ('DELIVERED','RTO')
    ) terminal_cs
 from public.be_data_entry_parcel_details d
 join public.be_warehouse_receipts_v36 r on r.pickup_id=d.pickup_id
  and r.parcel_sequence=d.parcel_sequence
 where upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED','DUPLICATE_ARCHIVED')
)
select provider_code,delivery_region,receipt_status,
  case
   when terminal_cs then 'CS_TERMINAL_RECONCILIATION'
   when active_wayplan then 'EXISTING_WAYPLAN_FOLLOWUP'
   when future_hold then 'HOLD_UNTIL_CUSTOMER_DATE'
   when last_dispatch_at>last_return_at then 'AWAITING_PHYSICAL_RETURN_OR_CUSTODY'
   when coalesce(discrepancy_code,'')<>'' then 'WAREHOUSE_DISCREPANCY_REVIEW'
   when finance_status not in ('OK','VALID') then 'FINANCE_OR_MERCHANT_VALIDATION'
   when receipt_status<>'WAREHOUSE_READY' then 'WAREHOUSE_READINESS_REVIEW'
   when provider_code='UNSET' then 'PROVIDER_IDENTITY_REVIEW'
   when provider_code='BRITIUM' then 'STANDARD_WAYPLAN_PLANNING'
   else 'PROVIDER_TRANSFER_SITE_AND_WAYPLAN'
  end as next_action,
  count(*)::integer as way_count
from candidate
group by 1,2,3,4
order by way_count desc,provider_code,delivery_region;

-- Read-only core schema readiness for the release candidate.
select
  to_regclass('public.be_data_entry_parcel_details') is not null as parcel_master,
  to_regclass('public.be_warehouse_receipts_v36') is not null as warehouse_receipts,
  to_regclass('public.be_wayplan_dispatches') is not null as wayplans,
  to_regclass('public.be_wayplan_membership_v40') is not null as memberships,
  to_regclass('public.be_wayplan_review_v43') is not null as supervisor_reviews,
  to_regclass('public.be_dispatch_scans_v39') is not null as dispatch_scans,
  to_regclass('public.be_warehouse_return_scans_v39') is not null as return_scans,
  to_regclass('public.be_provider_handover_sites_v1') is not null as approved_sites_registry,
  to_regprocedure('public.be_provider_transfer_wayplan_draft_v1(uuid,text,text,text,text[],text,text)') is not null
    as transfer_creator,
  to_regprocedure('public.be_provider_transfer_confirm_handover_v1(text,text,text,text,text,text,text,text)') is not null
    as provider_custody;
