import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAccountingEventLines,
  getAccountingFlags,
  listAccountingEvents,
  listGeneralLedger,
  listFixedAssets,
  postAccountingEvent,
  reviewAccountingEvent,
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
