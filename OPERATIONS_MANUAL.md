# Britium Express - Complete Operations Manual

**Version:** 1.2  
**Last Updated:** September 13, 2026  
**Production System:** https://britiumexpress.com  
**Document Owner:** Britium Express Operations Team

---

## Revision Summary - Version 1.2

Version 1.2 replaces the previous generic Yangon van-planning rules with the approved **Yangon Van Assignment Master**, strengthens Auto Geo Review quality controls, and retains the current map-pin, Rider guidance, Warehouse LIFO, crew and finance controls.

Key changes:

- Safe Auto Geo Review accepts only reliable address/POI-level results for automatic route eligibility.
- Township-centre/default coordinates and the retired generic Yangon fallback `16.800000, 96.150000` are not valid route-ready locations.
- Manual location correction requires confirmation of the actual delivery pin.
- Yangon aliases are canonicalized without changing Britium scope or tariff: Hlaingthaya East/West -> Hlaingthaya; Kyeemyindaing -> Kyimyindaing; Mingalartaungnyunt/Minglartaungnyunt -> Mingala Taungnyunt.
- Yangon automatic planning is volume-driven: **<45 parcels = 3-zone plan; 45-95 = 5-zone plan; >95 = 9-route plan**.
- The approved operational zone is assigned first; actual stop sequence is optimized afterwards on the road network.
- Straight-line/geographic routing is not accepted for automatic Wayplan creation.
- Google Routes is primary; Mapbox may be used only as a labelled road-based fallback.
- Each route remains limited to 75 stops. If a master zone exceeds 75 route-ready stops, Operations must split that zone before creation.
- The standard below-50 exception remains for the non-Yangon planner, but does not block the volume-driven Yangon master plan.
- Whole-route map review, click/drag pin correction, emergency crew substitution, immutable Warehouse LIFO, and Rider **Finish & guide next stop** remain active controls.

---

## Table of Contents

1. System Overview
2. Roles and Access
3. Login, Session and Security
4. Core Operations
   - 4.1 Data Entry and Safe Location Validation
   - 4.2 Warehouse Operations
   - 4.3 Yangon Van Assignment Master
   - 4.4 Road Optimization and Whole-Route Review
   - 4.5 Manual Location Correction on the Map
   - 4.6 Vehicle and Crew Assignment
   - 4.7 Rider / Driver Delivery Execution
   - 4.8 Delivery Exceptions and Rerouting
   - 4.9 Finance and COD Handover
5. Daily Operating Procedure
6. Troubleshooting
7. Audit, Route Versioning and Control Rules
8. Quick Reference
9. Document Control

---

# 1. System Overview

Britium Express is the operational platform for shipment registration, location validation, warehouse processing, road-route planning, vehicle and crew assignment, field delivery, proof capture, COD handling, reporting and administration.

The normal operating flow is:

**Data Entry -> Safe Location Validation -> Warehouse -> Yangon Zone Assignment / Regional Planning -> Road Optimization -> Vehicle & Crew Assignment -> Warehouse LIFO Loading -> Rider Delivery -> Proof / COD -> Finance / Reporting**

## 1.1 Generated Route vs Active Route

- **Generated route:** reviewed delivery sequence saved when the Wayplan is created.
- **Warehouse LIFO snapshot:** exact reverse of the generated route and retained as immutable loading history.
- **Active Rider route:** current field sequence; it may change after a pin correction, skip, reschedule, customer-unavailable event or RTO action.

A Rider reroute does not rewrite the original Warehouse loading snapshot.

## 1.2 Road-Routing Principle

Automatic Wayplans must be based on an actual road-routing source.

- **Google Routes** is the primary source.
- **Mapbox road matrix** may be used as a labelled road-based fallback when Google is unavailable.
- A straight-line or geographic-only route is not acceptable for automatic Wayplan creation.
- If no road-routing matrix is available, automatic creation must stop and Operations must resolve the routing service before dispatch.

---

# 2. Roles and Access

