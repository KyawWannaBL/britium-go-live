// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Search } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  rpcName: string;
  rpcArgs?: Record<string, any>;
  rowsKey?: string;
  searchPlaceholder?: string;
};

const C = {
  panel: "bg-[#0b2236] border border-[#1a3a5c] rounded-2xl",
  card: "bg-[#071827] border border-[#1a3a5c] rounded-xl",
  text: "text-[#eef8ff]",
  sub: "text-[#8ab0c9]",
  orange: "text-[#f6b84b]",
};

function normalizeRows(snapshot: any, rowsKey?: string): any[] {
  if (!snapshot) return [];
  const keys = rowsKey
    ? [rowsKey]
    : ["rows", "queue", "jobs", "wayplans", "invoices", "shipments", "merchants", "service_areas", "events"];
  for (const k of keys) {
    if (Array.isArray(snapshot[k])) return snapshot[k];
  }
  return [];
}

function formatValue(v: any) {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function pickColumns(rows: any[]) {
  const preferred = [
    "tracking_no", "pickup_id", "waybill_no", "wayplan_code", "merchant_name", "recipient_name",
    "phone_number", "township", "delivery_status", "dispatch_status", "warehouse_status",
    "cod_amount", "delivery_charges", "asset_code", "rider_email", "driver_email", "status",
    "invoice_status", "updated_at"
  ];
  const all = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))));
  return preferred.filter((c) => all.includes(c)).concat(all.filter((c) => !preferred.includes(c))).slice(0, 12);
}

export default function PortalLiveSnapshotPage({
  title,
  subtitle,
  rpcName,
  rpcArgs = {},
  rowsKey,
  searchPlaceholder = "Search live records...",
}: Props) {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc(rpcName, rpcArgs);
      if (error) throw error;
      setSnapshot(data || {});
    } catch (e: any) {
      setMessage(e?.message || `Failed to load ${rpcName}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [rpcName, JSON.stringify(rpcArgs)]);

  const stats = snapshot?.stats || {};
  const rows = normalizeRows(snapshot, rowsKey);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => JSON.stringify(r || {}).toLowerCase().includes(q));
  }, [rows, search]);
  const columns = pickColumns(filtered);

  return (
    <div className="space-y-5 p-4 text-[#eef8ff]">
      <div className={`${C.panel} p-5`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[#f6b84b] font-semibold tracking-wide">{title}</h1>
            <p className="text-[#8ab0c9] text-sm mt-1">{subtitle || "Live Supabase workflow data only. No demo or mock rows."}</p>
            <p className="text-[#4d7a9b] text-xs mt-2">API: {rpcName}</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-[#123b63] border border-[#1a5588] text-sm hover:bg-[#174c7d] disabled:opacity-60 flex items-center gap-2"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
        {message && <div className="mt-3 text-[#ff668a] text-sm">{message}</div>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.keys(stats || {}).length === 0 ? (
          <div className={`${C.card} p-4 text-[#8ab0c9]`}>No stats returned</div>
        ) : Object.entries(stats).map(([k, v]) => (
          <div key={k} className={`${C.card} p-4`}>
            <div className="text-[#8ab0c9] text-xs uppercase">{k.replaceAll("_", " ")}</div>
            <div className="text-[#f6b84b] font-semibold mt-2">{formatValue(v)}</div>
          </div>
        ))}
      </div>

      <div className={`${C.panel} overflow-hidden`}>
        <div className="flex items-center justify-between p-4 border-b border-[#1a3a5c] gap-3">
          <div>
            <div className="font-semibold">Live Records</div>
            <div className="text-[#8ab0c9] text-xs">{filtered.length} / {rows.length}</div>
          </div>
          <div className="relative w-full max-w-sm">
            <Search size={16} className="absolute left-3 top-2.5 text-[#8ab0c9]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#061524] border border-[#1a3a5c] text-sm"
            />
          </div>
        </div>

        <div className="overflow-auto max-h-[58vh]">
          {filtered.length === 0 ? (
            <div className="p-16 text-center text-[#8ab0c9]">No live records found.</div>
          ) : (
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="sticky top-0 bg-[#071827]">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="text-left px-3 py-3 border-b border-[#1a3a5c] text-[#8ab0c9] whitespace-nowrap">
                      {c.replaceAll("_", " ").toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r?.tracking_no || r?.pickup_id || r?.id || idx} className="border-b border-[#102b44] hover:bg-[#0d2a43]">
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-3 align-top whitespace-nowrap max-w-[280px] truncate">
                        {formatValue(r?.[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
