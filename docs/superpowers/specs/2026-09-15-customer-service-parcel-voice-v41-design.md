# Customer Service Parcel Voice Workflow V41 — Design

Date: 2026-09-15
Status: Approved design awaiting implementation-plan approval
Branch: `design/customer-service-parcel-voice-v41`

## 1. Objective

Turn the Customer Service Portal into a parcel-centric support channel where Customer Service can see the live lifecycle status of every parcel they are authorized to read, record every customer voice against the exact parcel, and route required actions automatically to the responsible operational channel.

The parcel / Delivery Way ID is the master reference. Customer comments, complaints, requests, corrections, redelivery instructions, COD concerns, and follow-up outcomes remain permanently attached to that parcel.

## 2. Scope

V41 covers:

- parcel-level Customer Service read model;
- live operational status projection into the Customer Service channel;
- parcel-linked Customer Voice records;
- automatic department routing;
- receiving-channel notification and acknowledgement;
- action / resolution tracking;
- formal escalation flow;
- Superadmin-only routing override;
- audit history;
- Customer Service follow-up and closure.

V41 does not redesign unrelated Warehouse, Finance, Rider, Wayplan, Pickup, or Data Entry workflows. It consumes their existing lifecycle/status data and sends them parcel-linked work items when required.

## 3. Business Authority Model

### 3.1 Default routing

Routing is 100% automatic from issue type, parcel state, and operational context.

Normal users may not redirect a case outside the formal workflow.

### 3.2 Superadmin override

Only `SUPERADMIN` may override the automatically selected responsible department.

Every override must persist:

- original department;
- replacement department;
- Superadmin identity;
- timestamp;
- mandatory override reason.

### 3.3 Escalation by non-Superadmin users

Customer Service, Operations, Warehouse, Finance, Dispatch/Rider, and Supervisor users may escalate a case for rerouting review, but may not reroute it themselves.

The case remains with its current formal owner until Superadmin approves a routing override.

## 4. Parcel-Centric Customer Service Read Model

Customer Service must not depend only on pickup-request rows. The read model must expose every parcel that the signed-in Customer Service user is allowed to read through territory/branch access rules.

Each parcel record should include, where available:

- Delivery Way ID / Waybill;
- Pickup ID;
- recipient name and phone;
- delivery address / township / ward / postal code;
- merchant / branch context;
- parcel lifecycle status;
- warehouse status and latest warehouse event;
- dispatch / operational status and latest operation event;
- rider / driver / vehicle / wayplan assignment;
- latest delivery attempt / proof state;
- COD / collection / finance state;
- latest status timestamp;
- number of open Customer Voices;
- active responsible department;
- latest Customer Voice summary;
- latest internal action;
- escalation flag;
- SLA / due state when applicable.

The read model must project from existing operational sources rather than copy lifecycle state into an independent CS-only status table.

## 5. Customer Voice Record

A Customer Voice is one customer-originated instruction, complaint, request, clarification, or concern linked to one parcel.

Minimum fields:

- id;
- delivery_way_id / waybill_no;
- pickup_id;
- customer_name;
- customer_phone;
- source_channel;
- issue_type;
- priority;
- customer_voice_text;
- created_by;
- created_at;
- auto_routed_department;
- current_department;
- workflow_status;
- resolution_status;
- due_at (nullable);
- closed_at (nullable).

Recommended source channels:

- PHONE;
- VIBER;
- MESSENGER;
- WALK_IN;
- EMAIL;
- OTHER.

Recommended issue types:

- INQUIRY;
- REQUEST;
- COMPLAINT;
- REDELIVERY;
- ADDRESS_CORRECTION;
- LOCATION_CORRECTION;
- COD_ISSUE;
- PAYMENT_ISSUE;
- PARCEL_MISSING;
- WAREHOUSE_ISSUE;
- RIDER_ISSUE;
- PICKUP_ISSUE;
- OTHER.

## 6. Automatic Routing Rules

Initial recommended routing contract:

- REDELIVERY, RIDER_ISSUE, delivery timing/failure -> Operations / Dispatch / Rider channel;
- ADDRESS_CORRECTION, LOCATION_CORRECTION -> Data Entry / Operations;
- PARCEL_MISSING, WAREHOUSE_ISSUE -> Warehouse;
- COD_ISSUE, PAYMENT_ISSUE -> Finance;
- PICKUP_ISSUE -> Pickup / Supervisor workflow;
- general operational complaint -> Operations;
- ambiguous OTHER -> Operations by default, with escalation available.

Routing rules must be centralized and testable, not hardcoded differently in multiple screens.

## 7. Receiving Department Workflow

After a Customer Voice is saved:

1. system determines the responsible department;
2. system creates a parcel-linked work item / notification;
3. destination queue receives Way ID, priority, Customer Voice text, issue type, due time if any, and direct parcel reference;
4. receiving department opens the item;
5. receiving department acknowledges it;
6. receiving department records action/update;
7. receiving department marks the required action resolved;
8. Customer Service sees the updated state and completes customer follow-up;
9. Customer Service closes the case when communication is complete.

## 8. Workflow States

Recommended lifecycle:

- OPEN;
- ROUTED;
- SEEN;
- ACKNOWLEDGED;
- IN_PROGRESS;
- ACTION_TAKEN;
- RESOLVED;
- CS_CONFIRMED;
- CLOSED;
- ESCALATED;
- REOPENED.

