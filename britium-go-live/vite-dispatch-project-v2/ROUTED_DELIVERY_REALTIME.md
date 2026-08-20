# Routed Delivery Realtime Integration

## Implemented client flow

1. A dispatcher assigns a manifest with `assign_manifest`.
2. The Rider App enriches its existing rider snapshot with RLS-filtered rows from
   `manifests` and `deliveries`.
3. Starting a canonical route calls `accept_manifest`.
4. Completing a canonical delivery calls `complete_delivery` with a stable
   client operation UUID and expected row version.
5. The Dispatch Command Center subscribes once to `manifests` and `deliveries`
   Postgres Changes.
6. A delivery event patches the matching dashboard job immediately. A debounced
   snapshot reload then reconciles aggregate counters and related legacy views.

Legacy rider/dispatch RPCs remain as compatibility fallbacks for jobs that have
not yet been linked to a canonical `deliveries` row.

## Important files

- `src/lib/routedDeliveryApi.ts`: typed assignment, acceptance, and completion RPCs.
- `src/lib/dispatchRealtime.ts`: shared Realtime channel with cleanup.
- `src/stores/dispatchStore.ts`: normalized, version-aware Zustand state.
- `src/pages/DispatchCommandCenterPage.tsx`: live event integration and status indicator.
- `src/pages/RiderAppPage.tsx`: canonical row enrichment, acceptance, idempotent
  completion, durable local queue, optimistic pending-sync state, and automatic replay.

## Runtime requirements

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable/anon key only)
- The authenticated dispatcher must resolve to `DISPATCHER` or `SUPER_ADMIN`.
- The authenticated rider's `auth.uid()` must equal `manifests.assigned_rider_id`.
- `manifests` and `deliveries` must be in `supabase_realtime`.
- The database functions `assign_manifest`, `accept_manifest`, and
  `complete_delivery` must be installed.

## QA smoke test

1. Sign into `/dispatch-command` as a dispatcher and confirm the `LIVE` badge.
2. Assign a manifest containing at least one canonical delivery to a rider and
   an active `van` or `bicycle`.
3. Sign into `/rider-app` as that rider and open the delivery route.
4. Start the route; verify the manifest changes to `IN_PROGRESS`.
5. Complete the first stop; verify the dispatcher sees `DELIVERED` without a
   manual refresh.
6. Repeat the same completion operation ID and verify only one
   `delivery_status_events` row exists.
7. Disable connectivity, complete another stop, and verify
   `COMPLETED_PENDING_SYNC`.
8. Restore connectivity and verify the queue flushes, the canonical delivery
   becomes `delivered`, and the dispatcher updates.

## Validation

`npm run build` succeeds. The existing stylesheet emits Lightning CSS warnings
for Tailwind-specific directives (`@theme`, `@tailwind`, and `@apply`); these
warnings predate and are unrelated to the routed-delivery integration.
