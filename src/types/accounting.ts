export type AccountingReviewStatus =
  | "DRAFT"
  | "REVIEW_PENDING"
  | "APPROVED"
  | "POSTED"
  | "NEEDS_REVIEW"
  | "HELD"
  | "REJECTED"
  | "SYNC_FAILED"
  | "REVERSED";

export type AccountingReviewAction = "APPROVE" | "HOLD" | "REJECT" | "INVESTIGATE";

export interface AccountingRuntimeFlags {
  erpUiEnabled: boolean;
  syncEnabled: boolean;
  postingEnabled: boolean;
  reportsEnabled: boolean;
}

export interface AccountingEvent {
  id: string;
  event_date: string;
  source_system: string;
  source_table: string;
  source_record_id: string;
  source_reference?: string | null;
  event_type: string;
  accounting_version: string;
  description?: string | null;
  currency_code: string;
  total_amount: number;
  review_status: AccountingReviewStatus;
  source_snapshot: Record<string, unknown>;
  input_fingerprint: string;
  created_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  posted_journal_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AccountingAccountSummary {
  account_code: string;
  account_name: string;
  account_type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "COGS" | "EXPENSE";
}

export interface AccountingEventLine {
  id: string;
  event_id: string;
  account_id: string;
  sequence_no: number;
  debit_amount: number;
  credit_amount: number;
  branch_code?: string | null;
  merchant_id?: string | null;
  rider_or_employee_id?: string | null;
  cost_center?: string | null;
  description?: string | null;
  metadata: Record<string, unknown>;
  account?: AccountingAccountSummary | null;
}

export interface AccountingEventFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: AccountingReviewStatus | "";
  eventType?: string;
  sourceSystem?: string;
  merchantId?: string;
  branchCode?: string;
  search?: string;
  limit?: number;
}

export type FinanceSourceMode = "MANUAL" | "ADJUSTMENT" | "SYSTEM_ASSISTED";

export interface FinanceDailyLogInput {
  entry_date: string;
  department_code: string;
  delivery_fees_collected: number;
  cod_handling_fees: number;
  surcharges: number;
  rider_commissions_accrued: number;
  fuel_and_tolls_spent: number;
  packaging_supplies_spent: number;
  petty_cash_expenses: number;
  cod_cash_collected_in_hand: number;
  accounts_receivable_invoiced: number;
  accounts_payable_incurred: number;
  source_mode: FinanceSourceMode;
  metadata: Record<string, unknown>;
}

export interface FinanceDailyLog extends FinanceDailyLogInput {
  id: string;
  submission_no: string;
  accounting_event_id?: string | null;
  is_locked: boolean;
  submitted_at?: string | null;
  created_by?: string | null;
  created_at: string;
  version_no: number;
}

export interface AdminHrLogInput {
  entry_date: string;
  department_code: string;
  asset_name?: string | null;
  asset_category?: string | null;
  acquisition_date?: string | null;
  acquisition_cost?: number | null;
  residual_value?: number;
  useful_life_months?: number | null;
  warehouse_overtime: number;
  base_payroll_accrual: number;
  facility_rent: number;
  utilities_admin_cost: number;
  source_mode: FinanceSourceMode;
  fixed_asset_id?: string | null;
  metadata: Record<string, unknown>;
}

export interface AccountingRpcResult {
  ok: boolean;
  code: string;
  message?: string;
  event_id?: string;
  journal_id?: string;
  journal_number?: string;
  status?: string;
  debit?: number;
  credit?: number;
  difference?: number;
  [key: string]: unknown;
}

export interface GeneralLedgerRow {
  id: string;
  journal_id: string;
  account_id: string;
  sequence_no: number;
  debit_amount: number;
  credit_amount: number;
  branch_code?: string | null;
  merchant_id?: string | null;
  rider_or_employee_id?: string | null;
  source_reference?: string | null;
  cost_center?: string | null;
  description?: string | null;
  created_at: string;
  account?: AccountingAccountSummary | null;
  journal?: {
    journal_number: string;
    accounting_date: string;
    description?: string | null;
    status: "POSTED" | "REVERSED";
    source_event_id?: string | null;
    posted_at: string;
  } | null;
}
