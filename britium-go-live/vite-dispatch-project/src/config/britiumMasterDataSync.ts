export type MasterOptions = Record<string, string[]>;

export const DEFAULT_MASTER_OPTIONS: MasterOptions = {
  business_type: [
    'Retail',
    'Wholesale',
    'E-commerce',
    'Marketplace',
    'Corporate',
    'SME',
    'Individual Seller',
    'Online Shop',
    'Book Store',
    'Branch Office',
  ],
  customer_type: ['Individual', 'Company', 'VIP', 'Wholesale', 'Retail', 'Government', 'Partner'],
  payment_terms: ['COD', 'Prepaid', 'Monthly Billing', 'Merchant Credit', 'Bank Transfer', 'KBZ Pay'],
  contract_status: ['Draft', 'Submitted', 'Approved', 'Active', 'Rejected', 'Inactive'],
  record_status: ['Draft', 'Submitted', 'Approved', 'Active', 'Inactive', 'Suspended', 'Blacklisted'],
  employment_type: ['Permanent', 'Contract', 'Part-time', 'Temporary', 'Partner'],
  department: [
    'Customer Service',
    'Marketing',
    'Business Development',
    'Operation',
    'Warehouse',
    'Finance',
    'Admin',
    'Management',
  ],
  role_id: [
    'customer_service',
    'marketing',
    'business_development_manager',
    'supervisor',
    'operation_manager',
    'warehouse',
    'finance',
    'finance_manager',
    'admin',
    'superadmin',
    'data entry',
    'Sales & Marketing Assistant',
  ],
  vehicle_type: ['Bike', 'Van', 'Truck', 'Mini Truck', 'Car', 'Partner Vehicle'],
  ownership_type: ['Owned', 'Rented', 'Partner', 'Leased'],
  fleet_status: ['Available', 'Assigned', 'Maintenance', 'Inactive'],
  pickup_status: ['Draft', 'Created', 'Assigned', 'Picked Up', 'Warehouse Received', 'Completed', 'Cancelled'],
  payment_type: ['COD', 'Prepaid', 'Collect', 'Credit', 'Bank Transfer', 'KBZ Pay'],
  city: [
    'Yangon',
    'Mandalay',
    'Naypyidaw',
    'Mawlamyine',
    'Bago',
    'Pathein',
    'Taunggyi',
    'Sittwe',
    'Myitkyina',
    'Lashio',
  ],
  region_state: [
    'Yangon Region',
    'Mandalay Region',
    'Naypyidaw Union Territory',
    'Mon State',
    'Bago Region',
    'Ayeyarwady Region',
    'Shan State',
    'Rakhine State',
    'Kachin State',
    'Sagaing Region',
    'Magway Region',
    'Tanintharyi Region',
    'Kayah State',
    'Kayin State',
    'Chin State',
  ],
  zone: [
    'Yangon Central',
    'Yangon West',
    'Yangon East',
    'Yangon North',
    'Yangon South',
    'Mandalay Central',
    'Upper Myanmar',
    'Lower Myanmar',
  ],
  severity: ['Low', 'Medium', 'High', 'Critical'],
  yes_no: ['Yes', 'No'],
  yes_no_cond: ['YES', 'No', 'COND'],
  customer_tier: ['Standard', 'Royal'],
  warehouse_action: ['Receive', 'Hold', 'Release', 'Sort', 'Dispatch', 'Damage Report'],
  process_type: ['PICKUP', 'WAREHOUSE', 'DELIVERY', 'RETURN'],
  township: [
    'Ahlone',
    'Bahan',
    'Botahtaung',
    'Dagon',
    'Dagon Myothit East',
    'Dagon Myothit North',
    'Dagon Myothit Seikkan',
    'Dagon Myothit South',
    'Hlaing',
    'Hlaing Tharyar',
    'Insein',
    'Kamayut',
    'Kyauktada',
    'Kyimyindaing',
    'Lanmadaw',
    'Latha',
    'Mayangone',
    'Mingalar Taung Nyunt',
    'North Okkalapa',
    'Pabedan',
    'Pazundaung',
    'Sanchaung',
    'South Okkalapa',
    'Tamwe',
    'Thingangyun',
    'Yankin',
    'Chan Aye Tharzan',
    'Aungmyaythazan',
    'Maha Aungmye',
    'Pyigyidagun',
    'Zabuthiri',
    'Dekkhinathiri',
    'Ottara Thiri',
  ],
};

