import { supabase } from "@/lib/supabaseClient";
import type {
  AccountingEvent,
  AccountingEventFilters,
  AccountingEventLine,
  AccountingReviewAction,
  AccountingAuditRow,
  AccountingPeriod,
  AccountingRpcResult,
  AccountingRuntimeFlags,
  AdminHrLogInput,
  BalanceSheetReport,
  FinanceDailyLog,
  FinanceDailyLogInput,
  FixedAsset,
  GeneralLedgerRow,
  ProfitLossReport,
  ReconciliationReport,
  TrialBalanceReport,
  JournalHeader,
} from "@/types/accounting";

type ErrorShape = {
  code?: string;
  message?: string;
  debit?: number | string;
  credit?: number | string;
  difference?: number | string;
};

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function accountingErrorMessage(error: ErrorShape | null | undefined): string {
  const code = String(error?.code ?? "");
  const debit = numeric(error?.debit);
  const credit = numeric(error?.credit);
  const difference = numeric(error?.difference ?? debit - credit);

  switch (code) {
    case "JOURNAL_NOT_BALANCED":
      return `Journal cannot be posted: Debit MMK ${debit.toLocaleString()} does not equal Credit MMK ${credit.toLocaleString()}. Difference: MMK ${Math.abs(difference).toLocaleString()}.`;
    case "ALREADY_POSTED":
      return "This accounting event has already been posted.";
    case "PERIOD_CLOSED":
      return "This accounting period is closed. Reopen it through Accounting Control before posting.";
    case "POSTING_DISABLED":
      return "General Ledger posting is currently disabled by the ERP rollout gate.";
    case "SYNC_DISABLED":
      return "Accounting synchronization is currently disabled by the ERP rollout gate.";
    case "SOURCE_DUPLICATE":
      return "This operational source is already represented in accounting.";
    case "HOLD_EXCEPTION":
      return "This accounting event is held by an unresolved operational exception.";
    case "UNAUTHORIZED":
      return "Your account is not authorized for this accounting action.";
    case "EVENT_NOT_APPROVED":
      return "The event must be approved in Finance Review before it can be posted.";
    case "INVALID_STATE":
      return "This accounting event has already moved to another review state. Refresh the queue.";
    default:
      return error?.message || code || "The accounting operation could not be completed.";
  }
}

function assertRpcResult(data: unknown): AccountingRpcResult {
  const result = (data ?? {}) as AccountingRpcResult;
  if (!result.ok) {
    const error = new Error(accountingErrorMessage(result)) as Error & {
      code?: string;
      details?: AccountingRpcResult;
    };
    error.code = result.code;
    error.details = result;
    throw error;
  }
  return result;
}

export async function getAccountingFlags(): Promise<AccountingRuntimeFlags> {
  const off: AccountingRuntimeFlags = {
    erpUiEnabled: false,
    syncEnabled: false,
    postingEnabled: false,
    reportsEnabled: false,
  };

  try {
    const { data, error } = await supabase.rpc("be_accounting_get_flags_v1");
    if (error) {
      console.warn("Accounting rollout flags unavailable; failing closed.", error.message);
      return off;
    }
    const flags = (data ?? {}) as Partial<AccountingRuntimeFlags>;
    return {
      erpUiEnabled: Boolean(flags.erpUiEnabled),
      syncEnabled: Boolean(flags.syncEnabled),
      postingEnabled: Boolean(flags.postingEnabled),
      reportsEnabled: Boolean(flags.reportsEnabled),
    };
  } catch (error) {
    console.warn("Accounting rollout flags unavailable; failing closed.", error);
    return off;
  }
}

