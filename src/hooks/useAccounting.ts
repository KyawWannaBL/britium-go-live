import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAccountingEventLines,
  getAccountingFlags,
  getAccountingReconciliation,
  getBalanceSheet,
  getProfitLoss,
  getTrialBalance,
  closeAccountingPeriod,
  listAccountingEvents,
  listAccountingAudit,
  listAccountingPeriods,
  listGeneralLedger,
  listJournalHeaders,
  listFixedAssets,
  postAccountingEvent,
  reviewAccountingEvent,
  reverseAccountingJournal,
  setAccountingFlag,
  submitAdminHrLog,
  submitFinanceDailyLog,
} from "@/lib/accountingApi";
import type {
  AccountingEventFilters,
  AccountingReviewAction,
  AdminHrLogInput,
  FinanceDailyLogInput,
} from "@/types/accounting";

export function useAccountingFlags() {
  return useQuery({
    queryKey: ["accounting", "flags"],
    queryFn: getAccountingFlags,
    staleTime: 30_000,
  });
}

export function useAccountingEvents(filters: AccountingEventFilters) {
  return useQuery({
    queryKey: ["accounting", "events", filters],
    queryFn: () => listAccountingEvents(filters),
    enabled: Boolean(filters),
    staleTime: 15_000,
  });
}

export function useAccountingEventLines(eventId?: string | null) {
  return useQuery({
    queryKey: ["accounting", "event-lines", eventId],
    queryFn: () => getAccountingEventLines(eventId as string),
    enabled: Boolean(eventId),
  });
}

export function useSubmitFinanceDailyLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FinanceDailyLogInput) => submitFinanceDailyLog(input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounting", "events"] }),
        qc.invalidateQueries({ queryKey: ["accounting", "finance-daily"] }),
      ]);
    },
  });
}

export function useSubmitAdminHrLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminHrLogInput) => submitAdminHrLog(input),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounting", "events"] }),
        qc.invalidateQueries({ queryKey: ["accounting", "assets"] }),
      ]);
    },
  });
}

export function useReviewAccountingEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      eventId: string;
      action: AccountingReviewAction;
      reason?: string;
    }) => reviewAccountingEvent(input.eventId, input.action, input.reason),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["accounting", "events"] });
    },
  });
}

export function usePostAccountingEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postAccountingEvent,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounting", "events"] }),
        qc.invalidateQueries({ queryKey: ["accounting", "general-ledger"] }),
      ]);
    },
  });
}

export function useGeneralLedger(limit = 500) {
  return useQuery({
    queryKey: ["accounting", "general-ledger", limit],
    queryFn: () => listGeneralLedger(limit),
    staleTime: 15_000,
  });
}

export function useFixedAssets() {
  return useQuery({
    queryKey: ["accounting", "assets"],
    queryFn: listFixedAssets,
    staleTime: 30_000,
  });
}

export function useAccountingPeriods() {
  return useQuery({
    queryKey: ["accounting", "periods"],
    queryFn: listAccountingPeriods,
    staleTime: 30_000,
  });
}

export function useAccountingAudit(limit = 300) {
  return useQuery({
    queryKey: ["accounting", "audit", limit],
    queryFn: () => listAccountingAudit(limit),
    staleTime: 15_000,
  });
}

export function useJournalHeaders(limit = 300) {
  return useQuery({
    queryKey: ["accounting", "journals", limit],
    queryFn: () => listJournalHeaders(limit),
    staleTime: 15_000,
  });
}

export function useSetAccountingFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      key: "ERP_UI_ENABLED" | "ACCOUNTING_SYNC_ENABLED" | "GL_POSTING_ENABLED" | "FINANCIAL_REPORTS_ENABLED";
      value: boolean;
      reason: string;
    }) => setAccountingFlag(input.key, input.value, input.reason),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["accounting", "flags"] });
    },
  });
}

export function useReverseAccountingJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { journalId: string; reason: string }) =>
      reverseAccountingJournal(input.journalId, input.reason),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounting", "journals"] }),
        qc.invalidateQueries({ queryKey: ["accounting", "general-ledger"] }),
        qc.invalidateQueries({ queryKey: ["accounting", "audit"] }),
      ]);
    },
  });
}

export function useCloseAccountingPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { periodId: string; reason: string }) =>
      closeAccountingPeriod(input.periodId, input.reason),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounting", "periods"] }),
        qc.invalidateQueries({ queryKey: ["accounting", "audit"] }),
      ]);
    },
  });
}

export function useTrialBalance(dateFrom: string, dateTo: string, enabled = true) {
  return useQuery({
    queryKey: ["accounting", "trial-balance", dateFrom, dateTo],
    queryFn: () => getTrialBalance(dateFrom, dateTo),
    enabled: enabled && Boolean(dateFrom && dateTo),
    staleTime: 30_000,
  });
}

export function useProfitLoss(dateFrom: string, dateTo: string, enabled = true) {
  return useQuery({
    queryKey: ["accounting", "profit-loss", dateFrom, dateTo],
    queryFn: () => getProfitLoss(dateFrom, dateTo),
    enabled: enabled && Boolean(dateFrom && dateTo),
    staleTime: 30_000,
  });
}

export function useBalanceSheet(asOf: string, enabled = true) {
  return useQuery({
    queryKey: ["accounting", "balance-sheet", asOf],
    queryFn: () => getBalanceSheet(asOf),
    enabled: enabled && Boolean(asOf),
    staleTime: 30_000,
  });
}

export function useAccountingReconciliation(asOf: string, enabled = true) {
  return useQuery({
    queryKey: ["accounting", "reconciliation", asOf],
    queryFn: () => getAccountingReconciliation(asOf),
    enabled: enabled && Boolean(asOf),
    staleTime: 30_000,
  });
}