Transitions must be role-aware and audited.

## 9. Internal Action History

Use a separate append-only action history for operational updates.

Each action should contain:

- customer_voice_id;
- action_type;
- action_note;
- department;
- actor_user_id / actor role;
- action timestamp;
- optional resulting workflow status.

Customer Service must be able to read this history from the parcel detail panel.

## 10. Escalation and Override

### 10.1 Escalation

Any authorized workflow participant may raise an escalation with:

- escalation reason;
- requested department or requested review outcome;
- timestamp;
- actor identity.

Escalation does not change `current_department`.

### 10.2 Superadmin override

Superadmin may approve a new department. The system must record both the automatic route and override route for audit.

An override must create a new destination notification and preserve the prior route history.

## 11. Notifications

Notification delivery status should support:

- QUEUED;
- SENT;
- SEEN;
- ACKNOWLEDGED;
- ACTIONED;
- RESOLVED.

Notification records should reference the Customer Voice and parcel, not duplicate the full parcel record.

## 12. Customer Service Portal UX

### 12.1 Main table

Recommended columns:

- Select;
- Pickup ID;
- Waybill / Delivery Way ID;
- live parcel status;
- recipient;
- phone;
- township;
- rider / assignment;
- open voices;
- current owner department;
- latest Customer Voice;
- latest internal action;
- priority;
- SLA / due state;
- escalation;
- action.

### 12.2 Parcel detail panel

Opening a parcel should show:

1. Parcel Summary
   - identity, customer, address, rider, branch, COD/finance, current status.
2. Status Timeline
   - Data Entry, Warehouse, Dispatch/Operations, Rider/Delivery, Finance, Waybill events.
3. Customer Voices
   - chronological parcel-linked customer contact history.
4. Action Composer
   - issue type, priority, source channel, Customer Voice text, optional due/callback time.
5. Internal Action History
   - acknowledgement, operations notes, resolution, escalations, overrides.

## 13. Proposed Data Structures

Recommended new tables (names may be adjusted to existing naming conventions during planning):

- `be_customer_voices`;
- `be_customer_voice_actions`;
- `be_customer_voice_escalations`;
- `be_customer_voice_notifications`.

The parcel live-status read model should be provided by an RPC/view derived from current parcel and lifecycle tables rather than a duplicate source of truth.

## 14. Access Control

- CS users: read authorized parcels, create Customer Voices, follow actions, confirm/close after resolution, escalate.
- receiving departments: read assigned work items, acknowledge, update, resolve.
- Supervisors: same formal workflow plus escalation visibility; no routing override.
- Superadmin: full read plus routing override.
- all access remains subject to branch/territory rules where applicable.

RLS / security-definer RPCs must not widen access beyond existing territory authority.

## 15. Audit Requirements

Audit events must cover:

- Customer Voice creation;
- routing decision;
- notification send;
- seen / acknowledgement;
- action updates;
- resolution;
- CS confirmation;
- closure;
- escalation;
- Superadmin override with reason;
- reopen.

Audit records must preserve timestamps and actor identity.

## 16. Error Handling

- Customer Voice creation must be atomic with its initial route assignment.
- If downstream notification creation fails, the Customer Voice must remain visible as a recoverable delivery failure rather than disappearing.
- Duplicate submission protection should prevent repeated clicks from creating duplicate voices.
- Missing/retired parcel references must return a clear error and must not create orphaned cases.
- If the auto-routing rules cannot classify an issue, route to Operations and mark it for review rather than dropping it.

## 17. Testing Contract

Implementation must prove at least:

1. authorized CS users can see parcel-level lifecycle data;
2. unauthorized territory access remains blocked;
3. Customer Voice is attached to the correct Delivery Way ID;
4. each configured issue type routes to the expected department;
5. non-Superadmin users cannot reroute directly;
6. staff can escalate without changing department ownership;
7. Superadmin override records old route, new route, actor, reason, timestamp;
8. receiving department can acknowledge and resolve;
9. CS sees status transitions without losing original customer text;
10. multiple Customer Voices can coexist on one parcel;
11. closed voices can be reopened through an audited transition;
12. notification state progresses independently of parcel lifecycle state;
13. no regression to current Pickup Request authority or V36.1 parcel status projection;
14. existing Data Entry, Warehouse, Rider, Finance, Wayplan, and Waybill workflows remain functional.

## 18. Implementation Boundaries

Implementation should be phased but delivered under one coherent contract:

### Phase 1
- parcel-centric CS read model;
- Customer Voice storage;
- automatic routing;
- parcel detail panel.

### Phase 2
- receiving-channel acknowledgement and actions;
- notifications;
- escalation;
- Superadmin override;
- audit history.

### Phase 3
- SLA timers;
- dashboard counters;
- repeated-complaint / unresolved-case analytics.

Phase 3 analytics must not block deployment of the operational core.

## 19. Success Criteria

V41 is successful when Customer Service can open any authorized parcel, see its current operational lifecycle, record the customer’s voice against that exact parcel, have the system route the instruction automatically, observe acknowledgement/action/resolution from the responsible department, and close the customer communication with a complete audit trail. Manual department rerouting is impossible for ordinary users and is available only to Superadmin with a mandatory reason.
