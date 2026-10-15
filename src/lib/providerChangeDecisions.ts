import { supabase } from "@/integrations/supabase/client";

/** Manager operations remain server-authorized. Never write override tables from the browser. */
type ProviderDecision = "approve" | "reject";
export type ProviderChangePreflight = {
  request_id: string;
  status: string;
  requested_provider: string;
  matching_tariffs: number;
  has_wayplan: boolean;
  has_settlement: boolean;
  parcel_closed: boolean;
  safe_for_automatic_apply: boolean;
  requires_finance_and_warehouse_sync: boolean;
};
export type ProviderChangeResult = {
  ok: boolean;
  status: string;
  request_id: string;
  provider?: string;
};
async function callProviderRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // Newly migrated RPCs are not yet included in generated Supabase database types.
  const client = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("Provider change RPC returned no result");
  return data as T;
}
export function getProviderChangePreflight(requestId: string) {
  if (!requestId.trim()) throw new Error("Request ID is required");
  return callProviderRpc<ProviderChangePreflight>("be_provider_change_preflight_v1", { p_request_id: requestId });
}
export async function decideProviderChange(requestId: string, decision: ProviderDecision, reviewNote: string) {
  if (!requestId.trim()) throw new Error("Request ID is required");
  if (reviewNote.trim().length < 10) throw new Error("A review note of at least 10 characters is required");
  if (decision === "approve") {
    const preview = await getProviderChangePreflight(requestId);
    // Server performs all authoritative checks again during the approval transaction.
    if (preview.status !== "PENDING_REVIEW" || preview.has_wayplan || preview.has_settlement || preview.parcel_closed || preview.matching_tariffs !== 1) {
      throw new Error("Approval blocked: operational, settlement, or tariff review is required");
    }
  }
  return callProviderRpc<ProviderChangeResult>(
    decision === "approve" ? "be_approve_provider_change_request_v1" : "be_reject_provider_change_request_v1",
    { p_id: requestId, p_note: reviewNote.trim() },
  );
}