| Role | Main Operational Responsibility |
|---|---|
| Super Admin / Admin | System administration and controlled intervention |
| Management / Director | Oversight, route review and authorized decisions |
| Operations / Operations Admin | Daily control, Wayplan creation and exceptions |
| Supervisor | Team assignment, review and exception support |
| Wayplan Manager | Zone planning, road-route review and dispatch preparation |
| Data Entry / Encoder | Shipment registration, bulk upload and location validation |
| Warehouse Staff | Inbound, sorting, loading, dispatch and returns |
| Rider / Driver | Assigned route execution, proof, COD and field exceptions |
| Finance | COD verification, settlement and reconciliation |
| Customer Service | Address/customer follow-up and exception support |
| Merchant | Merchant-authorized shipment and reporting functions |

## 2.1 Location-Edit Permission

- Authorized management, operations, Wayplan and supervisor roles may correct delivery pins during review.
- An authenticated Rider or Driver may correct the current stop of an assigned active Wayplan.
- Every saved correction is audit-recorded.

---

# 3. Login, Session and Security

1. Open **https://britiumexpress.com**.
2. Sign in with the account issued to you.
3. Confirm that the correct portal and role are shown.
4. Never use another person's account to bypass permission problems.

Rider devices should permit GPS/location, camera and external navigation opening.

Do not store shared passwords in manuals, chat, spreadsheets or printed operating sheets.

---

# 4. Core Operations

## 4.1 Data Entry and Safe Location Validation

### 4.1.1 Required Location Data

Before a mapped parcel becomes Wayplan-ready, verify recipient address, correct township/region, ward or village tract when available, postal code where applicable, delivery coordinates, and service provider / delivery scope.

### 4.1.2 Safe Auto Geo Review

Use **Auto-Geocode Review File - SAFE ADDRESS MODE** for bulk location review.

- **ADDRESS_EXACT / POI_EXACT + confidence >= 0.95 + ACCEPTED** -> may become route-ready automatically.
- Street-, ward- or approximate-level result -> **REVIEW REQUIRED**.
- Missing or unreliable result -> **REVIEW REQUIRED**; no fake fallback coordinate is inserted.
- Manual correction -> actual pin must be verified and **Manual Pin Confirmed = YES**.
- Bulk blind acceptance is prohibited.

**Never copy one township coordinate to many unrelated addresses.** Township-centre/default coordinates are not address-level delivery points.

### 4.1.3 Canonical Yangon Township Aliases

The following names are the same Britium-covered township for routing and tariff purposes:

- **Hlaingthaya East / Hlaingthaya West -> Hlaingthaya (လှိုင်သာယာ)**.
- **Kyeemyindaing / Kyimyindaing -> Kyimyindaing (ကြည့်မြင်တိုင်)**.
- **Mingalartaungnyunt / Minglartaungnyunt / Mingala Taungnyunt -> Mingala Taungnyunt (မင်္ဂလာတောင်ညွန့်)**.

These remain **Britium / Yangon / Doorstep Map** deliveries and inherit the canonical township tariff.

Dagon Township, North Dagon, South Dagon, East Dagon and Dagon Seikkan remain distinct operational areas.

---

## 4.2 Warehouse Operations

### 4.2.1 Inbound

1. Scan and receive the parcel.
2. Confirm Way ID / waybill information.
3. Record condition and exceptions.
4. Place the parcel into the correct warehouse flow.

### 4.2.2 LIFO Loading

After a Wayplan is generated:

1. Open the generated loading list.
2. Load parcels in the system-provided **LIFO** order.
3. LIFO is the exact reverse of the final reviewed delivery sequence.
4. Confirm parcel count before dispatch.
5. Do not rewrite an already generated loading snapshot to match a later Rider reroute.

### 4.2.3 Reserved Vehicles

Pickup/highway vehicles **1H-6033** and **7R-1473** remain reserved and must not be allocated as normal Yangon drop-off delivery vans.

---

## 4.3 Yangon Van Assignment Master

### 4.3.1 Scope and Hub

**Hub:** East Dagon Logistics Center  
**Scope:** Yangon Urban Region  
**Excluded from this master:** Dala, Seikkyi Kanaungto and Thanlyin.

Parcels for excluded areas must follow their approved separate routing/provider workflow and must not be forced into a Yangon master zone.

### 4.3.2 Automatic Volume Trigger

| Route-ready Yangon parcel volume | Automatic plan |
|---|---|
| Fewer than 45 | **Low Volume - 3 zones** |
| 45 to 95 | **Standard - 5 zones** |
| More than 95 | **High Volume - 9 routes** |

