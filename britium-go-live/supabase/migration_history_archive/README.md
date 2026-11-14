# Local-only migration SQL archived during history reconciliation

These 47 migration files existed in the active local migrations directory, but their version IDs were not present in the production `supabase_migrations.schema_migrations` ledger as of 2026-11-14. They are preserved byte-for-byte here for investigation and must **not** be applied automatically to production. Their functions may differ from later production SQL; do not delete or reactivate without comparing effect and ordering.

The 66 byte-identical redundant migrations were removed from the active directory because their contents are available under production version identifiers restored from the ledger. Production data and the migration ledger were not changed.
