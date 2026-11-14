begin;

create or replace function public.be_guard_posted_journal_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_status text;
begin
  if tg_table_name='be_journal_entries' then
    if old.status='POSTED' then
      raise exception using
        errcode='P0001',
        message='POSTED_JOURNAL_IMMUTABLE',
        detail='Posted journal headers cannot be updated or deleted. Use reversal and replacement journals.';
    end if;
  elsif tg_table_name='be_journal_lines' then
    select status into v_status
    from public.be_journal_entries
    where id=old.journal_id;

    if v_status='POSTED' then
      raise exception using
        errcode='P0001',
        message='POSTED_JOURNAL_IMMUTABLE',
        detail='Posted journal lines cannot be updated or deleted. Use reversal and replacement journals.';
    end if;
  end if;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists be_journal_entries_guard_posted_v1 on public.be_journal_entries;
create trigger be_journal_entries_guard_posted_v1
before update or delete on public.be_journal_entries
for each row execute function public.be_guard_posted_journal_v1();

drop trigger if exists be_journal_lines_guard_posted_v1 on public.be_journal_lines;
create trigger be_journal_lines_guard_posted_v1
before update or delete on public.be_journal_lines
for each row execute function public.be_guard_posted_journal_v1();

comment on function public.be_guard_posted_journal_v1() is
  'Hard immutability guard for posted journal headers and lines. Corrections use reversing/replacement journals.';

commit;
