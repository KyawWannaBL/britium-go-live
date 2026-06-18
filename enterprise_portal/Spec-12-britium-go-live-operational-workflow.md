<!-- Page: 1 -->

# SPEC-12-Britium Go-Live Operational Workflow

## Background

Britium Enterprise Portal is being prepared for go-live with mock/sample operational data removed or isolated, master data synchronized, and all operational modules wired to backend APIs. The target operating model is to eliminate duplicate work between Customer Service, Merchant Portal, Customer Portal, Supervisor, Dispatch, Branch Office, Warehouse, Finance, and Rider/Driver/Helper apps.

The go-live principle is:

One pickup request creates one canonical Pickup ID, then all departments act on the same backend record through role-specific screens and notifications.

## Requirements

## Must Have

Merchant Portal, Customer Portal, and Customer Service must submit pickup requests into the same backend workflow. •

Every pickup request must receive one canonical P-format Pickup ID. •

Customer Service, Supervisor, Operation Manager, Dispatch, Warehouse, Branch Office, Finance, Rider, Driver, and Helper users must see role-relevant information from backend tables only. •

Notifications must be created for relevant users when a pickup request is submitted or updated. •

Sample/test operational records must remain removed from active runtime screens. •

Dispatch route counters must show zero until real routes are generated. •

Branch Office must load Mandalay and Naypyitaw branches safely without crashing. •

Rider/Driver/Helper assignment must be synchronized with backend workforce accounts. •

Tariff calculation must follow the approved Britium tariff rule. •

## Should Have

Branch routing should automatically resolve Mandalay and Naypyitaw from pickup city/township/ address. •

Merchant and Customer tracking should update from cargo events. •

Customer Service conversation/message history should remain linked to the Pickup ID. •

Workforce users should be created from the approved CSV and synchronized to role registry tables. •

## Could Have

Phone OTP login for riders/drivers/helpers after an SMS provider is available. •

Dynamic route optimization and automated dispatch route generation. •

Advanced tariff versioning by township, tier, weight, destination type, and effective date. •

1

<!-- Page: 2 -->

## Won't Have For Initial Go-Live

Phone OTP login unless an SMS provider such as Twilio, MessageBird, Vonage, or TextLocal is configured. •

Deletion of master data records during runtime cleanup. •

Multiple pickup IDs for one request. •

## Method

## 1. High-Level Operational Workflow

```
@startuml
skinparam shadowing false
skinparam packageStyle rectangle
skinparam defaultFontName Arial

actor Merchant
actor Customer
actor "Customer Service" as CS
actor Supervisor
actor "Operation Manager" as OM
actor Dispatch
actor Warehouse
actor "Branch Office" as Branch
actor Finance
actor "Rider / Driver / Helper" as Mobile

rectangle "Britium Enterprise Portal" {
    component "Merchant Portal" as MP
    component "Customer Portal" as CP
    component "Customer Service Portal" as CSP
    component "Supervisor Portal" as SP
    component "Operation Manager Portal" as OMP
    component "Dispatch Center" as DC
    component "Warehouse Visibility" as WH
    component "Branch Office" as BO
    component "Finance / COD Settlement" as FIN
}

rectangle "Backend API / Supabase" {
    database "Master Data" as Master
    database "Pickup Requests" as Pickup
    database "Notifications" as Notif
    database "Cargo Events" as Cargo
    database "Workforce Accounts" as Workforce
    database "Tariff Master" as Tariff
    database "Audit / Archive" as Audit
```

2

<!-- Page: 3 -->

```
}

Merchant --> MP
Customer --> CP
CS --> CSP
Supervisor --> SP
OM --> OMP
Dispatch --> DC
Warehouse --> WH
Branch --> BO
Finance --> FIN
Mobile --> Workforce

MP --> Pickup
CP --> Pickup
CSP --> Pickup
Pickup --> Notif
Pickup --> Cargo
Pickup --> Tariff
Pickup --> Master
Pickup --> Audit
Notif --> CSP
Notif --> SP
Notif --> OMP
Notif --> DC
Notif --> WH
Notif --> BO
Notif --> FIN
SP --> Workforce
DC --> Workforce
Mobile --> Cargo
Cargo --> MP
Cargo --> CP
Cargo --> CSP
@enduml
```

## 2. End-to-End Pickup Request Sequence

```
@startuml
skinparam shadowing false
skinparam defaultFontName Arial
autonumber
actor "Merchant / Customer / CS" as Requester
participant "Portal UI" as UI
participant "Pickup Request RPC" as PickupRPC
```

