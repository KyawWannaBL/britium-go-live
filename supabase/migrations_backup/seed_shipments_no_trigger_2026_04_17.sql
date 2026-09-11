
-- Step 1: Drop or disable the problematic trigger
ALTER TABLE public.shipments DISABLE TRIGGER ALL;

-- Step 2: Insert shipments now without triggers firing
DO $$
DECLARE
  v_merchant_id UUID;
  v_ygn_id UUID;
BEGIN
  SELECT id INTO v_merchant_id FROM public.user_profiles 
  WHERE role IN ('super-admin','admin','super_admin') 
  LIMIT 1;
  
  IF v_merchant_id IS NULL THEN
    SELECT id INTO v_merchant_id FROM public.user_profiles LIMIT 1;
  END IF;
  
  SELECT id INTO v_ygn_id FROM public.warehouses WHERE code = 'YGN-HUB-01' LIMIT 1;
  
  IF v_merchant_id IS NULL THEN
    RAISE NOTICE 'No user profiles found';
    RETURN;
  END IF;

  INSERT INTO public.shipments (awb, merchant_id, service_type, status, cod_amount, shipping_fee, payment_method, payment_status, sender, recipient, package_details, created_by, origin_warehouse_id, created_at)
  VALUES
    ('BX-2026-00001', v_merchant_id, 'express',  'delivered',        15000, 4500, 'cod',     'verified',  '{"name":"Aung Thu Shop","phone":"+95911111111","address":{"city":"Yangon"}}',      '{"name":"Ko Kyaw Zin","phone":"+95922222222","address":{"street":"15 Zay St","city":"Mandalay"}}',       '{"weight":2.5,"description":"Electronics"}',     v_merchant_id, v_ygn_id, NOW()-INTERVAL'10 days'),
    ('BX-2026-00002', v_merchant_id, 'standard', 'delivered',         8000, 2500, 'cod',     'verified',  '{"name":"Thin Thin Store","phone":"+95911111112","address":{"city":"Yangon"}}',    '{"name":"Ma Aye Myat","phone":"+95922222223","address":{"street":"8 Yaza Rd","city":"Naypyidaw"}}',      '{"weight":1.2,"description":"Clothing"}',        v_merchant_id, v_ygn_id, NOW()-INTERVAL'9 days'),
    ('BX-2026-00003', v_merchant_id, 'standard', 'in_transit',           0, 3000, 'prepaid', 'deposited', '{"name":"Kyaw Electronics","phone":"+95911111113","address":{"city":"Mandalay"}}', '{"name":"U Thant Zin","phone":"+95922222224","address":{"street":"44 Shwemawdaw","city":"Bago"}}',       '{"weight":3.0,"description":"Computer parts"}',  v_merchant_id, v_ygn_id, NOW()-INTERVAL'8 days'),
    ('BX-2026-00004', v_merchant_id, 'economy',  'delivered',        12000, 2000, 'cod',     'verified',  '{"name":"Online Fashion","phone":"+95911111114","address":{"city":"Yangon"}}',     '{"name":"Ma Su Hlaing","phone":"+95922222225","address":{"street":"2 Inya Lake","city":"Pathein"}}',     '{"weight":0.8,"description":"Clothes"}',         v_merchant_id, v_ygn_id, NOW()-INTERVAL'7 days'),
    ('BX-2026-00005', v_merchant_id, 'express',  'delivered',            0, 6500, 'prepaid', 'deposited', '{"name":"Tech Hub Myanmar","phone":"+95911111115","address":{"city":"Yangon"}}',   '{"name":"Ko Myo Aung","phone":"+95922222226","address":{"street":"77 78th St","city":"Mandalay"}}',      '{"weight":5.0,"description":"Laptop"}',          v_merchant_id, v_ygn_id, NOW()-INTERVAL'6 days'),
    ('BX-2026-00006', v_merchant_id, 'express',  'in_transit',       45000, 5000, 'cod',     'pending',   '{"name":"Shwe Yatha Gems","phone":"+95911111116","address":{"city":"Mandalay"}}',  '{"name":"Daw Khin May","phone":"+95922222227","address":{"street":"18 Merchant","city":"Yangon"}}',      '{"weight":0.5,"description":"Jewelry"}',         v_merchant_id, v_ygn_id, NOW()-INTERVAL'5 days'),
    ('BX-2026-00007', v_merchant_id, 'standard', 'pending',          18000, 3200, 'cod',     'pending',   '{"name":"Cool Gadgets","phone":"+95911111117","address":{"city":"Yangon"}}',       '{"name":"Ko Pyae Phyo","phone":"+95922222228","address":{"street":"12 Strand","city":"Mawlamyine"}}',   '{"weight":2.0,"description":"Phone"}',           v_merchant_id, v_ygn_id, NOW()-INTERVAL'4 days'),
    ('BX-2026-00008', v_merchant_id, 'standard', 'delivered',         9500, 2800, 'cod',     'verified',  '{"name":"Bloom Beauty","phone":"+95911111118","address":{"city":"Yangon"}}',       '{"name":"Ma Ei Phyu","phone":"+95922222229","address":{"street":"55 Yoma","city":"Naypyidaw"}}',         '{"weight":1.5,"description":"Cosmetics"}',       v_merchant_id, v_ygn_id, NOW()-INTERVAL'3 days'),
    ('BX-2026-00009', v_merchant_id, 'economy',  'delivered',            0, 3500, 'prepaid', 'deposited', '{"name":"Myanmar Books","phone":"+95911111119","address":{"city":"Yangon"}}',      '{"name":"Ko Thet Oo","phone":"+95922222230","address":{"street":"25 Lashio Rd","city":"Mandalay"}}',    '{"weight":4.0,"description":"Books"}',           v_merchant_id, v_ygn_id, NOW()-INTERVAL'3 days'),
    ('BX-2026-00010', v_merchant_id, 'express',  'in_transit',           0, 7000, 'prepaid', 'deposited', '{"name":"Alpha Pharma","phone":"+95911111120","address":{"city":"Yangon"}}',       '{"name":"Dr Win Naing","phone":"+95922222231","address":{"street":"10 Shan Rd","city":"Taunggyi"}}',    '{"weight":3.5,"description":"Medicine"}',        v_merchant_id, v_ygn_id, NOW()-INTERVAL'2 days'),
    ('BX-2026-00011', v_merchant_id, 'standard', 'pending',          22000, 3000, 'cod',     'pending',   '{"name":"Pyone Cho Fashion","phone":"+95911111121","address":{"city":"Mandalay"}}', '{"name":"Ma Hnin Pwint","phone":"+95922222232","address":{"street":"3 Kaba Aye","city":"Yangon"}}',     '{"weight":1.8,"description":"Dress"}',           v_merchant_id, v_ygn_id, NOW()-INTERVAL'2 days'),
    ('BX-2026-00012', v_merchant_id, 'standard', 'failed',               0, 4000, 'prepaid', 'pending',   '{"name":"Bright Star","phone":"+95911111122","address":{"city":"Yangon"}}',        '{"name":"U Zaw Win","phone":"+95922222233","address":{"street":"8 Station Rd","city":"Bago"}}',         '{"weight":6.0,"description":"Hardware"}',        v_merchant_id, v_ygn_id, NOW()-INTERVAL'1 day'),
    ('BX-2026-00013', v_merchant_id, 'express',  'out_for_delivery', 16000, 4800, 'cod',     'pending',   '{"name":"Myo Family Shop","phone":"+95911111123","address":{"city":"Yangon"}}',    '{"name":"Ko Aung Myo","phone":"+95922222234","address":{"street":"66 83rd St","city":"Mandalay"}}',     '{"weight":2.2,"description":"Food"}',            v_merchant_id, v_ygn_id, NOW()-INTERVAL'1 day'),
    ('BX-2026-00014', v_merchant_id, 'economy',  'delivered',         7500, 1800, 'cod',     'verified',  '{"name":"Digital Dreams","phone":"+95911111124","address":{"city":"Yangon"}}',     '{"name":"Ma Khaing Zin","phone":"+95922222235","address":{"street":"14 Strand","city":"Pathein"}}',     '{"weight":0.6,"description":"USB drive"}',       v_merchant_id, v_ygn_id, NOW()-INTERVAL'1 day'),
    ('BX-2026-00015', v_merchant_id, 'same_day', 'delivered',         5000, 5500, 'cod',     'collected', '{"name":"Nilar Flowers","phone":"+95911111125","address":{"city":"Mandalay"}}',    '{"name":"Ma Thida Soe","phone":"+95922222236","address":{"street":"22 Thabyegone","city":"Naypyidaw"}}','{"weight":0.3,"description":"Flowers"}',         v_merchant_id, v_ygn_id, NOW()-INTERVAL'12 hours'),
    ('BX-2026-00016', v_merchant_id, 'standard', 'pending',          28000, 3400, 'cod',     'pending',   '{"name":"Golden Star Market","phone":"+95911111126","address":{"city":"Yangon"}}',  '{"name":"Ko Kyaw Myo Htun","phone":"+95922222237","address":{"street":"5 Bogyoke","city":"Mawlamyine"}}','{"weight":3.8,"description":"Furniture"}',       v_merchant_id, v_ygn_id, NOW()-INTERVAL'6 hours'),
    ('BX-2026-00017', v_merchant_id, 'same_day', 'in_transit',       11000, 4200, 'cod',     'pending',   '{"name":"Sun Electronics","phone":"+95911111127","address":{"city":"Yangon"}}',    '{"name":"Daw Than Than","phone":"+95922222238","address":{"street":"88 Insein Rd","city":"Yangon"}}',   '{"weight":1.1,"description":"Charger"}',         v_merchant_id, v_ygn_id, NOW()-INTERVAL'5 hours'),
    ('BX-2026-00018', v_merchant_id, 'express',  'pending',          19500, 4900, 'cod',     'pending',   '{"name":"Aung Kyaw Trading","phone":"+95911111128","address":{"city":"Mandalay"}}', '{"name":"Ma Sandar Win","phone":"+95922222239","address":{"street":"44 Botahtaung","city":"Yangon"}}',  '{"weight":2.7,"description":"Tiles"}',           v_merchant_id, v_ygn_id, NOW()-INTERVAL'4 hours'),
    ('BX-2026-00019', v_merchant_id, 'standard', 'out_for_delivery',     0, 3800, 'prepaid', 'deposited', '{"name":"MegaMart Online","phone":"+95911111129","address":{"city":"Yangon"}}',    '{"name":"Ko Thura Aung","phone":"+95922222240","address":{"street":"12 Palace Rd","city":"Mandalay"}}', '{"weight":4.5,"description":"Groceries"}',       v_merchant_id, v_ygn_id, NOW()-INTERVAL'3 hours'),
    ('BX-2026-00020', v_merchant_id, 'standard', 'pending',          13500, 2600, 'cod',     'pending',   '{"name":"Star Cosmetics","phone":"+95911111130","address":{"city":"Yangon"}}',     '{"name":"Ma Wai Phyo Oo","phone":"+95922222241","address":{"street":"77 Pyinmana","city":"Naypyidaw"}}','{"weight":0.9,"description":"Skincare"}',        v_merchant_id, v_ygn_id, NOW()-INTERVAL'1 hour')
  ON CONFLICT (awb) DO NOTHING;
  
  RAISE NOTICE 'Done! merchant_id=%', v_merchant_id;
END $$;

-- Step 3: Re-enable triggers
ALTER TABLE public.shipments ENABLE TRIGGER ALL;
