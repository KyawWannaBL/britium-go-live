-- Read-only pre/postflight for the November authoritative D-way allocator.
-- No waybill release, print audit, pickup state, or settlement changes.
with scope as (
  select d.pickup_id,d.parcel_sequence,d.delivery_way_id,
    d.saved_at is not null and d.financial_validation_status='OK' as financial_ready,
    nullif(btrim(d.recipient_name),'') is not null
      and nullif(btrim(d.contact_no_1),'') is not null
      and nullif(btrim(d.recipient_address),'') is not null
      and nullif(btrim(d.township),'') is not null
      and lower(btrim(d.township))<>'unknown' as fields_ready,
    exists(
      select 1 from public.parcels p
      where upper(btrim(p.way_id))=upper(btrim(d.delivery_way_id))
        and p.parcel_sequence=d.parcel_sequence
        and p.validation_status='OK'
    ) as matches_authoritative_parcel,
    upper(btrim(d.delivery_way_id)) =
      upper(btrim(public.be_resolve_delivery_way_id(
        d.pickup_id||'-'||lpad(d.parcel_sequence::text,3,'0')
      ))) as legacy_p_derived_match
  from public.be_data_entry_parcel_details d
)
select count(*) as saved_details,
 count(*) filter(where financial_ready and fields_ready and matches_authoritative_parcel) as valid_authoritative_waybill_rows,
 count(*) filter(where not legacy_p_derived_match and financial_ready and fields_ready and matches_authoritative_parcel) as incorrectly_blocked_by_legacy_p_id_comparison,
 count(*) filter(where not financial_ready) as unsafe_financial_rows,
 count(*) filter(where not fields_ready) as incomplete_recipient_rows,
 count(*) filter(where not matches_authoritative_parcel) as missing_or_mismatched_authoritative_parcels
from scope;

-- An empty legacy print table is not grounds to renumber D-way IDs.
select count(*) as generated_waybill_rows from public.be_v32_parcels;