3

<!-- Page: 4 -->

```
participant "Pickup ID Reservation" as IDRPC  
participant "Tariff Engine" as Tariff  
participant "Branch Resolver" as Branch  
participant "Notification Service" as Notify  
participant "Supervisor Portal" as Supervisor  
participant "Dispatch Center" as Dispatch  
participant "Rider App" as Rider  
participant "Tracking / Cargo Events" as Cargo  

Requester -> UI: Fill pickup request form  
UI -> PickupRPC: Submit pickup request  
PickupRPC -> IDRPC: Reserve canonical Pickup ID  
IDRPC -> PickupRPC: P-format Pickup ID  
PickupRPC -> Tariff: Calculate tariff if weight/township available  
Tariff -> PickupRPC: Tariff breakdown  
PickupRPC -> Branch: Resolve branch from city/township/address  
Branch -> PickupRPC: Branch code YGN / MDY / NPT  
PickupRPC -> Notify: Create role notifications  
Notify -> Supervisor: New pickup assignment alert  
Notify -> Dispatch: New pickup route/dispatch alert  
Notify -> Requester: Submission confirmation  
PickupRPC -> Cargo: Create submitted event  
PickupRPC -> UI: Return Pickup ID and status  
Supervisor -> Dispatch: Assign rider/driver/helper/vehicle  
Dispatch -> Rider: Assignment visible in Rider App  
Rider -> Cargo: Picked / in transit / delivered status  
Cargo -> UI: Tracking history visible to Merchant/Customer/CS  
@enduml
```

## 3. Login and Role Synchronization Workflow

```
@startuml
skinparam shadowing false
skinparam defaultFontName Arial

actor Admin
participant "CSV Account File" as CSV
participant "Provisioning Script" as Script
participant "Supabase Auth" as Auth
participant "be_user_account_registry" as Registry
participant "be_mobile_workforce_accounts" as Workforce
participant "Enterprise Portal Login" as Login

Admin -> CSV: Prepare approved user accounts
Admin -> Script: Run script locally with service_role key
Script -> Auth: Create or update auth user
```

4

<!-- Page: 5 -->

```
Auth --> Script: auth_user_id

Script -> Registry: Upsert account, role, branch, aliases
alt Rider / Driver / Helper

Script -> Workforce: Upsert workforce account and auth_user_id
end

Admin -> Login: Test login with email/password

Login -> Auth: Authenticate user

Auth --> Login: Session + metadata

Login -> Registry: Resolve app role and branch

Registry --> Login: Role permissions

Login --> Admin: Route user to allowed portal screens
@enduml
```

## 4. Branch Office Workflow

```
@startuml
skinparam shadowing false
skinparam defaultFontName Arial

actor "Branch Admin" as Admin
participant "Branch Office Page" as Page
participant "Branch Registry" as Branches
participant "Branch Snapshot RPC" as Snapshot
participant "Pickup Requests" as Pickup
participant "Notifications" as Notif

Admin -> Page: Open Branch Office
Page -> Branches: Load active branches
Branches -> Page: MDY and NPT branch options
Admin -> Page: Select Mandalay or Naypyitaw
Page -> Snapshot: Request branch snapshot(branch_code)
Snapshot -> Pickup: Load pickups assigned to branch
Snapshot -> Notif: Load branch notifications
Snapshot -> Page: Summary + pickup registry + notifications
Page -> Admin: Display branch operational registry
@enduml
```

## 5. Dispatch Workflow

```
@startuml
skinparam shadowing false
skinparam defaultFontName Arial

actor Dispatcher
participant "Dispatch Center" as UI
```

5

<!-- Page: 6 -->

```
participant "Workforce Accounts" as Workforce
participant "Pickup Requests" as Pickup
participant "Route Generator" as Route
participant "Rider App" as Rider
participant "Cargo Events" as Cargo

Dispatcher -> UI: Open Dispatch Center
UI -> Workforce: Load active riders/drivers/helpers
Workforce -> UI: Workforce roster
UI -> Dispatcher: Show zero routes/stops until real routes exist
Dispatcher -> UI: Generate or assign route
UI -> Pickup: Fetch eligible pickups
UI -> Route: Create route plan from eligible pickups
Route -> UI: Route with stops
UI -> Rider: Assign route to rider/driver/helper
Rider -> Cargo: Update pickup status
Cargo -> UI: Dispatch status updates
@enduml
```

