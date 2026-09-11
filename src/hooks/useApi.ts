// ─────────────────────────────────────────────────────────────────────────────
// useApi.ts — TanStack Query wrappers for all Britium API endpoints
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient, QueryKey } from "@tanstack/react-query";
import api, { ApiError } from "../lib/apiClient";
import { API_ROUTES } from "../lib/config";
import type { RiderTask } from "../types";
import {
  listAssignedRiderTasks,
  performRiderAction,
  submitPickupVerification,
  uploadRiderProof,
  type RiderActionRequest,
  type RiderPickupVerificationRequest,
  type RiderProofUploadRequest,
} from "../lib/riderWorkflow";

// ── Generic helpers ───────────────────────────────────────────────────────────
export function useApiQuery<T>(
  queryKey: QueryKey,
  endpoint: string,
  params?: Record<string, string | number | boolean>,
  options?: { enabled?: boolean; staleTime?: number; refetchInterval?: number }
) {
  return useQuery<T, ApiError>({
    queryKey,
    queryFn: () => api.get<T>(endpoint, params),
    staleTime: options?.staleTime ?? 30_000,
    refetchInterval: options?.refetchInterval,
    enabled: options?.enabled ?? true,
  });
}

export function useApiMutation<TData, TVariables>(
  mutateFn: (vars: TVariables) => Promise<TData>,
  invalidateKeys?: QueryKey[]
) {
  const qc = useQueryClient();
  return useMutation<TData, ApiError, TVariables>({
    mutationFn: mutateFn,
    onSuccess: () => {
      invalidateKeys?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WAREHOUSE hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useWarehouseOverview() {
  return useApiQuery(["warehouse", "overview"], API_ROUTES.WH_OVERVIEW, undefined, {
    refetchInterval: 30_000,
  });
}
export function useWarehouseInbound() {
  return useApiQuery(["warehouse", "inbound"], API_ROUTES.WH_INBOUND, undefined, {
    refetchInterval: 15_000,
  });
}
export function useWarehouseStaging() {
  return useApiQuery(["warehouse", "staging"], API_ROUTES.WH_STAGING);
}
export function useWarehouseStorage() {
  return useApiQuery(["warehouse", "storage"], API_ROUTES.WH_STORAGE);
}
export function useWarehouseOutbound() {
  return useApiQuery(["warehouse", "outbound"], API_ROUTES.WH_OUTBOUND, undefined, {
    refetchInterval: 15_000,
  });
}
export function useWarehouseManifests() {
  return useApiQuery(["warehouse", "manifests"], API_ROUTES.WH_MANIFESTS);
}
export function useQrScan() {
  return useApiMutation((code: string) =>
    api.get(API_ROUTES.WH_QR, { code })
  );
}
export function useMoveToStaging() {
  return useApiMutation(
    (body: { trackingNo: string; zone: string; lane: string; position: string }) =>
      api.post(API_ROUTES.WH_STAGING, body),
    [["warehouse", "staging"], ["warehouse", "inbound"]]
  );
}
export function useMoveToStorage() {
  return useApiMutation(
    (body: { trackingNo: string; rack: string; bin: string }) =>
      api.post(API_ROUTES.WH_STORAGE, body),
    [["warehouse", "storage"], ["warehouse", "staging"]]
  );
}
export function useDispatchOutbound() {
  return useApiMutation(
    (body: { trackingNo: string; manifestNo?: string }) =>
      api.post(API_ROUTES.WH_OUTBOUND, body),
    [["warehouse", "outbound"], ["warehouse", "storage"]]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useFinanceOverview() {
  return useApiQuery(["finance", "overview"], API_ROUTES.FIN_OVERVIEW, undefined, {
    refetchInterval: 60_000,
  });
}
export function useCodReconciliation(params?: Record<string, string>) {
  return useApiQuery(["finance", "cod", params], API_ROUTES.FIN_COD, params);
}
export function useSettlements(params?: Record<string, string>) {
  return useApiQuery(["finance", "settlements", params], API_ROUTES.FIN_SETTLEMENTS, params);
}
export function useApproveSettlement() {
  return useApiMutation(
    (id: string) => api.post(API_ROUTES.FIN_SETTLE_APPROVE(id)),
    [["finance", "settlements"]]
  );
}
export function useRiderWallets() {
  return useApiQuery(["finance", "rider-wallets"], API_ROUTES.FIN_RIDER_WALLETS);
}
export function useVouchers() {
  return useApiQuery(["finance", "vouchers"], API_ROUTES.FIN_VOUCHERS);
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN HR hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useEmployees(params?: Record<string, string>) {
  return useApiQuery(["hr", "employees", params], API_ROUTES.HR_EMPLOYEES, params);
}
export function useCreateEmployee() {
  return useApiMutation(
    (body: Record<string, unknown>) => api.post(API_ROUTES.HR_EMPLOYEES, body),
    [["hr", "employees"]]
  );
}
export function useUpdateEmployee() {
  return useApiMutation(
    ({ id, ...body }: { id: string; [k: string]: unknown }) =>
      api.patch(API_ROUTES.HR_EMPLOYEE(id), body),
    [["hr", "employees"]]
  );
}
export function useAttendance(params?: Record<string, string>) {
  return useApiQuery(["hr", "attendance", params], API_ROUTES.HR_ATTENDANCE, params);
}
export function useLeaveRequests(params?: Record<string, string>) {
  return useApiQuery(["hr", "leave", params], API_ROUTES.HR_LEAVE, params);
}
export function useLeaveAction() {
  return useApiMutation(
    ({ id, action, note }: { id: string; action: "approve" | "reject"; note?: string }) =>
      api.post(API_ROUTES.HR_LEAVE_ACT(id), { action, note }),
    [["hr", "leave"]]
  );
}
export function useApprovals() {
  return useApiQuery(["hr", "approvals"], API_ROUTES.HR_APPROVALS);
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETING hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useMarketingOverview() {
  return useApiQuery(["marketing", "overview"], API_ROUTES.MKT_OVERVIEW);
}
export function useCampaigns(params?: Record<string, string>) {
  return useApiQuery(["marketing", "campaigns", params], API_ROUTES.MKT_CAMPAIGNS, params);
}
export function useCreateCampaign() {
  return useApiMutation(
    (body: Record<string, unknown>) => api.post(API_ROUTES.MKT_CAMPAIGNS, body),
    [["marketing", "campaigns"]]
  );
}
export function useLeads(params?: Record<string, string>) {
  return useApiQuery(["marketing", "leads", params], API_ROUTES.MKT_LEADS, params);
}
export function useUpdateLead() {
  return useApiMutation(
    ({ id, ...body }: { id: string; [k: string]: unknown }) =>
      api.patch(API_ROUTES.MKT_LEAD(id), body),
    [["marketing", "leads"]]
  );
}
export function usePromoCodes() {
  return useApiQuery(["marketing", "promos"], API_ROUTES.MKT_PROMOS);
}
export function usePartnerships() {
  return useApiQuery(["marketing", "partnerships"], API_ROUTES.MKT_PARTNERSHIPS);
}
export function useZoneLaunches() {
  return useApiQuery(["marketing", "zones"], API_ROUTES.MKT_ZONES);
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONS hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useShipments(params?: Record<string, string>) {
  return useApiQuery(["ops", "shipments", params], API_ROUTES.OPS_SHIPMENTS, params, {
    refetchInterval: 20_000,
  });
}
export function useShipment(id: string) {
  return useApiQuery(["ops", "shipment", id], API_ROUTES.OPS_SHIPMENT(id), undefined, {
    enabled: !!id,
  });
}
export function useTrackShipment(awb: string) {
  return useApiQuery(["ops", "track", awb], API_ROUTES.OPS_TRACK(awb), undefined, {
    enabled: !!awb,
    staleTime: 10_000,
  });
}
export function useCreateShipment() {
  return useApiMutation(
    (body: Record<string, unknown>) => api.post(API_ROUTES.OPS_CREATE, body),
    [["ops", "shipments"]]
  );
}
export function useExceptions(params?: Record<string, string>) {
  return useApiQuery(["ops", "exceptions", params], API_ROUTES.OPS_EXCEPTIONS, params, {
    refetchInterval: 30_000,
  });
}
export function usePickups(params?: Record<string, string>) {
  return useApiQuery(["ops", "pickups", params], API_ROUTES.OPS_PICKUPS, params);
}
export function useCreatePickup() {
  return useApiMutation(
    (body: Record<string, unknown>) => api.post(API_ROUTES.OPS_PICKUPS, body),
    [["ops", "pickups"]]
  );
}
export function useTickets(params?: Record<string, string>) {
  return useApiQuery(["ops", "tickets", params], API_ROUTES.OPS_TICKETS, params);
}
export function useCreateTicket() {
  return useApiMutation(
    (body: Record<string, unknown>) => api.post(API_ROUTES.OPS_TICKETS, body),
    [["ops", "tickets"]]
  );
}
export function useUpdateTicket() {
  return useApiMutation(
    ({ id, ...body }: { id: string; [k: string]: unknown }) =>
      api.patch(API_ROUTES.OPS_TICKET(id), body),
    [["ops", "tickets"]]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useNotifications() {
  return useApiQuery(["notifications"], API_ROUTES.NOTIF_LIST, undefined, {
    refetchInterval: 45_000,
  });
}
export function useMarkRead() {
  return useApiMutation(
    (id: string) => api.post(API_ROUTES.NOTIF_READ(id)),
    [["notifications"]]
  );
}
export function useMarkAllRead() {
  return useApiMutation(
    () => api.post(API_ROUTES.NOTIF_READ_ALL),
    [["notifications"]]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useUploadPod() {
  return useApiMutation((formData: FormData) =>
    api.upload(API_ROUTES.UPLOAD_POD, formData)
  );
}
export function useBulkUpload() {
  return useApiMutation(
    (formData: FormData) => api.upload(API_ROUTES.UPLOAD_BULK, formData),
    [["ops", "shipments"]]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANCH OFFICE hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useBranchOverview() {
  return useApiQuery(["branch", "overview"], API_ROUTES.BRANCH_OVERVIEW, undefined, {
    refetchInterval: 30_000,
  });
}
export function useBranchManifests() {
  return useApiQuery(["branch", "manifests"], API_ROUTES.BRANCH_MANIFESTS, undefined, {
    refetchInterval: 20_000,
  });
}
export function useBranchShipments(params?: Record<string, string>) {
  return useApiQuery(["branch", "shipments", params], API_ROUTES.BRANCH_SHIPMENTS, params, {
    refetchInterval: 20_000,
  });
}
export function useBranchRiders() {
  return useApiQuery(["branch", "riders"], API_ROUTES.BRANCH_RIDERS, undefined, {
    refetchInterval: 15_000,
  });
}
export function useAssignRider() {
  return useApiMutation(
    (body: { shipment_ids: string[]; rider_id: string }) =>
      api.post(API_ROUTES.BRANCH_ASSIGN, body),
    [["branch", "shipments"], ["branch", "riders"], ["branch", "overview"]]
  );
}
export function useConfirmManifest() {
  return useApiMutation(
    (id: string) => api.post(`${API_ROUTES.BRANCH_MANIFESTS}/${id}/confirm`),
    [["branch", "manifests"], ["branch", "overview"]]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RIDER hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useRiderTasks() {
  return useQuery<RiderTask[], Error>({
    queryKey: ["rider", "tasks"],
    queryFn: () => listAssignedRiderTasks(100),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useRiderWallet() {
  return useApiQuery(
    ["rider", "wallet"],
    API_ROUTES.RIDER_WALLET,
    undefined,
    { refetchInterval: 30_000 }
  );
}

export function useRiderAction() {
  const qc = useQueryClient();

  return useMutation<unknown, Error, RiderActionRequest>({
    mutationFn: performRiderAction,
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["rider", "tasks"],
      });
    },
  });
}

export function useSubmitPickupVerification() {
  const qc = useQueryClient();

  return useMutation<
    unknown,
    Error,
    RiderPickupVerificationRequest
  >({
    mutationFn: submitPickupVerification,
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["rider", "tasks"],
      });
    },
  });
}

export function useUploadRiderProof() {
  return useMutation<string, Error, RiderProofUploadRequest>({
    mutationFn: ({ task_id, file }) =>
      uploadRiderProof(task_id, file),
  });
}

export function useRiderHistory(
  params?: Record<string, string>
) {
  return useApiQuery(
    ["rider", "history", params],
    API_ROUTES.RIDER_HISTORY,
    params
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useMyShipments() {
  return useApiQuery(["customer", "my-shipments"], API_ROUTES.CUSTOMER_SHIPMENTS, undefined, {
    refetchInterval: 30_000,
  });
}
export function useSavedAddresses() {
  return useApiQuery(["customer", "addresses"], API_ROUTES.CUSTOMER_ADDRESSES);
}
export function useCreateAddress() {
  return useApiMutation(
    (body: Record<string, unknown>) => api.post(API_ROUTES.CUSTOMER_ADDRESSES, body),
    [["customer", "addresses"]]
  );
}
export function useDeleteAddress() {
  return useApiMutation(
    (id: string) => api.delete(`${API_ROUTES.CUSTOMER_ADDRESSES}/${id}`),
    [["customer", "addresses"]]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPER ADMIN hooks
// ─────────────────────────────────────────────────────────────────────────────
export function usePlatformOverview() {
  return useApiQuery(["admin", "platform-overview"], API_ROUTES.ADMIN_OVERVIEW, undefined, {
    refetchInterval: 30_000,
  });
}
export function useAllUsers(params?: Record<string, string>) {
  return useApiQuery(["admin", "users", params], API_ROUTES.ADMIN_USERS, params);
}
export function usePatchUser() {
  return useApiMutation(
    ({ id, ...body }: { id: string; [k: string]: unknown }) =>
      api.patch(API_ROUTES.ADMIN_USER(id), body),
    [["admin", "users"]]
  );
}
export function useAuditLog(params?: Record<string, string>) {
  return useApiQuery(["admin", "audit-log", params], API_ROUTES.ADMIN_AUDIT_LOG, params);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIPMENT TIMELINE (shared — used by customer & CS portals)
// ─────────────────────────────────────────────────────────────────────────────
export function useShipmentTimeline(shipmentId: string) {
  return useApiQuery(
    ["ops", "shipment-timeline", shipmentId],
    `${API_ROUTES.OPS_SHIPMENT(shipmentId)}/timeline`,
    undefined,
    { enabled: !!shipmentId }
  );
}
