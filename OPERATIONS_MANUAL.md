# Britium Express - Complete Operations Manual

**Version:** 1.1  
**Last Updated:** September 13, 2026  
**Production System:** https://britiumexpress.com  
**Document Owner:** Britium Express Operations Team

---

## Revision Summary - Version 1.1

This revision updates the operating manual to reflect the current Wayplan, map-location correction, and Rider guided-delivery workflow now used in Production.

Key changes in this version:

- Adds click-or-drag manual delivery pin correction directly on the Wayplan map.
- Adds the same map-pin correction capability for the Rider's current stop.
- Recalculates the affected active road route after a corrected pin is saved.
- Adds proof-safe **Finish & guide next stop** behavior in the Rider workflow.
- Documents immutable Warehouse LIFO history versus the Rider's active route version.
- Documents the normal **50-75 parcels per delivery van** operating band and the controlled below-50 exception.
- Clarifies that pickup/highway vehicles **1H-6033** and **7R-1473** remain reserved from normal delivery-van allocation.
- Removes hard-coded login passwords from the manual. Credentials must be provisioned through authorized account administration only.
- Updates the Production URL to **britiumexpress.com**.

---

## Table of Contents

1. System Overview
2. Roles and Access
3. Login, Session and Security
4. Core Operations
   - 4.1 Data Entry and Location Validation
   - 4.2 Warehouse Operations
   - 4.3 Wayplan and Multi-Van Planning
   - 4.4 Manual Location Correction on the Map
   - 4.5 Rider / Driver Delivery Execution
   - 4.6 Delivery Exceptions and Rerouting
   - 4.7 Finance and COD Handover
5. Daily Operating Procedure
6. Troubleshooting
7. Audit, Route Versioning and Control Rules
8. Quick Reference
9. Document Control

---

# 1. System Overview

Britium Express is the operational platform for shipment registration, warehouse processing, route planning, field delivery, proof capture, COD handling, reporting, and operational administration.

The normal parcel flow is:

**Data Entry -> Location Validation -> Warehouse -> Wayplan -> Vehicle / Crew Assignment -> Warehouse LIFO Loading -> Rider Delivery -> Proof / COD -> Finance / Reporting**

The system uses role-based access controls. Users should only perform actions available to their assigned role and operational responsibility.

## 1.1 Current Route Model

The current route model separates two important concepts:

- **Generated / Warehouse route history:** the route sequence used to create the Wayplan and the corresponding reverse-order Warehouse LIFO loading snapshot. This history is retained for operational traceability.
- **Active Rider route:** the current field-delivery sequence. It may be recalculated when a stop location is corrected or when an operational exception makes a stop ineligible for the current trip.

A Rider reroute does **not** rewrite the Warehouse loading history of an already generated Wayplan.

## 1.2 Google Mapping

Google road routing is the primary road-routing source for the supported core operating areas. When the route service is unavailable, the system may show an explicitly labelled fallback route. Staff must never treat a geographic fallback as if it were a Google-optimized road route.

---

# 2. Roles and Access

| Role | Main Operational Responsibility |
|---|---|
| Super Admin / Admin | System-wide administration and controlled operational intervention |
| Management / Director | Oversight, Wayplan review and authorized operational decisions |
| Operations / Operations Admin | Daily operating control, Wayplan creation and exception handling |
| Supervisor | Team assignment, operational review and exception support |
| Wayplan Manager | Route planning, van allocation, route review and dispatch preparation |
| Data Entry / Encoder | Shipment registration, bulk upload and data validation |
| Warehouse Staff | Inbound, sorting, loading, dispatch and return processing |
| Rider / Driver | Assigned route execution, customer delivery, proof, COD and field exceptions |
| Finance | COD verification, settlement and financial review |
| Customer Service | Address/customer follow-up and delivery exception support |
| Merchant | Merchant-authorized shipment and reporting functions |

## 2.1 Location-Edit Permission

Manual map-pin updates are controlled actions.

- Authorized management, operations, Wayplan and supervisor roles may correct delivery locations during planning/review.
- An authenticated Rider or Driver may correct the location of a parcel on an active Wayplan assigned to that worker.
- Every saved manual pin correction is audit-recorded.

