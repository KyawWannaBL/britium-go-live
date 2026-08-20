export type MerchantMaster = {
  merchant_code: string;
  merchant_name: string;
  business_type?: string;
  payment_terms?: string;
  default_pickup_address?: string;
  address_line_1?: string;
  township?: string;
  city?: string;
  region_state?: string;
  phone_primary?: string;
  customer_tier?: string;
  base_fee?: number;
  delivery_charge?: number;
};

export type WorkforceMaster = {
  code: string;
  name: string;
  role: 'RIDER' | 'DRIVER' | 'HELPER' | string;
  status?: string;
  branch_code?: string;
  assigned_zone?: string;
};

export type FleetMaster = {
  id: string;
  vehicle_no: string;
  vehicle_type?: string;
  ownership_type?: string;
  status?: string;
  branch_code?: string;
};

export type DropdownOptions = Record<string, string[]>;

export const FALLBACK_DROPDOWNS: DropdownOptions = {
  business_type: ['Retail', 'Wholesale', 'E-commerce', 'Marketplace', 'Corporate', 'SME', 'Individual Seller', 'Online Shop', 'Book Store', 'Branch Office'],
  payment_terms: ['COD', 'Prepaid', 'Monthly Billing', 'Merchant Credit', 'Bank Transfer', 'KBZ Pay'],
  township: ['Ahlone', 'Bahan', 'Dagon', 'Hlaing', 'Insein', 'Kamayut', 'North Dagon', 'South Dagon', 'Tamwe', 'Thaketa', 'Thingangyun', 'Yankin', 'Mandalay', 'Naypyidaw'],
  vehicle_type: ['Bike', 'Van', 'Mini Truck', 'Truck', 'Car', 'Partner Vehicle'],
  city: ['Yangon', 'Mandalay', 'Naypyidaw'],
  region_state: ['Yangon Region', 'Mandalay Region', 'Naypyidaw Union Territory'],
};

export function resolveBranchCode(input: { city?: string; township?: string; address?: string }) {
  const text = `${input.city || ''} ${input.township || ''} ${input.address || ''}`.toLowerCase();
  if (text.includes('mandalay')) return 'MDY';
  if (text.includes('naypyidaw') || text.includes('naypyitaw') || text.includes('npt')) return 'NPT';
  return 'YGN';
}

export function getDropdownOptions(options: DropdownOptions, key: string) {
  return Array.from(new Set([...(options[key] || []), ...(FALLBACK_DROPDOWNS[key] || [])])).filter(Boolean);
}

export async function loadDropdownOptions(supabase: any): Promise<DropdownOptions> {
  try {
    const { data, error } = await supabase
      .from('be_master_data_options')
      .select('*')
      .eq('is_active', true)
      .order('dropdown_name', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const grouped: DropdownOptions = { ...FALLBACK_DROPDOWNS };

    (data || []).forEach((row: any) => {
      const key = row.dropdown_name || row.option_group || row.master_type || row.field_name;
      const value = row.value || row.option_value || row.label || row.status_name_en;
      if (!key || !value) return;
      grouped[key] = grouped[key] || [];
      if (!grouped[key].includes(value)) grouped[key].push(value);
    });

    return grouped;
  } catch {
    return { ...FALLBACK_DROPDOWNS };
  }
}

export async function loadMasterSnapshot(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('be_master_data_page_snapshot');
    if (error) throw error;
    return data || {};
  } catch {
    return {};
  }
}

export function normalizeMerchant(row: any): MerchantMaster {
  return {
    merchant_code: row.merchant_code || row.code || row.id || '',
    merchant_name: row.merchant_name || row.name || row.display_name || '',
    business_type: row.business_type || '',
    payment_terms: row.payment_terms || '',
    default_pickup_address: row.default_pickup_address || row.address_line_1 || row.address || '',
    address_line_1: row.address_line_1 || row.address || '',
    township: row.township || row.town || '',
    city: row.city || '',
    region_state: row.region_state || row.state_region || '',
    phone_primary: row.phone_primary || row.phone || '',
    customer_tier: row.customer_tier || row.tier || 'Standard',
    base_fee: Number(row.base_fee || row.delivery_charge || row.standard_delivery_fee || 4000),
    delivery_charge: Number(row.delivery_charge || row.base_fee || row.standard_delivery_fee || 4000),
  };
}

