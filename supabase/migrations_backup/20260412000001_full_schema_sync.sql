-- Historical placeholder migration.
-- Version 20260412000001 must remain because it exists in remote migration history.
-- The original file duplicated objects already created by 20260412000000_emergency_restore.sql,
-- which caused local shadow-database replay to fail during `supabase db pull`.

select 1;
