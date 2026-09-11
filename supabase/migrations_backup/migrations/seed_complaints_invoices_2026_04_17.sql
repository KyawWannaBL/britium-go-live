
-- Seed COMPLAINTS with correct enum values
-- complaint_category: delivery_delay, damaged_package, lost_package, wrong_address, poor_service, payment_issue, other
-- complaint_status: open, in_progress, resolved, closed, escalated
-- task_priority: low, medium, high, urgent
DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM public.user_profiles 
  WHERE role IN ('super-admin','admin','super_admin') LIMIT 1;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.user_profiles LIMIT 1;
  END IF;
  IF v_admin_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.complaints (ticket_number, subject, description, category, status, priority, customer_id, created_at)
  VALUES
    ('TKT-2026-0001', 'Package not delivered on time',     'Order BX-2026-00003 was supposed to arrive 3 days ago. Still in transit.',     'delivery_delay',  'open',        'high',   v_admin_id, NOW()-INTERVAL'2 days'),
    ('TKT-2026-0002', 'Wrong item delivered',              'I received a completely different item inside my package.',                      'wrong_address',   'in_progress', 'urgent', v_admin_id, NOW()-INTERVAL'1 day'),
    ('TKT-2026-0003', 'Package arrived damaged',           'Box was crushed during transport. Product inside is broken.',                   'damaged_package', 'in_progress', 'high',   v_admin_id, NOW()-INTERVAL'1 day'),
    ('TKT-2026-0004', 'Driver was rude to customer',       'Delivery driver was very impolite and unprofessional during handover.',         'poor_service',    'open',        'medium', v_admin_id, NOW()-INTERVAL'18 hours'),
    ('TKT-2026-0005', 'COD amount was overcharged',        'Driver collected MMK 2000 more than the stated COD amount.',                   'payment_issue',   'resolved',    'high',   v_admin_id, NOW()-INTERVAL'3 days'),
    ('TKT-2026-0006', 'Tracking not updating for 5 days',  'Status shows in_transit but has not changed in 5 days with no updates.',       'delivery_delay',  'open',        'medium', v_admin_id, NOW()-INTERVAL'12 hours'),
    ('TKT-2026-0007', 'Package left at wrong address',     'Delivery was left at a neighbor without my consent.',                          'wrong_address',   'open',        'high',   v_admin_id, NOW()-INTERVAL'6 hours'),
    ('TKT-2026-0008', 'Refund not processed after return', 'My returned shipment was confirmed received 5 days ago but no refund yet.',    'payment_issue',   'in_progress', 'medium', v_admin_id, NOW()-INTERVAL'4 hours'),
    ('TKT-2026-0009', 'No call before delivery attempt',   'Driver did not call before attempting delivery. I was not home.',              'poor_service',    'resolved',    'low',    v_admin_id, NOW()-INTERVAL'5 days'),
    ('TKT-2026-0010', 'Tracking says delivered not received','System shows delivered but I never received the package.',                   'lost_package',    'escalated',   'urgent', v_admin_id, NOW()-INTERVAL'2 hours')
  ON CONFLICT (ticket_number) DO NOTHING;
END $$;

-- Seed INVOICES with correct enum values
-- invoice_status: draft, sent, paid, overdue, cancelled
DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM public.user_profiles 
  WHERE role IN ('super-admin','admin','super_admin') LIMIT 1;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.user_profiles LIMIT 1;
  END IF;
  IF v_admin_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.invoices (invoice_number, merchant_id, billing_period_start, billing_period_end, subtotal, tax, discount, total, status, due_date, paid_at, payment_reference, line_items, created_by)
  VALUES
    ('INV-2026-0001', v_admin_id, '2026-03-01', '2026-03-31', 125000, 0, 0,    125000, 'paid',    '2026-04-01', NOW()-INTERVAL'15 days', 'KBZPAY-REF-001', '[{"description":"March delivery fees","quantity":50,"unit_price":2500,"total":125000}]',    v_admin_id),
    ('INV-2026-0002', v_admin_id, '2026-03-01', '2026-03-31',  87500, 0, 0,     87500, 'paid',    '2026-04-05', NOW()-INTERVAL'12 days', 'KBZPAY-REF-002', '[{"description":"Express delivery fees","quantity":25,"unit_price":3500,"total":87500}]',  v_admin_id),
    ('INV-2026-0003', v_admin_id, '2026-04-01', '2026-04-15', 215000, 0, 5000, 210000, 'paid',    '2026-04-20', NOW()-INTERVAL'5 days',  'WAVE-PAY-003',   '[{"description":"April 1-15 deliveries","quantity":72,"unit_price":2986,"total":215000}]', v_admin_id),
    ('INV-2026-0004', v_admin_id, '2026-04-01', '2026-04-15',  63000, 0, 0,     63000, 'sent',    '2026-04-25', NULL,                    NULL,             '[{"description":"Economy delivery fees","quantity":35,"unit_price":1800,"total":63000}]',  v_admin_id),
    ('INV-2026-0005', v_admin_id, '2026-04-01', '2026-04-15', 312000, 0, 0,    312000, 'sent',    '2026-04-28', NULL,                    NULL,             '[{"description":"Same-day delivery fees","quantity":60,"unit_price":5200,"total":312000}]', v_admin_id),
    ('INV-2026-0006', v_admin_id, '2026-04-01', '2026-04-17', 180000, 0, 0,    180000, 'draft',   '2026-04-30', NULL,                    NULL,             '[{"description":"Mixed service deliveries","quantity":45,"unit_price":4000,"total":180000}]', v_admin_id),
    ('INV-2026-0007', v_admin_id, '2026-03-15', '2026-03-31',  95000, 0, 0,     95000, 'overdue', '2026-04-10', NULL,                    NULL,             '[{"description":"March 15-31 deliveries","quantity":38,"unit_price":2500,"total":95000}]',  v_admin_id),
    ('INV-2026-0008', v_admin_id, '2026-03-01', '2026-03-14',  41000, 0, 0,     41000, 'overdue', '2026-04-08', NULL,                    NULL,             '[{"description":"March 1-14 deliveries","quantity":20,"unit_price":2050,"total":41000}]',   v_admin_id)
  ON CONFLICT (invoice_number) DO NOTHING;
END $$;
