BRITIUM EXPRESS - DRIVER/RIDER ASSIGNMENT + NOTIFICATION SOUND FIX
Date: 2026-08-14

WHAT THIS FIXES
1. Rider-only pickup: Rider is required; Driver/Helper/Fleet are not required.
2. Vehicle pickup: Driver + Helper + Fleet are required; Rider may be NIL.
3. Removes the backend blocker: "An authenticated Rider is required" when a valid Driver dispatch is selected.
4. Resolves Rider/Driver/Helper Auth UUIDs from workforce code/email before assignment.
5. Creates targeted unread assignment notifications for every actually assigned field-team member.
6. Adds an audible realtime assignment chime to the Rider/field app.

APPLY IN THIS ORDER

A) SUPABASE BACKEND
1. Open Supabase SQL Editor.
2. Run the complete file:
   20260814_driver_or_rider_assignment_hotfix.sql
3. At the bottom, verify both result columns are TRUE:
   rider_or_driver_rule_installed = true
   field_team_wrapper_installed = true

B) SUPERVISOR FRONTEND
The included SupervisorPickupPage.tsx already has the correct button rule:
- Driver selected -> Helper + Fleet required; Rider can be NIL.
- No Driver -> Rider required.
Replace src/pages/SupervisorPickupPage.tsx with the included file only if your project is using that page.

IMPORTANT: Some Britium builds route the supervisor screen through
SupervisorPickupAssignmentGoLivePage.tsx and call be_supervisor_assign_job(jsonb).
The SQL hotfix fixes that active RPC too, so the backend error is removed even when
that route is active.

C) RIDER APP NOTIFICATION SOUND
1. Copy AssignmentNotificationSound.tsx to:
   src/components/AssignmentNotificationSound.tsx
2. Copy apply_rider_notification_sound_patch.mjs to the Rider app project root.
3. From the Rider app project root run:
   node apply_rider_notification_sound_patch.mjs
4. The patcher makes a timestamped backup of RiderFieldPortalApp.tsx first.
5. Run:
   npm run build

The sound component automatically unlocks audio on the first normal tap/click/key
press after login. Browsers do not allow a website to force audio before any user
interaction. After audio is unlocked, new targeted assignment notifications play a
three-tone alert and mobile vibration when supported. The component also offers a
"Tap once for sound" control and can request browser notification permission.

D) TESTS
TEST 1 - VEHICLE PICKUP
Rider: NIL
Driver: selected and Auth-mapped
Helper: selected and Auth-mapped
Fleet: selected
Expected: Confirm Dispatch succeeds. Driver + Helper receive unread notifications.

TEST 2 - RIDER PICKUP
Rider: selected and Auth-mapped
Driver: NIL
Helper: NIL
Fleet: NIL
Expected: Confirm Dispatch succeeds. Rider receives unread notification.

TEST 3 - INVALID DRIVER PICKUP
Driver selected; Helper or Fleet missing
Expected: assignment is blocked with a specific Helper/Fleet requirement message.

TEST 4 - AUTH MAPPING
Select a Driver/Helper whose be_mobile_workforce_accounts.auth_user_id is NULL.
Expected: assignment is blocked with "not mapped to an active Auth user" so the job
cannot be sent to an identity that cannot securely receive it.

TEST 5 - SOUND
Sign in to the assigned field app, tap/click once anywhere, then create a new
assignment from Supervisor.
Expected: realtime unread notification appears and the assignment chime sounds.