export const PROCESS_STATUS_MASTER = [
  'PICKUP_REQUESTED',
  'PICKUP_ASSIGNED',
  'RIDER_EN_ROUTE_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PICKUP_COMPLETED',
  'PICKUP_FAILED',
  'PICKUP_RESCHEDULED',
  'PICKUP_CANCELLED',
  'RECEIVED_AT_ORIGIN',
  'SORTING',
  'READY_FOR_DISPATCH',
  'IN_TRANSIT_TO_HUB',
  'RECEIVED_AT_DESTINATION',
  'WAREHOUSE_HOLD',
  'DAMAGED',
  'LOST',
  'READY_FOR_DELIVERY',
  'DELIVERY_ASSIGNED',
  'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPTED',
  'DELIVERED',
  'DELIVERY_FAILED',
  'DELIVERY_RESCHEDULED',
  'RTO_INITIATED',
  'RETURNED_TO_SENDER',
];

export const MASTER_TEMPLATE_FIELDS = {
  Merchant_Master: [
    'merchant_code',
    'merchant_name',
    'business_type',
    'contact_person',
    'phone_primary',
    'phone_secondary',
    'email',
    'address_line_1',
    'address_line_2',
    'township',
    'city',
    'region_state',
    'default_pickup_address',
    'default_pickup_time_window',
    'payment_terms',
    'contract_status',
    'is_active',
  ],
  Rider_Master: [
    'rider_id',
    'rider_name',
    'phone_primary',
    'nrc_or_id_no',
    'assigned_zone',
    'employment_type',
    'status',
  ],
  Driver_Master: [
    'driver_id',
    'driver_name',
    'phone_primary',
    'license_no',
    'license_expiry_date',
    'assigned_fleet_id',
    'status',
  ],
  Helper_Master: [
    'helper_id',
    'helper_name',
    'phone_primary',
    'assigned_zone',
    'employment_type',
    'status',
  ],
  Employee_Master: [
    'employee_id',
    'employee_name',
    'role_id',
    'department',
    'phone_primary',
    'email',
    'supervisor_employee_id',
    'status',
  ],
  Fleet_Master: [
    'fleet_id',
    'vehicle_no',
    'vehicle_type',
    'capacity_kg',
    'capacity_cbm',
    'ownership_type',
    'insurance_expiry_date',
    'status',
  ],
};

export const REQUIRED_FIELDS_BY_TEMPLATE: Record<string, string[]> = {
  Merchant_Master: [
    'merchant_name',
    'business_type',
    'contact_person',
    'phone_primary',
    'address_line_1',
    'township',
    'city',
    'region_state',
    'default_pickup_address',
    'contract_status',
  ],
  Rider_Master: [
    'rider_name',
    'phone_primary',
    'nrc_or_id_no',
    'assigned_zone',
    'employment_type',
    'status',
  ],
  Driver_Master: [
    'driver_name',
    'phone_primary',
    'license_no',
    'license_expiry_date',
    'status',
  ],
  Helper_Master: ['helper_name', 'phone_primary', 'employment_type', 'status'],
  Employee_Master: ['employee_name', 'role_id', 'department', 'phone_primary', 'status'],
  Fleet_Master: [
    'vehicle_no',
    'vehicle_type',
    'capacity_kg',
    'capacity_cbm',
    'ownership_type',
    'insurance_expiry_date',
    'status',
  ],
};

export function getOptions(options: MasterOptions | undefined, dropdownName: string): string[] {
  const backendValues = options?.[dropdownName] || [];
  const fallbackValues = DEFAULT_MASTER_OPTIONS[dropdownName] || [];
  return Array.from(new Set([...backendValues, ...fallbackValues])).filter(Boolean);
}