---

# 3. Login, Session and Security

## 3.1 Accessing Production

1. Open **https://britiumexpress.com**.
2. Sign in using the account issued to you by the authorized administrator.
3. Confirm that the portal shown matches your role.
4. If the portal is incorrect or an action is denied, do not use another person's account. Contact the administrator or supervisor.

## 3.2 Password Handling

- Shared passwords must not be written in this manual, chat messages, spreadsheets, or printed operating sheets.
- Use password reset when a password is forgotten.
- Never share an authenticated Rider or Driver account with another field worker.
- If the system reports an invalid or expired session, sign in again using your own account.

## 3.3 Location and Camera Permission

Rider devices should allow:

- Location / GPS permission for current-position and proof functions.
- Camera permission for delivery or pickup photos when required.
- Pop-up / external navigation opening when using **Finish & guide next stop** and Google Maps navigation.

---

# 4. Core Operations

## 4.1 Data Entry and Location Validation

### 4.1.1 Single and Bulk Registration

Data Entry operators may register shipments individually or through the approved bulk-upload workflow.

Before saving or generating a waybill, verify:

- Merchant / customer information.
- Recipient name and phone number.
- Delivery address.
- Correct township and city/region.
- Postal code where required.
- Item price / COD values where applicable.
- Service provider / routing result where applicable.
- Delivery coordinates when the shipment is in a mapped operating area.

### 4.1.2 Location Review

When the system flags a location for review:

1. Check the original address, township, ward and postal information.
2. Confirm that the mapped result represents the actual delivery area.
3. If the location is wrong, correct the pin using the map-based workflow described in Section 4.4.
4. Save the corrected location.
5. Re-run or review the route result before final Wayplan creation.

**Important:** Similar names must not be treated as the same township. For example, Dagon Township and the North, South and East Dagon new-town areas are operationally different delivery areas and must remain correctly distinguished.

---

## 4.2 Warehouse Operations

### 4.2.1 Inbound

1. Receive and scan the parcel.
2. Confirm Way ID / waybill information.
3. Record parcel condition and any exception.
4. Place the parcel into the correct warehouse flow.

### 4.2.2 Wayplan Loading

After a Wayplan is generated:

1. Open the generated Wayplan loading list.
2. Load parcels using the Warehouse **LIFO** order supplied by the system.
3. The loading list is the exact reverse of the reviewed generated delivery sequence.
4. Confirm parcel count before dispatch.
5. Do not manually rewrite an already generated Warehouse route snapshot to match later Rider reroutes.

### 4.2.3 Why Warehouse History Stays Locked

A delivery route can change after dispatch because of a corrected pin, customer unavailability, rescheduling, skip or RTO action. The Warehouse snapshot remains the historical record of how the vehicle was originally loaded. The Rider's current active route may therefore be a newer route version.

---

## 4.3 Wayplan and Multi-Van Planning

### 4.3.1 Automatic Van Planning

The system groups ready parcels by location and prepares practical delivery-van plans.

Normal operating rules:

- **50 parcels minimum per delivery van** under normal operation.
- **75 parcels practical maximum per delivery van.**
- The system should use only the practical number of vans required; it does not need to appoint the entire fleet every day.
- At most one below-50 van may be accepted in a reviewed planning batch, and only with an explicit operator approval and reason.
- Pickup/highway vehicles **1H-6033** and **7R-1473** remain reserved and are not part of normal drop-off van allocation.

### 4.3.2 Create and Review a Route Plan

1. Open the Wayplan creation / command area.
2. Select the ready pickup batch or the applicable ready parcels.
3. Select **Automatic - practical van count** unless there is an approved reason to set the van count manually.
4. Click **Generate / optimize route plan**.
5. Review each van:
   - Vehicle.
   - Driver.
   - Rider.
   - Optional helper.
   - Parcel count.
   - Township grouping.
   - Route source.
   - Distance and estimated road time when available.
6. Open **View whole Google route map** for each van.
7. Check numbered stops for obvious location errors.
8. Correct any wrong pin before final creation using Section 4.4.
9. Re-check the delivery sequence and Warehouse LIFO list.
10. Create the reviewed Wayplans.