## 6. Tariff Calculation Workflow

```
@startuml
skinparam shadowing false
skinparam defaultFontName Arial

actor User
participant "Pickup Form" as Form
participant "Tariff Master" as Master
participant "Tariff RPC" as Tariff

User -> Form: Enter township, tier, weight, highway drop-off
Form -> Tariff: Calculate tariff
Tariff -> Master: Find active township/tier tariff rule
Master -> Tariff: Base fee and rule values
Tariff -> Tariff: ceil(weight) - allowance
Tariff -> Tariff: extra kg * 500 MMK
Tariff -> Tariff: add 3,000 MMK if highway drop-off
Tariff -> Form: Return breakdown and total tariff
@enduml
```

6

<!-- Page: 7 -->

## 7. Data Model Summary

| Area | Primary Backend Object | Purpose |
| --- | --- | --- |
| Master Data | be_master_data_options | Source of dropdowns, merchant/customer/rider/driver/helper records, township and tariff seed metadata |
| Pickup Request | be_portal_pickup_requests | Unified pickup request record from Merchant, Customer, or Customer Service |
| Pickup ID | be_pickup_id_reservations | Ensures one canonical Pickup ID per request |
| Notifications | be_app_notifications | Role-based alerts for CS, Supervisor, Operations, Dispatch, Warehouse, Branch, Finance |
| Cargo Tracking | be_portal_cargo_events | Real-time pickup lifecycle events and tracking history |
| Customer Service Messages | be_portal_service_threads, be_portal_service_messages | Customer/Merchant communication linked to Pickup ID |
| Workforce | be_mobile_workforce_accounts | Rider/Driver/Helper accounts linked to Auth users and branch |
| User Registry | be_user_account_registry | Enterprise role, branch, aliases, and Auth mapping |
| Branch | be_branch_nodes | Mandalay and Naypyitaw active branch nodes |
| Tariff | be_tariff_master | Base fee, weight allowance, surcharge, and highway fee rule |
| Audit Archive | be_go_live_archived_operational_test_data | Archived sample/test operational data before go-live |
| Runtime Reset Log | be_go_live_runtime_reset_log | Evidence of cleanup actions |


7

<!-- Page: 8 -->

## Detailed Step Elaboration

## Step 1 — User Login

A user logs in using a provisioned account such as rider_ygn_0001@britiumventures.com  or  cs_ygn_0001@britiumventures.com .

The authentication flow performs these checks:

Supabase Auth validates email and password. 1.

The app reads Auth metadata and/or be_user_account_registry . 2.

The user role is mapped to Enterprise Portal permissions. 3.

The sidebar and allowed screens are shown according to role. 4.

Rider, Driver, and Helper users are also mapped to be_mobile_workforce_accounts . 5.

For initial go-live, login is email/password. Phone OTP can be introduced later after an SMS provider is configured.

## Step 2 — Master Data Synchronization

Master Data remains the source of truth for dropdowns and lookup values.

Key synchronized records include:

Merchant list •

Customer list •

Rider list •

Driver list •

Helper list •

Employee list •

Fleet list •

Township / territory list •

Status list •

Tariff master values •

Each operational form should read dropdown options from backend APIs or RPCs, not from local hardcoded arrays.

## Step 3 — Pickup Request Creation

Pickup requests can be created from:

Merchant Portal •

Customer Portal •

Customer Service Portal •

8

<!-- Page: 9 -->

The same backend function should handle all three sources. The required behavior is:

Validate requester type and required fields. 1.

Generate or reserve one canonical Pickup ID. 2.

Store request details in the unified pickup request table. 3.

Resolve branch code if the city/township/address maps to Mandalay or Naypyitaw. 4.

Calculate tariff if weight/township/tier data are available. 5.

Create an initial cargo event. 6.

Notify relevant roles. 7.

This removes duplicate Customer Service work because CS no longer has to re-enter a pickup request submitted by Merchant or Customer.

## Step 4 — Notification Distribution

When a pickup is submitted, notifications are generated for role-specific users.

Recommended notification routing:

| Event | Recipients |
| --- | --- |
| New pickup request | Customer Service, Supervisor, Operation Manager |
| Branch-resolved pickup | Branch Office for MDY/NPT when applicable |
| COD pickup | Finance/COD Settlement |
| Assignment required | Supervisor, Dispatch |
| Warehouse received | Warehouse, Operation Manager |
| Customer/Merchant message | Customer Service |
| Delivery status update | Customer Service, Merchant/Customer tracking |


