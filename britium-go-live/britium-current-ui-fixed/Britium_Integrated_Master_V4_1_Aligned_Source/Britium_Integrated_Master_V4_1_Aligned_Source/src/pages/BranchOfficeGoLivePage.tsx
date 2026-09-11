// @ts-nocheck
// pages/branch/BranchOfficeGoLivePage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Building2, Package, AlertCircle, RefreshCw } from "lucide-react";

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, fallback = "—"): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => safeText(item, "")).filter(Boolean).join(", ");
    return joined || fallback;
  }
  if (isObject(value)) {
    for (const key of ["label", "name", "display_name", "value", "code"]) {
      const text = safeText(value[key], "");
      if (text) return text;
    }
    try {
      const json = JSON.stringify(value);
      return json === "{}" ? fallback : json;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function safeNumber(value: unknown): number {
  const parsed = Number(typeof value === "string" ? value.replace(/,/g, "") : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function flattenPayload(value: any): Record<string, any> {
  let current = isObject(value) ? value : {};
  let merged: Record<string, any> = {};
  const seen = new Set<any>();

  for (let depth = 0; depth < 8 && isObject(current) && !seen.has(current); depth += 1) {
    seen.add(current);
    const { payload, ...rest } = current;
    merged = { ...merged, ...rest };
    if (!isObject(payload)) break;
    current = payload;
  }

  return merged;
}

function normalizePickup(value: any) {
  const row = flattenPayload(value);
  return {
    ...row,
    pickup_id: safeText(row.pickup_id ?? row.tracking_no ?? row.waybill_id, ""),
    status: safeText(row.status ?? row.record_status, "PENDING").toUpperCase(),
    merchant_code: safeText(row.merchant_code ?? row.merchant, ""),
    customer_name: safeText(row.customer_name ?? row.receiver_name ?? row.receiver, ""),
    address: safeText(row.address ?? row.delivery_address, ""),
    township: safeText(row.township ?? row.destination_township, ""),
    tier: safeText(row.tier ?? row.service_type, "STANDARD"),
    weight_kg: safeNumber(row.weight_kg),
  };
}

function normalizeNotification(value: any) {
  const row = flattenPayload(value);
  return {
    ...row,
    id: safeText(row.id ?? row.notification_id ?? crypto.randomUUID()),
    pickup_id: safeText(row.pickup_id ?? row.tracking_no, ""),
    message: safeText(row.message ?? row.body ?? row.description, "Branch notification"),
  };
}

export default function BranchOfficeGoLivePage() {
  const [activeBranch, setActiveBranch] = useState<"MDY" | "NPT">("MDY");
  const [branchData, setBranchData] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchBranchSnapshot = async (branchCode: string) => {
    setLoading(true);
    setErrorMessage("");

    try {
      const [pickupResult, notificationResult] = await Promise.all([
        supabase
          .from("be_portal_pickup_requests")
          .select("*")
          .eq("branch_code", branchCode)
          .order("created_at", { ascending: false }),
        supabase
          .from("be_app_notifications")
          .select("*")
          .eq("target_branch", branchCode)
          .eq("is_read", false)
          .order("created_at", { ascending: false }),
      ]);

      if (pickupResult.error) throw pickupResult.error;
      if (notificationResult.error) throw notificationResult.error;

      setBranchData((pickupResult.data || []).map(normalizePickup));
      setNotifications((notificationResult.data || []).map(normalizeNotification));
    } catch (error: any) {
      console.error("Branch Snapshot Failed:", error);
      setBranchData([]);
      setNotifications([]);
      setErrorMessage(error?.message || "Could not load the branch snapshot.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBranchSnapshot(activeBranch);
  }, [activeBranch]);

  const getStatusColor = (value: unknown) => {
    const status = safeText(value, "PENDING").toUpperCase();
    if (status.includes("COMPLETED") || status.includes("DELIVERED")) {
      return "bg-green-100 text-green-800";
    }
    if (status.includes("FAILED") || status.includes("EXCEPTION")) {
      return "bg-red-100 text-red-800";
    }
    return "bg-blue-100 text-blue-800";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-blue-800" />
          <h1 className="text-2xl font-bold">Regional Branch Office</h1>
        </div>
        <button
          onClick={() => void fetchBranchSnapshot(activeBranch)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <Tabs value={activeBranch} onValueChange={(value) => setActiveBranch(value as "MDY" | "NPT")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="MDY">Mandalay (MDY)</TabsTrigger>
          <TabsTrigger value="NPT">Naypyitaw (NPT)</TabsTrigger>
        </TabsList>
      </Tabs>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center text-gray-500 animate-pulse">Loading Branch Snapshot...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Package className="w-5 h-5" /> Operational Registry ({activeBranch})
            </h2>

            <div className="bg-white border rounded-lg shadow-sm">
              {branchData.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No active operations recorded for {activeBranch} branch.
                </div>
              ) : (
                <div className="divide-y">
                  {branchData.map((request, index) => (
                    <div
                      key={request.pickup_id || request.id || index}
                      className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold">{safeText(request.pickup_id)}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${getStatusColor(request.status)}`}
                          >
                            {safeText(request.status).replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {safeText(request.merchant_code)} - {safeText(request.customer_name)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {safeText(request.address)}, {safeText(request.township)}
                        </p>
                      </div>

                      <div className="text-right">
                        <Badge variant="outline">{safeText(request.tier, "STANDARD")}</Badge>
                        <p className="text-xs text-gray-500 mt-1">{safeNumber(request.weight_kg)} kg</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Branch Alerts
            </h2>

            <div className="bg-white border rounded-lg shadow-sm p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-4">No unread alerts.</div>
              ) : (
                notifications.map((notification, index) => (
                  <div
                    key={notification.id || index}
                    className="p-3 bg-red-50 border border-red-100 rounded-md text-sm"
                  >
                    <p className="font-semibold text-red-800">{safeText(notification.pickup_id)}</p>
                    <p className="text-red-600 mt-1">{safeText(notification.message)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