### 4.3.3 Manual Sequence Adjustment

Authorized operators may move a stop up or down in the planned sequence before Wayplan creation. A manually edited sequence must still be reviewed on the map. Warehouse LIFO automatically follows the reverse of the final reviewed generated sequence.

### 4.3.4 Route Source Labels

Users may see route-source descriptions such as:

- **Google Routes road optimized** - primary production road optimization.
- **Mapbox fallback** - secondary fallback when available.
- **Emergency geographic fallback - NOT Google optimized** - a fallback sequence that must not be described as a Google road route.

If a fallback route is shown, review it carefully before dispatch.

---

## 4.4 Manual Location Correction on the Map

This is the preferred manual correction method. Users do not need to type latitude and longitude values manually.

### 4.4.1 Correct a Stop During Wayplan Review

1. Open the van's **whole Google route map**.
2. Click the numbered marker of the delivery you want to correct.
3. Either:
   - Click the exact correct drop-off point on the map, or
   - Drag the selected marker to the correct place.
4. Confirm the proposed pin displayed by the system.
5. Click **Update location**.
6. Wait for the save confirmation.
7. The affected van route is recalculated automatically.
8. Review the new numbered delivery sequence.
9. Review the corresponding Warehouse LIFO list again before creating the Wayplan.

### 4.4.2 Correct the Current Stop in the Rider App

1. Open **Active Wayplan Route**.
2. At the current stop, open **Correct delivery pin on map**.
3. Tap the exact delivery point or drag the marker.
4. Click **Update location**.
5. The corrected location is saved.
6. If more than one eligible stop remains, the remaining active route is recalculated.
7. Continue using the new active route.

### 4.4.3 What the System Records

A saved manual pin correction records the delivery identifier, previous coordinates, new coordinates, user and update context in the audit trail. The coordinate source becomes a manual-pin correction.

### 4.4.4 Important Control Rule

Correcting a location changes the active planning/delivery coordinates. It does **not** silently rewrite historical Warehouse loading history for an already generated Wayplan.

---

## 4.5 Rider / Driver Delivery Execution

The Rider field workflow is designed around one current stop at a time:

**Current Stop -> Complete Required Action -> Finish -> Guided Next Stop**

### 4.5.1 Start the Route

1. Sign in with the assigned Rider or Driver account.
2. Open the Rider App and **Active Wayplan Route**.
3. Confirm:
   - Wayplan ID.
   - Active route version.
   - Current stop.
   - Delivery sequence.
4. Press **Navigate current stop** to open Google navigation for the current destination.

### 4.5.2 At the Customer Location

1. Confirm that the map location and physical address match.
2. If the pin is wrong, correct it using Section 4.4.2.
3. Press **Arrived** when appropriate.
4. Contact the customer if required.
5. Complete the delivery proof process.

### 4.5.3 Delivery Proof Requirements

Before the stop can be finished as delivered, complete the applicable proof and payment controls:

- Receiver information.
- Required proof photo where applicable.
- Receiver electronic signature.
- GPS capture.
- COD amount confirmation when COD applies.
- Payment method and required payment reference for electronic payment flows.

Use **Complete Delivery Proof** before pressing **Finish & guide next stop**.

### 4.5.4 Finish and Automatically Move to the Next Stop

After proof and payment requirements are complete:

1. Return to the Active Wayplan Route screen.
2. Press **Finish & guide next stop**.
3. The system verifies that the current delivery has the required completed proof state.
4. The current stop is closed as delivered.
5. The next eligible stop automatically becomes the current stop.
6. Google navigation opens for that next stop.
7. Continue the same process until no eligible delivery stops remain.

For the final stop, the system closes the drop and reports that no remaining delivery stop exists.

### 4.5.5 Proof-Safe Finish

**Finish is not a shortcut around proof capture.** If delivery proof, signature or required COD/payment confirmation is incomplete, the system blocks Finish and instructs the Rider to complete the delivery proof first.

---

## 4.6 Delivery Exceptions and Rerouting

The current-stop screen provides controlled exception actions.

### Customer Unavailable

