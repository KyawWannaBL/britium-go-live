import { create } from "zustand";

export type DispatchDelivery = {
  id: string;
  manifest_id: number | null;
  status: string | null;
  version: number;
  tracking_no?: string | null;
  delivery_id?: string | null;
  way_id?: string | null;
  delivered_at?: string | null;
  completed_by?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

export type DispatchManifest = {
  id: number;
  status: string | null;
  version: number;
  assigned_rider_id?: string | null;
  vehicle_id?: string | null;
  accepted_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
};

type RealtimeState = "connecting" | "connected" | "disconnected" | "error";

type DispatchState = {
  deliveriesById: Record<string, DispatchDelivery>;
  manifestsById: Record<number, DispatchManifest>;
  realtimeState: RealtimeState;
  upsertDelivery: (delivery: DispatchDelivery) => void;
  upsertManifest: (manifest: DispatchManifest) => void;
  removeDelivery: (id: string) => void;
  removeManifest: (id: number) => void;
  setRealtimeState: (state: RealtimeState) => void;
};

export const useDispatchStore = create<DispatchState>((set) => ({
  deliveriesById: {},
  manifestsById: {},
  realtimeState: "disconnected",

  upsertDelivery: (incoming) =>
    set((state) => {
      const current = state.deliveriesById[incoming.id];
      if (current && Number(current.version || 0) > Number(incoming.version || 0)) {
        return state;
      }
      return {
        deliveriesById: {
          ...state.deliveriesById,
          [incoming.id]: incoming,
        },
      };
    }),

  upsertManifest: (incoming) =>
    set((state) => {
      const current = state.manifestsById[incoming.id];
      if (current && Number(current.version || 0) > Number(incoming.version || 0)) {
        return state;
      }
      return {
        manifestsById: {
          ...state.manifestsById,
          [incoming.id]: incoming,
        },
      };
    }),

  removeDelivery: (id) =>
    set((state) => {
      const next = { ...state.deliveriesById };
      delete next[id];
      return { deliveriesById: next };
    }),

  removeManifest: (id) =>
    set((state) => {
      const next = { ...state.manifestsById };
      delete next[id];
      return { manifestsById: next };
    }),

  setRealtimeState: (realtimeState) => set({ realtimeState }),
}));