export async function listAccountingEvents(
  filters: AccountingEventFilters = {}
): Promise<AccountingEvent[]> {
  let query = supabase
    .from("be_accounting_events")
    .select("*")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 250);

  if (filters.dateFrom) query = query.gte("event_date", filters.dateFrom);
  if (filters.dateTo) query = query.lte("event_date", filters.dateTo);
  if (filters.status) query = query.eq("review_status", filters.status);
  if (filters.eventType) query = query.eq("event_type", filters.eventType);
  if (filters.sourceSystem) query = query.eq("source_system", filters.sourceSystem);
  if (filters.merchantId) query = query.contains("source_snapshot", { merchant_id: filters.merchantId });
  if (filters.branchCode) query = query.contains("metadata", { branch_code: filters.branchCode });
  if (filters.search?.trim()) {
    const value = filters.search.trim().replace(/[%_,()]/g, " ");
    query = query.or(
      `source_reference.ilike.%${value}%,source_record_id.ilike.%${value}%,description.ilike.%${value}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AccountingEvent[];
}

export async function getAccountingEventLines(eventId: string): Promise<AccountingEventLine[]> {
  const { data, error } = await supabase
    .from("be_accounting_event_lines")
    .select("*, account:be_chart_of_accounts(account_code,account_name,account_type)")
    .eq("event_id", eventId)
    .order("sequence_no", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as AccountingEventLine[];
}

export async function submitFinanceDailyLog(input: FinanceDailyLogInput): Promise<FinanceDailyLog> {
  const { data, error } = await supabase
    .from("finance_daily_logs")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return data as FinanceDailyLog;
}

export async function submitAdminHrLog(input: AdminHrLogInput): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("admin_assets_and_hr_logs")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function reviewAccountingEvent(
  eventId: string,
  action: AccountingReviewAction,
  reason?: string
): Promise<AccountingRpcResult> {
  const { data, error } = await supabase.rpc("be_accounting_review_event_v1", {
    p_event_id: eventId,
    p_action: action,
    p_reason: reason ?? null,
  });

  if (error) throw error;
  return assertRpcResult(data);
}

export async function postAccountingEvent(eventId: string): Promise<AccountingRpcResult> {
  const { data, error } = await supabase.rpc("be_accounting_post_event_v1", {
    p_event_id: eventId,
  });

  if (error) throw error;
  const result = (data ?? {}) as AccountingRpcResult;
  if (result.code === "ALREADY_POSTED") return result;
  return assertRpcResult(result);
}

export async function listGeneralLedger(limit = 500): Promise<GeneralLedgerRow[]> {
  const { data, error } = await supabase
    .from("be_journal_lines")
    .select(
      "*, account:be_chart_of_accounts(account_code,account_name,account_type), journal:be_journal_entries(journal_number,accounting_date,description,status,source_event_id,posted_at)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as GeneralLedgerRow[];
}

export async function listFixedAssets(): Promise<FixedAsset[]> {
  const { data, error } = await supabase
    .from("be_fixed_asset_register")
    .select("*")
    .order("acquisition_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FixedAsset[];
}

export async function listAccountingPeriods(): Promise<AccountingPeriod[]> {
  const { data, error } = await supabase
    .from("be_accounting_periods")
    .select("*")
    .order("period_start", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AccountingPeriod[];
}

export async function listAccountingAudit(limit = 300): Promise<AccountingAuditRow[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .or("table_name.ilike.%accounting%,table_name.eq.be_journal_entries,table_name.eq.be_accounting_events,entity_type.ilike.%accounting%,entity_type.eq.be_accounting_events")
    .order("timestamp", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AccountingAuditRow[];
}

export async function listJournalHeaders(limit = 300): Promise<JournalHeader[]> {
  const { data, error } = await supabase
    .from("be_journal_entries")
    .select("*")
    .order("accounting_date", { ascending: false })
    .order("posted_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as JournalHeader[];
}

export async function setAccountingFlag(
  key: "ERP_UI_ENABLED" | "ACCOUNTING_SYNC_ENABLED" | "GL_POSTING_ENABLED" | "FINANCIAL_REPORTS_ENABLED",
  value: boolean,
  reason: string
): Promise<AccountingRpcResult> {
  const { data, error } = await supabase.rpc("be_accounting_set_flag_v1", {
    p_key: key,
    p_value: value,
    p_reason: reason,
  });
  if (error) throw error;
  return assertRpcResult(data);
}

export async function reverseAccountingJournal(
  journalId: string,
  reason: string
): Promise<AccountingRpcResult> {
  const { data, error } = await supabase.rpc("be_accounting_reverse_journal_v1", {
    p_journal_id: journalId,
    p_reason: reason,
  });
  if (error) throw error;
  return assertRpcResult(data);
}

export async function closeAccountingPeriod(
  periodId: string,
  reason: string
): Promise<AccountingRpcResult> {
  const { data, error } = await supabase.rpc("be_accounting_close_period_v1", {
    p_period_id: periodId,
    p_reason: reason,
  });
  if (error) throw error;
  return assertRpcResult(data);
}

export async function getTrialBalance(dateFrom: string, dateTo: string): Promise<TrialBalanceReport> {
  const { data, error } = await supabase.rpc("be_accounting_trial_balance_v1", {
    p_from: dateFrom,
    p_to: dateTo,
  });
  if (error) throw error;
  const result = data as TrialBalanceReport;
  if (!result?.ok) throw new Error(accountingErrorMessage(result as unknown as ErrorShape));
  return result;
}

export async function getProfitLoss(dateFrom: string, dateTo: string): Promise<ProfitLossReport> {
  const { data, error } = await supabase.rpc("be_accounting_profit_loss_v1", {
    p_from: dateFrom,
    p_to: dateTo,
  });
  if (error) throw error;
  const result = data as ProfitLossReport;
  if (!result?.ok) throw new Error(accountingErrorMessage(result as unknown as ErrorShape));
  return result;
}

export async function getBalanceSheet(asOf: string): Promise<BalanceSheetReport> {
  const { data, error } = await supabase.rpc("be_accounting_balance_sheet_v1", {
    p_as_of: asOf,
  });
  if (error) throw error;
  const result = data as BalanceSheetReport;
  if (!result?.ok) throw new Error(accountingErrorMessage(result as unknown as ErrorShape));
  return result;
}

export async function getAccountingReconciliation(asOf: string): Promise<ReconciliationReport> {
  const { data, error } = await supabase.rpc("be_accounting_reconciliation_v1", {
    p_as_of: asOf,
  });
  if (error) throw error;
  const result = data as ReconciliationReport;
  if (!result?.ok) throw new Error(accountingErrorMessage(result as unknown as ErrorShape));
  return result;
}
