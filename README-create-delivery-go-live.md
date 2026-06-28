# Package 02 — Create Delivery Go-Live

## Purpose
Manual shipment creation with Supabase-wired tariff calculation, ID generation, and branch auto-resolution.

## Files
| File | Description |
|------|-------------|
| `supabase/sql/71-create-delivery-go-live.sql` | RPCs: `be_calculate_tariff`, `be_get_merchants_dropdown`, `be_create_delivery`, verification |
| `src/lib/createDeliveryApi.ts` | Typed API helpers |
| `src/pages/CreateDeliveryPage.tsx` | 6-step shipment creation form |
| `src/pages/CreateDeliveryRoutes.snippet.tsx` | Route/nav integration snippet |

## Apply Instructions
1. Run SQL in Supabase SQL Editor: `supabase/sql/71-create-delivery-go-live.sql`
2. Extract `src/` files into `D:\Britium_No_Demo_Deployment\web-portal\britium_enterprise_portal\src\`
3. Add route per snippet
4. Verify: `SELECT be_create_delivery_go_live_verification();`

## Tariff Logic
| Tier | Free Allowance | Base | Extra/kg | Highway |
|------|---------------|------|----------|---------|
| Standard | 0–3 kg | 4,000 MMK | +500 | +3,000 |
| Royal | 0–5 kg | 4,000 MMK | +500 | +3,000 |
| Commitment | 0–5 kg | 3,500 MMK | +500 | +3,000 |

## RBAC
- Roles: admin, operation_manager, cs, data_entry
