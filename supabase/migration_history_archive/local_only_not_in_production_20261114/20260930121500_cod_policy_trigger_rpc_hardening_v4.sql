begin;

revoke all on function public.be_pickup_cod_policy_sync_v1()
from public, anon, authenticated;

revoke all on function public.be_finance_predispatch_sync_from_parcel_v1()
from public, anon, authenticated;

comment on function public.be_pickup_cod_policy_sync_v1() is
  'Trigger-only COD fee policy synchronization. Direct RPC execution revoked.';

comment on function public.be_finance_predispatch_sync_from_parcel_v1() is
  'Trigger-only Finance pre-dispatch synchronization using COD_FEE_2026_09_30. Direct RPC execution revoked.';

commit;
