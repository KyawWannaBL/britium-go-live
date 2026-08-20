import { supabase } from '@/integrations/supabase/client';

export type FinancialV2Field = {
  name: string;
  section: string;
  ownership: 'INPUT' | 'SERVER' | string;
  editable: boolean;
  data_type: string;
  required: boolean;
  source?: string;
};

export type FinancialV2Envelope<T = Record<string, unknown>> = {
  ok: boolean;
  build?: string;
  generated_at?: string;
  data?: T;
  warnings?: Array<{ code?: string; message?: string; field?: string }>;
  errors?: Array<{ code?: string; message?: string; field?: string }>;
  access?: Record<string, unknown>;
  mutation_mode?: string;
  dry_run?: boolean;
  persisted?: boolean;
  operation?: string;
  message?: string;
  [key: string]: unknown;
};

export type FinancialV2SchemaData = {
  schema_version: string;
  field_count: number;
  environment: string;
  mutation_rpcs_activated: boolean;
  fields: FinancialV2Field[];
};

export type FinancialV2SnapshotData = {
  schema_version: string;
  returned_rows: number;
  limit: number;
  filters: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
};

function throwRpcError(error: unknown): never {
  const value = error as { message?: string; details?: string; hint?: string } | null;
  const message = [value?.message, value?.details, value?.hint].filter(Boolean).join(' | ');
  throw new Error(message || 'Financial V2 RPC failed.');
}

export async function financialV2Schema() {
  const { data, error } = await supabase.rpc('be_data_entry_financial_v2_schema');
  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<FinancialV2SchemaData>;
}

export async function financialV2Snapshot(filter: Record<string, unknown> = {}, limit = 100) {
  const { data, error } = await supabase.rpc('be_data_entry_financial_v2_snapshot', {
    p_filter: filter,
    p_limit: limit,
  });
  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<FinancialV2SnapshotData>;
}

export async function financialV2Calculate(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('be_data_entry_financial_v2_calculate', { p_payload: payload });
  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<Record<string, unknown>>;
}

export async function financialV2Save(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('be_data_entry_financial_v2_save', { p_payload: payload });
  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<Record<string, unknown>>;
}

export async function financialV2Import(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('be_data_entry_financial_v2_import', { p_payload: payload });
  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<Record<string, unknown>>;
}

export async function financialV2CreateWaybill(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('be_data_entry_financial_v2_create_waybill', { p_payload: payload });
  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<Record<string, unknown>>;
}
