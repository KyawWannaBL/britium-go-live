
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const results: Record<string, unknown> = {};

  try {
    // 1. Get existing profiles
    const { data: existingProfiles } = await supabase
      .from('user_profiles')
      .select('id, role, full_name')
      .limit(20);

    const profiles = existingProfiles || [];
    const adminProfile = profiles.find((p: { role: string }) =>
      ['super-admin', 'admin', 'super_admin'].includes(p.role)
    ) || profiles[0];

    if (!adminProfile) {
      return new Response(JSON.stringify({ error: 'No user profiles found.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const adminId: string = adminProfile.id;

    // 2. WAREHOUSES
    const warehouseRows = [
      {
        code: 'YGN-HUB-01', name: 'Yangon Main Hub', type: 'hub',
        address: { street: '45 Industrial Zone', city: 'Yangon', state: 'Yangon', country: 'Myanmar' },
        capacity: { total: 5000, used: 1820, unit: 'packages' },
        operating_hours: { open: '08:00', close: '20:00', days: 'Mon-Sun' },
        status: 'operational',
      },
      {
        code: 'MDY-WH-01', name: 'Mandalay Warehouse', type: 'branch',
        address: { street: '12 Chan Aye Tharzan Rd', city: 'Mandalay', state: 'Mandalay', country: 'Myanmar' },
        capacity: { total: 2000, used: 640, unit: 'packages' },
        operating_hours: { open: '08:00', close: '18:00', days: 'Mon-Sat' },
        status: 'operational',
      },
      {
        code: 'NPT-DEP-01', name: 'Naypyidaw Depot', type: 'branch',
        address: { street: '88 Naypyidaw Business Park', city: 'Naypyidaw', state: 'NPT', country: 'Myanmar' },
        capacity: { total: 1000, used: 210, unit: 'packages' },
        operating_hours: { open: '07:00', close: '17:00', days: 'Mon-Sat' },
        status: 'operational',
      },
      {
        code: 'BGO-TP-01', name: 'Bago Transit Point', type: 'sorting-center',
        address: { street: '5 Station Road', city: 'Bago', state: 'Bago', country: 'Myanmar' },
        capacity: { total: 500, used: 88, unit: 'packages' },
        operating_hours: { open: '08:00', close: '18:00', days: 'Mon-Sat' },
        status: 'operational',
      },
    ];

    const { data: wInserted, error: wErr } = await supabase
      .from('warehouses')
      .upsert(warehouseRows, { onConflict: 'code', ignoreDuplicates: false })
      .select('id, code, name');
    results.warehouses = wErr ? { error: wErr.message } : wInserted;

    const warehouses = (wInserted || []) as Array<{ id: string; code: string; name: string }>;
    const wYgn = warehouses.find((w) => w.code === 'YGN-HUB-01');
    const wMdy = warehouses.find((w) => w.code === 'MDY-WH-01');
    const wNpt = warehouses.find((w) => w.code === 'NPT-DEP-01');
    const wBgo = warehouses.find((w) => w.code === 'BGO-TP-01');
    const fallbackId = wYgn?.id || '';

    // 3. VEHICLES
    if (wYgn?.id) {
      const vehicleRows = [
        { registration_number: 'YGN-1234-A', type: 'van',   capacity: { weight_kg: 1000, volume_m3: 8  }, status: 'available', warehouse_id: wYgn.id },
        { registration_number: 'YGN-5678-B', type: 'van',   capacity: { weight_kg: 800,  volume_m3: 6  }, status: 'in_use',    warehouse_id: wYgn.id },
        { registration_number: 'YGN-9012-C', type: 'truck', capacity: { weight_kg: 3000, volume_m3: 20 }, status: 'available', warehouse_id: wYgn.id },
        { registration_number: 'MDY-1111-A', type: 'van',   capacity: { weight_kg: 1000, volume_m3: 8  }, status: 'available', warehouse_id: wMdy?.id || wYgn.id },
        { registration_number: 'MDY-2222-B', type: 'bike',  capacity: { weight_kg: 80,   volume_m3: 0.5}, status: 'in_use',    warehouse_id: wMdy?.id || wYgn.id },
        { registration_number: 'YGN-3344-D', type: 'van',   capacity: { weight_kg: 1200, volume_m3: 9  }, status: 'available', warehouse_id: wYgn.id },
        { registration_number: 'NPT-5566-A', type: 'van',   capacity: { weight_kg: 800,  volume_m3: 6  }, status: 'available', warehouse_id: wNpt?.id || wYgn.id },
        { registration_number: 'YGN-7788-E', type: 'truck', capacity: { weight_kg: 4000, volume_m3: 25 }, status: 'available', warehouse_id: wYgn.id },
      ];
      const { error: vErr } = await supabase
        .from('vehicles')
        .upsert(vehicleRows, { onConflict: 'registration_number', ignoreDuplicates: true });
      results.vehicles = vErr ? { error: vErr.message } : 'OK';
    }

    // 4. SHIPMENTS
    const now = new Date();
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

    const shipmentRows = [
      { awb: 'BX-2026-00001', merchant_id: adminId, service_type: 'express',  status: 'delivered',        cod_amount: 15000, shipping_fee: 4500, payment_method: 'cod',     payment_status: 'verified',  sender: { name: 'Aung Thu Shop',      phone: '+95911111111', address: { city: 'Yangon'     }}, recipient: { name: 'Ko Kyaw Zin',      phone: '+95922222222', address: { street: '15 Zay St',     city: 'Mandalay'   }}, package_details: { weight: 2.5, description: 'Electronics'    }, created_at: daysAgo(10), created_by: adminId },
      { awb: 'BX-2026-00002', merchant_id: adminId, service_type: 'standard', status: 'delivered',        cod_amount:  8000, shipping_fee: 2500, payment_method: 'cod',     payment_status: 'verified',  sender: { name: 'Thin Thin Store',     phone: '+95911111112', address: { city: 'Yangon'     }}, recipient: { name: 'Ma Aye Myat',      phone: '+95922222223', address: { street: '8 Yaza Rd',     city: 'Naypyidaw'  }}, package_details: { weight: 1.2, description: 'Clothing'       }, created_at: daysAgo(9),  created_by: adminId },
      { awb: 'BX-2026-00003', merchant_id: adminId, service_type: 'standard', status: 'in_transit',       cod_amount:     0, shipping_fee: 3000, payment_method: 'prepaid', payment_status: 'deposited', sender: { name: 'Kyaw Electronics',    phone: '+95911111113', address: { city: 'Mandalay'   }}, recipient: { name: 'U Thant Zin',      phone: '+95922222224', address: { street: '44 Shwemawdaw', city: 'Bago'       }}, package_details: { weight: 3.0, description: 'Computer parts'  }, created_at: daysAgo(8),  created_by: adminId },
      { awb: 'BX-2026-00004', merchant_id: adminId, service_type: 'economy',  status: 'delivered',        cod_amount: 12000, shipping_fee: 2000, payment_method: 'cod',     payment_status: 'verified',  sender: { name: 'Online Fashion',      phone: '+95911111114', address: { city: 'Yangon'     }}, recipient: { name: 'Ma Su Hlaing',     phone: '+95922222225', address: { street: '2 Inya Lake',   city: 'Pathein'    }}, package_details: { weight: 0.8, description: 'Clothes'        }, created_at: daysAgo(7),  created_by: adminId },
      { awb: 'BX-2026-00005', merchant_id: adminId, service_type: 'express',  status: 'delivered',        cod_amount:     0, shipping_fee: 6500, payment_method: 'prepaid', payment_status: 'deposited', sender: { name: 'Tech Hub Myanmar',    phone: '+95911111115', address: { city: 'Yangon'     }}, recipient: { name: 'Ko Myo Aung',      phone: '+95922222226', address: { street: '77 78th St',    city: 'Mandalay'   }}, package_details: { weight: 5.0, description: 'Laptop'         }, created_at: daysAgo(6),  created_by: adminId },
      { awb: 'BX-2026-00006', merchant_id: adminId, service_type: 'express',  status: 'in_transit',       cod_amount: 45000, shipping_fee: 5000, payment_method: 'cod',     payment_status: 'pending',   sender: { name: 'Shwe Yatha Gems',     phone: '+95911111116', address: { city: 'Mandalay'   }}, recipient: { name: 'Daw Khin May',     phone: '+95922222227', address: { street: '18 Merchant',   city: 'Yangon'     }}, package_details: { weight: 0.5, description: 'Jewelry'        }, created_at: daysAgo(5),  created_by: adminId },
      { awb: 'BX-2026-00007', merchant_id: adminId, service_type: 'standard', status: 'pending',          cod_amount: 18000, shipping_fee: 3200, payment_method: 'cod',     payment_status: 'pending',   sender: { name: 'Cool Gadgets',        phone: '+95911111117', address: { city: 'Yangon'     }}, recipient: { name: 'Ko Pyae Phyo',     phone: '+95922222228', address: { street: '12 Strand',     city: 'Mawlamyine' }}, package_details: { weight: 2.0, description: 'Phone'          }, created_at: daysAgo(4),  created_by: adminId },
      { awb: 'BX-2026-00008', merchant_id: adminId, service_type: 'standard', status: 'delivered',        cod_amount:  9500, shipping_fee: 2800, payment_method: 'cod',     payment_status: 'verified',  sender: { name: 'Bloom Beauty',        phone: '+95911111118', address: { city: 'Yangon'     }}, recipient: { name: 'Ma Ei Phyu',       phone: '+95922222229', address: { street: '55 Yoma',       city: 'Naypyidaw'  }}, package_details: { weight: 1.5, description: 'Cosmetics'      }, created_at: daysAgo(3),  created_by: adminId },
      { awb: 'BX-2026-00009', merchant_id: adminId, service_type: 'economy',  status: 'delivered',        cod_amount:     0, shipping_fee: 3500, payment_method: 'prepaid', payment_status: 'deposited', sender: { name: 'Myanmar Books',       phone: '+95911111119', address: { city: 'Yangon'     }}, recipient: { name: 'Ko Thet Oo',       phone: '+95922222230', address: { street: '25 Lashio Rd',  city: 'Mandalay'   }}, package_details: { weight: 4.0, description: 'Books'          }, created_at: daysAgo(3),  created_by: adminId },
      { awb: 'BX-2026-00010', merchant_id: adminId, service_type: 'express',  status: 'in_transit',       cod_amount:     0, shipping_fee: 7000, payment_method: 'prepaid', payment_status: 'deposited', sender: { name: 'Alpha Pharma',        phone: '+95911111120', address: { city: 'Yangon'     }}, recipient: { name: 'Dr Win Naing',     phone: '+95922222231', address: { street: '10 Shan Rd',    city: 'Taunggyi'   }}, package_details: { weight: 3.5, description: 'Medicine'       }, created_at: daysAgo(2),  created_by: adminId },
      { awb: 'BX-2026-00011', merchant_id: adminId, service_type: 'standard', status: 'pending',          cod_amount: 22000, shipping_fee: 3000, payment_method: 'cod',     payment_status: 'pending',   sender: { name: 'Pyone Cho Fashion',   phone: '+95911111121', address: { city: 'Mandalay'   }}, recipient: { name: 'Ma Hnin Pwint',    phone: '+95922222232', address: { street: '3 Kaba Aye',    city: 'Yangon'     }}, package_details: { weight: 1.8, description: 'Dress'          }, created_at: daysAgo(2),  created_by: adminId },
      { awb: 'BX-2026-00012', merchant_id: adminId, service_type: 'standard', status: 'failed',           cod_amount:     0, shipping_fee: 4000, payment_method: 'prepaid', payment_status: 'pending',   sender: { name: 'Bright Star',         phone: '+95911111122', address: { city: 'Yangon'     }}, recipient: { name: 'U Zaw Win',        phone: '+95922222233', address: { street: '8 Station Rd',  city: 'Bago'       }}, package_details: { weight: 6.0, description: 'Hardware'       }, created_at: daysAgo(1),  created_by: adminId },
      { awb: 'BX-2026-00013', merchant_id: adminId, service_type: 'express',  status: 'out_for_delivery', cod_amount: 16000, shipping_fee: 4800, payment_method: 'cod',     payment_status: 'pending',   sender: { name: 'Myo Family Shop',     phone: '+95911111123', address: { city: 'Yangon'     }}, recipient: { name: 'Ko Aung Myo',      phone: '+95922222234', address: { street: '66 83rd St',    city: 'Mandalay'   }}, package_details: { weight: 2.2, description: 'Food'           }, created_at: daysAgo(1),  created_by: adminId },
      { awb: 'BX-2026-00014', merchant_id: adminId, service_type: 'economy',  status: 'delivered',        cod_amount:  7500, shipping_fee: 1800, payment_method: 'cod',     payment_status: 'verified',  sender: { name: 'Digital Dreams',      phone: '+95911111124', address: { city: 'Yangon'     }}, recipient: { name: 'Ma Khaing Zin',    phone: '+95922222235', address: { street: '14 Strand',     city: 'Pathein'    }}, package_details: { weight: 0.6, description: 'USB drive'      }, created_at: daysAgo(1),  created_by: adminId },
      { awb: 'BX-2026-00015', merchant_id: adminId, service_type: 'same_day', status: 'delivered',        cod_amount:  5000, shipping_fee: 5500, payment_method: 'cod',     payment_status: 'collected', sender: { name: 'Nilar Flowers',       phone: '+95911111125', address: { city: 'Mandalay'   }}, recipient: { name: 'Ma Thida Soe',     phone: '+95922222236', address: { street: '22 Thabyegone', city: 'Naypyidaw'  }}, package_details: { weight: 0.3, description: 'Flowers'        }, created_at: daysAgo(0),  created_by: adminId },
      { awb: 'BX-2026-00016', merchant_id: adminId, service_type: 'standard', status: 'pending',          cod_amount: 28000, shipping_fee: 3400, payment_method: 'cod',     payment_status: 'pending',   sender: { name: 'Golden Star Market',  phone: '+95911111126', address: { city: 'Yangon'     }}, recipient: { name: 'Ko Kyaw Myo Htun', phone: '+95922222237', address: { street: '5 Bogyoke',     city: 'Mawlamyine' }}, package_details: { weight: 3.8, description: 'Furniture parts'}, created_at: daysAgo(0),  created_by: adminId },
      { awb: 'BX-2026-00017', merchant_id: adminId, service_type: 'same_day', status: 'in_transit',       cod_amount: 11000, shipping_fee: 4200, payment_method: 'cod',     payment_status: 'pending',   sender: { name: 'Sun Electronics',     phone: '+95911111127', address: { city: 'Yangon'     }}, recipient: { name: 'Daw Than Than',    phone: '+95922222238', address: { street: '88 Insein Rd',  city: 'Yangon'     }}, package_details: { weight: 1.1, description: 'Charger'        }, created_at: daysAgo(0),  created_by: adminId },
      { awb: 'BX-2026-00018', merchant_id: adminId, service_type: 'express',  status: 'pending',          cod_amount: 19500, shipping_fee: 4900, payment_method: 'cod',     payment_status: 'pending',   sender: { name: 'Aung Kyaw Trading',   phone: '+95911111128', address: { city: 'Mandalay'   }}, recipient: { name: 'Ma Sandar Win',    phone: '+95922222239', address: { street: '44 Botahtaung', city: 'Yangon'     }}, package_details: { weight: 2.7, description: 'Tiles'          }, created_at: daysAgo(0),  created_by: adminId },
      { awb: 'BX-2026-00019', merchant_id: adminId, service_type: 'standard', status: 'out_for_delivery', cod_amount:     0, shipping_fee: 3800, payment_method: 'prepaid', payment_status: 'deposited', sender: { name: 'MegaMart Online',     phone: '+95911111129', address: { city: 'Yangon'     }}, recipient: { name: 'Ko Thura Aung',    phone: '+95922222240', address: { street: '12 Palace Rd',  city: 'Mandalay'   }}, package_details: { weight: 4.5, description: 'Groceries'      }, created_at: daysAgo(0),  created_by: adminId },
      { awb: 'BX-2026-00020', merchant_id: adminId, service_type: 'standard', status: 'pending',          cod_amount: 13500, shipping_fee: 2600, payment_method: 'cod',     payment_status: 'pending',   sender: { name: 'Star Cosmetics',      phone: '+95911111130', address: { city: 'Yangon'     }}, recipient: { name: 'Ma Wai Phyo Oo',   phone: '+95922222241', address: { street: '77 Pyinmana',   city: 'Naypyidaw'  }}, package_details: { weight: 0.9, description: 'Skincare'       }, created_at: daysAgo(0),  created_by: adminId },
    ];

    const { data: sInserted, error: sErr } = await supabase
      .from('shipments')
      .upsert(shipmentRows, { onConflict: 'awb', ignoreDuplicates: true })
      .select('id, awb, status');
    results.shipments = sErr ? { error: sErr.message } : `${sInserted?.length || 0} rows`;

    // 5. COMPLAINTS
    const complaintRows = [
      { ticket_number: 'TKT-2026-0001', subject: 'Package not delivered on time',    description: 'Order BX-2026-00003 was supposed to arrive 3 days ago. Still in transit.',  category: 'delayed_delivery', status: 'open',        priority: 'high',   customer_id: adminId },
      { ticket_number: 'TKT-2026-0002', subject: 'Wrong item delivered',             description: 'I received a completely different item inside my package.',                   category: 'wrong_item',       status: 'in_progress', priority: 'urgent', customer_id: adminId },
      { ticket_number: 'TKT-2026-0003', subject: 'Package arrived damaged',          description: 'Box was crushed during transport. Product inside is broken.',                category: 'damaged_package',  status: 'in_progress', priority: 'high',   customer_id: adminId },
      { ticket_number: 'TKT-2026-0004', subject: 'Driver was rude to customer',      description: 'Delivery driver was very impolite and unprofessional during handover.',      category: 'driver_behavior',  status: 'open',        priority: 'medium', customer_id: adminId },
      { ticket_number: 'TKT-2026-0005', subject: 'COD amount was overcharged',       description: 'Driver collected MMK 2000 more than the stated COD amount.',               category: 'billing_issue',    status: 'resolved',    priority: 'high',   customer_id: adminId, resolved_at: daysAgo(1), resolution: 'Refund issued to customer' },
      { ticket_number: 'TKT-2026-0006', subject: 'Tracking not updating for 5 days', description: 'Status shows in transit but has not changed in 5 days with no updates.',  category: 'tracking_issue',   status: 'open',        priority: 'medium', customer_id: adminId },
      { ticket_number: 'TKT-2026-0007', subject: 'Package left at wrong address',    description: 'Delivery was left at a neighbor without my consent.',                       category: 'delivery_issue',   status: 'open',        priority: 'high',   customer_id: adminId },
      { ticket_number: 'TKT-2026-0008', subject: 'Refund not processed after return','description': 'My returned shipment was confirmed received 5 days ago but no refund.', category: 'billing_issue',    status: 'in_progress', priority: 'medium', customer_id: adminId },
      { ticket_number: 'TKT-2026-0009', subject: 'No call before delivery attempt',  description: 'Driver did not call before attempting delivery. I was not home.',          category: 'delivery_issue',   status: 'resolved',    priority: 'low',    customer_id: adminId, resolved_at: daysAgo(3), resolution: 'Rescheduled delivery successfully' },
      { ticket_number: 'TKT-2026-0010', subject: 'Tracking says delivered not received','description': 'System shows delivered but I never received the package.',           category: 'missing_package',  status: 'open',        priority: 'urgent', customer_id: adminId },
    ];

    const { error: cErr } = await supabase
      .from('complaints')
      .upsert(complaintRows, { onConflict: 'ticket_number', ignoreDuplicates: true });
    results.complaints = cErr ? { error: cErr.message } : 'OK';

    // 6. INVOICES
    const invoiceRows = [
      { invoice_number: 'INV-2026-0001', merchant_id: adminId, billing_period_start: '2026-03-01', billing_period_end: '2026-03-31', subtotal: 125000, tax: 0, discount: 0,    total: 125000, status: 'paid',    due_date: '2026-04-01', paid_at: daysAgo(15), payment_reference: 'KBZPAY-001', line_items: [{ description: 'March delivery fees', quantity: 50, unit_price: 2500, total: 125000 }], created_by: adminId },
      { invoice_number: 'INV-2026-0002', merchant_id: adminId, billing_period_start: '2026-03-01', billing_period_end: '2026-03-31', subtotal: 87500,  tax: 0, discount: 0,    total: 87500,  status: 'paid',    due_date: '2026-04-05', paid_at: daysAgo(12), payment_reference: 'KBZPAY-002', line_items: [{ description: 'Express delivery fees', quantity: 25, unit_price: 3500, total: 87500 }],  created_by: adminId },
      { invoice_number: 'INV-2026-0003', merchant_id: adminId, billing_period_start: '2026-04-01', billing_period_end: '2026-04-15', subtotal: 215000, tax: 0, discount: 5000, total: 210000, status: 'paid',    due_date: '2026-04-20', paid_at: daysAgo(5),  payment_reference: 'WAVE-003',   line_items: [{ description: 'April 1-15 deliveries', quantity: 72, unit_price: 2986, total: 215000 }], created_by: adminId },
      { invoice_number: 'INV-2026-0004', merchant_id: adminId, billing_period_start: '2026-04-01', billing_period_end: '2026-04-15', subtotal: 63000,  tax: 0, discount: 0,    total: 63000,  status: 'pending', due_date: '2026-04-25', paid_at: null,         line_items: [{ description: 'Economy delivery fees', quantity: 35, unit_price: 1800, total: 63000 }],  created_by: adminId },
      { invoice_number: 'INV-2026-0005', merchant_id: adminId, billing_period_start: '2026-04-01', billing_period_end: '2026-04-15', subtotal: 312000, tax: 0, discount: 0,    total: 312000, status: 'pending', due_date: '2026-04-28', paid_at: null,         line_items: [{ description: 'Same-day delivery fees', quantity: 60, unit_price: 5200, total: 312000 }], created_by: adminId },
      { invoice_number: 'INV-2026-0006', merchant_id: adminId, billing_period_start: '2026-04-01', billing_period_end: '2026-04-17', subtotal: 180000, tax: 0, discount: 0,    total: 180000, status: 'pending', due_date: '2026-04-30', paid_at: null,         line_items: [{ description: 'Mixed service deliveries', quantity: 45, unit_price: 4000, total: 180000 }], created_by: adminId },
      { invoice_number: 'INV-2026-0007', merchant_id: adminId, billing_period_start: '2026-03-15', billing_period_end: '2026-03-31', subtotal: 95000,  tax: 0, discount: 0,    total: 95000,  status: 'overdue', due_date: '2026-04-10', paid_at: null,         line_items: [{ description: 'March 15-31 deliveries', quantity: 38, unit_price: 2500, total: 95000 }],  created_by: adminId },
      { invoice_number: 'INV-2026-0008', merchant_id: adminId, billing_period_start: '2026-03-01', billing_period_end: '2026-03-14', subtotal: 41000,  tax: 0, discount: 0,    total: 41000,  status: 'overdue', due_date: '2026-04-08', paid_at: null,         line_items: [{ description: 'March 1-14 deliveries', quantity: 20, unit_price: 2050, total: 41000 }],   created_by: adminId },
    ];

    const { error: iErr } = await supabase
      .from('invoices')
      .upsert(invoiceRows, { onConflict: 'invoice_number', ignoreDuplicates: true });
    results.invoices = iErr ? { error: iErr.message } : 'OK';

    // 7. MANIFESTS
    if (wYgn?.id) {
      const manifestRows = [
        { manifest_number: 'MNF-2026-0001', driver_id: adminId, warehouse_id: wYgn.id,           status: 'completed',   scheduled_date: new Date(now.getTime() - 3 * 86400000).toISOString().split('T')[0], total_shipments: 12, completed_shipments: 11, failed_shipments: 1, route_data: { zone: 'Yangon North',      stops: 12 } },
        { manifest_number: 'MNF-2026-0002', driver_id: adminId, warehouse_id: wYgn.id,           status: 'completed',   scheduled_date: new Date(now.getTime() - 2 * 86400000).toISOString().split('T')[0], total_shipments:  8, completed_shipments:  8, failed_shipments: 0, route_data: { zone: 'Yangon South',      stops:  8 } },
        { manifest_number: 'MNF-2026-0003', driver_id: adminId, warehouse_id: wMdy?.id || fallbackId, status: 'in_progress', scheduled_date: new Date(now.getTime() - 1 * 86400000).toISOString().split('T')[0], total_shipments: 15, completed_shipments:  9, failed_shipments: 0, route_data: { zone: 'Mandalay Central', stops: 15 } },
        { manifest_number: 'MNF-2026-0004', driver_id: adminId, warehouse_id: wYgn.id,           status: 'in_progress', scheduled_date: new Date().toISOString().split('T')[0],                             total_shipments: 10, completed_shipments:  4, failed_shipments: 0, route_data: { zone: 'Yangon East',       stops: 10 } },
        { manifest_number: 'MNF-2026-0005', driver_id: adminId, warehouse_id: wNpt?.id || wYgn.id, status: 'assigned',  scheduled_date: new Date().toISOString().split('T')[0],                             total_shipments:  6, completed_shipments:  0, failed_shipments: 0, route_data: { zone: 'Naypyidaw A',       stops:  6 } },
        { manifest_number: 'MNF-2026-0006', driver_id: adminId, warehouse_id: wBgo?.id || wYgn.id, status: 'draft',     scheduled_date: new Date(now.getTime() + 86400000).toISOString().split('T')[0],     total_shipments:  9, completed_shipments:  0, failed_shipments: 0, route_data: { zone: 'Bago-Yangon',       stops:  9 } },
      ];
      const { error: mErr } = await supabase
        .from('manifests')
        .upsert(manifestRows, { onConflict: 'manifest_number', ignoreDuplicates: true });
      results.manifests = mErr ? { error: mErr.message } : `${manifestRows.length} rows`;
    }

    // 8. ATTENDANCE & LEAVE for existing users
    const driverProfiles = profiles.filter((p: { role: string }) =>
      ['driver', 'rider', 'warehouse_staff', 'supervisor', 'branch_office', 'data_entry'].includes(p.role)
    ).slice(0, 4);
    const staffList = driverProfiles.length > 0 ? driverProfiles : [adminProfile];

    const attendanceRows: Record<string, unknown>[] = [];
    for (const [idx, emp] of staffList.entries()) {
      const todayDate = new Date().toISOString().split('T')[0];
      const yesterdayDate = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
      attendanceRows.push({
        employee_id: (emp as { id: string }).id,
        date: todayDate,
        check_in: new Date(now.getTime() - (8 - idx) * 3600000).toISOString(),
        check_out: idx === 0 ? new Date(now.getTime() - 1800000).toISOString() : null,
        status: idx === 2 ? 'late' : 'present',
      });
      attendanceRows.push({
        employee_id: (emp as { id: string }).id,
        date: yesterdayDate,
        check_in: new Date(now.getTime() - 86400000 - (8 * 3600000)).toISOString(),
        check_out: new Date(now.getTime() - 86400000 - (1 * 3600000)).toISOString(),
        status: 'present',
      });
    }

    if (attendanceRows.length > 0) {
      const { error: aErr } = await supabase
        .from('attendance')
        .upsert(attendanceRows, { onConflict: 'employee_id,date', ignoreDuplicates: true });
      results.attendance = aErr ? { error: aErr.message } : `${attendanceRows.length} rows`;
    }

    // 9. LEAVE REQUESTS
    const leaveRows = staffList.slice(0, 3).map((emp: unknown, idx: number) => ({
      employee_id: (emp as { id: string }).id,
      leave_type: ['annual', 'sick', 'emergency'][idx] as string,
      start_date: new Date(now.getTime() + (3 + idx * 2) * 86400000).toISOString().split('T')[0],
      end_date: new Date(now.getTime() + (5 + idx * 2) * 86400000).toISOString().split('T')[0],
      days_count: 3,
      reason: ['Family trip to Bagan', 'Medical appointment', 'Personal emergency'][idx],
      status: idx === 1 ? 'approved' : 'pending',
    }));

    if (leaveRows.length > 0) {
      const { error: lErr } = await supabase.from('leave_requests').insert(leaveRows);
      results.leave_requests = lErr ? { error: lErr.message } : `${leaveRows.length} rows`;
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message, results }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
