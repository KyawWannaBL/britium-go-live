# Britium Express - Production Wiring Implementation Plan

## Overview
This document outlines the systematic approach to wire all frontend portals to the Supabase backend API.

## Completed
✅ Database schema created (shipments, deliveries, manifests, warehouses, vehicles, branches, tasks, complaints, attendance, leave_requests, cod_collections, invoices, qr_codes)
✅ RLS policies configured for all tables
✅ Comprehensive API layer created (`src/api/supabase.ts`)
✅ Custom hooks for data fetching (`src/hooks/useSupabaseQuery.tsx`)
✅ Super admin account created (md@britiumexpress.com)

## Implementation Priority

### Phase 1: Core Operations (HIGH PRIORITY)
1. **SupervisorPortal** - Replace mock data with real API calls
   - Deliveries list
   - Driver performance
   - Queue management
   - Exceptions handling

2. **DriverPortal** - Real-time delivery management
   - Assigned deliveries
   - Delivery status updates
   - COD collection
   - Photo verification

3. **WarehousePortal** - Inventory and operations
   - Inbound/outbound shipments
   - QR code scanning
   - Inventory management

### Phase 2: Planning & Data Entry (HIGH PRIORITY)
4. **WayplanPortal** - Manifest and route management
   - Create manifests
   - Assign drivers/vehicles
   - Route optimization

5. **DataEntryPortal** - Bulk operations
   - Bulk shipment upload
   - Data validation
   - Template download

6. **CreateDelivery** - Shipment creation
   - Form with real API
   - AWB generation
   - Validation

### Phase 3: Customer Facing (MEDIUM PRIORITY)
7. **MerchantPortal** - Merchant operations
   - Create shipments
   - View reports
   - Invoice management

8. **CustomerPortal** - Customer self-service
   - Track orders
   - Submit complaints
   - View history

9. **CustomerServicePortal** - Support operations
   - Complaint management
   - Live chat
   - Resolution tracking

### Phase 4: Management & Analytics (MEDIUM PRIORITY)
10. **HRPortal** - HR management
    - Attendance tracking
    - Leave requests
    - Employee management

11. **FinancePortal** - Financial operations
    - COD collections
    - Invoice generation
    - Reports

12. **MarketingPortal** - Marketing analytics
    - Customer analytics
    - Campaign tracking

13. **Analytics** - Business intelligence
    - Revenue reports
    - Performance metrics
    - Custom reports

14. **Settings** - System configuration
    - User management
    - Role permissions
    - System settings

### Phase 5: Additional Features (LOW PRIORITY)
15. **BranchOfficePortal** - Branch operations
16. **QRCodeManagement** - QR operations

## API Integration Pattern

### Standard Pattern for Each Portal:

```typescript
// 1. Import API and hooks
import { shipmentsAPI, deliveriesAPI } from '@/api/supabase';
import { useQuery, useMutation } from '@/hooks/useSupabaseQuery';
import { useAuth } from '@/hooks/useAuth';

// 2. Fetch data
const { data: shipments, isLoading, refetch } = useQuery(
  () => shipmentsAPI.getAll({ status: 'pending' })
);

// 3. Mutations
const { mutate: createShipment } = useMutation(
  shipmentsAPI.create,
  {
    onSuccess: () => {
      refetch();
      toast({ title: 'Shipment created successfully' });
    }
  }
);

// 4. Replace mock data with real data
// OLD: const data = mockShipments;
// NEW: const data = shipments || [];
```

## Key Changes Required

### 1. Remove Mock Data Imports
```typescript
// REMOVE:
import { mockDeliveries, mockEmployees, mockShipments } from '@/data/index';

// ADD:
import { shipmentsAPI, deliveriesAPI, employeesAPI } from '@/api/supabase';
import { useQuery } from '@/hooks/useSupabaseQuery';
```

### 2. Replace Static Data with API Calls
```typescript
// OLD:
const deliveries = mockDeliveries;

// NEW:
const { data: deliveries, isLoading } = useQuery(
  () => deliveriesAPI.getAll({ driverId: user.id })
);
```

### 3. Add Loading States
```typescript
if (isLoading) {
  return <div>Loading...</div>;
}
```

### 4. Add Error Handling
```typescript
if (error) {
  return <div>Error: {error.message}</div>;
}
```

### 5. Implement Real Actions
```typescript
// OLD:
const handleComplete = () => {
  console.log('Complete delivery');
};

// NEW:
const { mutate: completeDelivery } = useMutation(
  (id: string) => deliveriesAPI.markDelivered(id, proofData),
  {
    onSuccess: () => {
      refetch();
      toast({ title: 'Delivery completed' });
    }
  }
);
```

## Database Seeding (Optional)

To test with sample data, create seed data:

```sql
-- Insert sample warehouse
INSERT INTO public.warehouses (code, name, type, address, status)
VALUES (
  'YGN-HUB-01',
  'Yangon Central Hub',
  'hub',
  '{"street": "123 Pyay Road", "city": "Yangon", "country": "Myanmar"}'::jsonb,
  'operational'
);

-- Insert sample shipments
-- (Add more as needed)
```

## Testing Checklist

For each portal:
- [ ] Data loads from Supabase
- [ ] Loading states work
- [ ] Error handling works
- [ ] Create operations work
- [ ] Update operations work
- [ ] Delete operations work (if applicable)
- [ ] Filters work
- [ ] Search works
- [ ] Pagination works (if applicable)
- [ ] Real-time updates work (if applicable)
- [ ] RLS policies enforce correct permissions

## Next Steps

1. Start with SupervisorPortal (highest priority)
2. Test thoroughly with real data
3. Move to DriverPortal
4. Continue through priority list
5. Add seed data as needed for testing
6. Deploy and test in production

## Notes

- All API calls are in `src/api/supabase.ts`
- All hooks are in `src/hooks/useSupabaseQuery.tsx`
- RLS policies are already configured
- Super admin account: md@britiumexpress.com / Bv@000899600
- Use this account to create test data and other users
