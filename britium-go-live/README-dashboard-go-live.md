# Britium Dashboard Go-Live Package

Real-time KPI overview for Operations, Supervisor, and Admin roles.

## Apply SQL
Run in Supabase SQL Editor:
  supabase/sql/70-dashboard-go-live.sql

Verify:
  select public.be_dashboard_go_live_verification();
Expected: { "ok": true, "rpc_count": 6 }

## Apply Frontend
cd D:\Britium_No_Demo_Deployment\web-portal\britium_enterprise_portal
Expand-Archive -Path .\01-dashboard-go-live-package.zip -DestinationPath . -Force
npm run build

## Add Routes
See: src/pages/DashboardRoutes.snippet.tsx
Routes: /dashboard  /  (root)

## Role Access
admin, operation_manager, supervisor, finance, cs, dispatch, warehouse

## Features
- 8 KPI cards (Active Shipments, Delivered Today, Failed, Pending COD, Pickups, Pending Assignment, Exceptions, Active Riders)
- 7-day delivery trend line chart (Recharts)
- SLA breakdown (within 24h / 48h / over 48h)
- Source throughput by requester type (30d)
- Real-time activity feed (20 most recent cargo events)
- Auto-refresh every 30 seconds
- Branch-scoped for non-admin roles
