import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const MOBILE_OPERATIONS_BUILD =
  "MOBILE_OPERATIONS_READ_ONLY_V56_2026_07_31";

type MobileRow = Record<string, any>;

type Snapshot = {
  ok?: boolean;
  build?: string;
  generated_at?: string;
  summary?: Record<string, unknown>;
  rows?: MobileRow[];
  data?: { rows?: MobileRow[]; summary?: Record<string, unknown> };
};

export default function MobileOperationsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc("be_mobile_operations_snapshot_v54", {
        p_payload: {},
      });
      if (rpcError) throw rpcError;
      setSnapshot((data || {}) as Snapshot);
    } catch (loadError: any) {
      setSnapshot({});
      setError(
        loadError?.message ||
          "The read-only mobile operations snapshot RPC is not deployed or this account is not authorized.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = Array.isArray(snapshot.rows)
    ? snapshot.rows
    : Array.isArray(snapshot.data?.rows)
      ? snapshot.data?.rows || []
      : [];
  const summary = snapshot.summary || snapshot.data?.summary || {};
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <main className="space-y-5" data-build={MOBILE_OPERATIONS_BUILD}>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]">
              <Smartphone size={15} /> Internal Production Support
            </div>
            <h1 className="mt-2 text-3xl font-black text-[#eef8ff]">Mobile Operations</h1>
            <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[#8fb4d0]">
              Read-only rider, driver, device, synchronization, proof, COD handover, and support visibility. The field Rider application remains separately available at <code>/rider-app</code> and is not replaced by this console.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2.5 text-[12px] font-black text-[#061524] disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        <div className="mt-4 text-[11px] text-[#6f98b8]">
          Backend source: be_mobile_operations_snapshot_v54 · Build: {snapshot.build || "not returned"}
        </div>
      </section>

      {error ? (
        <section className="flex items-start gap-3 rounded-2xl border border-rose-700 bg-rose-950/25 p-4 text-[12px] leading-6 text-rose-100">
          <AlertTriangle size={17} className="mt-1 shrink-0" />
          <div>
            <div className="font-black uppercase tracking-wider">Mobile Operations backend unavailable</div>
            <div>{error}</div>
            <div className="mt-1 text-rose-200/80">No synthetic jobs, locations, proofs, or mobile events are displayed.</div>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Workforce" value={metric(summary, "workforce", "workforce_count", rows.length)} />
        <Metric label="Offline Queue" value={metric(summary, "offline_queue", "offline_queue_count")} />
        <Metric label="Failed Events" value={metric(summary, "failed_events", "failed_event_count")} />
        <Metric label="Open Support" value={metric(summary, "open_support", "open_support_count")} />
      </section>

      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1a3a5c] p-4">
          <div className="font-black uppercase tracking-widest text-[#eef8ff]">Mobile Workforce Status</div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search identity, branch, account, sync or issue..."
            className="w-full max-w-md rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2.5 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b]"
          />
        </div>
        <div className="max-h-[580px] overflow-auto">
          <table className="w-full min-w-[1100px] text-left text-[11px]">
            <thead className="sticky top-0 bg-[#081b2e] uppercase tracking-wider text-[#6f98b8]">
              <tr>
                <th className="p-3">Identity</th>
                <th className="p-3">Type / Branch</th>
                <th className="p-3">Account</th>
                <th className="p-3">Assignments</th>
                <th className="p-3">Last Sync</th>
                <th className="p-3">Offline Queue</th>
                <th className="p-3">Issue</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr key={String(row.workforce_code || row.employee_id || row.user_id || index)} className="border-t border-[#12304d] text-[#d8ecfa]">
                  <td className="p-3">
                    <div className="font-black text-[#f6b84b]">{text(row.workforce_code || row.employee_code || row.rider_code || row.user_id)}</div>
                    <div className="mt-1 text-[#8fb4d0]">{text(row.display_name || row.workforce_name || row.name)}</div>
                  </td>
                  <td className="p-3">{text(row.workforce_type || row.type)} · {text(row.branch_code || row.branch)}</td>
                  <td className="p-3">{text(row.account_status || row.user_status)} / PIN {text(row.pin_status)}</td>
                  <td className="p-3">Pickups {number(row.assigned_pickups)} · Wayplans {number(row.assigned_wayplans)}</td>
                  <td className="p-3">{date(row.last_successful_sync || row.last_sync_at)}</td>
                  <td className="p-3">{number(row.offline_queue_count)} · oldest {date(row.oldest_offline_event_at)}</td>
                  <td className="p-3">{text(row.issue_type || row.latest_issue || row.sync_status)}</td>
                </tr>
              ))}
              {!loading && visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-[#6f98b8]">
                    <WifiOff className="mx-auto mb-3 opacity-50" />
                    {error ? "No data loaded because the backend snapshot failed." : "The backend returned no mobile workforce records."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#6f98b8]">{label}</div>
      <div className="mt-2 text-2xl font-black text-[#f6b84b]">{value}</div>
    </div>
  );
}

function metric(summary: Record<string, unknown>, ...keys: Array<string | number>) {
  const fallback = typeof keys[keys.length - 1] === "number" ? Number(keys.pop()) : null;
  for (const key of keys) {
    const value = summary[String(key)];
    if (value !== undefined && value !== null && value !== "") return number(value);
  }
  return fallback === null ? "—" : fallback.toLocaleString();
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || "—";
}

function date(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
}
