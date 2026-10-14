# HR registration production release blocker — 2026-10-15

Verified against Supabase project `dltavabvjwocknkyvwgz` (read-only inspection):

- `public.be_employee_master` has RLS enabled; the present SELECT/INSERT/UPDATE/DELETE policies use unconditional `true` expressions. Inspect policy role scopes before making changes. Do not enable sensitive HR workflows under these broad predicates.
- `public.be_employee_details` and `public.be_hr_document_register_v1` have RLS enabled but no direct policies in this inspection. Verify the specific approved API/RPC access routes.
- The private `hr-documents` bucket exists, but its storage object permissions and registration workflow have not yet passed end-to-end testing.

Required acceptance gates before any production promotion or signed APK release:

1. Establish least-privilege HR/super-admin authorization in server-enforced DB policies or a trusted authenticated server endpoint. Never authorize from mutable user metadata.
2. Test authorized and unauthorized reads/writes and private storage uploads/downloads with real roles, using synthetic employee data only.
3. Implement the full web form, validated Excel import with rollback/reconciliation, employee attachment association, and audit events.
4. Pass production build, installation tests on supported Android devices, and preserve the existing Rider APK link.

No production schema or policies were changed as part of this inspection.