The master-zone boundary is operational policy. The road optimizer decides the stop order **inside** the assigned zone; it does not freely mix unrelated townships merely to balance counts.

### 4.3.3 Low Volume Plan - 3 Zones

| Route | Zone | Townships | Preferred vehicle | Dispatch |
|---|---|---|---|---|
| A | East & North-East | East Dagon, North Dagon, South Dagon, Dagon Seikkan, Thingangyun, South Okkalapa, North Okkalapa, Yankin | 1.5-Ton Box Van | 08:30 |
| B | Urban Core & Inner West | Thaketa, Dawbon, Tamwe, Bahan, Mingala Taungnyunt, Kyauktada, Pabedan, Latha, Lanmadaw, Botahtaung, Pazundaung, Dagon, Sanchaung, Ahlone, Kyimyindaing | 1-Ton High-Roof Van | 08:00 |
| C | Outer West & North | Hlaing, Kamayut, Mayangone, Insein, Mingaladon, Shwepyitha, Hlaingthaya | 1.5-Ton Cargo Van | 08:30 |

### 4.3.4 Standard Plan - 5 Zones

| Route | Zone | Townships | Preferred vehicle | Dispatch |
|---|---|---|---|---|
| 1 | East Core | East Dagon, North Dagon, South Dagon, Dagon Seikkan | 1.5-Ton Box Van | 08:30 |
| 2 | North-East Corridor | Thingangyun, South Okkalapa, North Okkalapa, Yankin | 1-Ton Delivery Van | 09:00 |
| 3 | Central-East Corridor | Tamwe, Bahan, Mingala Taungnyunt, Thaketa, Dawbon | 1-Ton Light Van | 09:00 |
| 4 | Downtown, CBD & Inner West | Kyauktada, Pabedan, Latha, Lanmadaw, Botahtaung, Pazundaung, Dagon, Sanchaung, Ahlone, Kyimyindaing | High-Roof Compact Van / LWB Walk-In | 08:00 |
| 5 | West & North Gateway | Hlaing, Kamayut, Mayangone, Insein, Mingaladon, Shwepyitha, Hlaingthaya | 1.5-Ton High-Capacity Cargo Van | 08:30 |

### 4.3.5 High Volume Plan - 9 Routes

| Route | Zone | Townships |
|---|---|---|
| 1 | East Dagon & Dagon Seikkan | East Dagon, Dagon Seikkan |
| 2 | North Dagon & South Dagon | North Dagon, South Dagon |
| 3 | South Okkalapa & Thingangyun | South Okkalapa, Thingangyun |
| 4 | North Okkalapa & Yankin | North Okkalapa, Yankin |
| 5 | Central-East Peninsula | Thaketa, Dawbon, Tamwe, Bahan, Mingala Taungnyunt |
| 6 | Downtown Core | Kyauktada, Pabedan, Latha, Lanmadaw, Botahtaung, Pazundaung, Dagon |
| 7 | Inner West | Sanchaung, Ahlone, Kyimyindaing |
| 8 | Outer Residential & North-West | Hlaing, Kamayut, Mayangone, Insein, Mingaladon |
| 9 | Industrial Gateway | Hlaingthaya, Shwepyitha |

### 4.3.6 Route-Count and Stop Controls

- Only routes with parcels are activated for the day; the system does not need to use every configured route when that zone has zero parcels.
- Each active route has a hard maximum of **75 stops**.
- If one zone exceeds 75 route-ready parcels, Operations must split that operational zone into additional practical routes before creation.
- Yangon master zones may contain fewer than 50 parcels because the split is driven by the approved 3/5/9 plan and do not require the standard below-50 exception approval.
- Outside the Yangon master plan, the normal 50-75 parcel operating band and one-below-minimum exception remain in force.

---

## 4.4 Road Optimization and Whole-Route Review

### 4.4.1 Planning Sequence

For Yangon:

**Validated locations -> canonical township -> approved 3/5/9 zone -> vehicle & crew -> real road optimization -> whole-route map review -> final sequence -> Warehouse LIFO -> Wayplan creation**

### 4.4.2 Route Sources