export async function loadMerchantMasters(supabase: any): Promise<MerchantMaster[]> {
  const snapshot = await loadMasterSnapshot(supabase);
  const snapshotRows =
    snapshot.merchants ||
    snapshot.merchant_master ||
    snapshot.Merchant_Master ||
    snapshot.merchantMaster ||
    [];

  if (snapshotRows.length) {
    return snapshotRows.map(normalizeMerchant).filter((m: MerchantMaster) => m.merchant_code && m.merchant_name);
  }

  const tableCandidates = ['be_merchant_master', 'be_master_merchants', 'merchant_master'];

  for (const table of tableCandidates) {
    try {
      const { data, error } = await supabase.from(table).select('*').eq('is_active', true);
      if (error) throw error;
      if (data?.length) return data.map(normalizeMerchant).filter((m: MerchantMaster) => m.merchant_code && m.merchant_name);
    } catch {
      // try next table name
    }
  }

  return [];
}

function normalizeWorker(row: any, fallbackRole = ''): WorkforceMaster {
  const role = String(row.role || row.workforce_role || row.employee_type || fallbackRole || '').toUpperCase();

  return {
    code: row.workforce_code || row.rider_id || row.driver_id || row.helper_id || row.employee_id || row.code || row.id || '',
    name: row.full_name || row.rider_name || row.driver_name || row.helper_name || row.employee_name || row.name || '',
    role,
    status: row.status || row.record_status || (row.is_active === false ? 'Inactive' : 'Active'),
    branch_code: row.branch_code,
    assigned_zone: row.assigned_zone || row.zone,
  };
}

function normalizeFleet(row: any): FleetMaster {
  return {
    id: row.fleet_id || row.id || row.vehicle_id || '',
    vehicle_no: row.vehicle_no || row.plate || row.vehicle_plate || row.plate_no || '',
    vehicle_type: row.vehicle_type || row.type || '',
    ownership_type: row.ownership_type || '',
    status: row.status || row.fleet_status || 'Available',
    branch_code: row.branch_code,
  };
}

export async function loadAssignmentMasters(supabase: any) {
  const snapshot = await loadMasterSnapshot(supabase);

  let workforceRows = [
    ...(snapshot.workforce || []),
    ...(snapshot.riders || []).map((r: any) => ({ ...r, role: 'RIDER' })),
    ...(snapshot.drivers || []).map((r: any) => ({ ...r, role: 'DRIVER' })),
    ...(snapshot.helpers || []).map((r: any) => ({ ...r, role: 'HELPER' })),
  ];

  let fleetRows = snapshot.fleets || snapshot.fleet_master || snapshot.Fleet_Master || [];

  if (!workforceRows.length) {
    try {
      const { data } = await supabase.from('be_mobile_workforce_accounts').select('*');
      workforceRows = data || [];
    } catch {
      workforceRows = [];
    }
  }

  if (!fleetRows.length) {
    for (const table of ['be_fleet_master', 'be_fleet_vehicles', 'fleet_master']) {
      try {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        if (data?.length) {
          fleetRows = data;
          break;
        }
      } catch {
        // try next table
      }
    }
  }

  const workers = workforceRows.map((row: any) => normalizeWorker(row)).filter((w: WorkforceMaster) => w.code);
  const activeWorkers = workers.filter((w: WorkforceMaster) => !['INACTIVE', 'SUSPENDED', 'BLACKLISTED'].includes(String(w.status || '').toUpperCase()));

  const fleets = fleetRows
    .map(normalizeFleet)
    .filter((f: FleetMaster) => f.id && f.vehicle_no)
    .filter((f: FleetMaster) => !['INACTIVE', 'MAINTENANCE'].includes(String(f.status || '').toUpperCase()));

  return {
    riders: activeWorkers.filter((w: WorkforceMaster) => w.role === 'RIDER'),
    drivers: activeWorkers.filter((w: WorkforceMaster) => w.role === 'DRIVER'),
    helpers: activeWorkers.filter((w: WorkforceMaster) => w.role === 'HELPER'),
    workers: activeWorkers,
    fleets,
  };
}

