-- Patch: app_notifications.type must never be null.
-- Run this in Supabase SQL Editor, not Git Bash.

alter table public.app_notifications
alter column type set default 'info';

-- If older rows somehow exist from before the NOT NULL constraint, normalize them.
-- This line is safe if no rows are null.
update public.app_notifications
set type = 'info'
where type is null;

-- Optional verification.
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'app_notifications'
order by ordinal_position;
