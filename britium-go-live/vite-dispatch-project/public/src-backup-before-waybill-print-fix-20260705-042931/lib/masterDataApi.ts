// Britium Master Data API helpers
// Current portal structure: Supabase RPC calls from React pages.

import { supabase } from "@/integrations/supabase/client";

export type MasterField = {
  field_key: string;
  label_en?: string;
  label_mm?: string;
  data_type?: "text" | "number" | "date" | "boolean" | string;
  required?: boolean;
  editable?: boolean;
  visible?: boolean;
  options?: string[];
  sort_order?: number;
};

export type MasterDataset = {
  dataset_key: string;
  sheet_name?: string;
  display_name_en?: string;
  display_name_mm?: string;
  category?: string;
  primary_key: string;
  sort_order?: number;
  active?: boolean;
  row_count?: number;
  fields?: MasterField[];
};

export type MasterRow = {
  id?: string;
  dataset_key?: string;
  record_key: string;
  payload: Record<string, any>;
  status?: string;
  updated_at?: string;
  updated_by_email?: string;
};

export async function fetchMasterDataSnapshot(params?: {
  datasetKey?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}) {
  const { data, error } = await supabase.rpc("be_master_data_snapshot", {
    p_dataset_key: params?.datasetKey ?? null,
    p_search: params?.search ?? null,
    p_limit: params?.limit ?? 500,
    p_offset: params?.offset ?? 0,
  });
  if (error) throw error;
  return data as any;
}

export async function upsertMasterDataRow(args: {
  datasetKey: string;
  recordKey: string;
  payload: Record<string, any>;
  status?: string;
  actorEmail?: string | null;
}) {
  const { data, error } = await supabase.rpc("be_master_data_upsert_row", {
    p_dataset_key: args.datasetKey,
    p_record_key: args.recordKey,
    p_payload: args.payload,
    p_status: args.status ?? "ACTIVE",
    p_actor_email: args.actorEmail ?? null,
  });
  if (error) throw error;
  return data as any;
}

export async function deleteMasterDataRow(args: {
  datasetKey: string;
  recordKey: string;
  actorEmail?: string | null;
}) {
  const { data, error } = await supabase.rpc("be_master_data_delete_row", {
    p_dataset_key: args.datasetKey,
    p_record_key: args.recordKey,
    p_actor_email: args.actorEmail ?? null,
  });
  if (error) throw error;
  return data as any;
}

export async function bulkUpsertMasterDataRows(args: {
  datasetKey: string;
  rows: Array<Record<string, any>>;
  actorEmail?: string | null;
}) {
  const { data, error } = await supabase.rpc("be_master_data_bulk_upsert", {
    p_dataset_key: args.datasetKey,
    p_rows: args.rows,
    p_actor_email: args.actorEmail ?? null,
  });
  if (error) throw error;
  return data as any;
}

export async function syncMasterDataToLive(args?: {
  datasetKey?: string | null;
  actorEmail?: string | null;
}) {
  const { data, error } = await supabase.rpc("be_master_data_sync_to_live_tables", {
    p_dataset_key: args?.datasetKey ?? null,
    p_actor_email: args?.actorEmail ?? null,
  });
  if (error) throw error;
  return data as any;
}

export async function fetchMasterDataHealthcheck() {
  const { data, error } = await supabase.rpc("be_master_data_healthcheck");
  if (error) throw error;
  return data as any;
}
