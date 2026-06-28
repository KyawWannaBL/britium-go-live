import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Wallet, Bike, Car, Users, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Worker = {
  id?: string;
  auth_user_id?: string;
  worker_code?: string;
  rider_id?: string;
  driver_id?: string;
  helper_id?: string;
  full_name?: string;
  rider_name?: string;
  driver_name?: string;
  helper_name?: string;
  email?: string;
  role?: string;
  worker_type?: string;
  branch_code?: string;
  assigned_zone?: string;
  status?: string;
  wallet_balance?: number;
};

function nameOf(worker: Worker) {
  return worker.full_name || worker.rider_name || worker.driver_name || worker.helper_name || worker.email || worker.worker_code || worker.rider_id || "-";
}

function codeOf(worker: Worker) {
  return worker.worker_code || worker.rider_id || worker.driver_id || worker.helper_id || worker.id || "-";
}

export default function MobileWalletsPage() {
  const [rows, setRows] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await (supabase as any)
        .from("be_mobile_workforce_accounts")
        .select("*")
        .order("worker_code", { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (error: any) {
      setMessage(error?.message || "Mobile workforce wallet data is not ready yet.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    const rider = rows.filter((r) => /rider/i.test(`${r.role || r.worker_type || r.worker_code || r.rider_id || ""}`)).length;
    const driver = rows.filter((r) => /driver/i.test(`${r.role || r.worker_type || r.driver_id || ""}`)).length;
    const helper = rows.filter((r) => /helper/i.test(`${r.role || r.worker_type || r.helper_id || ""}`)).length;
    return { rider, driver, helper, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#1a3a5c] bg-[#071a2b] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-[#f6b84b] text-[13px] font-black uppercase tracking-[0.18em] flex items-center gap-2">
            <Wallet size={17} /> Rider / Driver / Helper Wallets
          </div>
          <p className="text-[#4d7a9b] text-[12px] mt-1">Backend workforce account wallet visibility. Settlement ledger can be connected to this screen in the SQL phase.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-4 py-2 text-[11px] font-black uppercase tracking-widest text-[#eef8ff] hover:border-[#f6b84b] hover:text-[#f6b84b]">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-[#f6b84b]/50 bg-[#061524] p-3 text-[#f6b84b] text-[12px] flex items-center gap-2">
          <AlertTriangle size={15} /> {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[#4d7a9b] text-[11px] uppercase">Total</div><div className="text-[#eef8ff] text-2xl font-black">{summary.total}</div></div>
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[#4d7a9b] text-[11px] uppercase flex gap-1"><Bike size={13}/> Riders</div><div className="text-[#eef8ff] text-2xl font-black">{summary.rider}</div></div>
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[#4d7a9b] text-[11px] uppercase flex gap-1"><Car size={13}/> Drivers</div><div className="text-[#eef8ff] text-2xl font-black">{summary.driver}</div></div>
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4"><div className="text-[#4d7a9b] text-[11px] uppercase flex gap-1"><Users size={13}/> Helpers</div><div className="text-[#eef8ff] text-2xl font-black">{summary.helper}</div></div>
      </div>

      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] overflow-hidden">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-[#061524] text-[#4ea8de] uppercase tracking-widest">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Name</th>
              <th className="p-3">Role</th>
              <th className="p-3">Branch</th>
              <th className="p-3">Zone</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Wallet Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-[#4d7a9b]">No mobile workforce wallet rows loaded.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={`${codeOf(row)}-${index}`} className="border-t border-[#1a3a5c]/60 hover:bg-[#061524]">
                <td className="p-3 text-[#f6b84b] font-bold">{codeOf(row)}</td>
                <td className="p-3 text-[#eef8ff]">{nameOf(row)}</td>
                <td className="p-3 text-[#c8dff0]">{row.role || row.worker_type || "-"}</td>
                <td className="p-3 text-[#c8dff0]">{row.branch_code || "YGN"}</td>
                <td className="p-3 text-[#c8dff0]">{row.assigned_zone || "-"}</td>
                <td className="p-3 text-[#c8dff0]">{row.status || "Active"}</td>
                <td className="p-3 text-right text-emerald-400 font-bold">{Number(row.wallet_balance || 0).toLocaleString()} MMK</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
