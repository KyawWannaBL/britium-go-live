-- Rider workflow proof storage.
-- Public URLs are required by the current workflow RPC contract.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'rider-proofs',
  'rider-proofs',
  true,
  15728640,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rider_proofs_authenticated_insert"
on storage.objects;

create policy "rider_proofs_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rider-proofs'
  and auth.uid() is not null
);

drop policy if exists "rider_proofs_owner_update"
on storage.objects;

create policy "rider_proofs_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'rider-proofs'
  and owner = auth.uid()
)
with check (
  bucket_id = 'rider-proofs'
  and owner = auth.uid()
);

drop policy if exists "rider_proofs_owner_delete"
on storage.objects;

create policy "rider_proofs_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'rider-proofs'
  and owner = auth.uid()
);