Notifications must carry:

Pickup ID •

Source table •

Source key •

Target role •

Target branch if relevant •

Read/unread status •

Metadata for routing •

## Step 5 — Supervisor Assignment

Supervisor receives the pickup request and assigns operational resources.

9

<!-- Page: 10 -->

Assignment output should include:

Rider code •

Driver code if required •

Helper code if required •

Fleet/vehicle code if required •

Branch/zone information •

Assignment timestamp •

Assigned by user •

The assignment must update backend metadata and create a tracking/cargo event.

## Step 6 — Dispatch Route Management

Dispatch Center should show workforce roster immediately, but route counters should remain zero until real routes exist.

For go-live:

Active Routes = 0 until route generation happens. •

Total Stops = 0 until route stops are created. •

Completed Routes = 0 until real route completion. •

Over-Capacity = 0 until capacity rules flag a real route. •

Roster rows are valid because they are staff accounts, not operational sample data.

When a route is generated:

Dispatch selects eligible pickup requests. 1.

System creates route and route stops. 2.

Dispatcher assigns route to rider/driver/helper. 3.

Rider App receives assignment from backend. 4.

Status updates flow back into cargo events. 5.

## Step 7 — Rider / Driver / Helper Mobile Workflow

For initial go-live, mobile workers use email/password accounts.

Workflow:

Rider logs in. 1.

App resolves user against be_mobile_workforce_accounts . 2.

App loads assignments from backend only. 3.

If no real assignment exists, app shows zero jobs. 4.

Rider accepts/picks up/completes delivery. 5.

Status update creates cargo event. 6.

Merchant/Customer/CS tracking updates from cargo events. 7.

10

<!-- Page: 11 -->

Phone login can be enabled later by:

Collecting phone numbers in E.164 format. 1.

Updating phone_e164  values. 2.

Enabling Supabase Phone provider. 3.

Configuring an SMS provider. 4.

Updating the Rider App login UI to phone OTP. 5.

## Step 8 — Branch Office Workflow

Branch Office must support:

Mandalay Branch Office ( MDY ) •

Naypyitaw Branch Office ( NPT ) •

Branch resolution rules:

City/township/address contains Mandalay → MDY •

City/township/address contains Naypyitaw/Naypyidaw → NPT •

Branch page behavior:

Load active branches from backend. 1.

Default to Mandalay/Naypyitaw if backend branch list is temporarily unavailable. 2.

Load branch snapshot from backend. 3.

Display summary, operational registry, and branch notifications. 4.

Never crash when arrays are empty or missing. 5.

## Step 9 — Warehouse Workflow

Warehouse receives parcels after pickup/dispatch handover.

Expected flow:

Parcel received or scanned. 1.

Warehouse inventory record created. 2.

Cargo event created. 3.

Warehouse dashboard updates. 4.

Merchant/Customer tracking sees warehouse status. 5.

Exceptions are flagged if receiving mismatch occurs. 6.

Initial go-live should show zero old manifests and zero old storage records.

## Step 10 — Tariff Master Workflow

Tariff uses this rule:

11

<!-- Page: 12 -->

| Rule | Value |
| --- | --- |
| Standard allowance | 3 kg |
| Royal allowance | 5 kg |
| Chargeable weight | ceil(actual_weight) |
| Extra weight | max(0, chargeable_weight - allowance) |
| Surcharge | extra_weight * 500 MMK |
| Highway station drop-off | + 3,000 MMK if selected |
| Total tariff | base_fee + weight_surcharge + highway_fee |


## Examples:

Standard, 1.5 kg, no highway: base fee only. •

Standard, 6.2 kg, highway: ceil(6.2)=7 , extra 7-3=4 , surcharge 4*500=2,000 , highway  3,000 . •

Royal, 6.2 kg, highway: ceil(6.2)=7 , extra 7-5=2 , surcharge 2*500=1,000 , highway 3,000 . •

## Step 11 — Finance / COD Settlement Workflow

Finance receives COD-relevant pickup records.

Flow:

Pickup request includes COD amount or COD payment term. 1.

Finance notification is created. 2.

Delivery completion triggers settlement eligibility. 3.

COD settlement record is prepared. 4.

Finance validates and closes settlement. 5.

Finance should not edit operational pickup details directly.

## Step 12 — Customer Service Response and History