export function normalizeMasterOptions(rows: any[] | null | undefined): MasterOptions {
  const grouped: MasterOptions = { ...DEFAULT_MASTER_OPTIONS };

  if (!Array.isArray(rows)) {
    return grouped;
  }

  rows.forEach((row) => {
    const dropdownName =
      row.dropdown_name ||
      row.option_group ||
      row.group_name ||
      row.master_type ||
      row.field_name ||
      row.name;

    const value =
      row.value ||
      row.option_value ||
      row.label ||
      row.status_code ||
      row.status_name_en ||
      row.city ||
      row.township ||
      row.zone_name;

    if (!dropdownName || !value) return;

    if (!grouped[dropdownName]) grouped[dropdownName] = [];
    if (!grouped[dropdownName].includes(value)) {
      grouped[dropdownName].push(value);
    }
  });

  return grouped;
}

export function isValidMyanmarPhone(phone: string, required = true): boolean {
  const value = String(phone || '').trim();

  if (!value && !required) return true;

  return /^09\d{6,9}$/.test(value);
}

export function validateRequiredFields<T extends Record<string, any>>(
  data: T,
  requiredFields: string[],
): string[] {
  return requiredFields.filter((field) => {
    const value = data[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

export function resolveBranchCode(input: {
  city?: string | null;
  township?: string | null;
  address?: string | null;
}): 'YGN' | 'MDY' | 'NPT' {
  const text = `${input.city || ''} ${input.township || ''} ${input.address || ''}`.toLowerCase();

  if (text.includes('mandalay')) return 'MDY';
  if (
    text.includes('naypyidaw') ||
    text.includes('naypyitaw') ||
    text.includes('nay pyi taw') ||
    text.includes('npt')
  ) {
    return 'NPT';
  }

  return 'YGN';
}

export function calculateTariffFallback(input: {
  tier?: string | null;
  actualWeightKg?: number | string | null;
  baseFee?: number | string | null;
  highwayDropoff?: boolean | null;
}) {
  const tier = input.tier || 'Standard';
  const weight = Number(input.actualWeightKg || 0);
  const baseFee = Number(input.baseFee || 0);
  const allowance = tier === 'Royal' ? 5 : 3;
  const chargeableWeight = Math.ceil(Math.max(0, weight));
  const extraWeight = Math.max(0, chargeableWeight - allowance);
  const weightSurcharge = extraWeight * 500;
  const highwayFee = input.highwayDropoff ? 3000 : 0;
  const total = baseFee + weightSurcharge + highwayFee;

  return {
    tier,
    allowance_kg: allowance,
    actual_weight_kg: weight,
    chargeable_weight_kg: chargeableWeight,
    extra_weight_kg: extraWeight,
    base_fee: baseFee,
    weight_surcharge: weightSurcharge,
    highway_fee: highwayFee,
    total_tariff: total,
  };
}

export async function loadMasterOptions(supabase: any): Promise<MasterOptions> {
  try {
    const { data, error } = await supabase
      .from('be_master_data_options')
      .select('*')
      .eq('is_active', true)
      .order('dropdown_name', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return normalizeMasterOptions(data);
  } catch (error) {
    console.warn('Using fallback master options because backend master options failed:', error);
    return { ...DEFAULT_MASTER_OPTIONS };
  }
}

export async function loadMasterSnapshot(supabase: any) {
  try {
    const { data, error } = await supabase.rpc('be_master_data_page_snapshot');

    if (error) throw error;

    return data || {};
  } catch (error) {
    console.warn('Master snapshot RPC unavailable:', error);
    return {};
  }
}

export function optionLabel(value: string | null | undefined) {
  return value || '—';
}

export const PICKUP_STATUS_FLOW = [
  'Draft',
  'Created',
  'Assigned',
  'Picked Up',
  'Warehouse Received',
  'Completed',
  'Cancelled',
];

export const WAREHOUSE_STATUS_OPTIONS = [
  'RECEIVED_AT_ORIGIN',
  'SORTING',
  'READY_FOR_DISPATCH',
  'IN_TRANSIT_TO_HUB',
  'RECEIVED_AT_DESTINATION',
  'WAREHOUSE_HOLD',
  'DAMAGED',
  'LOST',
];

export const CUSTOMER_SERVICE_QUEUE_STATUS = [
  'PICKUP_REQUESTED',
  'PICKUP_FAILED',
  'PICKUP_RESCHEDULED',
  'WAREHOUSE_HOLD',
  'DELIVERY_ATTEMPTED',
  'DELIVERY_FAILED',
  'RETURNED_TO_SENDER',
];

export const FIELD_INSTRUCTIONS = [
  {
    template_sheet: 'Merchant_Master',
    field: 'merchant_code',
    required: false,
    validation: 'Text, 3 chars, auto',
    myanmar_label: 'မာကာသာ ကုဒ်',
    notes: 'System-generated. Leave blank for new records.',
  },
  {
    template_sheet: 'Merchant_Master',
    field: 'merchant_name',
    required: true,
    validation: 'Text, max 150 chars',
    myanmar_label: 'ဆိုင်အမည်',
    notes: 'Required. Searchable/autocomplete in portal.',
  },
  {
    template_sheet: 'Merchant_Master',
    field: 'business_type',
    required: true,
    validation: 'Dropdown: business_type',
    myanmar_label: 'လုပ်ငန်းအမျိုးအစား',
    notes: 'Select from backend master dropdown.',
  },
  {
    template_sheet: 'Merchant_Master',
    field: 'phone_primary',
    required: true,
    validation: 'Phone format 09xxx',
    myanmar_label: 'ဖုန်းနံပါတ် (မူလ)',
    notes: 'Unique check. Must start with 09.',
  },
  {
    template_sheet: 'Merchant_Master',
    field: 'township',
    required: true,
    validation: 'Dropdown: township',
    myanmar_label: 'မြို့နယ်',
    notes: 'Linked to township master.',
  },
  {
    template_sheet: 'Merchant_Master',
    field: 'payment_terms',
    required: false,
    validation: 'Dropdown: payment_terms',
    myanmar_label: 'ငွေပေးချေမှု သတ်မှတ်ချက်',
    notes: 'COD/Prepaid/Monthly etc.',
  },
  {
    template_sheet: 'Merchant_Master',
    field: 'contract_status',
    required: true,
    validation: 'Dropdown: contract_status',
    myanmar_label: 'စာချုပ် အခြေအနေ',
    notes: 'Draft → Submitted → Approved → Active.',
  },
  {
    template_sheet: 'Fleet_Master',
    field: 'vehicle_type',
    required: true,
    validation: 'Dropdown: vehicle_type',
    myanmar_label: 'ယာဉ်အမျိုးအစား',
    notes: 'Van/Mini Truck/Bike etc.',
  },
  {
    template_sheet: 'Fleet_Master',
    field: 'status',
    required: true,
    validation: 'Dropdown: fleet_status',
    myanmar_label: 'ယာဉ် အခြေအနေ',
    notes: 'Available/Assigned/Maintenance.',
  },
  {
    template_sheet: 'Rider_Master',
    field: 'assigned_zone',
    required: true,
    validation: 'Dropdown: zone',
    myanmar_label: 'သတ်မှတ်ဇုန်',
    notes: 'Linked to zone master.',
  },
  {
    template_sheet: 'Employee_Master',
    field: 'role_id',
    required: true,
    validation: 'Dropdown: role_id',
    myanmar_label: 'ရာထူး',
    notes: 'Linked to role master.',
  },
];

export const BRITIUM_GO_LIVE_RULES = {
  canonicalPickupId: true,
  backendOnlyOperationalScreens: true,
  removeRuntimeSampleData: true,
  dispatchCountersZeroUntilRoutesExist: true,
  branchCodes: ['YGN', 'MDY', 'NPT'],
  phoneLoginInitialMode: 'email_password',
  tariff: {
    standardAllowanceKg: 3,
    royalAllowanceKg: 5,
    extraKgFeeMmk: 500,
    highwayDropoffFeeMmk: 3000,
  },
};