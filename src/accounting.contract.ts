import {
  accountingErrorMessage,
  getAccountingFlags,
  listAccountingEvents,
  submitFinanceDailyLog,
  reviewAccountingEvent,
  postAccountingEvent,
  getAccountingEventLines,
} from "@/lib/accountingApi";
import type {
  AccountingEventFilters,
  FinanceDailyLogInput,
} from "@/types/accounting";

const errorMessage: string = accountingErrorMessage({
  code: "JOURNAL_NOT_BALANCED",
  debit: 1_200_000,
  credit: 1_180_000,
});
void errorMessage;

async function accountingClientContract() {
  const flags = await getAccountingFlags();
  const uiEnabled: boolean = flags.erpUiEnabled;
  const postingEnabled: boolean = flags.postingEnabled;
  void uiEnabled;
  void postingEnabled;

  const filters: AccountingEventFilters = {
    dateFrom: "2099-01-01",
    dateTo: "2099-01-31",
    status: "REVIEW_PENDING",
    search: "D0101-ABC-0001",
  };

  const events = await listAccountingEvents(filters);
  if (events[0]) {
    const eventId: string = events[0].id;
    const lines = await getAccountingEventLines(eventId);
    const debit: number = lines[0]?.debit_amount ?? 0;
    void debit;
  }

  const input: FinanceDailyLogInput = {
    entry_date: "2099-01-01",
    department_code: "FINANCE",
    delivery_fees_collected: 0,
    cod_handling_fees: 0,
    surcharges: 0,
    rider_commissions_accrued: 0,
    fuel_and_tolls_spent: 5_000,
    packaging_supplies_spent: 0,
    petty_cash_expenses: 0,
    cod_cash_collected_in_hand: 0,
    accounts_receivable_invoiced: 0,
    accounts_payable_incurred: 0,
    source_mode: "MANUAL",
    metadata: {
      funding_account_code: "1010",
      reference: "FUEL-001",
    },
  };

  await submitFinanceDailyLog(input);
  await reviewAccountingEvent("00000000-0000-4000-8000-000000000000", "APPROVE", "Reviewed");
  await postAccountingEvent("00000000-0000-4000-8000-000000000000");
}

void accountingClientContract;
