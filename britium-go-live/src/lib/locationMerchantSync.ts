import { supabase } from '@/integrations/supabase/client';

export type TownshipMaster = {
  township_code?: string;
  township_name: string;
  city: string;
  region_state?: string;
  zone?: string;
  branch_code?: string;
  is_active?: boolean;
};

export type MerchantMaster = {
  merchant_code: string;
  merchant_name: string;
  business_type?: string;
  payment_terms?: string;
  contact_person?: string;
  phone_primary?: string;
  phone_secondary?: string;
  email?: string;
  address_line_1?: string;
  address_line_2?: string;
  default_pickup_address?: string;
  township?: string;
  city?: string;
  region_state?: string;
  zone?: string;
  branch_code?: string;
  customer_tier?: string;
  base_fee?: number;
  delivery_charge?: number;
  is_active?: boolean;
};

export const FALLBACK_TOWNSHIP_MASTER: TownshipMaster[] = [
  { township_name: 'Ahlone', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Bahan', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Botahtaung', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Dagon', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Hlaing', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon West', branch_code: 'YGN' },
  { township_name: 'Insein', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon North', branch_code: 'YGN' },
  { township_name: 'Kamayut', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon West', branch_code: 'YGN' },
  { township_name: 'Kyauktada', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Lanmadaw', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Latha', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Mayangone', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon North', branch_code: 'YGN' },
  { township_name: 'North Dagon', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon East', branch_code: 'YGN' },
  { township_name: 'South Dagon', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon East', branch_code: 'YGN' },
  { township_name: 'North Okkalapa', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon North', branch_code: 'YGN' },
  { township_name: 'South Okkalapa', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon East', branch_code: 'YGN' },
  { township_name: 'Pabedan', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Pazundaung', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Sanchaung', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon West', branch_code: 'YGN' },
  { township_name: 'Tamwe', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Thaketa', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon East', branch_code: 'YGN' },
  { township_name: 'Thingangyun', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon East', branch_code: 'YGN' },
  { township_name: 'Yankin', city: 'Yangon', region_state: 'Yangon Region', zone: 'Yangon Central', branch_code: 'YGN' },
  { township_name: 'Chan Aye Tharzan', city: 'Mandalay', region_state: 'Mandalay Region', zone: 'Mandalay Central', branch_code: 'MDY' },
  { township_name: 'Aungmyaythazan', city: 'Mandalay', region_state: 'Mandalay Region', zone: 'Mandalay Central', branch_code: 'MDY' },
  { township_name: 'Maha Aungmye', city: 'Mandalay', region_state: 'Mandalay Region', zone: 'Mandalay Central', branch_code: 'MDY' },
  { township_name: 'Pyigyidagun', city: 'Mandalay', region_state: 'Mandalay Region', zone: 'Mandalay Central', branch_code: 'MDY' },
  { township_name: 'Zabuthiri', city: 'Naypyidaw', region_state: 'Naypyidaw Union Territory', zone: 'Upper Myanmar', branch_code: 'NPT' },
  { township_name: 'Dekkhinathiri', city: 'Naypyidaw', region_state: 'Naypyidaw Union Territory', zone: 'Upper Myanmar', branch_code: 'NPT' },
  { township_name: 'Ottara Thiri', city: 'Naypyidaw', region_state: 'Naypyidaw Union Territory', zone: 'Upper Myanmar', branch_code: 'NPT' },
];

function asText(value: any) {
  return String(value ?? '').trim();
}

function uniqByName(rows: TownshipMaster[]) {
  const map = new Map<string, TownshipMaster>();
  rows.forEach((row) => {
    const key = asText(row.township_name).toLowerCase();
    if (key && !map.has(key)) map.set(key, row);
  });
  return Array.from(map.values()).sort((a, b) => a.township_name.localeCompare(b.township_name));
}

export function normalizeTownship(row: any): TownshipMaster {
  const township = asText(row.township_name || row.township || row.value || row.option_value || row.label || row.name);
  const city = asText(row.city || row.city_name || row.parent_city || row.parent_value || '');
  const region = asText(row.region_state || row.region || row.state || '');
  const zone = asText(row.zone || row.zone_name || '');
  const branch = asText(row.branch_code || row.branch || '');

  return {
    township_code: asText(row.township_code || row.code || row.id),
    township_name: township,
    city: city || inferCityFromTownship(township),
    region_state: region || inferRegionState(city || township),
    zone: zone || inferZone(city || township),
    branch_code: branch || inferBranchCode(city || township),
    is_active: row.is_active !== false,
  };
}

export function inferCityFromTownship(value: string) {
  const text = value.toLowerCase();
  if (text.includes('mandalay') || ['chan aye tharzan', 'aungmyaythazan', 'maha aungmye', 'pyigyidagun'].some((x) => text.includes(x))) return 'Mandalay';
  if (text.includes('naypyidaw') || text.includes('naypyitaw') || text.includes('zabuthiri') || text.includes('dekkhinathiri') || text.includes('ottara')) return 'Naypyidaw';
  return 'Yangon';
}

export function inferRegionState(value: string) {
  const text = value.toLowerCase();
  if (text.includes('mandalay')) return 'Mandalay Region';
  if (text.includes('naypyidaw') || text.includes('naypyitaw') || text.includes('npt')) return 'Naypyidaw Union Territory';
  return 'Yangon Region';
}

export function inferZone(value: string) {
  const text = value.toLowerCase();
  if (text.includes('mandalay')) return 'Mandalay Central';
  if (text.includes('naypyidaw') || text.includes('naypyitaw') || text.includes('npt')) return 'Upper Myanmar';
  if (text.includes('north')) return 'Yangon North';
  if (text.includes('south') || text.includes('east')) return 'Yangon East';
  if (text.includes('hlaing') || text.includes('sanchaung') || text.includes('kamayut')) return 'Yangon West';
  return 'Yangon Central';
}

export function inferBranchCode(value: string) {
  const text = value.toLowerCase();
  if (text.includes('mandalay')) return 'MDY';
  if (text.includes('naypyidaw') || text.includes('naypyitaw') || text.includes('npt')) return 'NPT';
  return 'YGN';
}

export async function loadTownshipMaster(): Promise<TownshipMaster[]> {
  const rows: TownshipMaster[] = [];

  for (const table of ['be_township_master', 'be_master_townships', 'township_master']) {
    try {
      const { data, error } = await (supabase as any)
        .from(table)
        .select('*')
        .order('city', { ascending: true })
        .order('township_name', { ascending: true });

      if (!error && data?.length) rows.push(...data.map(normalizeTownship));
    } catch {
      // Try next table.
    }
  }

  try {
    const { data, error } = await (supabase as any)
      .from('be_master_data_options')
      .select('*')
      .in('dropdown_name', ['township', 'city'])
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!error && data?.length) {
      const townshipRows = data.filter((row: any) => row.dropdown_name === 'township');
      rows.push(...townshipRows.map(normalizeTownship));
    }
  } catch {
    // Fallback below.
  }

  return uniqByName([...rows, ...FALLBACK_TOWNSHIP_MASTER]).filter((row) => row.is_active !== false);
}

export function findTownship(master: TownshipMaster[], typedValue: string) {
  const value = asText(typedValue).toLowerCase();
  return master.find((row) => row.township_name.toLowerCase() === value);
}

export function townshipSuggestions(master: TownshipMaster[], typedValue: string, limit = 12) {
  const value = asText(typedValue).toLowerCase();
  if (!value) return master.slice(0, limit);

  return master
    .filter((row) =>
      row.township_name.toLowerCase().includes(value) ||
      row.city.toLowerCase().includes(value) ||
      asText(row.zone).toLowerCase().includes(value),
    )
    .slice(0, limit);
}

export function normalizeMerchant(row: any): MerchantMaster {
  return {
    merchant_code: asText(row.merchant_code || row.code || row.id),
    merchant_name: asText(row.merchant_name || row.name || row.display_name),
    business_type: asText(row.business_type),
    payment_terms: asText(row.payment_terms),
    contact_person: asText(row.contact_person || row.merchant_name || row.name),
    phone_primary: asText(row.phone_primary || row.phone),
    phone_secondary: asText(row.phone_secondary),
    email: asText(row.email),
    address_line_1: asText(row.address_line_1 || row.address),
    address_line_2: asText(row.address_line_2),
    default_pickup_address: asText(row.default_pickup_address || row.address_line_1 || row.address),
    township: asText(row.township || row.town),
    city: asText(row.city),
    region_state: asText(row.region_state || row.state_region),
    zone: asText(row.zone || row.assigned_zone),
    branch_code: asText(row.branch_code),
    customer_tier: asText(row.customer_tier || row.tier || 'Standard'),
    base_fee: Number(row.base_fee || row.standard_delivery_fee || row.delivery_charge || 4000),
    delivery_charge: Number(row.delivery_charge || row.base_fee || row.standard_delivery_fee || 4000),
    is_active: row.is_active !== false,
  };
}

export async function loadMerchantMaster(): Promise<MerchantMaster[]> {
  try {
    const { data, error } = await (supabase as any).rpc('be_master_data_page_snapshot');

    if (!error) {
      const snapshot = data || {};
      const rows =
        snapshot.merchants ||
        snapshot.merchant_master ||
        snapshot.Merchant_Master ||
        snapshot.merchantMaster ||
        [];

      if (rows.length) {
        return rows.map(normalizeMerchant).filter((m: MerchantMaster) => m.merchant_code && m.merchant_name && m.is_active !== false);
      }
    }
  } catch {
    // Try tables below.
  }

  for (const table of ['be_merchant_master', 'be_master_merchants', 'merchant_master']) {
    try {
      const { data, error } = await (supabase as any).from(table).select('*').order('merchant_name', { ascending: true });
      if (!error && data?.length) {
        return data.map(normalizeMerchant).filter((m: MerchantMaster) => m.merchant_code && m.merchant_name && m.is_active !== false);
      }
    } catch {
      // Try next table.
    }
  }

  return [];
}

export function findMerchant(master: MerchantMaster[], value: string) {
  const keyword = asText(value).toLowerCase();
  return master.find((m) =>
    m.merchant_code.toLowerCase() === keyword ||
    m.merchant_name.toLowerCase() === keyword ||
    `${m.merchant_code} - ${m.merchant_name}`.toLowerCase() === keyword ||
    asText(m.phone_primary).toLowerCase() === keyword,
  );
}

export function merchantSuggestions(master: MerchantMaster[], value: string, limit = 20) {
  const keyword = asText(value).toLowerCase();
  if (!keyword) return master.slice(0, limit);

  return master
    .filter((m) =>
      m.merchant_code.toLowerCase().includes(keyword) ||
      m.merchant_name.toLowerCase().includes(keyword) ||
      asText(m.phone_primary).toLowerCase().includes(keyword) ||
      asText(m.township).toLowerCase().includes(keyword),
    )
    .slice(0, limit);
}

export function merchantToFormPatch(merchant: MerchantMaster) {
  return {
    merchant_code: merchant.merchant_code,
    merchant_name: merchant.merchant_name,
    business_type: merchant.business_type || '',
    payment_terms: merchant.payment_terms || '',
    contact_person: merchant.contact_person || merchant.merchant_name,
    phone_primary: merchant.phone_primary || '',
    phone_secondary: merchant.phone_secondary || '',
    email: merchant.email || '',
    pickup_address: merchant.default_pickup_address || merchant.address_line_1 || '',
    address_line_1: merchant.address_line_1 || merchant.default_pickup_address || '',
    township: merchant.township || '',
    city: merchant.city || inferCityFromTownship(merchant.township || ''),
    region_state: merchant.region_state || inferRegionState(merchant.city || merchant.township || ''),
    zone: merchant.zone || inferZone(merchant.city || merchant.township || ''),
    branch_code: merchant.branch_code || inferBranchCode(merchant.city || merchant.township || ''),
    customer_tier: merchant.customer_tier || 'Standard',
    base_fee: merchant.base_fee || merchant.delivery_charge || 4000,
    delivery_charge: merchant.delivery_charge || merchant.base_fee || 4000,
  };
}

export function townshipToFormPatch(township: TownshipMaster) {
  return {
    township: township.township_name,
    city: township.city,
    region_state: township.region_state || inferRegionState(township.city),
    zone: township.zone || inferZone(township.city || township.township_name),
    branch_code: township.branch_code || inferBranchCode(township.city || township.township_name),
  };
}
