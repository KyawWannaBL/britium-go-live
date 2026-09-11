-- ============================================================
-- BRITIUM EXPRESS - PRODUCTION-READY SEED DATA
-- ============================================================

-- -------------------------------------------------------
-- 1. WAREHOUSES
-- -------------------------------------------------------
INSERT INTO public.warehouses (name, code, type, address, capacity, status, operating_hours)
VALUES
  (
    'Yangon Main Hub', 
    'YGN-HUB', 
    'hub', 
    '{"street": "45 Industrial Zone, Mingaladon", "city": "Yangon", "state": "Yangon", "country": "Myanmar"}'::jsonb, 
    '{"total_kg": 5000, "total_cbm": 150}'::jsonb, 
    'active', 
    '{"open": "08:00", "close": "20:00", "days": "Mon-Sat"}'::jsonb
  ),
  (
    'Mandalay Warehouse', 
    'MDY-WH', 
    'branch', 
    '{"street": "12 Chan Aye Tharzan Rd", "city": "Mandalay", "state": "Mandalay", "country": "Myanmar"}'::jsonb, 
    '{"total_kg": 2000, "total_cbm": 60}'::jsonb, 
    'active', 
    '{"open": "08:00", "close": "18:00", "days": "Mon-Sat"}'::jsonb
  ),
(
    'Naypyidaw Depot', 
    'NPT-DEP', 
    'branch',  -- CHANGED FROM 'depot'
    '{"street": "88 Naypyidaw Business Park", "city": "Naypyidaw", "state": "NPT", "country": "Myanmar"}'::jsonb, 
    '{"total_kg": 1000, "total_cbm": 30}'::jsonb, 
    'active', 
    '{"open": "07:00", "close": "17:00", "days": "Mon-Sat"}'::jsonb
  )
ON CONFLICT (code) DO NOTHING;