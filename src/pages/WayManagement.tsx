// src/pages/WayManagement.tsx
// @ts-nocheck

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  Search,
  RefreshCw,
  Loader2,
  CheckCircle2,
  RotateCcw,
  XCircle,
  Truck,
} from "lucide-react";

type RawShipment = Record<string, unknown>;
type TimelineEvent = {
  id?: string;
  event_code?: string;
  to_status?: string;
  internal_status?: string;
  public_status?: string;
  event_at?: string;
  notes?: string | null;
};

type PodRecord = {
  id?: string;
  pod_type?: string | null;
  recipient_name?: string | null;
  recipient_relationship?: string | null;
  photo_url?: string | null;
  signature_image_url?: string | null;
  otp_verified?: boolean;
  collected_at?: string | null;
};

type WayRow = {
  id: string;
  trackingNo: string;
  customerName: string;
  phone: string;
  status: string;
  collectable: number;
  riderRemark: string;
  lastLocation: string;
  createdAt: string;
};

const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim();

function normalizeApiBase(input: string) {
  if (!input) return "";
  if (input.includes(".supabase.co")) return "";
  return input.replace(/\/+$/, "");
}

const API_BASE = normalizeApiBase(RAW_API_BASE);

function toText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "-";
}

function toNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function formatMMK(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0
  )} MMK`;
}

function getStatusBadge(status: string) {
  const s = status.toLowerCase();
  if (["delivered", "success", "completed"].includes(s)) return "bg-emerald-100 text-emerald-700";
  if (["failed", "delivery_failed", "cancelled"].includes(s)) return "bg-rose-100 text-rose-700";
  if (["returned", "return_initiated"].includes(s)) return "bg-amber-100 text-amber-700";
  if (["on_hold", "hold"].includes(s)) return "bg-violet-100 text-violet-700";
  return "bg-sky-100 text-sky-700";
}

function normalizeShipments(input: unknown): WayRow[] {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as Record<string, unknown>).items)
      ? ((input as Record<string, unknown>).items as RawShipment[])
      : input && typeof input === "object" && Array.isArray((input as Record<string, unknown>).shipments)
        ? ((input as Record<string, unknown>).shipments as RawShipment[])
        : [];

  return source.map((item, index) => ({
    id: toText(item.id, `row-${index}`),
    trackingNo: toText(item.tracking_no, item.trackingNo, item.waybill_no, item.waybillNo, item.code),
    customerName: toText(
      item.customer_name,
      item.customerName,
      item.recipient_name,
      item.recipientName,
      item.sender_name,
      item.senderName
    ),
    phone: toText(item.phone, item.recipient_phone, item.customer_phone, item.sender_phone),
    status: toText(item.current_status, item.status, item.delivery_status, "processing").toLowerCase(),
    collectable: toNumber(
      item.total_collectable,
      item.totalCollectable,
      item.cod_amount,
      item.codAmount,
      item.total_charge,
      item.totalCharge,
      item.delivery_fee,
      item.deliveryFee
    ),
    riderRemark: toText(item.rider_remark, item.riderRemark, item.comments, item.remark, "No comments"),
    lastLocation: toText(item.last_location, item.lastLocation, item.address, item.current_branch, "Processing"),
    createdAt: toText(item.created_at, item.createdAt, "-"),
  }));
}

async function buildHeaders(json = true) {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (json) headers.set("Content-Type", "application/json");

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return headers;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${path}, got ${contentType || "non-JSON response"}`);
  }

  const payload = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Request failed (${response.status})`);
  }

  return payload as T;
}

export default function WayManagementPage() {
  const [rows, setRows] = useState<WayRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<WayRow | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [pod, setPod] = useState<PodRecord | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchShipments();
  }, []);

  async function fetchShipments() {
    setListLoading(true);
    setError(null);

    try {
      const headers = await buildHeaders(false);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (query.trim()) params.set("tracking_no", query.trim());

      const data = await apiRequest<unknown>(
        `/api/v1/shipments${params.toString() ? `?${params.toString()}` : ""}`,
        { method: "GET", headers }
      );

      setRows(normalizeShipments(data));
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load shipments");
    } finally {
      setListLoading(false);
    }
  }

  async function openDetails(row: WayRow) {
    setSelected(row);
    setDetailLoading(true);
    setTimeline([]);
    setPod(null);

    try {
      const headers = await buildHeaders(false);

      const [timelineRes, podRes] = await Promise.allSettled([
        apiRequest<{ items?: TimelineEvent[] } | TimelineEvent[]>(
          `/api/v1/shipments/${row.id}/timeline`,
          { method: "GET", headers }
        ),
        apiRequest<PodRecord>(`/api/v1/shipments/${row.id}/pod`, {
          method: "GET",
          headers,
        }),
      ]);

      if (timelineRes.status === "fulfilled") {
        const data = timelineRes.value;
        setTimeline(Array.isArray(data) ? data : data.items || []);
      }

      if (podRes.status === "fulfilled") {
        setPod(podRes.value);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load details");
    } finally {
      setDetailLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        row.trackingNo.toLowerCase().includes(q) ||
        row.customerName.toLowerCase().includes(q) ||
        row.phone.includes(q);

      const matchesStatus = statusFilter === "all" ? true : row.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  return (
    <div className="min-h-screen bg-[#f7f9fc] p-8">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
          Britium Express Delivery
        </p>
        <h1 className="text-4xl font-black uppercase tracking-tight text-[#0d2c54]">
          Way Management <span className="font-normal">/ ကုန်စည်စီမံခန့်ခွဲမှု</span>
        </h1>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        <MetricCard icon={<Truck size={28} />} badge="ACTIVE" title="Total Ways / စုစုပေါင်း" value={filteredRows.length} dark />
        <MetricCard icon={<CheckCircle2 className="text-emerald-500" size={28} />} badge="SUCCESS" title="Delivered / ပို့ပြီး" value={filteredRows.filter((r) => r.status === "delivered").length} />
        <MetricCard icon={<XCircle className="text-rose-500" size={28} />} badge="FAILURE" title="Failed / မအောင်မြင်မှု" value={filteredRows.filter((r) => r.status.includes("failed")).length} />
        <MetricCard icon={<RotateCcw className="text-amber-500" size={28} />} badge="RETURN" title="Returns / ပြန်ပို့မှု" value={filteredRows.filter((r) => r.status.includes("return")).length} />
      </div>

      <div className="mt-8 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr_0.5fr]">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracking... | ကုန်စည်နံပါတ်ဖြင့်ရှာရန်"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium outline-none focus:border-[#0d2c54]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none"
          >
            <option value="all">All Statuses / အခြေအနေအားလုံး</option>
            <option value="pending_pickup">Pending Pickup</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
          </select>

          <button
            onClick={() => void fetchShipments()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#0d2c54] px-4 py-3 text-sm font-black text-white"
          >
            {listLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-8 overflow-x-auto rounded-[28px] border border-slate-200">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left font-black uppercase tracking-wider text-slate-500">
                <th className="px-4 py-4">Tracking</th>
                <th className="px-4 py-4">Customer</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Collectable</th>
                <th className="px-4 py-4">Location</th>
                <th className="px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-4 py-4 font-black text-[#0d2c54]">
                    {row.trackingNo}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <div>{row.customerName}</div>
                    <div className="text-xs text-slate-400">{row.phone}</div>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${getStatusBadge(row.status)}`}>
                      {row.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4 font-black text-emerald-600">
                    {formatMMK(row.collectable)}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-4 text-slate-600">{row.lastLocation}</td>
                  <td className="border-b border-slate-100 px-4 py-4">
                    <button onClick={() => void openDetails(row)} className="font-bold text-[#0d2c54] hover:underline">
                      {detailLoading && selected?.id === row.id ? "Loading..." : "Details"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected ? (
          <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
            <div className="text-xl font-black text-[#0d2c54]">{selected.trackingNo}</div>
            <div className="mt-2 text-sm text-slate-600">{selected.customerName} · {selected.phone}</div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-black text-slate-500">Timeline</div>
                <div className="mt-3 space-y-2">
                  {timeline.length ? timeline.map((item, idx) => (
                    <div key={item.id || idx} className="rounded-xl border border-slate-100 p-3 text-sm">
                      <div className="font-semibold text-[#0d2c54]">
                        {item.to_status || item.public_status || item.internal_status || item.event_code || "-"}
                      </div>
                      <div className="text-slate-500">{item.event_at || "-"}</div>
                      {item.notes ? <div className="mt-1 text-slate-600">{item.notes}</div> : null}
                    </div>
                  )) : <div className="text-sm text-slate-500">No timeline found.</div>}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-black text-slate-500">POD</div>
                <div className="mt-3 text-sm text-slate-700">
                  <div>Recipient: {pod?.recipient_name || "-"}</div>
                  <div>Relationship: {pod?.recipient_relationship || "-"}</div>
                  <div>Collected At: {pod?.collected_at || "-"}</div>
                  <div>OTP Verified: {pod?.otp_verified ? "Yes" : "No"}</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ icon, badge, title, value, dark = false }: any) {
  return (
    <div className={`rounded-[28px] p-6 shadow-sm ${dark ? "bg-[#192b4d] text-white" : "bg-white"}`}>
      <div className="mb-6 flex items-center justify-between">
        {icon}
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-700">
          {badge}
        </span>
      </div>
      <p className="text-xs font-black uppercase tracking-[0.2em] opacity-60">{title}</p>
      <p className="mt-4 text-5xl font-black">{value}</p>
    </div>
  );
}