Use when the receiver cannot complete the delivery. Record the appropriate reason and follow Customer Service / Supervisor instructions.

### Reschedule

Use when delivery must be attempted later. The current route is updated so the Rider can continue with eligible stops.

### Skip

Use only for a legitimate operational reason. The system removes the stop from the current eligible sequence and recalculates the remaining route where required.

### RTO

Use when the parcel must return to origin / Warehouse according to the approved operating process.

### Rerouting Rule

When an exception makes the current stop ineligible for the current trip, the system may recalculate the remaining active route. This creates or applies a newer active route version without changing the original Warehouse loading history.

---

## 4.7 Finance and COD Handover

### Rider / Driver

1. Confirm the required COD at the delivery point.
2. Record the actual collected amount and payment method using the approved proof workflow.
3. Do not mark a COD delivery complete with an unresolved amount mismatch.
4. At end of duty, hand over collected funds and supporting records according to Finance procedure.

### Finance

1. Review Rider / Driver settlement information.
2. Verify expected versus received amounts.
3. Investigate any variance before approval.
4. Retain the approved settlement trail for reconciliation.

---

# 5. Daily Operating Procedure

## 5.1 Before Dispatch

### Data Entry

- Complete registration and bulk-upload review.
- Resolve material location errors.
- Ensure ready parcels contain the required routing data.

### Warehouse

- Complete inbound processing.
- Sort ready parcels.
- Confirm Wayplan-ready status.

### Wayplan / Operations

- Generate practical van plans.
- Confirm 50-75 parcel operating band where possible.
- Review the route source and whole route map.
- Correct wrong pins before dispatch.
- Confirm vehicle, Driver, Rider and helper where applicable.
- Review Warehouse LIFO list.
- Create the Wayplans.

### Rider / Driver

- Sign in using the assigned account.
- Review the active Wayplan.
- Confirm device GPS, camera and navigation access.
- Verify vehicle and parcel count before departure.

## 5.2 During Delivery

For every stop:

1. Navigate to current stop.
2. Correct the pin if needed.
3. Arrive and contact customer as required.
4. Complete delivery proof and COD/payment confirmation.
5. Press **Finish & guide next stop**.
6. Follow the automatically advanced next-stop navigation.

For exceptions, use the correct exception action rather than falsely finishing the stop as delivered.

## 5.3 End of Route

- Confirm no eligible stops remain.
- Return RTO / failed / returned parcels to the appropriate Warehouse process.
- Submit COD and supporting records.
- Report unresolved location or routing issues to Operations / Customer Service.
- Complete end-of-duty reporting.

---

# 6. Troubleshooting

## 6.1 Wrong Location on the Map

**Preferred solution:**

1. Select the affected delivery marker.
2. Click or drag to the correct drop-off point.
3. Press **Update location**.
4. Wait for the route to recalculate.
5. Review the new sequence before continuing.

Do not restart the entire batch just because one pin is wrong.

## 6.2 Update Location Button Is Disabled

Check that:

- A delivery stop has been selected.
- A new point has been chosen on the map.
- You are signed in with an authorized role or you are the assigned Rider / Driver for the active Wayplan.
- The internet connection is available.

## 6.3 Google Map Does Not Load

- Confirm internet access.
- Refresh the page once.
- Check that the browser allows the page to load mapping resources.
- If the road line is unavailable but stop pins are visible, review/correct stop pins and use the available route controls.
- If the problem persists, report it to IT with the Wayplan ID and screenshot.

## 6.4 Route Recalculation Fails After Pin Correction

- The location may already be saved even if road optimization fails.
- Use **Re-optimize road route** before saving/dispatching the Wayplan.
- Do not dispatch an obviously incorrect fallback sequence without review.

## 6.5 Finish Is Blocked

If **Finish & guide next stop** reports that proof is required:

1. Open **Complete Delivery Proof**.
2. Complete receiver details, signature, proof/GPS and COD/payment fields required for that parcel.
3. Submit the proof successfully.
4. Return to the route screen.
5. Press **Finish & guide next stop** again.

## 6.6 Next-Stop Navigation Does Not Open

