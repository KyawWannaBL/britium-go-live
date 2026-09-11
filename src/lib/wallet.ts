import { supabase } from "@/lib/supabase/client";

export type WalletAccountType = string;

export interface WalletAccount {
  id: string;
  owner_user_id?: string | null;
  owner_email?: string | null;
  account_type?: string | null;
  role_scope?: string | null;
  currency_code?: string | null;
  status?: string | null;
  available_balance?: number | null;
  pending_balance?: number | null;
  branch_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CommissionRun {
  id: string;
  run_code?: string | null;
  beneficiary_type?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  status?: string | null;
  total_amount?: number | null;
  created_at?: string | null;
}

export interface BranchSettlement {
  id: string;
  branch_code?: string | null;
  settlement_date?: string | null;
  cod_collected?: number | null;
  expenses?: number | null;
  office_commission?: number | null;
  rider_commission?: number | null;
  helper_commission?: number | null;
  net_payable?: number | null;
  status?: string | null;
  created_at?: string | null;
}

export interface ProfileActivity {
  id: string;
  description?: string | null;
  status?: string | null;
  amount?: number | null;
  created_at?: string | null;
}

function safeLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

/*
 * The local Supabase client does not currently include generated table types.
 * Database row-level security remains the authorization boundary.
 */
const db = supabase as any;

export async function getMyWalletAccounts(
  accountType?: WalletAccountType,
): Promise<WalletAccount[]> {
  let query = db
    .from("wallet_accounts")
    .select(
      "id, owner_user_id, owner_email, account_type, role_scope, currency_code, status, available_balance, pending_balance, branch_code, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });

  const normalizedType = accountType?.trim().toUpperCase();
  if (normalizedType) {
    query = query.eq("account_type", normalizedType);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as WalletAccount[];
}

export async function listCommissionRuns(
  limit = 10,
): Promise<CommissionRun[]> {
  const { data, error } = await db
    .from("commission_runs")
    .select(
      "id, run_code, beneficiary_type, period_start, period_end, status, total_amount, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit(limit, 10));

  if (error) throw error;
  return (data ?? []) as CommissionRun[];
}

export async function listBranchSettlements(
  limit = 10,
): Promise<BranchSettlement[]> {
  const { data, error } = await db
    .from("branch_settlements")
    .select(
      "id, branch_code, settlement_date, cod_collected, expenses, office_commission, rider_commission, helper_commission, net_payable, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit(limit, 10));

  if (error) throw error;
  return (data ?? []) as BranchSettlement[];
}

export async function getMyProfileActivities(
  limit = 8,
): Promise<ProfileActivity[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return [];

  const { data, error } = await db
    .from("wallet_transactions")
    .select("id, description, status, amount, created_at")
    .eq("submitted_by", user.id)
    .order("created_at", { ascending: false })
    .limit(safeLimit(limit, 8));

  if (error) throw error;
  return (data ?? []) as ProfileActivity[];
}