Customer Service should be the single control point for customer responses and complaints.

Flow:

Merchant/Customer sends message from portal. 1.

Thread is created and linked to Pickup ID. 2.

Customer Service receives notification. 3.

CS replies or takes action. 4.

Message history remains visible against the pickup/customer account. 5.

If operational action is required, CS escalates to Supervisor/Operations. 6.

12

<!-- Page: 13 -->

## Step 13 — Go-Live Runtime Cleanup Rule

Before go-live, operational runtime records must be empty or real only.

Cleaned areas include:

Old shipments •

Old wayplans •

Old dispatch routes/stops •

Old warehouse manifests •

Old supervisor cards •

Old rider app verification logs •

Old delivery workflow rows •

Old customer service pickup test records •

## Preserved areas include:

Master Data •

Tariff Master •

Branch nodes •

Workforce accounts •

User registry •

Audit archive •

## Implementation

## Phase 1 — Backend Readiness

Confirm master data options are active. 1.

Confirm branch nodes exist for MDY and NPT. 2.

Confirm tariff master rows exist for Standard and Royal. 3.

Confirm user registry and workforce account tables are populated. 4.

Confirm all active operational sample rows are archived/deleted. 5.

## Phase 2 — Frontend Readiness

Route Dispatch to backend-only go-live page. 1.

Route Branch Office to safe backend-only page. 2.

Ensure Merchant and Customer portals submit pickup requests through backend RPC. 3.

Ensure Customer Service does not duplicate pickup requests. 4.

Ensure notification bell loads backend notifications. 5.

Ensure Rider App loads backend assignments only. 6.

## Phase 3 — User Account Readiness

Create Auth users from approved CSV. 1.

Store account role and branch in be_user_account_registry . 2.

Store Rider/Driver/Helper records in be_mobile_workforce_accounts 3.

13

<!-- Page: 14 -->

Verify 182 active accounts. 4.

Verify 30 riders, 20 drivers, and 20 helpers are linked. 5.

Test representative logins for each major role. 6.

## Phase 4 — Live Dry Run

Submit one pickup from Merchant Portal. 1.

Confirm one Pickup ID is generated. 2.

Confirm notification appears for Customer Service/Supervisor/Operations. 3.

Assign rider/driver/helper. 4.

Confirm Rider App sees assignment. 5.

Update pickup status. 6.

Confirm Merchant/Customer tracking updates. 7.

Confirm Branch Office sees branch-specific pickup if city is Mandalay/Naypyitaw. 8.

Confirm Finance sees COD pickup if applicable. 9.

## Milestones

| Milestone | Exit Criteria |
| --- | --- |
| M1: Master Data Ready | Dropdowns and master records load from backend |
| M2: Runtime Cleanup Complete | Operations, Dispatch, Delivery Workflow, Warehouse, Supervisor show no sample rows |
| M3: Account Provisioning Complete | 182 accounts active and role-mapped |
| M4: Portal Submission Ready | Merchant/Customer/CS submit to same backend pickup workflow |
| M5: Assignment Ready | Supervisor can assign real pickups to workforce users |
| M6: Tracking Ready | Cargo events update Merchant/Customer/CS tracking |
| M7: Branch Ready | MDY/NPT branch screens load and filter correctly |
| M8: Tariff Ready | Tariff calculation matches approved logic |
| M9: Go-Live Dry Run Passed | One complete pickup lifecycle succeeds end-to-end |


## Gathering Results

## Functional Validation

Pickup ID uniqueness verified. •

Notifications created for correct roles. •

Branch assignment correct for Mandalay and Naypyitaw. •

Rider/Driver/Helper accounts can log in. •

Dispatch counters remain zero until real route generation. •

Rider App jobs remain zero until real assignment. •

14

<!-- Page: 15 -->

Merchant/Customer tracking shows cargo events. •

Tariff calculation returns correct breakdown. •

## Operational Validation

No visible sample/test data remains in active runtime screens. •

Archive tables retain cleanup evidence. •

Staff roster is active but current jobs are zero. •

Master Data is preserved. •

Role permissions route users to correct screens. •

## Post-Go-Live Monitoring

## Monitor daily:

Pickup requests created •

Notifications delivered/read •

Assignment time •

Route generation count •

Rider status update latency •

Failed/exception pickups •

Branch-specific volume •

COD settlement pending amount •

Customer Service response time •

## Need Professional Help in Developing Your Architecture?

Please contact me at sammuti.com :)

15