# Britium Express - Complete Operations Manual

**Version**: 1.0  
**Last Updated**: April 10, 2026  
**System URL**: https://cg5nqi8t9h.skywork.website

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Getting Started](#3-getting-started)
4. [Portal Operations Guide](#4-portal-operations-guide)
5. [Daily Operations](#5-daily-operations)
6. [Troubleshooting](#6-troubleshooting)
7. [API Integration](#7-api-integration)
8. [Database Management](#8-database-management)
9. [Security & Compliance](#9-security--compliance)
10. [Appendix](#10-appendix)

---

## 1. System Overview

### 1.1 What is Britium Express?

Britium Express is a comprehensive enterprise delivery management platform designed for Myanmar's logistics industry. The system manages the complete delivery lifecycle from shipment creation to final delivery, including:

- **Shipment Management**: Create, track, and manage deliveries
- **Route Optimization**: Intelligent wayplan management for efficient deliveries
- **Fleet Management**: Track vehicles and drivers in real-time
- **Warehouse Operations**: Manage inbound/outbound inventory
- **Financial Management**: COD collection, invoicing, and reporting
- **Customer Service**: Complaint handling and live support
- **HR Management**: Attendance, leave requests, and employee management
- **Analytics**: Business intelligence and performance metrics

### 1.2 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Portals  │  │   Auth   │  │   API    │  │   UI     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                  Backend (Supabase)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Database │  │   Auth   │  │ Storage  │  │ Functions│   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Key Features

- **Multi-language Support**: English and Myanmar (Burmese)
- **Role-based Access Control**: 15 different user roles
- **Real-time Tracking**: Live location updates for deliveries
- **QR Code Integration**: Scan-based operations
- **Bulk Operations**: CSV upload for mass shipment creation
- **Mobile Responsive**: Works on desktop, tablet, and mobile
- **Offline Capability**: Basic operations work offline
- **Audit Trail**: Complete history of all operations

---

## 2. User Roles & Permissions

### 2.1 Role Hierarchy

```
Super Admin
    ├── Admin
    │   ├── Branch Office
    │   ├── Supervisor
    │   ├── Wayplan Manager
    │   ├── Data Entry
    │   ├── Customer Service
    │   ├── HR Admin
    │   ├── Finance
    │   └── Marketing
    ├── Warehouse Staff
    ├── Driver/Rider
    ├── Merchant
    └── Customer
```

### 2.2 Role Descriptions

#### **Super Admin** (`super-admin`)
- **Access**: Full system access
- **Permissions**: All operations, user management, system configuration
- **Portal**: All portals
- **Use Case**: System administrators, IT team

#### **Admin** (`admin`)
- **Access**: All operational features
- **Permissions**: User management, reporting, configuration (except system settings)
- **Portal**: All portals except system settings
- **Use Case**: Operations managers, senior management

#### **Branch Office** (`branch-office`)
- **Access**: Full operational access for branch
- **Permissions**: All operations except admin functions
- **Portal**: Dashboard, Supervisor, Driver, Warehouse, Customer Service, Create Delivery, QR Code, Analytics, Data Entry, Wayplan, Finance, Settings
- **Use Case**: Branch managers, regional managers

#### **Supervisor** (`supervisor`)
- **Access**: Team management and operations
- **Permissions**: View deliveries, assign tasks, manage team, view reports
- **Portal**: Supervisor Portal, Dashboard, Analytics
- **Use Case**: Team leaders, shift supervisors

#### **Wayplan Manager** (`wayplan`)
- **Access**: Route and manifest management
- **Permissions**: Create manifests, assign drivers, optimize routes
- **Portal**: Wayplan Portal, Dashboard
- **Use Case**: Route planners, dispatch managers

#### **Driver/Rider** (`driver`, `rider`)
- **Access**: Assigned deliveries
- **Permissions**: Update delivery status, collect COD, upload proof
- **Portal**: Driver Portal
- **Use Case**: Delivery drivers, riders

#### **Warehouse Staff** (`warehouse-staff`)
- **Access**: Warehouse operations
- **Permissions**: Scan packages, manage inventory, inbound/outbound
- **Portal**: Warehouse Portal
- **Use Case**: Warehouse workers, inventory staff

#### **Data Entry** (`data-entry`)
- **Access**: Shipment creation
- **Permissions**: Create shipments, bulk upload, data entry
- **Portal**: Data Entry Portal, Create Delivery
- **Use Case**: Data entry operators, booking staff

#### **Customer Service** (`customer-service`)
- **Access**: Customer support
- **Permissions**: Handle complaints, live chat, view shipments
- **Portal**: Customer Service Portal
- **Use Case**: Customer service representatives

#### **HR Admin** (`hr`)
- **Access**: HR management
- **Permissions**: Manage attendance, leave requests, employee records
- **Portal**: HR Portal
- **Use Case**: HR managers, HR staff

#### **Finance** (`finance`)
- **Access**: Financial operations
- **Permissions**: COD management, invoicing, financial reports
- **Portal**: Finance Portal
- **Use Case**: Finance managers, accountants

#### **Marketing** (`marketing`)
- **Access**: Marketing analytics
- **Permissions**: View customer data, analytics, campaigns
- **Portal**: Marketing Portal
- **Use Case**: Marketing team, business analysts

#### **Merchant** (`merchant`)
- **Access**: Own shipments
- **Permissions**: Create shipments, view reports, manage invoices
- **Portal**: Merchant Portal
- **Use Case**: Business customers, e-commerce sellers

#### **Customer** (`customer`)
- **Access**: Own orders
- **Permissions**: Track orders, submit complaints, view history
- **Portal**: Customer Portal
- **Use Case**: End customers, recipients

### 2.3 Permission Matrix

| Feature | Super Admin | Admin | Branch Office | Supervisor | Wayplan | Driver | Warehouse | Data Entry | Customer Service | HR | Finance | Marketing | Merchant | Customer |
|---------|-------------|-------|---------------|------------|---------|--------|-----------|------------|------------------|----|---------|-----------|-----------| ---------|
| View All Shipments | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| Create Shipments | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Update Delivery Status | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Create Manifests | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage Users | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| View Analytics | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| Handle Complaints | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage Attendance | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| COD Management | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Generate Invoices | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |

---

## 3. Getting Started

### 3.1 System Requirements

#### **For Users**
- **Browser**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Internet**: Stable connection (minimum 2 Mbps)
- **Screen**: Minimum 1280x720 resolution
- **Mobile**: iOS 13+ or Android 8+

#### **For Administrators**
- All user requirements plus:
- **Access**: Supabase Dashboard access
- **Tools**: Database client (optional)
- **Knowledge**: Basic SQL (for advanced operations)

### 3.2 Initial Setup

#### **Step 1: Access the System**
1. Open browser and navigate to: https://cg5nqi8t9h.skywork.website
2. You will see the login page

#### **Step 2: First Login**
1. Use the super admin credentials:
   - **Email**: md@britiumexpress.com
   - **Password**: Bv@000899600
2. Click "Sign In"
3. You will be redirected to the Dashboard

#### **Step 3: Change Password (Recommended)**
1. Click on your profile icon (top right)
2. Select "Settings"
3. Go to "Security" tab
4. Click "Change Password"
5. Enter current password and new password
6. Click "Update Password"

#### **Step 4: Configure System Settings**
1. Go to Settings portal
2. Configure:
   - Company information
   - Warehouse locations
   - Service types
   - Pricing rules
   - Email templates

### 3.3 Creating Users

#### **Method 1: Manual Creation (Recommended for few users)**

1. **Navigate to Settings**
   - Click "Settings" in the sidebar
   - Go to "User Management" tab

2. **Add New User**
   - Click "Add User" button
   - Fill in the form:
     - Full Name
     - Email Address
     - Phone Number
     - Role (select from dropdown)
     - Branch (if applicable)
     - Status (Active/Inactive)
   - Click "Create User"

3. **User Receives Email**
   - User receives invitation email
   - Click link to set password
   - Login with credentials

#### **Method 2: Bulk Import (For many users)**

1. **Download Template**
   - Go to Settings → User Management
   - Click "Bulk Import"
   - Download CSV template

2. **Fill Template**
   ```csv
   full_name,email,phone,role,branch_id,status
   John Doe,john@example.com,+959123456789,driver,branch-001,active
   Jane Smith,jane@example.com,+959987654321,warehouse-staff,branch-001,active
   ```

3. **Upload File**
   - Click "Upload CSV"
   - Select filled template
   - Review preview
   - Click "Import Users"

4. **Verify Import**
   - Check import results
   - Users receive invitation emails

### 3.4 Language Selection

The system supports English and Myanmar (Burmese).

**To Change Language:**
1. Look for the language toggle in the top navigation bar
2. Click the language icon (🌐)
3. Select your preferred language:
   - **EN** - English
   - **MM** - Myanmar (မြန်မာ)
4. The interface will immediately switch to the selected language

**Note**: Language preference is saved per user and persists across sessions.

---

## 4. Portal Operations Guide

### 4.1 Dashboard Portal

**Access**: All authenticated users  
**URL**: `/#/`

#### **Overview**
The Dashboard is the main landing page showing key metrics and quick actions.

#### **Features**

**1. Key Metrics Cards**
- Total Deliveries (today/this week/this month)
- Success Rate
- Pending Deliveries
- Active Drivers
- Revenue (today/this week/this month)

**2. Quick Actions**
- Create New Shipment
- View Pending Queue
- Generate Report
- Scan QR Code

**3. Recent Activity**
- Latest shipments
- Recent deliveries
- System notifications

**4. Charts & Graphs**
- Delivery trends (line chart)
- Status distribution (pie chart)
- Revenue over time (bar chart)

#### **Operations**

**Viewing Metrics**
1. Metrics update automatically every 30 seconds
2. Click on any metric card to see detailed breakdown
3. Use date range selector to view historical data

**Quick Actions**
1. Click any quick action button
2. You'll be redirected to the relevant portal
3. Or a modal will open for quick operations

---

### 4.2 Supervisor Portal

**Access**: Supervisor, Admin, Super Admin, Branch Office  
**URL**: `/#/supervisor`

#### **Overview**
Manage team operations, monitor deliveries, and handle exceptions.

#### **Features**

**1. Overview Tab**
- Team performance metrics
- Delivery trends chart
- Status distribution
- Leadership performance (driver stats)
- Urgent tasks list

**2. Queue Management Tab**
- Overnight delivery queue
- Pending assignments
- Bulk actions (assign, reassign, cancel)
- Filter by status, date, warehouse

**3. Fleet Mobility Tab**
- Real-time driver locations on map
- Active drivers list
- Vehicle status
- Route tracking

**4. Exceptions Tab**
- Failed deliveries
- NDR (Non-Delivery Report) cases
- Retry scheduling
- Exception resolution

#### **Operations**

**Assigning Deliveries**
1. Go to "Queue Management" tab
2. Select deliveries to assign (checkbox)
3. Click "Assign to Driver"
4. Select driver from dropdown
5. Click "Confirm Assignment"
6. Driver receives notification

**Handling Exceptions**
1. Go to "Exceptions" tab
2. Click on failed delivery
3. Review failure reason
4. Choose action:
   - **Retry**: Schedule next attempt
   - **Return**: Mark for return to sender
   - **Contact Customer**: Assign to customer service
   - **Escalate**: Create urgent task
5. Add notes and click "Submit"

**Monitoring Team Performance**
1. Go to "Overview" tab
2. Scroll to "Leadership Performance"
3. View individual driver metrics:
   - Total deliveries
   - Success rate
   - On-time rate
   - Average rating
4. Click on driver card for detailed view

**Creating Tasks**
1. Click "Create Task" button
2. Fill in task details:
   - Title
   - Description
   - Assign to (select employee)
   - Priority (Low/Medium/High/Urgent)
   - Due date
   - Related shipment (optional)
3. Click "Create Task"
4. Assignee receives notification

---

### 4.3 Driver Portal

**Access**: Driver, Rider  
**URL**: `/#/driver`

#### **Overview**
View assigned deliveries, update status, collect COD, and upload proof of delivery.

#### **Features**

**1. Today's Deliveries**
- List of assigned deliveries
- Delivery sequence (optimized route)
- Customer details
- Package information
- Navigation button

**2. Delivery Details**
- Shipment information
- Customer contact
- Package details
- Special instructions
- COD amount (if applicable)

**3. Status Updates**
- Picked up
- In transit
- Out for delivery
- Delivered
- Failed

**4. Proof of Delivery**
- Signature capture
- Photo upload
- OTP verification
- GPS location

**5. COD Collection**
- Amount to collect
- Payment confirmation
- Receipt generation

**6. History**
- Completed deliveries
- Earnings summary
- Performance metrics

#### **Operations**

**Starting Your Day**
1. Login to Driver Portal
2. View today's manifest
3. Check delivery sequence
4. Click "Start Route"
5. Navigate to first delivery

**Updating Delivery Status**
1. Select delivery from list
2. Click "Update Status"
3. Choose new status:
   - **Picked Up**: When you collect from warehouse
   - **In Transit**: When en route
   - **Out for Delivery**: When near customer
   - **Delivered**: When successfully delivered
   - **Failed**: When delivery cannot be completed
4. Add notes (optional)
5. Click "Confirm"

**Completing a Delivery**
1. Arrive at customer location
2. Click "Deliver" button
3. Collect COD (if applicable):
   - Enter amount collected
   - Select payment method
   - Click "Confirm Payment"
4. Capture proof:
   - **Option A - Signature**:
     - Click "Capture Signature"
     - Customer signs on screen
     - Click "Save"
   - **Option B - Photo**:
     - Click "Take Photo"
     - Take photo of package/receipt
     - Click "Use Photo"
   - **Option C - OTP**:
     - Enter OTP from customer
     - Click "Verify"
5. GPS location is captured automatically
6. Click "Complete Delivery"
7. Move to next delivery

**Handling Failed Deliveries**
1. Click "Mark as Failed"
2. Select failure reason:
   - Customer not available
   - Wrong address
   - Customer refused
   - Incomplete address
   - Other (specify)
3. Add detailed notes
4. Take photo of location (optional)
5. Click "Submit"
6. System schedules retry automatically

**Collecting COD**
1. When delivering COD shipment
2. Collect cash from customer
3. Enter amount in app
4. Select payment method (Cash/Card/Transfer)
5. Click "Confirm Collection"
6. Receipt is generated automatically
7. At end of day:
   - Go to "COD Summary"
   - Review total collected
   - Click "Ready for Deposit"
   - Submit to finance team

**Viewing Performance**
1. Go to "History" tab
2. View metrics:
   - Deliveries completed today/week/month
   - Success rate
   - On-time rate
   - Earnings
3. Click on any delivery for details

---

### 4.4 Warehouse Portal

**Access**: Warehouse Staff, Supervisor, Admin, Super Admin, Branch Office  
**URL**: `/#/warehouse`

#### **Overview**
Manage warehouse operations including inbound, outbound, inventory, and QR scanning.

#### **Features**

**1. Main Dashboard**
- Warehouse capacity
- Inbound queue
- Outbound queue
- Inventory levels
- Today's activity

**2. Inbound Operations**
- Receive shipments
- QR code scanning
- Quality check
- Storage assignment

**3. Outbound Operations**
- Pick shipments for delivery
- Load verification
- Manifest preparation
- Dispatch confirmation

**4. Inventory Management**
- Current stock
- Storage locations
- Search shipments
- Stock alerts

**5. QR Code Operations**
- Scan to receive
- Scan to dispatch
- Scan to locate
- Bulk scanning

#### **Operations**

**Receiving Inbound Shipments**
1. Go to "Inbound" tab
2. Click "Receive Shipments"
3. Scan QR code or enter AWB manually
4. System displays shipment details
5. Verify package condition:
   - Good condition
   - Damaged
   - Missing items
6. Take photo if damaged
7. Assign storage location
8. Click "Confirm Receipt"
9. Repeat for all packages

**Processing Outbound Shipments**
1. Go to "Outbound" tab
2. Select manifest to prepare
3. View list of shipments to pick
4. For each shipment:
   - Scan QR code
   - Verify package
   - Mark as picked
5. When all picked:
   - Click "Complete Picking"
   - Verify total count
   - Assign to driver
   - Click "Dispatch"

**QR Code Scanning**
1. Click "Scan QR" button
2. Allow camera access
3. Point camera at QR code
4. System automatically:
   - Identifies shipment
   - Shows current status
   - Displays next action
5. Confirm action
6. Scan next package

**Searching Inventory**
1. Go to "Inventory" tab
2. Use search bar:
   - Enter AWB number
   - Or scan QR code
   - Or search by customer name
3. System shows:
   - Current location
   - Status
   - Days in warehouse
   - Next action
4. Click on shipment for details

**Managing Storage Locations**
1. Go to "Inventory" → "Locations"
2. View warehouse layout
3. See capacity per zone
4. Assign/reassign locations
5. Generate location reports

---

### 4.5 Wayplan Portal

**Access**: Wayplan Manager, Supervisor, Admin, Super Admin, Branch Office  
**URL**: `/#/wayplan`

#### **Overview**
Create and manage delivery manifests, assign drivers, and optimize routes.

#### **Features**

**1. Manifest Management**
- Create new manifests
- View active manifests
- Edit draft manifests
- Cancel manifests

**2. Route Optimization**
- Automatic route calculation
- Manual route adjustment
- Distance and time estimation
- Traffic consideration

**3. Driver Assignment**
- Available drivers list
- Vehicle capacity matching
- Workload balancing
- Assignment history

**4. Vehicle Management**
- Vehicle list
- Capacity information
- Maintenance schedule
- Current assignments

#### **Operations**

**Creating a Manifest**
1. Go to Wayplan Portal
2. Click "Create Manifest"
3. Select date (default: today)
4. Select warehouse/branch
5. Click "Next"

**Adding Shipments to Manifest**
1. View available shipments (pending/assigned)
2. Filter by:
   - Destination area
   - Service type
   - Priority
   - Size/weight
3. Select shipments (checkbox)
4. Or click "Auto-Select" for AI selection
5. Review selected shipments
6. Click "Add to Manifest"

**Assigning Driver and Vehicle**
1. Click "Assign Driver"
2. View available drivers:
   - Name
   - Current location
   - Today's deliveries
   - Vehicle type
   - Capacity remaining
3. Select driver
4. Select vehicle (if multiple)
5. Click "Assign"

**Optimizing Route**
1. After adding shipments
2. Click "Optimize Route"
3. System calculates:
   - Shortest distance
   - Estimated time
   - Delivery sequence
4. Review suggested route on map
5. Adjust manually if needed:
   - Drag to reorder
   - Remove shipments
   - Add waypoints
6. Click "Save Route"

**Finalizing Manifest**
1. Review manifest summary:
   - Total shipments
   - Total distance
   - Estimated duration
   - Driver assigned
   - Vehicle assigned
2. Add special instructions (optional)
3. Click "Finalize Manifest"
4. Manifest is sent to driver
5. Driver receives notification

**Monitoring Active Manifests**
1. Go to "Active Manifests" tab
2. View all in-progress manifests
3. Click on manifest to see:
   - Current location of driver
   - Completed deliveries
   - Remaining deliveries
   - Estimated completion time
4. Track progress in real-time

**Handling Manifest Changes**
1. Select active manifest
2. Click "Modify"
3. Available actions:
   - Add shipments
   - Remove shipments
   - Reassign driver
   - Cancel manifest
4. Make changes
5. Click "Update Manifest"
6. Driver receives updated instructions

---

### 4.6 Data Entry Portal

**Access**: Data Entry, Admin, Super Admin, Branch Office  
**URL**: `/#/data-entry`

#### **Overview**
Create shipments individually or in bulk, manage data entry operations.

#### **Features**

**1. Single Shipment Entry**
- Manual form entry
- Field validation
- AWB generation
- Duplicate detection

**2. Bulk Upload**
- CSV template download
- Bulk import
- Error validation
- Import results

**3. Data Validation**
- Address verification
- Phone number validation
- Duplicate checking
- Required field checking

**4. Templates**
- Saved templates
- Quick entry
- Frequent customers

#### **Operations**

**Creating Single Shipment**
1. Go to Data Entry Portal
2. Click "Create Shipment"
3. Fill in sender information:
   - Name
   - Phone
   - Address
   - City/Township
4. Fill in recipient information:
   - Name
   - Phone
   - Address
   - City/Township
   - Postal code
5. Fill in package details:
   - Weight (kg)
   - Dimensions (L x W x H cm)
   - Declared value
   - Description
6. Select service type:
   - Standard
   - Express
   - Same Day
   - Next Day
7. Select payment method:
   - Prepaid
   - COD (enter amount)
   - Credit
8. Add special instructions (optional)
9. Click "Calculate Shipping Fee"
10. Review and click "Create Shipment"
11. AWB number is generated
12. Print label (optional)

**Bulk Upload Process**
1. Click "Bulk Upload"
2. Download CSV template
3. Open template in Excel/Google Sheets
4. Fill in shipment data:
   ```csv
   sender_name,sender_phone,sender_address,sender_city,recipient_name,recipient_phone,recipient_address,recipient_city,weight,cod_amount,service_type
   John Doe,+959123456789,123 Main St,Yangon,Jane Smith,+959987654321,456 Oak Ave,Mandalay,2.5,50000,standard
   ```
5. Save as CSV
6. Return to portal
7. Click "Upload File"
8. Select your CSV file
9. System validates data:
   - Shows preview
   - Highlights errors
   - Shows warnings
10. Review validation results
11. Fix errors if any
12. Click "Import Shipments"
13. View import results:
    - Successful: X shipments
    - Failed: Y shipments
    - Download error report
14. Fix failed shipments and re-upload

**Using Templates**
1. For frequent customers
2. Click "Templates"
3. Click "Create Template"
4. Fill in common information
5. Save template with name
6. Next time:
   - Click "Use Template"
   - Select template
   - Form is pre-filled
   - Modify as needed
   - Create shipment

**Data Validation Tips**
- **Phone numbers**: Must start with +959 or 09
- **Addresses**: Be specific (street, building, landmark)
- **Weight**: Enter in kg (e.g., 2.5 for 2.5kg)
- **COD amount**: Enter in MMK (e.g., 50000)
- **Service type**: standard, express, same_day, next_day
- **Payment method**: cod, prepaid, credit

---

### 4.7 Customer Service Portal

**Access**: Customer Service, Admin, Super Admin, Branch Office  
**URL**: `/#/customer-service`

#### **Overview**
Handle customer complaints, live chat support, and shipment inquiries.

#### **Features**

**1. Complaint Management**
- Open complaints
- In-progress complaints
- Resolved complaints
- Complaint categories

**2. Live Chat**
- Real-time messaging
- Customer history
- Quick responses
- File attachments

**3. Shipment Lookup**
- Track any shipment
- View full history
- Update customer
- Escalate issues

**4. Knowledge Base**
- FAQs
- Common issues
- Resolution guides
- Contact information

#### **Operations**

**Handling New Complaints**
1. Go to "Complaints" tab
2. View open complaints
3. Click on complaint to open
4. Review details:
   - Ticket number
   - Customer information
   - Related shipment
   - Complaint category
   - Description
   - Attachments
5. Investigate issue:
   - Check shipment status
   - Review delivery history
   - Contact driver if needed
   - Check warehouse records
6. Respond to customer:
   - Click "Add Message"
   - Type response
   - Attach files if needed
   - Click "Send"
7. Update complaint status:
   - In Progress
   - Resolved
   - Escalated
8. If resolved:
   - Add resolution notes
   - Click "Mark as Resolved"
   - Customer receives notification

**Live Chat Support**
1. Go to "Live Chat" tab
2. View active chats
3. Click on chat to open
4. View customer information:
   - Name
   - Recent orders
   - Previous chats
5. Type message and send
6. Use quick responses:
   - Click "Quick Responses"
   - Select template
   - Customize if needed
   - Send
7. Share shipment tracking:
   - Click "Share Tracking"
   - Enter AWB
   - Link is sent to customer
8. End chat:
   - Click "End Chat"
   - Add summary notes
   - Rate interaction

**Tracking Shipments for Customers**
1. Customer provides AWB number
2. Enter in search bar
3. View shipment details:
   - Current status
   - Current location
   - Delivery history
   - Estimated delivery
4. Share information with customer
5. If issue found:
   - Create complaint
   - Escalate to supervisor
   - Update customer

**Escalating Issues**
1. For complex issues
2. Click "Escalate"
3. Select escalation type:
   - Supervisor
   - Manager
   - Technical support
4. Add escalation notes
5. Set priority
6. Click "Submit Escalation"
7. Escalated team receives notification
8. Continue monitoring

**Using Knowledge Base**
1. Go to "Knowledge Base" tab
2. Search for issue
3. View resolution guide
4. Follow steps
5. If not found:
   - Click "Request New Article"
   - Describe issue
   - Submit request

---

### 4.8 HR Portal

**Access**: HR Admin, Admin, Super Admin, Branch Office  
**URL**: `/#/hr`

#### **Overview**
Manage employee attendance, leave requests, and HR operations.

#### **Features**

**1. Attendance Management**
- Daily attendance
- Check-in/check-out
- Attendance reports
- Late arrivals
- Absences

**2. Leave Management**
- Leave requests
- Approval workflow
- Leave balance
- Leave calendar

**3. Employee Management**
- Employee directory
- Employee profiles
- Performance records
- Documents

**4. Reports**
- Attendance reports
- Leave reports
- Performance reports
- Payroll data

#### **Operations**

**Recording Attendance**
1. Go to "Attendance" tab
2. Select date (default: today)
3. View employee list
4. For each employee:
   - Mark as Present/Absent/Leave
   - Record check-in time
   - Record check-out time
   - Add notes if needed
5. Click "Save Attendance"

**Approving Leave Requests**
1. Go to "Leave Requests" tab
2. View pending requests
3. Click on request to review:
   - Employee name
   - Leave type
   - Start date
   - End date
   - Days count
   - Reason
   - Leave balance
4. Check leave balance
5. Decide:
   - **Approve**: Click "Approve"
   - **Reject**: Click "Reject", add reason
6. Employee receives notification

**Managing Employee Records**
1. Go to "Employees" tab
2. Click on employee
3. View/edit information:
   - Personal details
   - Contact information
   - Employment details
   - Documents
   - Performance history
4. Update as needed
5. Click "Save Changes"

**Generating Reports**
1. Go to "Reports" tab
2. Select report type:
   - Attendance Summary
   - Leave Summary
   - Late Arrivals
   - Absences
3. Select date range
4. Select employees (or all)
5. Click "Generate Report"
6. View report
7. Export as PDF/Excel

---

### 4.9 Finance Portal

**Access**: Finance, Admin, Super Admin, Branch Office  
**URL**: `/#/finance`

#### **Overview**
Manage COD collections, generate invoices, and financial reporting.

#### **Features**

**1. COD Management**
- Collections tracking
- Deposit verification
- Reconciliation
- Outstanding amounts

**2. Invoice Management**
- Generate invoices
- Send invoices
- Payment tracking
- Invoice history

**3. Financial Reports**
- Revenue reports
- COD reports
- Merchant billing
- Payment reconciliation

**4. Transactions**
- Transaction history
- Payment verification
- Refunds
- Adjustments

#### **Operations**

**Managing COD Collections**
1. Go to "COD Collections" tab
2. View collections by status:
   - Collected (with drivers)
   - Deposited (submitted)
   - Verified (confirmed)
3. For collected amounts:
   - Click on driver
   - View collection details
   - Verify amount
   - Click "Mark as Deposited"
   - Enter deposit reference
   - Click "Confirm"
4. For deposited amounts:
   - Verify bank deposit
   - Match amounts
   - Click "Verify Deposit"
   - System updates status

**Generating Invoices**
1. Go to "Invoices" tab
2. Click "Generate Invoice"
3. Select merchant
4. Select billing period
5. System calculates:
   - Total shipments
   - Shipping fees
   - COD fees
   - Other charges
   - Discounts
   - Tax
   - Total amount
6. Review line items
7. Add notes (optional)
8. Click "Generate Invoice"
9. Invoice is created
10. Send to merchant:
    - Click "Send Invoice"
    - Email is sent automatically

**Tracking Payments**
1. Go to "Invoices" tab
2. Filter by status:
   - Sent (unpaid)
   - Paid
   - Overdue
3. For unpaid invoices:
   - Click on invoice
   - View details
   - If payment received:
     - Click "Mark as Paid"
     - Enter payment reference
     - Enter payment date
     - Click "Confirm"
4. For overdue invoices:
   - Click "Send Reminder"
   - Or contact merchant

**Financial Reporting**
1. Go to "Reports" tab
2. Select report type:
   - Revenue Report
   - COD Report
   - Merchant Billing
   - Payment Reconciliation
3. Select date range
4. Select filters (merchant, branch, etc.)
5. Click "Generate Report"
6. View report with charts
7. Export as PDF/Excel

**Reconciliation Process**
1. Go to "Reconciliation" tab
2. Select date range
3. System shows:
   - Expected COD collections
   - Actual deposits
   - Differences
4. Investigate discrepancies:
   - Click on difference
   - View related deliveries
   - Check driver submissions
   - Verify bank deposits
5. Resolve differences:
   - Adjust if needed
   - Add notes
   - Click "Reconcile"

---

### 4.10 Marketing Portal

**Access**: Marketing, Admin, Super Admin  
**URL**: `/#/marketing`

#### **Overview**
View customer analytics, manage campaigns, and track marketing metrics.

#### **Features**

**1. Customer Analytics**
- Customer segments
- Order patterns
- Customer lifetime value
- Retention metrics

**2. Campaign Management**
- Active campaigns
- Campaign performance
- ROI tracking
- A/B testing

**3. Reports**
- Marketing reports
- Customer reports
- Performance metrics
- Trend analysis

**4. Customer Database**
- Customer list
- Segmentation
- Export data
- Communication history

#### **Operations**

**Viewing Customer Analytics**
1. Go to Marketing Portal
2. View dashboard with:
   - Total customers
   - Active customers
   - New customers (this month)
   - Customer retention rate
3. View charts:
   - Customer growth
   - Order frequency
   - Average order value
4. Click on any metric for details

**Segmenting Customers**
1. Go to "Customers" tab
2. Click "Create Segment"
3. Define criteria:
   - Order frequency (e.g., >10 orders)
   - Order value (e.g., >100,000 MMK)
   - Last order date (e.g., within 30 days)
   - Location (e.g., Yangon)
4. Click "Create Segment"
5. View segment members
6. Export for campaigns

**Analyzing Trends**
1. Go to "Analytics" tab
2. Select analysis type:
   - Order trends
   - Revenue trends
   - Customer behavior
3. Select date range
4. View visualizations
5. Export data

---

### 4.11 Merchant Portal

**Access**: Merchant  
**URL**: `/#/merchant`

#### **Overview**
Merchants can create shipments, track orders, and view reports.

#### **Features**

**1. Create Shipments**
- Single shipment
- Bulk upload
- Saved templates
- Quick booking

**2. Track Shipments**
- All shipments
- Filter by status
- Search by AWB
- Delivery history

**3. Reports**
- Shipment reports
- Invoice reports
- Performance metrics
- Download reports

**4. Account Management**
- Profile settings
- Billing information
- API credentials
- Support tickets

#### **Operations**

**Creating Shipments**
(Same as Data Entry Portal - see section 4.6)

**Tracking Shipments**
1. Go to "Shipments" tab
2. View all your shipments
3. Filter by:
   - Status
   - Date range
   - Service type
4. Click on shipment to view:
   - Current status
   - Delivery history
   - Proof of delivery
   - Customer feedback
5. Download POD if needed

**Viewing Invoices**
1. Go to "Invoices" tab
2. View all invoices
3. Filter by:
   - Status (Paid/Unpaid)
   - Date range
4. Click on invoice to view details
5. Download invoice PDF
6. Make payment (if unpaid)

**Managing API Integration**
1. Go to "Settings" → "API"
2. View API credentials
3. Generate new API key
4. View API documentation
5. Test API endpoints

---

### 4.12 Customer Portal

**Access**: Customer  
**URL**: `/#/customer`

#### **Overview**
Customers can track their orders and submit support requests.

#### **Features**

**1. Track Orders**
- Active orders
- Order history
- Real-time tracking
- Delivery notifications

**2. Support**
- Submit complaints
- Live chat
- FAQ
- Contact information

**3. Profile**
- Personal information
- Saved addresses
- Notification preferences

#### **Operations**

**Tracking Orders**
1. Login to Customer Portal
2. View "My Orders"
3. See active deliveries
4. Click on order to view:
   - Current status
   - Estimated delivery
   - Driver information
   - Tracking map
5. Receive SMS/email updates

**Submitting Complaints**
1. Go to "Support" tab
2. Click "Submit Complaint"
3. Select order (if related)
4. Select category:
   - Delivery delay
   - Damaged package
   - Lost package
   - Wrong address
   - Poor service
   - Other
5. Describe issue
6. Upload photos (optional)
7. Click "Submit"
8. Receive ticket number
9. Track complaint status

**Live Chat Support**
1. Click "Live Chat" button
2. Chat window opens
3. Type your question
4. Customer service responds
5. Receive tracking links
6. Save chat history

---

### 4.13 Analytics Portal

**Access**: Admin, Super Admin, Branch Office, Supervisor, Finance, Marketing  
**URL**: `/#/analytics`

#### **Overview**
Business intelligence dashboard with comprehensive reports and metrics.

#### **Features**

**1. Overview Dashboard**
- Key performance indicators
- Revenue metrics
- Operational metrics
- Trend charts

**2. Revenue Analytics**
- Revenue by period
- Revenue by service type
- Revenue by branch
- Revenue forecasting

**3. Operational Analytics**
- Delivery performance
- Driver performance
- Warehouse efficiency
- Route optimization

**4. Custom Reports**
- Report builder
- Saved reports
- Scheduled reports
- Export options

#### **Operations**

**Viewing Dashboard**
1. Go to Analytics Portal
2. View KPI cards:
   - Total revenue
   - Total deliveries
   - Success rate
   - Average delivery time
3. View charts:
   - Revenue trend
   - Delivery trend
   - Status distribution
4. Select date range
5. Compare periods

**Creating Custom Reports**
1. Click "Create Report"
2. Select report type:
   - Revenue Report
   - Delivery Report
   - Performance Report
   - Custom Query
3. Select metrics to include
4. Select dimensions (group by)
5. Add filters
6. Preview report
7. Save report
8. Schedule (optional):
   - Daily/Weekly/Monthly
   - Email recipients
   - Format (PDF/Excel)

**Exporting Data**
1. Open any report
2. Click "Export"
3. Select format:
   - PDF
   - Excel
   - CSV
4. Click "Download"

---

### 4.14 Settings Portal

**Access**: Admin, Super Admin  
**URL**: `/#/settings`

#### **Overview**
System configuration and administration.

#### **Features**

**1. User Management**
- User list
- Create users
- Edit users
- Deactivate users
- Role assignment

**2. System Settings**
- Company information
- Warehouses
- Branches
- Service types
- Pricing rules

**3. Security**
- Password policies
- Session timeout
- Two-factor authentication
- Audit logs

**4. Integrations**
- API settings
- Webhook configuration
- Third-party integrations
- Email settings

#### **Operations**

**Managing Users**
(See section 3.3 - Creating Users)

**Configuring Warehouses**
1. Go to Settings → Warehouses
2. Click "Add Warehouse"
3. Fill in details:
   - Code (e.g., YGN-HUB-01)
   - Name
   - Type (Hub/Branch/Sorting Center)
   - Address
   - Capacity
   - Operating hours
   - Contact person
4. Click "Save"
5. Warehouse is now available in system

**Setting Up Service Types**
1. Go to Settings → Service Types
2. View existing services
3. Click "Add Service Type"
4. Fill in:
   - Name (e.g., Express)
   - Code (e.g., express)
   - Description
   - Base price
   - Price per kg
   - Delivery time (hours)
5. Click "Save"

**Configuring Pricing Rules**
1. Go to Settings → Pricing
2. Set base rates:
   - Standard delivery
   - Express delivery
   - Same day delivery
3. Set weight-based pricing:
   - Price per kg
   - Minimum weight
   - Maximum weight
4. Set zone-based pricing:
   - Within city
   - Intercity
   - Remote areas
5. Set special rates:
   - Bulk discounts
   - Merchant contracts
   - Promotional rates
6. Click "Save Changes"

---

### 4.15 QR Code Management Portal

**Access**: All staff roles  
**URL**: `/#/qr-code`

#### **Overview**
Generate, manage, and scan QR codes for shipments and operations.

#### **Features**

**1. QR Code Generation**
- Generate for shipments
- Bulk generation
- Custom QR codes
- Print labels

**2. QR Code Scanning**
- Scan to track
- Scan to update
- Scan to verify
- Batch scanning

**3. QR Code Management**
- Active QR codes
- Scan history
- Deactivate codes
- Regenerate codes

#### **Operations**

**Generating QR Codes**
1. Go to QR Code Portal
2. Click "Generate QR Code"
3. Select type:
   - Shipment QR
   - Location QR
   - Employee QR
4. Enter details
5. Click "Generate"
6. QR code is created
7. Print or download

**Scanning QR Codes**
1. Click "Scan QR Code"
2. Allow camera access
3. Point at QR code
4. System reads code
5. Displays information
6. Perform action:
   - Update status
   - View details
   - Assign location
7. Confirm action

**Bulk QR Generation**
1. Click "Bulk Generate"
2. Upload CSV with shipment IDs
3. System generates QR codes
4. Download all as PDF
5. Print labels

---

## 5. Daily Operations

### 5.1 Morning Routine (Warehouse & Operations)

**Time**: 6:00 AM - 8:00 AM

**Warehouse Staff:**
1. Check in via attendance system
2. Review overnight arrivals
3. Process inbound shipments
4. Organize by delivery zones
5. Prepare for driver pickup

**Wayplan Manager:**
1. Review pending shipments
2. Create manifests for the day
3. Optimize routes
4. Assign drivers and vehicles
5. Brief drivers on routes

**Supervisors:**
1. Review team attendance
2. Check vehicle status
3. Review urgent tasks
4. Brief team on priorities
5. Monitor manifest preparation

**Drivers:**
1. Check in via app
2. Vehicle inspection
3. Review assigned manifest
4. Load packages
5. Verify package count
6. Start route

### 5.2 Midday Operations

**Time**: 8:00 AM - 5:00 PM

**Drivers:**
1. Follow optimized route
2. Update status for each delivery
3. Collect COD payments
4. Capture proof of delivery
5. Handle exceptions
6. Communicate with customers

**Warehouse:**
1. Continue inbound processing
2. Prepare outbound shipments
3. Handle returns
4. Update inventory
5. Support driver queries

**Customer Service:**
1. Monitor live chat
2. Handle complaints
3. Track shipments for customers
4. Escalate urgent issues
5. Update customers proactively

**Supervisors:**
1. Monitor delivery progress
2. Handle exceptions
3. Reassign deliveries if needed
4. Support drivers
5. Update management

### 5.3 Evening Routine

**Time**: 5:00 PM - 8:00 PM

**Drivers:**
1. Complete remaining deliveries
2. Return to warehouse
3. Submit COD collections
4. Return undelivered packages
5. Update final statuses
6. Check out via app

**Warehouse:**
1. Receive returns
2. Process COD from drivers
3. Prepare next day shipments
4. Update inventory
5. Secure facility

**Finance:**
1. Verify COD collections
2. Reconcile amounts
3. Process deposits
4. Update records
5. Generate daily report

**Supervisors:**
1. Review day's performance
2. Handle pending exceptions
3. Plan next day operations
4. Submit daily report
5. Brief night shift (if applicable)

### 5.4 Weekly Operations

**Monday:**
- Review previous week performance
- Set weekly targets
- Plan resource allocation
- Schedule maintenance

**Wednesday:**
- Mid-week review
- Adjust operations if needed
- Address bottlenecks
- Team meetings

**Friday:**
- Week-end review
- Generate weekly reports
- Plan next week
- Process weekly payroll data

**Weekend:**
- Reduced operations (if applicable)
- Maintenance activities
- System updates
- Data cleanup

### 5.5 Monthly Operations

**First Week:**
- Generate monthly reports
- Invoice generation
- Performance reviews
- Inventory audit

**Second Week:**
- Payment collection
- Vendor payments
- Budget review
- Training sessions

**Third Week:**
- System maintenance
- Data backup verification
- Security audit
- Process improvements

**Fourth Week:**
- Month-end closing
- Financial reconciliation
- Planning next month
- Management review

---

## 6. Troubleshooting

### 6.1 Common Issues

#### **Issue: Cannot Login**

**Symptoms:**
- "Invalid credentials" error
- "User not found" error
- Login button not working

**Solutions:**
1. **Check credentials:**
   - Verify email is correct
   - Check password (case-sensitive)
   - Try "Forgot Password" if unsure

2. **Check account status:**
   - Contact admin to verify account is active
   - Check if account is locked

3. **Browser issues:**
   - Clear browser cache
   - Try incognito/private mode
   - Try different browser
   - Check internet connection

4. **System issues:**
   - Check if system is under maintenance
   - Contact IT support

#### **Issue: Password Reset Not Working**

**Symptoms:**
- Reset email not received
- Reset link expired
- Reset link redirects to wrong page

**Solutions:**
1. **Email not received:**
   - Check spam/junk folder
   - Wait 5-10 minutes
   - Verify email address is correct
   - Request new reset link

2. **Link expired:**
   - Reset links expire after 1 hour
   - Request new reset link
   - Use link immediately

3. **Wrong redirect:**
   - Copy the full URL from email
   - Replace domain with: cg5nqi8t9h.skywork.website
   - Paste in browser
   - See SUPABASE_PASSWORD_RESET_CONFIG.md for details

#### **Issue: QR Code Not Scanning**

**Symptoms:**
- Camera not working
- QR code not recognized
- Wrong shipment displayed

**Solutions:**
1. **Camera issues:**
   - Allow camera permission in browser
   - Check camera is working
   - Clean camera lens
   - Ensure good lighting

2. **QR code issues:**
   - Ensure QR code is not damaged
   - Hold steady while scanning
   - Adjust distance (10-30cm)
   - Try manual AWB entry

3. **System issues:**
   - Refresh page
   - Try different device
   - Report to IT if persistent

#### **Issue: Delivery Status Not Updating**

**Symptoms:**
- Status update fails
- Old status still showing
- Changes not saved

**Solutions:**
1. **Connection issues:**
   - Check internet connection
   - Wait and retry
   - Save offline (if supported)

2. **Permission issues:**
   - Verify you have permission to update
   - Check if delivery is assigned to you
   - Contact supervisor

3. **System issues:**
   - Refresh page
   - Clear cache
   - Try different browser
   - Report to IT

#### **Issue: Manifest Not Loading**

**Symptoms:**
- Blank manifest page
- Loading forever
- Error message

**Solutions:**
1. **Refresh page**
2. **Check filters:**
   - Remove all filters
   - Try different date range
3. **Check permissions:**
   - Verify you have access
   - Contact admin
4. **System issues:**
   - Try different browser
   - Clear cache
   - Report to IT

#### **Issue: Report Generation Fails**

**Symptoms:**
- Report not generating
- Timeout error
- Incomplete data

**Solutions:**
1. **Reduce date range:**
   - Try smaller time period
   - Generate multiple reports
2. **Simplify report:**
   - Remove complex filters
   - Reduce columns
3. **Try different format:**
   - PDF instead of Excel
   - CSV for large data
4. **Contact IT:**
   - If issue persists
   - May need database optimization

### 6.2 Error Messages

#### **"Unauthorized Access"**
- **Meaning**: You don't have permission
- **Solution**: Contact admin to grant access

#### **"Session Expired"**
- **Meaning**: You've been logged out
- **Solution**: Login again

#### **"Network Error"**
- **Meaning**: Connection problem
- **Solution**: Check internet, retry

#### **"Invalid Data"**
- **Meaning**: Form data is incorrect
- **Solution**: Check required fields, fix errors

#### **"Duplicate Entry"**
- **Meaning**: Record already exists
- **Solution**: Check if already created, use different ID

#### **"Server Error"**
- **Meaning**: System problem
- **Solution**: Wait and retry, contact IT if persists

### 6.3 Performance Issues

#### **Slow Loading**
1. Check internet speed
2. Clear browser cache
3. Close unnecessary tabs
4. Try different browser
5. Contact IT if persistent

#### **App Freezing**
1. Refresh page
2. Clear cache
3. Restart browser
4. Check system resources
5. Report to IT

#### **Data Not Syncing**
1. Check internet connection
2. Force refresh (Ctrl+F5)
3. Logout and login
4. Clear cache
5. Contact IT

### 6.4 Getting Help

#### **Level 1: Self-Help**
1. Check this manual
2. Check FAQ section
3. Try troubleshooting steps
4. Search knowledge base

#### **Level 2: Team Support**
1. Ask supervisor
2. Ask experienced colleague
3. Check team chat
4. Review training materials

#### **Level 3: IT Support**
1. Submit support ticket
2. Call IT helpdesk
3. Email: support@britiumexpress.com
4. Provide:
   - Your name and role
   - Issue description
   - Screenshots
   - Steps to reproduce
   - Browser and device info

#### **Level 4: Emergency**
For critical system issues:
1. Call emergency hotline: [TO BE CONFIGURED]
2. Email: emergency@britiumexpress.com
3. Contact system administrator directly

---

## 7. API Integration

### 7.1 API Overview

Britium Express provides a RESTful API for integration with external systems.

**Base URL**: `https://dltavabvjwocknkyvwgz.supabase.co`

**Authentication**: Bearer token (JWT)

**Format**: JSON

### 7.2 Authentication

**Getting API Key:**
1. Login as merchant or admin
2. Go to Settings → API
3. Click "Generate API Key"
4. Copy and save securely

**Using API Key:**
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     -H "apikey: YOUR_ANON_KEY" \
     https://dltavabvjwocknkyvwgz.supabase.co/rest/v1/shipments
```

### 7.3 Common API Endpoints

#### **Create Shipment**
```http
POST /rest/v1/shipments
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "awb": "BE123456",
  "merchant_id": "uuid",
  "service_type": "standard",
  "sender": {
    "name": "John Doe",
    "phone": "+959123456789",
    "address": "123 Main St, Yangon"
  },
  "recipient": {
    "name": "Jane Smith",
    "phone": "+959987654321",
    "address": "456 Oak Ave, Mandalay"
  },
  "package_details": {
    "weight": 2.5,
    "dimensions": {
      "length": 30,
      "width": 20,
      "height": 10
    }
  },
  "cod_amount": 50000,
  "payment_method": "cod"
}
```

#### **Track Shipment**
```http
GET /rest/v1/shipments?awb=eq.BE123456
Authorization: Bearer YOUR_TOKEN
```

#### **Update Delivery Status**
```http
PATCH /rest/v1/deliveries?id=eq.DELIVERY_ID
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN

{
  "status": "delivered",
  "delivered_at": "2026-04-10T14:30:00Z",
  "signature": "base64_signature_data"
}
```

### 7.4 Webhooks

Configure webhooks to receive real-time updates:

**Events:**
- `shipment.created`
- `shipment.updated`
- `delivery.status_changed`
- `delivery.completed`
- `delivery.failed`

**Configuration:**
1. Go to Settings → Webhooks
2. Click "Add Webhook"
3. Enter URL
4. Select events
5. Save

**Webhook Payload:**
```json
{
  "event": "delivery.completed",
  "timestamp": "2026-04-10T14:30:00Z",
  "data": {
    "delivery_id": "uuid",
    "shipment_id": "uuid",
    "awb": "BE123456",
    "status": "delivered",
    "delivered_at": "2026-04-10T14:30:00Z"
  }
}
```

### 7.5 Rate Limits

- **Standard**: 100 requests/minute
- **Premium**: 1000 requests/minute
- **Enterprise**: Unlimited

**Headers:**
- `X-RateLimit-Limit`: Total allowed
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

### 7.6 Error Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `429`: Rate Limit Exceeded
- `500`: Server Error

---

## 8. Database Management

### 8.1 Database Schema

**Core Tables:**
- `user_profiles`: User information
- `shipments`: Shipment records
- `deliveries`: Delivery attempts
- `manifests`: Delivery manifests
- `warehouses`: Warehouse locations
- `vehicles`: Fleet vehicles
- `branches`: Branch offices

**Supporting Tables:**
- `tasks`: Task management
- `complaints`: Customer complaints
- `attendance`: Employee attendance
- `leave_requests`: Leave management
- `cod_collections`: COD tracking
- `invoices`: Billing
- `qr_codes`: QR code management

### 8.2 Data Backup

**Automatic Backups:**
- Daily: 2:00 AM UTC
- Weekly: Sunday 2:00 AM UTC
- Monthly: 1st of month 2:00 AM UTC

**Retention:**
- Daily: 7 days
- Weekly: 4 weeks
- Monthly: 12 months

**Manual Backup:**
1. Login to Supabase Dashboard
2. Go to Database → Backups
3. Click "Create Backup"
4. Download backup file

### 8.3 Data Retention

**Active Data:**
- Shipments: 2 years
- Deliveries: 2 years
- User data: Until account deletion

**Archived Data:**
- Older than 2 years
- Moved to cold storage
- Available on request

**Deleted Data:**
- Soft delete (marked as deleted)
- Hard delete after 90 days
- Backup retained per policy

### 8.4 Database Maintenance

**Weekly:**
- Index optimization
- Query performance review
- Cleanup temporary data

**Monthly:**
- Full database analysis
- Storage optimization
- Archive old data

**Quarterly:**
- Security audit
- Performance tuning
- Capacity planning

---

## 9. Security & Compliance

### 9.1 Security Features

**Authentication:**
- Email/password login
- Password reset via email
- Session management
- Auto-logout after inactivity

**Authorization:**
- Role-based access control (RBAC)
- Row-level security (RLS)
- API key authentication
- Permission checking

**Data Security:**
- Encryption at rest
- Encryption in transit (HTTPS)
- Secure password hashing
- API key encryption

**Audit Trail:**
- All actions logged
- User activity tracking
- Change history
- Access logs

### 9.2 Password Policy

**Requirements:**
- Minimum 6 characters
- At least one letter
- At least one number
- Case-sensitive

**Best Practices:**
- Use unique passwords
- Change regularly (every 90 days)
- Don't share passwords
- Use password manager

### 9.3 Data Privacy

**Personal Data:**
- Collected: Name, email, phone, address
- Purpose: Service delivery
- Storage: Secure database
- Access: Authorized personnel only

**Customer Rights:**
- Access your data
- Correct your data
- Delete your data
- Export your data

**Data Sharing:**
- Not shared with third parties
- Only used for service delivery
- Anonymized for analytics

### 9.4 Compliance

**Standards:**
- ISO 27001 (Information Security)
- GDPR principles
- Local data protection laws

**Certifications:**
- [TO BE OBTAINED]

**Audits:**
- Annual security audit
- Quarterly compliance review
- Continuous monitoring

### 9.5 Incident Response

**If Security Breach:**
1. Immediately report to IT
2. Change your password
3. Review recent activity
4. Follow IT instructions

**Reporting:**
- Email: security@britiumexpress.com
- Phone: [TO BE CONFIGURED]
- Include: What, when, who, how

---

## 10. Appendix

### 10.1 Glossary

**AWB (Air Waybill)**: Unique tracking number for shipment

**COD (Cash on Delivery)**: Payment collected upon delivery

**Manifest**: List of deliveries assigned to a driver

**NDR (Non-Delivery Report)**: Report when delivery fails

**POD (Proof of Delivery)**: Evidence of successful delivery

**RLS (Row Level Security)**: Database security feature

**Wayplan**: Route optimization and planning

**Hub**: Main warehouse/distribution center

**Branch**: Regional office/warehouse

**Sorting Center**: Facility for sorting packages

**Last Mile**: Final delivery to customer

**Pickup**: Collecting package from sender

**Inbound**: Packages arriving at warehouse

**Outbound**: Packages leaving warehouse

**Exception**: Delivery that failed or has issues

**Escalation**: Raising issue to higher authority

**Reconciliation**: Matching records and amounts

**Bulk Upload**: Uploading multiple records at once

**Template**: Pre-filled form for quick entry

**Dashboard**: Overview page with metrics

**Portal**: Dedicated interface for specific role

### 10.2 Keyboard Shortcuts

**Global:**
- `Ctrl + K`: Quick search
- `Ctrl + /`: Show shortcuts
- `Esc`: Close modal/dialog
- `F5`: Refresh page

**Navigation:**
- `Alt + D`: Go to Dashboard
- `Alt + S`: Go to Settings
- `Alt + H`: Go to Help

**Forms:**
- `Tab`: Next field
- `Shift + Tab`: Previous field
- `Enter`: Submit form
- `Esc`: Cancel

**Tables:**
- `↑/↓`: Navigate rows
- `Space`: Select row
- `Ctrl + A`: Select all
- `Delete`: Delete selected

### 10.3 Status Codes

**Shipment Status:**
- `draft`: Being created
- `pending`: Awaiting pickup
- `in_transit`: In warehouse/transit
- `out_for_delivery`: With driver
- `delivered`: Successfully delivered
- `failed`: Delivery failed
- `returned`: Returned to sender
- `cancelled`: Cancelled by sender

**Delivery Status:**
- `pending`: Not assigned
- `assigned`: Assigned to driver
- `picked_up`: Collected by driver
- `in_transit`: En route
- `out_for_delivery`: Near customer
- `delivered`: Completed
- `failed`: Unsuccessful
- `returned`: Returning

**Payment Status:**
- `pending`: Not paid
- `collected`: COD collected
- `deposited`: Submitted to finance
- `verified`: Confirmed by finance
- `failed`: Payment failed

**Task Status:**
- `pending`: Not started
- `in_progress`: Being worked on
- `completed`: Finished
- `cancelled`: Cancelled

**Complaint Status:**
- `open`: New complaint
- `in_progress`: Being handled
- `resolved`: Issue fixed
- `closed`: Completed
- `escalated`: Raised to management

### 10.4 Service Types

**Standard:**
- Delivery: 3-5 business days
- Cost: Base rate
- Coverage: All areas

**Express:**
- Delivery: 1-2 business days
- Cost: Base rate + 50%
- Coverage: Major cities

**Same Day:**
- Delivery: Same day (if before 12 PM)
- Cost: Base rate + 100%
- Coverage: Within city only

**Next Day:**
- Delivery: Next business day
- Cost: Base rate + 75%
- Coverage: Major cities

**Economy:**
- Delivery: 5-7 business days
- Cost: Base rate - 20%
- Coverage: All areas

### 10.5 Contact Information

**General Inquiries:**
- Email: info@britiumexpress.com
- Phone: [TO BE CONFIGURED]
- Hours: Mon-Fri 9 AM - 6 PM

**Customer Support:**
- Email: support@britiumexpress.com
- Phone: [TO BE CONFIGURED]
- Hours: Mon-Sun 8 AM - 8 PM

**Technical Support:**
- Email: tech@britiumexpress.com
- Phone: [TO BE CONFIGURED]
- Hours: 24/7

**Emergency:**
- Email: emergency@britiumexpress.com
- Phone: [TO BE CONFIGURED]
- Hours: 24/7

**Sales:**
- Email: sales@britiumexpress.com
- Phone: [TO BE CONFIGURED]
- Hours: Mon-Fri 9 AM - 6 PM

### 10.6 Training Resources

**Video Tutorials:**
- Available at: [TO BE CONFIGURED]
- Topics: All portal operations
- Duration: 5-15 minutes each

**User Guides:**
- PDF downloads available
- Step-by-step instructions
- Screenshots included

**Webinars:**
- Monthly training sessions
- Live Q&A
- Recording available

**On-site Training:**
- Available on request
- Customized for your team
- Contact: training@britiumexpress.com

### 10.7 System Updates

**Release Schedule:**
- Major updates: Quarterly
- Minor updates: Monthly
- Hotfixes: As needed

**Maintenance Windows:**
- Scheduled: Sunday 2-4 AM
- Emergency: As needed
- Notification: 48 hours advance

**Update Notifications:**
- Email to all users
- In-app notification
- Release notes published

### 10.8 Feedback & Suggestions

**How to Provide Feedback:**
1. Click "Feedback" button (bottom right)
2. Select type:
   - Bug report
   - Feature request
   - General feedback
3. Describe in detail
4. Add screenshots (optional)
5. Submit

**What Happens Next:**
1. Ticket created
2. Team reviews
3. Prioritized
4. Implemented (if approved)
5. You're notified

**Feature Requests:**
- Reviewed monthly
- Voted by users
- Top requests prioritized
- Roadmap published quarterly

---

## Document Information

**Version**: 1.0  
**Last Updated**: April 10, 2026  
**Next Review**: July 10, 2026  
**Document Owner**: Britium Express Operations Team  
**Contact**: operations@britiumexpress.com

**Revision History:**
- v1.0 (2026-04-10): Initial release

**Feedback:**
Please send feedback or corrections to: docs@britiumexpress.com

---

**END OF OPERATIONS MANUAL**