- Make sure the browser allows a new navigation tab/window.
- Use the current stop's **Navigate current stop** button if the automatic handoff is blocked by the device/browser.
- Confirm the next stop has validated coordinates.

## 6.7 Rider Has No Active Wayplan

- Confirm the correct Rider / Driver account is signed in.
- Confirm the Wayplan has been assigned to that worker.
- Confirm the Wayplan is not completed, closed or cancelled.
- Ask Operations to verify the assignment if needed.

## 6.8 Cannot Login / Session Expired

- Re-enter the correct account credentials.
- Use password reset if required.
- Do not borrow another user's session.
- If repeated automatic logout occurs, record the time, account role and screenshot and report to IT.

---

# 7. Audit, Route Versioning and Control Rules

## 7.1 Manual Pin Audit

Every approved location pin update should be traceable to the user who made the change. The audit trail records the previous and new location values and the update context.

## 7.2 Generated Route Versus Active Route

- **Generated route:** reviewed route at Wayplan creation.
- **Warehouse LIFO snapshot:** reverse of the generated delivery sequence used for loading.
- **Active route:** current field route; may be newer after corrections or exceptions.

Never alter historical Warehouse loading evidence merely to make it match a later Rider reroute.

## 7.3 Assignment Control

Riders and Drivers may act only on Wayplans assigned to them. If an assignment error is detected, Operations must correct the assignment rather than asking users to share accounts.

## 7.4 Below-50 Van Exception

The normal minimum is 50 parcels. One below-minimum van may be approved only when operationally unavoidable. The approving user must enter a reason so the exception remains reviewable.

## 7.5 Fallback Route Control

A fallback route must remain visibly labelled as fallback. Staff must not present it as a Google-optimized route.

---

# 8. Quick Reference

## 8.1 Rider Current-Stop Buttons

| Button | Use |
|---|---|
| Navigate current stop | Open navigation to the current delivery point |
| Correct delivery pin on map | Manually fix the current stop by map click or drag |
| Arrived | Record arrival at the customer location |
| Call Customer | Call the recipient when a phone number is available |
| Complete Delivery Proof | Capture the required delivery proof / payment information |
| Finish & guide next stop | Close a proof-complete delivery and automatically move to the next eligible stop |
| Customer Unavailable | Record an unavailable-customer exception |
| Reschedule | Move the stop out of the current completion flow for later handling |
| Skip | Skip the stop for the current active route with an operational reason |
| RTO | Return the parcel to origin / Warehouse process |

## 8.2 Wayplan Map Correction

**Select stop -> click/drag correct point -> Update location -> route recalculates -> review sequence -> review LIFO -> create Wayplan**

## 8.3 Van Planning Rules

- Normal minimum: **50 parcels / delivery van**.
- Practical maximum: **75 parcels / delivery van**.
- Only one below-50 exception in a reviewed batch, with explicit approval and reason.
- Use the practical number of vans rather than automatically using the entire fleet.
- **1H-6033** and **7R-1473** remain reserved for pickup/highway work.

## 8.4 Common Route Terms

- **Wayplan:** planned group and order of deliveries assigned to a vehicle/crew.
- **LIFO:** Last In, First Out loading arrangement; Warehouse loading is the reverse of the generated delivery sequence.
- **Active Route Version:** current field-delivery order used by the Rider.
- **Generated Route Version:** original reviewed route version saved at Wayplan creation.
- **Manual Pin:** user-corrected latitude/longitude selected on the map.
- **RTO:** Return to Origin.
- **POD:** Proof of Delivery.
- **COD:** Cash / Collection on Delivery according to the parcel's payment requirement.

---

# 9. Document Control

**Version:** 1.1  
**Last Updated:** September 13, 2026  
**Next Review:** After the next material Wayplan / Rider workflow release or operational policy change  
**Document Owner:** Britium Express Operations Team  
**System:** https://britiumexpress.com

## Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-04-10 | Initial operations manual |
| 1.1 | 2026-09-13 | Production URL; map-pin correction; route recalculation; 50-75 parcel van rules; proof-safe Finish and next-stop guidance; Warehouse LIFO controls; hard-coded password removal |

---

**END OF OPERATIONS MANUAL**