- **Google Routes road optimized** - primary.
- **Mapbox road optimized fallback** - acceptable road-based fallback when clearly labelled.
- **Operator-edited route** - allowed after management/operations review; re-optimize when road time/distance needs refreshing.
- **Straight-line/geographic-only route** - not acceptable for automatic creation.

### 4.4.3 Whole-Route Map

Open the whole-route map for every active route and review hub/origin, numbered delivery stops, township continuity, road geometry, cross-city zig-zags and wrong pins. The map is a review tool; it does not override the approved master-zone boundary.

---

## 4.5 Manual Location Correction on the Map

### 4.5.1 During Wayplan Review

1. Open the route's whole map.
2. Select the affected numbered stop.
3. Click the exact drop-off point or drag the marker.
4. Press **Update location**.
5. Confirm save success.
6. Recalculate the affected road route.
7. Review the new sequence and LIFO order before creation.

### 4.5.2 During Rider Delivery

1. Open **Active Wayplan Route**.
2. Open **Correct delivery pin on map** for the current stop.
3. Tap/drag to the actual location.
4. Press **Update location**.
5. Continue with the recalculated active route.

Every approved pin change records old coordinates, new coordinates, user and context in the audit trail.

---

## 4.6 Vehicle and Crew Assignment

### 4.6.1 Normal Roster

- Driver and Rider must be active roster users.
- Helper is optional.
- The same person cannot serve two active routes in the same plan.
- Busy vehicle/crew assignments are rejected.
- Vehicle weight capacity must not be exceeded.

### 4.6.2 Emergency Manual Substitution

Use **Emergency substitution** only when necessary and approved. Manual Driver and Rider names plus a mandatory operational reason are required; Helper is optional.

The substitution is audit-recorded. A manually substituted Rider does **not** automatically receive Rider-App authentication; provision the account separately if mobile Rider functions are required.

---

## 4.7 Rider / Driver Delivery Execution

The field workflow is:

**Current Stop -> Navigate -> Arrive -> Proof / COD -> Finish & guide next stop -> Next Stop**

Before Finish, complete applicable receiver details, proof photo, receiver signature, GPS capture, COD amount and payment method/reference.

When **Finish & guide next stop** is pressed after proof completion, the current stop closes, the next eligible stop becomes current automatically, and navigation opens for the next location. Finish is blocked when required proof/payment data is incomplete.

---

## 4.8 Delivery Exceptions and Rerouting

Use the correct action:

- **Customer Unavailable** - customer cannot complete delivery.
- **Reschedule** - move delivery to later handling.
- **Skip** - operationally skip the stop with reason.
- **RTO** - return parcel according to approved process.

An exception may create a newer active route version. It does not rewrite the original generated route or Warehouse loading history.

---

## 4.9 Finance and COD Handover

Rider/Driver must confirm expected COD, record actual collection/payment method, avoid completing a COD delivery with unresolved amount mismatch, and hand over collected funds and records at end of duty.

Finance verifies expected versus received amounts, investigates variances and retains the settlement audit trail.

---

# 5. Daily Operating Procedure

## 5.1 Before Dispatch

### Data Entry

- Complete registration and bulk upload.
- Run Safe Auto Geo Review.
- Resolve every REVIEW REQUIRED location that must enter the day's Wayplan.
- Confirm canonical township and Britium/provider scope.

### Warehouse

- Complete inbound processing and sorting.
- Confirm Wayplan-ready status.

### Wayplan / Operations

1. Select route-ready Yangon parcels.
2. Generate the Yangon master plan.
3. Confirm the triggered plan: 3, 5 or 9 zones/routes.
4. Confirm excluded areas are not mixed into the Yangon master.
5. Confirm every active route is <=75 stops.
6. Assign a suitable delivery vehicle and crew.
7. Run road optimization.
8. Review the whole-route map.
9. Correct wrong pins.
10. Make justified manual sequence changes if needed.
11. Review Warehouse LIFO.
12. Create the reviewed Wayplans.

### Rider / Driver

- Sign in with the assigned account.
- Confirm GPS, camera and navigation permissions.
- Verify assigned vehicle, parcel count and current route.

## 5.2 During Delivery

For each stop:

**Navigate -> verify location -> correct pin if needed -> Arrived -> proof/COD -> Finish & guide next stop**.

