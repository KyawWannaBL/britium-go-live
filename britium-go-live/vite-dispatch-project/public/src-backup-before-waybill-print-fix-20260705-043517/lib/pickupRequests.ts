// src/lib/pickupRequests.ts
export type PickupRequest = {
  pickupId: string;
  waybillNo: string;
  merchantName: string;
  merchantCode: string;
  phone?: string;
  township?: string;
  address: string;
  parcels: number;
  source: "customer_service" | "create_delivery";
  status: "Pending Pickup" | "Pickup Assigned";
  assignedVehicleId?: string;
  assignedHelperId?: string;
  createdAt: string;
};

export const PICKUP_REQUESTS_STORAGE_KEY = "britium_pickup_requests";

export function loadPickupRequests(): PickupRequest[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(PICKUP_REQUESTS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function savePickupRequest(request: PickupRequest) {
  const rows = loadPickupRequests();
  const next = [request, ...rows.filter((row) => row.pickupId !== request.pickupId)];
  window.localStorage.setItem(PICKUP_REQUESTS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("britium-pickup-requests-updated"));
}

export function updatePickupRequest(pickupId: string, patch: Partial<PickupRequest>) {
  const next = loadPickupRequests().map((row) =>
    row.pickupId === pickupId ? { ...row, ...patch } : row,
  );
  window.localStorage.setItem(PICKUP_REQUESTS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("britium-pickup-requests-updated"));
}