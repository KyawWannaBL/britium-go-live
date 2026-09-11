// @section: training-data

export interface Lesson {
  id: string;
  title: string;
  overview: string;
  steps: string[];
  keyRules: string[];
  tip?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface TrainingModule {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  roles: string[];
  overview: string;
  lessons: Lesson[];
  quiz: QuizQuestion[];
}

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'login',
    number: 1,
    title: 'Login & Access Control',
    subtitle: 'Authentication, roles, and portal navigation',
    icon: '🔐',
    color: '#6366f1',
    roles: ['All Staff', 'Admin', 'System'],
    overview: 'The Britium Express Enterprise Portal uses role-based access control (RBAC) to ensure every staff member sees only the screens relevant to their function. Login is via email and password. The system resolves your role from the User Account Registry and routes you to the correct portal screens automatically.',
    lessons: [
      {
        id: 'login-1',
        title: 'How to Log In',
        overview: 'Staff accounts follow a standard email format tied to their role and branch. On first login, verify your credentials with your supervisor.',
        steps: [
          'Open the portal URL: aykqy528ce.skywork.website in your browser.',
          'Enter your provisioned email address (e.g. cs_ygn_0001@britiumventures.com).',
          'Enter your password and click Sign In.',
          'The system authenticates via Supabase Auth and reads your role from be_user_account_registry.',
          'The sidebar and allowed screens are automatically displayed based on your role.',
          'If login fails, contact your Admin — do NOT share passwords or attempt other accounts.',
        ],
        keyRules: [
          'Email format: {role}_{branch}_{sequence}@britiumventures.com (e.g. rider_ygn_0001@)',
          'Phone OTP login is available after SMS provider is configured',
          'Failed logins do not auto-unlock — contact Admin for reset',
        ],
        tip: 'Bookmark the portal URL. Do not use the browser back button after login — use the sidebar navigation.',
      },
      {
        id: 'login-2',
        title: 'Understanding Roles & Permissions',
        overview: 'The platform has 14 distinct roles, each with specific screen access. Understanding your role prevents confusion and security violations.',
        steps: [
          'Customer Service (CS): Access to CS Portal, customer lookup, pickup request creation, NDR handling.',
          'Supervisor: Access to Supervisor Hub, assignment management, escalation monitoring.',
          'Operation Manager: Full operational oversight, dispatch center, branch management.',
          'Dispatch: Route creation, rider/driver assignment, stop management.',
          'Warehouse Staff: Intake scanning, sorting, bagging, dispatch confirmation.',
          'Finance / COD Settlement: COD verification, invoice approval, merchant settlement.',
          'Rider / Driver / Helper: Mobile app only — pickup, delivery, POD capture, COD handover.',
          'Merchant: Merchant Portal — self-service upload, tracking, account management.',
          'Branch Office (MDY/NPT): Branch-specific pickup registry and notifications.',
        ],
        keyRules: [
          'Never share login credentials — each account is individually audited',
          'Role determines sidebar items and data visibility — report any unexpected access to Admin',
          'Rider, Driver, Helper accounts are also registered in be_mobile_workforce_accounts',
        ],
        tip: 'If you can see a screen you should not have access to, report it to Admin immediately. Unauthorized access is logged.',
      },
    ],
    quiz: [
      {
        question: 'What determines which screens a user can access in the portal?',
        options: ['Their department name', 'Their role in be_user_account_registry', 'Their branch location', 'Their employee number'],
        correct: 1,
        explanation: 'The app reads Auth metadata and resolves the user role from be_user_account_registry. This role determines which sidebar items and screens are displayed.',
      },
      {
        question: 'What is the correct email format for a Customer Service staff at Yangon Branch?',
        options: ['yangon_cs_001@britiumventures.com', 'cs_ygn_0001@britiumventures.com', 'customer.service@britium.com', 'cs001_yangon@britiumventures.com'],
        correct: 1,
        explanation: 'The standard format is {role}_{branch}_{sequence}@britiumventures.com. For CS in Yangon, this is cs_ygn_0001@britiumventures.com.',
      },
      {
        question: 'If a rider cannot log in with their email/password, what should they do?',
        options: ['Try another account', 'Reset the password themselves via the portal', 'Contact Admin for account assistance', 'Use phone OTP instead'],
        correct: 2,
        explanation: 'Riders should contact Admin for account reset. Self-service password reset and phone OTP require SMS provider configuration before they are available.',
      },
    ],
  },

  {
    id: 'customer-service',
    number: 2,
    title: 'Customer Service Portal',
    subtitle: 'Pickup initiation, CS lookup, NDR handling',
    icon: '📞',
    color: '#0ea5e9',
    roles: ['Customer Service', 'CS Supervisor', 'NDR Handler'],
    overview: 'Customer Service is the first point of entry for all pickup requests, customer inquiries, NDR (Non-Delivery Report) cases, reschedule requests, address corrections, and escalation cases. Every workflow in the platform begins here.',
    lessons: [
      {
        id: 'cs-1',
        title: 'Customer & Merchant Lookup',
        overview: 'Before creating any pickup request, always search for the existing record first to avoid duplicates and leverage auto-fill.',
        steps: [
          'Open the Customer Service Portal from the sidebar.',
          'Use the Search panel — search by Customer Name, Merchant Name, Phone Number, or AWB.',
          'The system returns the latest AWB, active ticket count, last delivery status, and phone details.',
          'If found: use the existing record as the base for the new request.',
          'If not found: proceed to create a new record with full validation.',
          'Always confirm there are no duplicate active pickup requests before creating a new one.',
        ],
        keyRules: [
          'Never create a duplicate pickup request for the same merchant+date+parcel batch',
          'The lookup panel is the single source of truth for customer history',
          'CS is the control point for all customer responses and complaints',
        ],
        tip: 'Search by phone number first — it is the fastest lookup method and returns the most accurate results.',
      },
      {
        id: 'cs-2',
        title: 'Pickup Request Confirmation Checklist',
        overview: 'Before creating or forwarding a pickup request to Data Entry, CS must validate all required fields. Missing fields cause downstream failures.',
        steps: [
          'Confirm Merchant / Sender details: Merchant name, Merchant ID, 3-letter code, sender phone.',
          'Confirm Pickup Details: Pickup address, township, city, date and time, parcel count.',
          'Confirm Recipient Details: Recipient name, phone, delivery township, delivery address.',
          'Confirm Commercial Terms: Payment method, COD amount (if COD), service type, priority.',
          'Confirm Special Instructions: Any handling notes or delivery requirements.',
          'Once all fields are verified, create the pickup request OR forward to Data Entry for bulk upload.',
        ],
        keyRules: [
          'All 5 field groups must be completed before creating a pickup request',
          'COD amount is mandatory if payment method is COD — leave blank for Prepaid/Account Billing',
          'CS does NOT re-enter a pickup request already submitted by Merchant or Customer Portal',
        ],
        tip: 'Use the master-data lookup: typing a Merchant ID auto-fills the merchant code, name, sender phone, pickup address, township, and payment profile.',
      },
      {
        id: 'cs-3',
        title: 'NDR & Resolution Actions',
        overview: 'After a failed delivery, CS receives the case and applies the appropriate resolution action from the resolution menu.',
        steps: [
          'Failed delivery cases appear automatically in the CS queue from Way Management.',
          'Review the failure reason submitted by the rider: Unreachable, Refused, Address Issue, Other.',
          'Select the correct resolution action from the following options:',
          '  → Call customer: contact the receiver to arrange reattempt',
          '  → Reschedule delivery: set a new delivery date',
          '  → Return to sender: initiate RTO process',
          '  → Update delivery address: correct the address and re-dispatch',
          '  → Escalate: forward to Branch Supervisor for urgent cases',
          '  → Mark Resolved: close the ticket when the issue is handled',
          'Document every action taken in the case notes for audit purposes.',
        ],
        keyRules: [
          'A failure record is immediately visible in Way Management, CS, and Supervisor Dashboard',
          'After 3 failed attempts, the case escalates to CS Review / Return to Origin (RTO)',
          'Every resolution action is logged and linked to the original Pickup ID',
        ],
        tip: 'Always call the receiver before initiating RTO — most failed deliveries are resolved by a phone call.',
      },
    ],
    quiz: [
      {
        question: 'Which field group is NOT part of the CS pickup confirmation checklist?',
        options: ['Merchant / Sender Details', 'Pickup Details', 'Rider Assignment Details', 'Recipient Details'],
        correct: 2,
        explanation: 'Rider assignment is handled by the Supervisor after the pickup request is created. CS confirms Merchant/Sender, Pickup, Recipient, Commercial Terms, and Special Instructions.',
      },
      {
        question: 'What should CS do when a pickup request has already been submitted by the Merchant Portal?',
        options: ['Create a duplicate to confirm it', 'Re-enter the same request manually', 'Do NOT create a duplicate — work from the existing record', 'Delete the merchant\'s request and recreate it'],
        correct: 2,
        explanation: 'One pickup request creates one canonical Pickup ID. CS should not duplicate a request already submitted by Merchant or Customer Portal, as this would create two competing records.',
      },
      {
        question: 'How many failed delivery attempts before a case automatically escalates to CS Review / RTO?',
        options: ['1', '2', '3', '5'],
        correct: 2,
        explanation: 'After 3 failed delivery attempts, the delivery exception rule triggers CS Review or Return to Origin (RTO) as the next action.',
      },
    ],
  },

  {
    id: 'data-entry',
    number: 3,
    title: 'Data Entry & Bulk Upload',
    subtitle: 'Template workflow, auto-fill logic, system-generated fields',
    icon: '📋',
    color: '#10b981',
    roles: ['Data Entry', 'Customer Service', 'Merchant'],
    overview: 'Data Entry structures shipment records either manually or through Excel/CSV bulk upload. The upload template is used for bulk pickup/delivery rows, API sync, field validation, and creating records in the pickup request and shipment tables.',
    lessons: [
      {
        id: 'de-1',
        title: 'Internal Data Entry Upload Template',
        overview: 'The BE_DataEntry_Bulk_Template.csv is the primary tool for creating multiple pickup/shipment records in a single batch operation.',
        steps: [
          'Download the latest template from the portal (Settings > Templates > Data Entry Template).',
          'Fill in Row Control fields: Row No, Upload Action (NEW/UPDATE), Requester Type.',
          'Complete Merchant Lookup: Merchant ID, Merchant Code, Merchant/Sender Name.',
          'Fill Pickup Details: Sender Phone, Address, Township, City, Date, Time.',
          'Fill Parcel Details: Pickup Parcel Count, Weight (KG), Item Value.',
          'Complete Recipient Details: Name, Phone, Delivery Township, Delivery Address.',
          'Fill Charges: Delivery Fee, Extra Weight Fee, Prepaid Amount, COD Amount.',
          'Select Service settings: Destination, Payment Method, Service Type, Priority.',
          'LEAVE BLANK: Pickup ID, Deliver ID, Invoice No, Waybill No — these are system-generated.',
          'Save as CSV and upload via the Data Entry portal page.',
        ],
        keyRules: [
          'Never manually fill Pickup ID, Deliver ID, Invoice No, or Waybill No',
          'Weight must be in KG with decimal precision (e.g. 1.5, 3.2)',
          'Upload Action must be NEW for new records — UPDATE only for corrections',
        ],
        tip: 'Use the Merchant ID lookup column to trigger auto-fill. Once you enter a valid Merchant ID, the system fills the merchant code, name, phone, address, township, and payment profile automatically.',
      },
      {
        id: 'de-2',
        title: 'System-Generated Fields — Never Touch These',
        overview: 'Four critical operational IDs are generated automatically. Staff must never create, modify, or guess these values.',
        steps: [
          'Pickup ID format: P{MMDD}-{MERCHANT_CODE_3}-{PARCEL_COUNT_3}',
          '  Example: P0525-BBK-015 = Pickup on May 25, Baby Kyaw merchant, 15 parcels',
          'Deliver ID format: D{MMDD}-{MERCHANT_CODE_3}-{SEQUENCE_3}',
          '  Example: D0525-BBK-016 = Delivery sequence starts at 016 (after pickup batch of 015)',
          'Invoice Number format: I{MMDD}-{MERCHANT_CODE_3}-{SEQUENCE_3}',
          '  Example: I0525-BBK-015 = Invoice for the same batch',
          'Waybill Number format: W{MMDD}-{MERCHANT_CODE_3}-{SEQUENCE_3}',
          '  Example: W0525-BBK-015 = Waybill for the same batch',
          'All four IDs share the same date, merchant code, and count — enabling any team to trace any parcel.',
        ],
        keyRules: [
          'All 4 IDs are READ-ONLY for staff — leave blank in upload templates',
          'The Deliver ID sequence starts at parcel_count + 1 relative to the Pickup ID count',
          'IDs use MMDD format (2-digit month + 2-digit day) — not DDMM or YYYY-MM-DD',
        ],
        tip: 'The design principle: any downstream team (Warehouse, Finance, CS, Rider) can identify the date, merchant, and batch from any single ID without additional lookup.',
      },
    ],
    quiz: [
      {
        question: 'If a pickup batch for merchant "Baby Kyaw" (BBK) on May 25th has 15 parcels, what is the correct Pickup ID?',
        options: ['P25-05-BBK-015', 'P0525-BBK-015', 'P20250525-BBK-015', 'BBK-0525-P-015'],
        correct: 1,
        explanation: 'The format is P{MMDD}-{MERCHANT_CODE_3}-{PARCEL_COUNT_3}. May = 05, Day = 25 → P0525-BBK-015.',
      },
      {
        question: 'What should you put in the Pickup ID column when uploading a new record?',
        options: ['A sequential number you create', 'The same ID from a previous batch', 'Leave it blank — the system generates it', 'Copy it from the merchant\'s invoice'],
        correct: 2,
        explanation: 'Pickup ID, Deliver ID, Invoice No, and Waybill No are ALL system-generated. Staff must leave these blank during upload. The backend populates them automatically after validation.',
      },
      {
        question: 'For the same BBK batch (P0525-BBK-015), what would the Deliver ID be?',
        options: ['D0525-BBK-015', 'D0525-BBK-016', 'D0525-BBK-001', 'D0526-BBK-015'],
        correct: 1,
        explanation: 'The Deliver ID sequence begins AFTER the pickup count. Since the pickup has 015 parcels, the Deliver ID starts at 016: D0525-BBK-016.',
      },
    ],
  },

  {
    id: 'create-delivery',
    number: 4,
    title: 'Create Delivery',
    subtitle: 'Manual shipment creation via the Enterprise Portal',
    icon: '📦',
    color: '#f59e0b',
    roles: ['Customer Service', 'Operation Manager', 'Admin'],
    overview: 'The Create Delivery page in the Enterprise Portal allows staff to create individual shipments manually. It captures all operational and commercial parameters in a single form, runs validation, and generates all four operational IDs upon successful submission.',
    lessons: [
      {
        id: 'cd-1',
        title: 'Filling the Create Delivery Form',
        overview: 'The creation form is comprehensive. Completing it correctly is essential — errors at this stage propagate through the entire shipment lifecycle.',
        steps: [
          'Select Service Type: Standard, Royal, or Commitment.',
          'Set Priority: Normal, Express, or Same-Day.',
          'Select Branch: YGN (Yangon), MDY (Mandalay), or NPT (Naypyitaw).',
          'Merchant Account: Search by Merchant ID or Name — this auto-fills sender details.',
          'Sender Details: Confirm name, phone, pickup address, township, city.',
          'Recipient Details: Enter name, phone, delivery township, delivery address.',
          'Product: Enter product description, package count, weight (kg), dimensions.',
          'Payment Term: COD, Prepaid, Account Billing, or Collect.',
          'Enter COD Amount if payment method is COD (leave blank for Prepaid).',
          'Set POD Type, Dispatch Mode, preferred vehicle, tracking SMS, and rider remarks.',
          'Click Submit — the system runs full validation before creating the record.',
        ],
        keyRules: [
          'All required fields must be complete — the form will not submit with missing mandatory data',
          'Phone numbers must follow Myanmar format: 09xxxxxxxxx or +959xxxxxxxxx',
          'COD Amount is mandatory when Payment Method = COD; must be 0 for Prepaid',
        ],
        tip: 'Use the Merchant lookup first — it auto-fills sender phone, address, township, and payment profile. This reduces data entry time and errors.',
      },
      {
        id: 'cd-2',
        title: 'Understanding Tariff Calculation',
        overview: 'The system calculates the delivery tariff automatically based on the service tier, weight, and whether a highway station drop-off is required.',
        steps: [
          'Three service tiers with different allowances:',
          '  • Standard: Free weight 0–3 kg | Base fee: 4,000 MMK',
          '  • Royal: Free weight 0–5 kg | Base fee: 4,000 MMK',
          '  • Commitment: Free weight 0–5 kg | Base fee: 3,500 MMK',
          'Extra weight charge for ALL tiers: +500 MMK per kg above the free weight limit.',
          'Highway station drop-off surcharge for ALL tiers: +3,000 MMK.',
          'Calculation formula: Total = Base Fee + (ceil(weight) − allowance) × 500 + Highway Fee',
          'Example — Standard, 4.5 kg, no highway:',
          '  ceil(4.5) = 5 kg | Extra = 5 − 3 = 2 kg | Surcharge = 2 × 500 = 1,000 | Total = 4,000 + 1,000 = 5,000 MMK',
          'Example — Royal, 6.2 kg, with highway:',
          '  ceil(6.2) = 7 kg | Extra = 7 − 5 = 2 kg | Surcharge = 2 × 500 = 1,000 | Total = 4,000 + 1,000 + 3,000 = 8,000 MMK',
        ],
        keyRules: [
          'Weight is always CEILING-rounded before calculation (1.1 kg → 2 kg)',
          'Extra weight = max(0, ceiling_weight − tier_allowance)',
          'Never manually override the system-calculated tariff without Finance Manager approval',
        ],
        tip: 'For Standard tier: if weight ≤ 3 kg, total = 4,000 MMK only. For Royal/Commitment: if weight ≤ 5 kg, total = base fee only (4,000 or 3,500 MMK).',
      },
    ],
    quiz: [
      {
        question: 'A Standard tier shipment weighs 4.5 kg with no highway. What is the correct delivery fee?',
        options: ['4,000 MMK', '4,500 MMK', '5,000 MMK', '5,500 MMK'],
        correct: 2,
        explanation: 'ceil(4.5) = 5 kg. Extra = 5 − 3 = 2 kg. Surcharge = 2 × 500 = 1,000. Total = 4,000 + 1,000 = 5,000 MMK.',
      },
      {
        question: 'A Royal tier shipment weighs 3 kg with no highway. What is the delivery fee?',
        options: ['3,500 MMK', '4,000 MMK', '4,500 MMK', '5,000 MMK'],
        correct: 1,
        explanation: 'Royal free weight is 0–5 kg. Since 3 kg is within the free band, there is no extra charge. Total = 4,000 MMK (base fee only).',
      },
      {
        question: 'When filling the Create Delivery form, the Merchant auto-fill feature populates which of the following?',
        options: ['Recipient name and phone', 'Sender details, pickup address, township, and payment profile', 'Rider assignment and route', 'COD amount and item value'],
        correct: 1,
        explanation: 'When you select a Merchant ID or Name, the system auto-fills: merchant code, full name, sender phone, pickup address, township, city, and payment/billing/tariff profiles.',
      },
    ],
  },

  {
    id: 'pickup-assignment',
    number: 5,
    title: 'Pickup & Supervisor Assignment',
    subtitle: 'Assigning riders, drivers, helpers; pickup completion',
    icon: '🏍',
    color: '#8b5cf6',
    roles: ['Supervisor', 'Operation Manager', 'Dispatch', 'Rider'],
    overview: 'After a pickup request is created, the Supervisor assigns it to the appropriate rider, driver, helper, or pickup team. The rider then executes the pickup and the system triggers a cascade of status updates.',
    lessons: [
      {
        id: 'pa-1',
        title: 'Supervisor Assignment Process',
        overview: 'The Supervisor receives a notification when a new pickup is created and assigns operational resources before the pickup can proceed.',
        steps: [
          'Supervisor receives a "New pickup assignment alert" notification in the Supervisor Hub.',
          'Open the assignment panel for the relevant Pickup ID.',
          'Select Rider code from the active workforce roster.',
          'Select Driver code (if a vehicle is required for the batch).',
          'Select Helper code (if additional manpower is required).',
          'Select Fleet/Vehicle code if applicable.',
          'Set Branch/Zone information and confirm the assignment.',
          'The assignment timestamp and "Assigned By" user are recorded automatically.',
          'A tracking/cargo event is created: status moves to "Assignment Confirmed".',
          'The assigned task appears immediately in the Rider App.',
        ],
        keyRules: [
          'Assignment must update backend metadata — never confirm assignments offline',
          'Roster rows are valid staff accounts — route counters show zero until real routes exist',
          'All assignment details (rider, driver, helper, vehicle) must be from the active workforce registry',
        ],
        tip: 'Dispatch Center shows zero route/stop counters until real routes are generated from eligible pickups. This is expected behavior at go-live.',
      },
      {
        id: 'pa-2',
        title: 'Rider Pickup Checklist',
        overview: 'The rider must complete all steps at the pickup point before departing. Missing any step can cause downstream tracking and financial issues.',
        steps: [
          'Open the assigned pickup job in the Rider App.',
          'Verify the tracking number and parcel count against the Pickup ID (e.g. P0525-BBK-015 = 15 parcels).',
          'Confirm parcel handover with the merchant.',
          'Capture pickup proof using the approved method: photo, signature, or QR scan.',
          'Submit the pickup completion action in the app.',
          'System validates parcel count against the Pickup ID count automatically.',
          'Status updates to "Picked Up" and records are prepared for warehouse intake.',
          'The linkage between Pickup ID → Deliver ID → Invoice No → Waybill No is maintained.',
        ],
        keyRules: [
          'Parcel count at pickup must match the Pickup ID count — mismatches trigger an exception',
          'Proof of pickup must be captured BEFORE submitting pickup completion',
          'Riders cannot start a delivery without completing the pickup confirmation',
        ],
        tip: 'Count the parcels twice before confirming. A parcel count mismatch at pickup stage creates an exception that delays the entire batch.',
      },
    ],
    quiz: [
      {
        question: 'What information does the Supervisor need to record during assignment?',
        options: ['Only the rider code', 'Rider code, driver code (if required), helper code, vehicle code, branch/zone', 'COD amount and delivery fee', 'Merchant ID and customer phone number'],
        correct: 1,
        explanation: 'A complete assignment includes: Rider code, Driver code (if needed), Helper code (if needed), Fleet/Vehicle code, and Branch/Zone. The assignment timestamp and user are recorded automatically.',
      },
      {
        question: 'What happens in the system when a rider confirms pickup completion?',
        options: [
          'Nothing — the warehouse team must manually update the status',
          'The system validates parcel count, records pickup proof, updates status to Picked Up, and prepares records for warehouse intake',
          'The invoice is automatically generated and sent to the merchant',
          'The delivery is scheduled automatically for the next day',
        ],
        correct: 1,
        explanation: 'On pickup completion: the system validates parcel count vs Pickup ID count, records proof, confirms merchant handover, updates status to Picked Up, and prepares records for warehouse intake.',
      },
      {
        question: 'If a Dispatch Center shows zero routes and zero stops, what does this indicate?',
        options: ['A system error — contact IT immediately', 'Expected behavior: no real routes have been generated yet', 'All routes have been completed', 'The workforce roster is empty'],
        correct: 1,
        explanation: 'Dispatch route counters show zero until real routes are generated. The roster rows (staff accounts) are valid — but Active Routes, Total Stops, and Completed Routes are zero until real route generation occurs.',
      },
    ],
  },

  {
    id: 'warehouse',
    number: 6,
    title: 'Warehouse Operations',
    subtitle: 'Intake, scanning, bagging, and dispatch',
    icon: '🏭',
    color: '#f97316',
    roles: ['Warehouse Staff', 'Operation Manager', 'Branch Office'],
    overview: 'Every parcel that enters Britium\'s facility undergoes a formal intake process. Warehouse Operations confirms physical custody, updates operational status, sorts parcels, bags them for dispatch, and releases them to the rider for delivery.',
    lessons: [
      {
        id: 'wh-1',
        title: 'Parcel Intake Process',
        overview: 'Intake is the formal handover point where the network takes physical custody of parcels from riders arriving from pickup.',
        steps: [
          'Rider arrives at the warehouse with the pickup batch.',
          'Warehouse staff opens the Intake console and scans the Waybill No or Pickup ID.',
          'The Intake API verifies the shipment exists and is in "Draft" status.',
          'Upon acceptance, status updates to "Received" — formal physical custody confirmed.',
          'Inbound Scan is performed: status advances to "In Warehouse".',
          'Sorting Scan is performed during sorting: status advances to "Sorting".',
          'The warehouse dashboard shows real-time counts: Inbound, Sorting, Dispatch, Exception.',
          'Any parcel count mismatch (expected vs. received) triggers an exception report immediately.',
        ],
        keyRules: [
          'Only parcels in "Draft" status can be accepted at intake — do not accept parcels with no system record',
          'Every scan is logged into the warehouse_scans table with operator ID and timestamp',
          'Warehouse Live Statistics are calculated in real-time from the shipments table',
        ],
        tip: 'If a waybill does not scan correctly, check for WAYBILL_MISMATCH exception — this requires supervisor approval before proceeding.',
      },
      {
        id: 'wh-2',
        title: 'Bagging & Dispatch Gate',
        overview: 'Bagging is the critical gate that ensures no parcel enters dispatch without confirmed warehouse handling. It is an enforcement mechanism, not just a scanning step.',
        steps: [
          'Only parcels with status "In Warehouse" or "Sorting" are eligible for bagging.',
          'Scan the Bag Code to open a dispatch bag in the system.',
          'On Bag Code scan, the system auto-fills: bag destination, assigned route, vehicle/fleet, and parcel count.',
          'Scan each parcel\'s Waybill No to add it to the bag.',
          'Status updates to "Bagged" — the parcel is now linked to a bag_id.',
          'Dispatch confirmation releases the bag: status advances to "Dispatched".',
          'No parcel can be dispatched without confirmed warehouse receipt and sorting.',
          'The dispatch gate enforces: Received → In Warehouse → Sorting → Bagged → Dispatched.',
        ],
        keyRules: [
          'GATE RULE: A parcel cannot be bagged unless its status is In Warehouse or Sorting',
          'A parcel cannot be dispatched without a bag_id — solo dispatch is not permitted',
          'On Waybill No scan, the system auto-fills: merchant code/name, expected count, route/zone, payment type, COD amount',
        ],
        tip: 'The bagging gate is the most important quality control in Warehouse. It ensures that every dispatched parcel has been physically received, scanned, and confirmed.',
      },
    ],
    quiz: [
      {
        question: 'What status must a shipment be in before warehouse intake can accept it?',
        options: ['Picked Up', 'In Transit', 'Draft', 'Pending Pickup'],
        correct: 2,
        explanation: 'The Intake API verifies that the shipment exists and is in "Draft" status. Only Draft-status shipments can be accepted at intake. Upon acceptance, status changes to "Received".',
      },
      {
        question: 'Which statuses allow a parcel to be added to a dispatch bag?',
        options: ['Draft or Received', 'In Warehouse or Sorting', 'Dispatched or Bagged', 'Picked Up or Failed Attempt'],
        correct: 1,
        explanation: 'Only parcels with "In Warehouse" or "Sorting" status are eligible for bagging. This gate enforces the sequence: Received → In Warehouse → Sorting → Bagged → Dispatched.',
      },
      {
        question: 'What happens when a warehouse staff scans a Bag Code?',
        options: [
          'Nothing — they must manually enter bag details',
          'The system auto-fills: bag destination, assigned route, vehicle/fleet assignment, and parcel count already inside',
          'All parcels are automatically assigned to the bag without further scanning',
          'An invoice is generated for the bag',
        ],
        correct: 1,
        explanation: 'Scanning a Bag Code triggers auto-fill: bag destination, assigned route, vehicle/fleet assignment, dispatch batch, and parcel count already inside the bag.',
      },
    ],
  },

  {
    id: 'way-management',
    number: 7,
    title: 'Way Management',
    subtitle: 'Shipment Control Tower — tracking, exceptions, route control',
    icon: '🗺',
    color: '#06b6d4',
    roles: ['Operation Manager', 'Customer Service', 'Supervisor', 'Dispatch'],
    overview: 'Way Management is the operational control tower for all shipment movement across the network. It provides real-time status filtering, timeline viewing, POD loading, exception handling, and route correction — making it the single source of truth for exception resolution.',
    lessons: [
      {
        id: 'wm-1',
        title: 'Way Management Overview & Metrics',
        overview: 'The Way Management module normalizes every shipment into a consistent row and provides real-time operational counters.',
        steps: [
          'Open Way Management from the sidebar — available to Operations, CS, and Supervisor.',
          'Each row shows: Tracking number, Customer/Recipient details, Phone, Status, Collectable amount, Rider remark, Location, Created date.',
          'Real-time metric counters at the top: Active Shipments, Delivered Shipments, Failed Attempts, Returns, Total Ways Under Management.',
          'Use Status Filter to quickly isolate: Active, Delivered, Failed, Returned, On Hold, Exception.',
          'Use the search bar to find a specific tracking number, AWB, or recipient name.',
          'Click any row to expand: Timeline view, POD loaded, rider notes, and available action buttons.',
        ],
        keyRules: [
          'Way Management is the single authoritative source for exception resolution and route correction',
          'Failed delivery cases appear here in real-time and trigger CS queue notifications',
          'Do NOT manually update shipment statuses in Way Management without operational justification',
        ],
        tip: 'Use Way Management as your operational dashboard during shift. The real-time counters tell you the health of the day\'s operations at a glance.',
      },
      {
        id: 'wm-2',
        title: 'Exception Handling & Route Correction',
        overview: 'When a shipment encounters a problem, Way Management is where you take corrective action.',
        steps: [
          'Identify the exception from the Status Filter (Failed Attempt, On Hold, Exception, Return).',
          'Click the shipment row to expand the detail view.',
          'Review the Timeline: every status change, scan, delivery attempt, and proof is recorded here.',
          'Available actions from Way Management:',
          '  → Status Update: move to a new status (requires authorization)',
          '  → Route Reassignment: change the assigned rider or route',
          '  → Shipment Hold: place shipment on hold pending resolution',
          '  → Return Initiation: start the Return to Origin process',
          '  → Support Escalation: create a CS ticket linked to this shipment',
          'For all actions: document the reason in the notes field — this is required for audit.',
        ],
        keyRules: [
          'Every action in Way Management is logged with user ID, timestamp, and reason',
          'Route reassignment must be reflected in the Rider App — confirm the rider has received the update',
          'Holds require an approved reason from the supported hold code list',
        ],
        tip: 'The shipment Timeline is your audit trail. Before taking any action, review the full timeline to understand what has already happened.',
      },
    ],
    quiz: [
      {
        question: 'Which team has the authority to initiate a Return to Origin (RTO) from Way Management?',
        options: ['Only the Rider via the Rider App', 'Customer Service, Operations, or Supervisor with the appropriate role permission', 'Only the Finance team after invoice closure', 'Only the Branch Office for their branch parcels'],
        correct: 1,
        explanation: 'Return initiation from Way Management is available to Operations, CS, and Supervisors with appropriate permissions. The action creates a formal RTO record in the system.',
      },
      {
        question: 'What does the Way Management Timeline show?',
        options: [
          'Only the current status',
          'Every status change, scan, delivery attempt, proof capture, and action taken for the shipment',
          'Only delivery failures',
          'Only financial transactions related to the shipment',
        ],
        correct: 1,
        explanation: 'The Timeline in Way Management records every status change, warehouse scan, delivery attempt, POD capture, CS action, and exception event — it is the full audit trail for each shipment.',
      },
      {
        question: 'Where does the real-time count of "Failed Attempts" come from in Way Management?',
        options: ['Manual entry by CS staff', 'Calculated in real-time from the shipments table based on DELIVERY_ATTEMPTED status records', 'Reported by riders at end of shift', 'Imported from an Excel file each morning'],
        correct: 1,
        explanation: 'Way Management reads non-draft shipments and calculates real-time counts — including Failed Attempts — directly from the shipments table. This makes it the authoritative, live view of operations.',
      },
    ],
  },

  {
    id: 'rider-delivery',
    number: 8,
    title: 'Rider Delivery Process',
    subtitle: 'Field execution, POD capture, COD collection, failure handling',
    icon: '🚀',
    color: '#84cc16',
    roles: ['Rider', 'Driver', 'Helper'],
    overview: 'The Rider App handles all field execution. Riders are responsible for accepting delivery jobs, executing routes, capturing proof of delivery, collecting COD, and submitting handovers at shift end. Every action in the app creates a real-time cargo event.',
    lessons: [
      {
        id: 'rd-1',
        title: 'Delivery Job Acceptance & Execution',
        overview: 'When a Supervisor assigns a job, it appears in the rider\'s queue. The rider must verify all details before departing for delivery.',
        steps: [
          'Open the Rider App and view the Assigned Jobs list.',
          'Each job shows: Tracking number, Merchant, Receiver name & phone, Delivery address, Township, Parcel count, COD amount, Service type, ETA, Distance.',
          'Accept the job to move it to Active Deliveries.',
          'Use the one-tap shortcuts: Receiver contact (call), Merchant contact, Map navigation, Support escalation.',
          'On arrival at the delivery address, verify receiver identity before handover.',
          'Confirm the COD amount displayed in the app against the physical parcel label.',
          'Collect COD from the receiver before marking delivery complete.',
          'Confirm the COD Collected field in the app.',
        ],
        keyRules: [
          'COD must be collected BEFORE submitting delivery completion — not after',
          'Verify receiver identity before handover — failed ID verification is an exception',
          'Riders must not deliver to an address different from what is shown in the app without CS authorization',
        ],
        tip: 'Always call the receiver before arriving at the delivery address. This increases first-attempt delivery success rates significantly.',
      },
      {
        id: 'rd-2',
        title: 'Proof of Delivery (POD) Capture',
        overview: 'POD is the official confirmation that a delivery was completed. Without valid POD, the shipment is not considered financially closed.',
        steps: [
          'Open the POD capture screen after reaching the delivery address.',
          'Select the Receiver Verification Method: Signature, Photo with receiver, QR scan, or OTP.',
          'Capture the required proof — the app will not allow submission without it.',
          'Enter COD Collected Amount (must match the parcel record).',
          'Add a delivery note if needed.',
          'Submit via "Complete Delivery" — status changes to "Delivered".',
          'The COD record automatically moves to "Pending Handover" status.',
          'For failed delivery: select the failure reason: Unreachable / Refused / Address Issue / Other.',
          'Failed delivery sets status to "Failed Attempt" — visible immediately in Way Management and CS.',
        ],
        keyRules: [
          'POD is required for every delivery — there is no bypass',
          'COD Collected amount must match the COD amount in the shipment record',
          'GPS coordinates are required for all rider pickup/delivery failure exceptions',
        ],
        tip: 'If the receiver refuses to sign or cooperate for POD, take a time-stamped photo of the delivery address with the parcel visible and submit it as proof. Then report via the failure flow.',
      },
      {
        id: 'rd-3',
        title: 'COD Handover & Shift Close',
        overview: 'At the end of shift, riders must hand over all collected COD. No rider may retain COD without a corresponding handover record. Shift cannot be closed with unresolved COD.',
        steps: [
          'At shift end, open the COD module in the Rider App.',
          'Review the COD list: Pending Collection, Collected, Awaiting Handover.',
          'Count all cash collected and match against the system total for each tracking number.',
          'Proceed to the operations desk or cashier and submit the COD handover.',
          'Operations team counts the physical cash or verifies digital payment against the system amount.',
          'A Rider Handover Settlement Reference is issued upon successful verification.',
          '  Format: RH{MMDD}-{RIDER_ID}-{MERCHANT_CODE}-{SEQUENCE}',
          '  Example: RH0525-RD009-BBK-001',
          'Retain the settlement reference for your personal records.',
          'The system enforces: a rider cannot close their shift until all COD records have a final handover result.',
        ],
        keyRules: [
          'Handover Rules (in order): Count cash → Match against jobs → Retain settlement ref → Submit to cashier → Finance confirms',
          'COD and Rider Earnings are TWO SEPARATE LEDGERS — never combine or confuse them',
          'Shortage, Excess, or Disputed statuses require supervisory review before shift close',
        ],
        tip: 'COD is money collected on behalf of merchants — not your earnings. Your earnings are calculated separately based on trips completed, not COD values collected.',
      },
    ],
    quiz: [
      {
        question: 'When must COD be collected from the receiver?',
        options: ['After marking delivery complete', 'Before submitting the delivery completion action', 'At the end of shift when handing over to the cashier', 'After the merchant confirms receipt'],
        correct: 1,
        explanation: 'COD must be collected BEFORE marking the delivery complete. The app requires you to confirm the COD Collected amount as part of the delivery completion flow.',
      },
      {
        question: 'What format is the Rider Handover Settlement Reference?',
        options: ['RH{YYYYMMDD}-{RIDER_ID}', 'RH{MMDD}-{RIDER_ID}-{MERCHANT_CODE}-{SEQUENCE}', 'SET{MMDD}-{RIDER_ID}-{SEQUENCE}', 'P{MMDD}-{RIDER_ID}-{SEQUENCE}'],
        correct: 1,
        explanation: 'The Rider Handover Settlement Reference format is: RH{MMDD}-{RIDER_ID}-{MERCHANT_CODE}-{SEQUENCE}. Example: RH0525-RD009-BBK-001.',
      },
      {
        question: 'A rider collects COD from a delivery. What COD status does this create?',
        options: ['Handed Over', 'Awaiting Handover', 'Collected', 'Locked'],
        correct: 2,
        explanation: 'After the rider collects COD from the receiver, the status moves to "Collected". After submitting to the cashier, it becomes "Submitted" → "Under Verification" → "Handed Over" after cashier confirmation.',
      },
    ],
  },

  {
    id: 'cod-finance',
    number: 9,
    title: 'COD & Finance Settlement',
    subtitle: 'Payment classification, cash verification, merchant settlement',
    icon: '💰',
    color: '#ec4899',
    roles: ['Finance', 'Operation Manager', 'CS'],
    overview: 'Finance is not an after-the-fact process — it is embedded in the shipment lifecycle from the point of creation. Every shipment is simultaneously an operational record and a financial record.',
    lessons: [
      {
        id: 'cf-1',
        title: 'Payment Method Classification',
        overview: 'Every shipment must be classified by payment method at booking. This determines who owes money, who collects it, and who receives settlement.',
        steps: [
          'COD (Cash on Delivery): Receiver pays the COD amount at delivery. Rider collects cash. Britium deducts agreed fees before settling net amount to merchant.',
          'Prepaid: Sender/merchant paid delivery fee before dispatch. Rider should NOT collect from receiver. Finance confirms service completion and matches invoice.',
          'Account Billing: Charges accumulated to merchant account. Finance issues invoice at end of billing cycle (daily/weekly/monthly).',
          'Recipient-Pay / Collect: Receiver pays delivery fee, COD, or both at delivery. Rider must collect the total collectable amount.',
          'Return / Failed: COD must NOT be recognized as collected. Return fee, reattempt fee, or penalty applies per merchant agreement. Finance holds settlement until resolved.',
          'Review the payment method field for every shipment before COD settlement actions.',
        ],
        keyRules: [
          'Payment method determines the entire financial flow — confirm it is correct at booking',
          'Failed deliveries: COD cannot be recognized as collected unless actual payment occurred',
          'Duplicate or incorrect payments trigger a refund process through the exception queue',
        ],
        tip: 'If a digital payment was made before a delivery failed, Finance must hold settlement until CS resolves the case. Do not auto-settle.',
      },
      {
        id: 'cf-2',
        title: 'Merchant Settlement Process',
        overview: 'After all COD is collected, verified, and transferred to Finance, the system calculates the net payable to each merchant.',
        steps: [
          'Merchant Net Payable = COD Collected − Delivery Fee − COD Fee − Extra Weight Fee − Return Fee − Discount − Penalty',
          'Example: COD 42,000 Ks − Service Fee 4,200 Ks − Deduction 600 Ks = Net Payable 37,200 Ks',
          'Finance creates a Finance Settlement Batch: SET{MMDD}-{MERCHANT_CODE}-{SEQUENCE}',
          '  Example: SET0525-BBK-001',
          'Merchant settlement statuses: Pending → Ready for Settlement → Transferred → Reconciled → Closed.',
          '"On Hold" occurs when there is an exception, return, dispute, or missing proof.',
          '"Disputed" means the merchant has challenged a charge or reports a missing parcel.',
          'Finance must receive from each operations batch: rider handover ref, cashier verification, COD by tracking number, POD records, exceptions, bank/transfer references.',
        ],
        keyRules: [
          'Finance settlement batch reference: SET{MMDD}-{MERCHANT_CODE}-{SEQUENCE}',
          'Merchant settlement cannot proceed if the waybill has an unresolved warehouse exception',
          'Rider earnings and COD cash are SEPARATE LEDGERS — never combined in reporting',
        ],
        tip: 'The Settlement Cycle: Rider Handover → Operations Verification → Finance Batch → Merchant Transfer → Merchant Confirmation → Close.',
      },
    ],
    quiz: [
      {
        question: 'What is the formula for Merchant Net Payable?',
        options: [
          'COD Collected + Delivery Fee + COD Fee',
          'COD Collected − Delivery Fee − COD Fee − Extra Weight Fee − Return Fee − Discount − Penalty',
          'COD Collected − Rider Earnings',
          'Total Sales − Operating Costs',
        ],
        correct: 1,
        explanation: 'Merchant Net Payable = COD Collected − Delivery Fee − COD Fee − Extra Weight Fee − Return Fee − Discount Adjustment − Penalty/Other Approved Deductions.',
      },
      {
        question: 'What is the Finance Settlement Batch Reference format?',
        options: ['FIN{MMDD}-{MERCHANT_CODE}-{SEQUENCE}', 'SET{MMDD}-{MERCHANT_CODE}-{SEQUENCE}', 'RH{MMDD}-{RIDER_ID}-{MERCHANT_CODE}-{SEQUENCE}', 'I{MMDD}-{MERCHANT_CODE}-{SEQUENCE}'],
        correct: 1,
        explanation: 'The Finance Settlement Batch Reference format is SET{MMDD}-{MERCHANT_CODE}-{SEQUENCE}. Example: SET0525-BBK-001.',
      },
      {
        question: 'When can a rider\'s earnings be released?',
        options: [
          'Immediately after deliveries are marked complete',
          'Only after COD handover is verified, POD validated, all returns accounted for, Supervisor approved shift close, and Finance locked the record',
          'After the merchant confirms the settlement',
          'At the end of each calendar month regardless of other conditions',
        ],
        correct: 1,
        explanation: 'Rider earnings must not be released until: COD handover is completed and verified, shortage/excess discrepancies resolved, delivery proof validated, returned parcels accounted for, Supervisor approved shift close, and Finance locked the rider settlement record.',
      },
    ],
  },

  {
    id: 'waybill-invoice',
    number: 10,
    title: 'Waybill, Invoice & Reporting',
    subtitle: 'Document generation, approval workflows, reporting metrics',
    icon: '📊',
    color: '#d4af37',
    roles: ['Finance', 'Operation Manager', 'Supervisor', 'Admin'],
    overview: 'The Waybill is both the operational and financial proof of a parcel\'s existence in the network. The Invoice closes the financial cycle between Britium and its merchants. Reporting consolidates all operational and financial metrics for management oversight.',
    lessons: [
      {
        id: 'wi-1',
        title: 'Waybill Lifecycle',
        overview: 'The waybill tracks a parcel from label generation through final financial closure. It must satisfy both operational and financial conditions before it can be closed.',
        steps: [
          'Waybill is generated automatically after successful pickup/delivery validation.',
          'Format: W{MMDD}-{MERCHANT_CODE_3}-{SEQUENCE}. Example: W0525-BBK-015.',
          'Waybill lifecycle stages: Printed → Picked Up → Received → In Warehouse → Sorting → Bagged → Dispatched → Out for Delivery → Delivered → Finance Pending → Closed.',
          'Failed Attempt and Returned are also valid states.',
          'Waybill close conditions (ALL must be met):',
          '  1. Shipment delivered, returned, or cancelled',
          '  2. POD or failure proof captured and validated',
          '  3. COD status is Settled or Not Applicable',
          '  4. Rider handover verified',
          '  5. Merchant settlement generated or Not Required',
          '  6. Invoice Issued, Paid, or On Hold (as appropriate)',
          '  7. No unresolved warehouse exceptions',
          '  8. Finance has locked the waybill record',
        ],
        keyRules: [
          'Waybill close requires ALL 8 conditions to be satisfied simultaneously',
          'Finance Pending status means operational close complete but financial close not yet processed',
          '"Closed" is the final, locked, archived state — no further edits are allowed',
        ],
        tip: 'If a waybill is stuck in "Finance Pending", check: COD settlement status, invoice status, and whether any warehouse exception remains open.',
      },
      {
        id: 'wi-2',
        title: 'Invoice Approval Workflow',
        overview: 'Every invoice follows a structured 10-step approval sequence before it is formally issued. Skipping steps creates financial and compliance risks.',
        steps: [
          'Step 1: System auto-generates a Draft invoice after the batch reaches Finance-ready status.',
          'Step 2: Operations confirms delivery and return counts.',
          'Step 3: Warehouse confirms no missing parcels in the batch.',
          'Step 4: COD handover is verified and matched.',
          'Step 5: Finance checks service fees, deductions, discounts, and applicable taxes.',
          'Step 6: Invoice status advances from Draft to Under Review.',
          'Step 7: Finance Manager approves the invoice.',
          'Step 8: Invoice is formally issued to the merchant or customer.',
          'Step 9: Payment or payout is scheduled.',
          'Step 10: Invoice is reconciled and locked as Closed.',
          'Invoice number format: I{MMDD}-{MERCHANT_CODE_3}-{SEQUENCE}. Example: I0525-BBK-015.',
        ],
        keyRules: [
          'Invoice statuses: Draft → Under Review → Issued → Partially Paid → Paid → On Hold → Adjusted → Cancelled → Closed',
          'Finance Manager approval (Step 7) is mandatory — no invoice can be issued without it',
          'Invoices on Hold require exception resolution before status can advance',
        ],
        tip: 'The invoice number uses the same format as the Pickup ID and Waybill. If you have one ID, you can derive the others for the same batch.',
      },
      {
        id: 'wi-3',
        title: 'Reporting Metrics Overview',
        overview: 'The Reporting module consolidates all operational and financial metrics. Understanding these metrics enables supervisors to monitor SLA compliance and financial health.',
        steps: [
          'Operational metrics to monitor daily:',
          '  • Pickup requests created | Pickup parcels by merchant/date',
          '  • Deliver IDs generated | Delivered parcels | Failed attempts',
          '  • Returns | Warehouse received count | Bagged count',
          '  • Exception count | Rider productivity | SLA performance',
          'Financial metrics to monitor daily:',
          '  • COD collected | COD handed over | Pending COD',
          '  • Invoice amount | Waybill count | Pending invoices | Overdue invoices',
          '  • Rider deduction total | Branch cash balance | COD dispute count',
          'Reconciliation performed at 5 levels:',
          '  1. Rider: Delivered COD = Collected = Handed Over = Operations Verified',
          '  2. Operation: Submitted = Cashier Counted = Bank/Digital Deposit',
          '  3. Finance: Operations Transfer = System COD = Merchant Payable',
          '  4. Merchant: Britium Statement = Merchant Records',
          '  5. Invoice: Issued = Paid = Reconciled',
        ],
        keyRules: [
          'Any reconciliation mismatch at any level creates a formal Finance Exception',
          'COD Collected Today ≠ Merchant Payout Today — deductions are applied before settlement',
          'Overdue invoices must be escalated to Finance Manager within 24 hours of due date',
        ],
        tip: 'The 5-level reconciliation framework is your daily financial health check. A clean reconciliation means every parcel has been tracked, every COD has been collected and handed over, and every merchant has been paid correctly.',
      },
    ],
    quiz: [
      {
        question: 'How many conditions must be satisfied before a waybill can be closed?',
        options: ['3', '5', '8', '10'],
        correct: 2,
        explanation: 'All 8 conditions must be met: (1) shipment delivered/returned/cancelled, (2) POD/failure proof captured, (3) COD settled or N/A, (4) rider handover verified, (5) merchant settlement generated, (6) invoice Issued/Paid/On Hold, (7) no warehouse exceptions, (8) Finance locked.',
      },
      {
        question: 'At what step does a Finance Manager approve an invoice?',
        options: ['Step 3', 'Step 5', 'Step 7', 'Step 10'],
        correct: 2,
        explanation: 'Step 7 in the 10-step invoice approval workflow is Finance Manager approval. Before this, Operations confirms (Step 2), Warehouse confirms (Step 3), COD is verified (Step 4), Finance checks fees (Step 5), and status advances to Under Review (Step 6).',
      },
      {
        question: 'Which reconciliation level verifies: Rider submitted amount = Cashier-counted amount = Bank/mobile deposit?',
        options: ['Level 1: Rider Reconciliation', 'Level 2: Operation Reconciliation', 'Level 3: Finance Reconciliation', 'Level 4: Merchant Reconciliation'],
        correct: 1,
        explanation: 'Level 2 (Operation Reconciliation) verifies: Rider submitted amount = Cashier-counted amount = Bank or mobile deposit amount. Level 1 verifies rider COD collected vs handed over.',
      },
    ],
  },
];

export const TOTAL_LESSONS = TRAINING_MODULES.reduce((sum, m) => sum + m.lessons.length, 0);
export const TOTAL_QUIZZES = TRAINING_MODULES.length;
