-- Retain non-waybill legacy uniqueness; waybill releases are unique by sequence.
begin;
set local lock_timeout = '5s';
create unique index be_waybill_print_log_release_unique
 on public.be_document_print_log(document_type,document_no,print_count)
 where document_type='WAYBILL';
drop index public.be_document_print_log_unique;
create unique index be_document_print_log_unique
 on public.be_document_print_log(document_type,document_no,coalesce(approved_by,''))
 where document_type is distinct from 'WAYBILL';
commit;