export async function submitCanonicalPickup(supabase: any, payload: any) {
  try {
    const { data, error } = await supabase.rpc('be_submit_pickup_request', {
      p_source_channel: payload.source_channel || 'CUSTOMER_SERVICE',
      p_payload: payload,
    });

    if (error) throw error;
    return data;
  } catch {
    const { data, error } = await supabase
      .from('be_portal_pickup_requests')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }
}

export async function assignPickupResources(
  supabase: any,
  payload: {
    waybill_no?: string;
    pickup_id?: string;
    rider_code?: string;
    driver_code?: string;
    helper_code?: string;
    fleet_id?: string;
    note?: string;
  },
) {
  try {
    const { data, error } = await supabase.rpc('be_assign_pickup_workforce', {
      p_waybill_no: payload.waybill_no || null,
      p_pickup_id: payload.pickup_id || null,
      p_rider_code: payload.rider_code || null,
      p_driver_code: payload.driver_code || null,
      p_helper_code: payload.helper_code || null,
      p_fleet_id: payload.fleet_id || null,
      p_note: payload.note || null,
    });

    if (error) throw error;
    return data;
  } catch {
    const updatePayload = {
      item_status: 'READY_FOR_DELIVERY',
      assigned_rider_code: payload.rider_code || null,
      assigned_driver_code: payload.driver_code || null,
      assigned_helper_code: payload.helper_code || null,
      assigned_fleet_id: payload.fleet_id || null,
      assigned_at: new Date().toISOString(),
      remarks: payload.note || null,
    };

    let query = supabase.from('be_portal_pickup_request_items').update(updatePayload);

    if (payload.waybill_no) query = query.eq('waybill_no', payload.waybill_no);
    else query = query.eq('pickup_id', payload.pickup_id);

    const { data, error } = await query.select('*');

    if (error) throw error;
    return data;
  }
}

export function calculateMerchantTemplateRow(row: any, merchant?: MerchantMaster) {
  const codAmount = Number(row.cod_amount || 0);
  const totalKg = Number(row.total_kg || 0);
  const tier = merchant?.customer_tier || 'Standard';
  const allowance = tier === 'Royal' ? 5 : 3;
  const roundedKg = Math.ceil(Math.max(0, totalKg));
  const extraKg = Math.max(0, roundedKg - allowance);
  const deliveryCharges = Number(merchant?.delivery_charge || merchant?.base_fee || 4000);
  const extraKgCharges = extraKg * 500;
  const totalCollectedAmount = codAmount + deliveryCharges + extraKgCharges;

  return {
    ...row,
    cod_amount: codAmount,
    total_kg: totalKg,
    delivery_charges: deliveryCharges,
    extra_kg_charges: extraKgCharges,
    total_collected_amount: totalCollectedAmount,
  };
}

export function downloadMerchantTemplateCsv() {
  // 7 merchant-entry columns excluding auto Sr.; charges are calculated by system after upload.
  const headers = [
    'sr',
    'merchant_name',
    'merchant_address',
    'merchant_township',
    'merchant_city',
    'phone_number',
    'cod_amount',
    'total_kg',
  ];

  const sample = [
    '1',
    'ABC Online Shop',
    'No. 12, Main Road',
    'North Dagon',
    'Yangon',
    '09123456789',
    '50000',
    '2.5',
  ];

  const csv = `${headers.join(',')}\n${sample.map((v) => `"${v}"`).join(',')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'britium_merchant_web_template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseSimpleCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    return headers.reduce((acc: any, header, index) => {
      acc[header] = values[index] || '';
      return acc;
    }, {});
  });
}