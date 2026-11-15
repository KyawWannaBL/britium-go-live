# Township Branch Role Workbench — Implementation Gate

## Phase 1 delivered in this feature branch
- Authenticated `/township-branch` screen reachable from the enterprise sidebar.
- Links grouped by Township Branch Manager, Operations Supervisor, Warehouse, Data Entry, CS, Branch Finance, Field Team and HQ.
- Portal role filtering reuses `canRoleOpenPath`, so a branch cashier cannot gain access to settlement actions by selecting a new menu.
- Where an existing branch assignment is present, the page reads the existing `be_branch_office_snapshot` RPC and shows its branch-scoped high-level counts.
- No SQL migrations, data writes, new role grants, automatic COD changes, privileged overrides or deployment of unverified backend functions.

## Mandatory controls before township operations are activated
1. Define canonical `township_code`, parent `branch_code`, active state and assigned staff per township; do not infer from current staff posting or unverified names.
2. Extend authenticated backend RPC/RLS scoping to township, branch and regional levels with explicit enterprise overrides and audit logging. UI menu filtering is not an authorization boundary.
3. Add custody handover and destination acknowledgment for HQ → regional → township, including partial receipt, manifests, Way ID scans, shortages and reversal authorization.
4. Verify branch manager approval ceilings and prohibit author self-review; distinguish local operational approval from HQ financial approval.
5. Define actual payment custody and COD ledger linkage: CS confirmation and expected COD are never proof of cash received or settlement.
6. Test cross-branch denial, inactive account denial, historical parcel exclusion, staff transfers, duplicate scans, delivery postponement, RTO and partial COD handover.
7. Validate every existing linked screen under all township roles. Hidden or inaccessible workflows must be fixed before active operational use.

## Acceptance exercises (no test records left in Production)
- Township manager opens local branch dashboard, sees only assigned territory, approves permitted operations, submits an HQ correction.
- Supervisor assigns real eligible pickup and field crew; rider accepts and captures proof; scanned parcel receives a canonical Way ID.
- HQ/Regional transfer manifests are received with exact Way ID matching; missing and extra parcels remain exceptions.
- Warehouse outbound scan, supervisor review and dispatch create a traceable custody transition.
- Field delivery, failed attempt/postponement with scheduled retry, third-party delivery, and RTO each preserve their history.
- COD mismatch produces a review flag; authorized Finance records actual receipt independently. Neither CS nor branch manager posts settlement by mere confirmation.
- HQ sees network-wide exceptions, cash submissions and approvals; neighboring township staff cannot read or edit other township data.

## Release boundary
This is a role navigation and read-only summary foundation, not evidence of complete township-level backend isolation. Keep the PR draft and run Vercel build, signed-in role tests and Supabase security tests before considering any Production release.
