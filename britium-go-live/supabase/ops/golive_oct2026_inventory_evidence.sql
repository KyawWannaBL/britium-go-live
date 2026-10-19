-- Replace the manifest UUID when reviewing another capture.
-- Metadata-only evidence inventory; never treats an existing object as backed up.
begin;
with strings as (
 select distinct v#>>'{}' as ref from private.be_golive_oct2026_row_snapshots s
 cross join lateral jsonb_path_query(s.row_data,'strict $.** ? (@.type() == "string")') v
 where manifest_id='aba5b898-de63-4c70-8cad-c24c9aafce9b'
), matched as (
 select distinct o.bucket_id,o.name from storage.objects o join strings s on
 s.ref=o.name or s.ref=o.bucket_id||'/'||o.name or
 position('/storage/v1/object/public/'||o.bucket_id||'/'||o.name in s.ref)>0 or
 position('/storage/v1/object/sign/'||o.bucket_id||'/'||o.name in s.ref)>0 or
 position('/storage/v1/object/authenticated/'||o.bucket_id||'/'||o.name in s.ref)>0
)
insert into private.be_golive_oct2026_storage_evidence(manifest_id,bucket_id,original_object_path)
select 'aba5b898-de63-4c70-8cad-c24c9aafce9b',bucket_id,name from matched
on conflict do nothing;
update private.be_golive_oct2026_manifests m
set storage_reconciliation=m.storage_reconciliation||jsonb_build_object(
 'matched_existing_objects',(select count(*) from private.be_golive_oct2026_storage_evidence where manifest_id=m.manifest_id),
 'reference_scan_complete',false,'content_bytes_verified',false,
 'note','Exact raw path and standard Supabase URL matches only; encoded, external, missing and other-table references remain unresolved.')
where manifest_id='aba5b898-de63-4c70-8cad-c24c9aafce9b';
commit;