Use exception actions instead of falsely completing a failed delivery.

## 5.3 End of Route

- Confirm no eligible stops remain.
- Return RTO/failed parcels through Warehouse process.
- Submit COD and supporting records.
- Report unresolved route/location issues.

---

# 6. Troubleshooting

## 6.1 Auto Geo Shows Too Many Review Rows

Do not force-accept them. Approximate or ambiguous locations are intentionally blocked from route-ready status until corrected.

## 6.2 Many Addresses Share One Coordinate

Treat this as a location-quality problem unless the addresses truly share one building/compound. Correct the actual pins; do not reuse a township-centre coordinate.

## 6.3 Yangon Master Township Mapping Error

Correct the township/alias before planning. Do not manually move an unknown township into an unrelated zone.

## 6.4 Route Has More Than 75 Stops

Split the affected master zone operationally into an additional route, then road-optimize both routes before creation.

## 6.5 Road Routing Unavailable

Automatic creation must stop. Do not accept a straight line as a delivery route. Restore Google Routes or the road-based fallback, then re-run optimization.

## 6.6 Wrong Pin on Map

Select the stop -> click/drag actual point -> **Update location** -> re-optimize -> review again.

## 6.7 Finish Is Blocked

Complete Delivery Proof, signature and required COD/payment information, then retry **Finish & guide next stop**.

## 6.8 Emergency Rider Cannot Use Rider App

Manual emergency names do not create authentication automatically. Operations must provision a proper Rider account if Rider-App functions are required.

---

# 7. Audit, Route Versioning and Control Rules

1. **Location quality gate:** only exact accepted or approved manual-pin locations should enter automatic mapped planning.
2. **Yangon master boundary:** fixed operational zone first; road optimizer orders stops inside the zone.
3. **Straight-line prohibition:** automatic Wayplan creation requires a real road route.
4. **Generated route immutability:** retain the original generated route/version.
5. **Warehouse LIFO immutability:** retain original loading snapshot.
6. **Active route versioning:** field changes create/use a newer active route when needed.
7. **Manual pin audit:** record old/new coordinates and actor.
8. **Crew audit:** emergency manual substitution requires a reason.
9. **Reserved vehicles:** 1H-6033 and 7R-1473 remain outside normal drop-off allocation.
10. **Standard non-Yangon minimum:** 50-75 remains normal; at most one below-50 route may be approved with reason.
11. **Yangon master minimum:** the 3/5/9 volume plan may legitimately produce multiple routes below 50; no separate below-minimum approval is required merely because of the master-plan split.

---

# 8. Quick Reference

## 8.1 Yangon Plan Trigger

| Eligible Yangon volume | Plan |
|---|---|
| <45 | 3 zones |
| 45-95 | 5 zones |
| >95 | 9 routes |

## 8.2 Safe Geo Rule

**Exact address/POI -> route-ready. Approximate/uncertain -> review. Manual correction -> confirm actual pin. No township-centre fallback.**

## 8.3 Wayplan Review

**Master zone -> road optimize -> whole map -> fix pins -> edit sequence if justified -> review LIFO -> create.**

## 8.4 Rider Current-Stop Buttons

| Button | Use |
|---|---|
| Navigate current stop | Open navigation to current stop |
| Correct delivery pin on map | Fix the current pin |
| Arrived | Record arrival |
| Complete Delivery Proof | Capture proof/payment |
| Finish & guide next stop | Complete proof-safe delivery and advance |
| Customer Unavailable | Record unavailable customer |
| Reschedule | Defer stop |
| Skip | Skip with operational reason |
| RTO | Return to origin / Warehouse |

---

# 9. Document Control

**Version:** 1.2  
**Last Updated:** September 13, 2026  
**Document Owner:** Britium Express Operations Team  
**System:** https://britiumexpress.com

## Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-04-10 | Initial operations manual |
| 1.1 | 2026-09-13 | Map-pin correction, Rider next-stop guidance, LIFO controls, secure credentials |
| 1.2 | 2026-09-13 | Safe Auto Geo quality gate; Yangon township aliases; approved 3/5/9 Yangon Van Assignment Master; fixed-zone-first road optimization; 75-stop route control; Yangon master save-flow alignment |

---

**END OF OPERATIONS MANUAL**