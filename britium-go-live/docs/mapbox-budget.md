# Mapbox budget guard

Authorized application ceiling: US$10/month. Controlled server API allowance:
US$9.50, leaving US$0.50 headroom. This is an application guard, not a Mapbox
account billing cap; other applications, public-token map loads, and requests
outside these API handlers are not counted here.

`api/wayplan-route.mjs` reserves Matrix elements before each request. The
95,000-element monthly cutoff includes padding, retries and failed attempts.
Full stop-to-stop matrices remain necessary for route optimization. Callers
needing only hub-to-stop travel times may send `matrix_mode: ONE_TO_MANY`.
That mode batches up to 24 destinations with explicit source/destination
indices. A single destination requires two reserved elements because Mapbox
does not support a single-element matrix. Null/missing cells trigger estimates.

`api/mapbox-geocode.mjs` uses permanent results because coordinates are saved.
The account console verified US$5/1,000 requests on 12 October 2026 Myanmar
time. Each request conservatively reserves US$0.005, even after an error.
Permanent results are cached server-side; concurrent identical lookups share
a lease and cannot issue duplicate requests while the lease is live.

Month keys use UTC calendar months. October starts with the observed baseline
of 48 Matrix elements and 104 permanent geocodes (US$0.52 reserved). Pricing
or account-plan changes require reviewing the SQL rates/free allowances.

Counter/cache tables and RPCs are service-role-only. The server needs
SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). An unavailable store fails
closed. No service key is sent to a browser or APK. In Mapbox-preferred mode,
errors/cutoffs use local estimates rather than automatically incurring Google
fees. Explicit Google provider modes are outside this Mapbox spending guard.

Local estimates use Haversine distance × 1.35 and 25 km/h. Returned durations
are seconds and distances are meters. Estimates are labelled and retain
DEFERRED_PROVIDER provenance so operators can review the route. They are not
road directions or evidence that a road is passable.

Verification: `node scripts/verify-mapbox-budget.mjs`, existing geocoding and
provider-resilience checks, and `supabase/tests/mapbox_budget_guard.sql` (rollback).
Four concurrent real database reservations with two elements left admitted
exactly two; the original quota was restored before guarded handlers deployed.

Mapbox Connected apps is for third-party account access. Portal/Rider API
requests are associated with an account through tokens; OAuth registration is
not required. Production's legacy Portal token was aligned to kyaw-wanna.
