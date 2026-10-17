import React, { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Wallet, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LedgerRow = {
  work_date: string;
  assignee_name: string | null;
  assignee_email: string | null;
  role_code: string;
  operation_type: string;
  unit_type: string;
  total_units: number;
  rate_mmk: number;
  commission_mmk: number;
};

type Summary = {
  total_commission: number;
  event_rows: number;
  rider_commission: number;
  driver_commission: number;
  helper_commission: number;
  pickup_commission: number;
  delivery_commission: number;
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLast30Days() {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return localDateKey(date);
}

export default function WorkforceCommissionPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(startOfLast30Days);
  const [toDate, setToDate] = useState(() => localDateKey(new Date()));
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [stats, setStats] = useState<Summary | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  const fetchPayouts = async (sync: boolean = false) => {
    setErrorMessage("");
    setSyncMessage("");
    if (!fromDate || !toDate || fromDate > toDate) {
      setErrorMessage("Please select a valid date range.");
      return;
    }
    const days = Math.round(
      (Date.parse(toDate + "T00:00:00Z") - Date.parse(fromDate + "T00:00:00Z")) / 86400000
    );
    if (days > 31) {
      setErrorMessage("Select up to 32 days per report.");
      return;
    }

    setLoading(true);
    try {
      if (sync) {
        const { data, error } = await (supabase as any).rpc(
          "be_workforce_commission_sync_range_v202",
          { p_from: fromDate, p_to: toDate }
        );
        if (error) throw error;
        if (data?.ok === false) {
          throw new Error(data?.message || data?.error || "Commission synchronization failed.");
        }
        setSyncMessage(`Synchronization completed for ${fromDate} to ${toDate}. Delivered stops reviewed: ${Number(data?.delivered_stops_synced || 0)}.`);
      }

      // Reporting must be read-only. Do not replay delivery/payment triggers on every page load.
      const { data, error } = await (supabase as any)
        .from("be_v_commission_settlement")
        .select("*")
        .gte("work_date", fromDate)
        .lte("work_date", toDate)
        .order("work_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as LedgerRow[];
      setLedger(rows);

      const sum = (predicate: (row: LedgerRow) => boolean) =>
        rows.filter(predicate).reduce((total, row) => total + Number(row.commission_mmk || 0), 0);
      setStats({
        total_commission: sum(() => true),
        event_rows: rows.length,
        rider_commission: sum((row) => row.role_code === "RIDER"),
        driver_commission: sum((row) => row.role_code === "DRIVER"),
        helper_commission: sum((row) => row.role_code === "HELPER"),
        pickup_commission: sum((row) => row.operation_type === "PICKUP"),
        delivery_commission: sum((row) => row.operation_type === "DELIVERY"),
      });
      if (rows.length >= 5000) {
        setErrorMessage("Report hit the 5,000-row limit. Please narrow the date range for complete totals.");
      }
    } catch (error: any) {
      console.error("Workforce commission report error", error);
      setErrorMessage(error?.message || "Unable to load commission records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPayouts(false);
  }, [fromDate, toDate]);

  const filtered = ledger.filter((row) => {
    const needle = search.trim().toLowerCase();
    return !needle || [row.assignee_name, row.assignee_email, row.role_code, row.operation_type]
      .some((value) => String(value || "").toLowerCase().includes(needle));
  });

  return (
    <div className="min-h-screen bg-[#061524] p-4 md:p-8 text-[#eef8ff]">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-5 md:p-8 shadow-xl">
          <div className="flex flex-col lg:flex-row justify-between gap-5">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#22c55e] mb-3">
                <Wallet className="h-3.5 w-3.5" />
                <span>{t("Finance", "ငွေစာရင်း")}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white m-0">
                {t("Workforce Commission", "ဝန်ထမ်း လစာနှင့် ခံစားခွင့်")}
              </h1>
              <p className="mt-2 text-sm font-semibold text-[#9cc2d9]">
                Commission earned in selected period: <strong className="text-[#f6b84b]">
                  {(stats?.total_commission ?? 0).toLocaleString()} MMK
                </strong>
              </p>
              <p className="mt-1 text-xs text-[#9cc2d9]">
                {fromDate} – {toDate} · {stats?.event_rows ?? 0} aggregated records.
                This report includes pending and approved earnings; it does not initiate payouts.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-[#9cc2d9]">
                From
                <input type="date" value={fromDate} max={toDate} onChange={(event) => setFromDate(event.target.value)}
                  className="mt-1 block h-11 rounded-xl border border-[#31506a] bg-white px-3 text-[#061524]" />
              </label>
              <label className="text-xs font-semibold text-[#9cc2d9]">
                To
                <input type="date" value={toDate} min={fromDate} onChange={(event) => setToDate(event.target.value)}
                  className="mt-1 block h-11 rounded-xl border border-[#31506a] bg-white px-3 text-[#061524]" />
              </label>
              <button disabled={loading} onClick={() => void fetchPayouts(true)}
                className="flex h-11 items-center gap-2 rounded-xl bg-[#f6b84b] px-4 text-xs font-black uppercase tracking-wider text-[#061524] hover:bg-[#e5a93a] disabled:opacity-50">
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                {t("Sync Commissions", "ကော်မရှင် စာရင်း ထပ်တူပြု")}
              </button>
            </div>
          </div>
          {errorMessage && <p role="alert" className="mt-4 text-sm font-semibold text-rose-300">{errorMessage}</p>}
          {syncMessage && <p role="status" className="mt-4 text-sm font-semibold text-emerald-300">{syncMessage}</p>}
        </header>

        <section className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236] shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between gap-3 border-b border-[#1a3a5c] bg-[#081b2e] p-5">
            <h2 className="text-base font-bold text-white">Earnings Ledger</h2>
            <input value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email or role..."
              className="w-full sm:max-w-xs rounded-xl border border-[#31506a] bg-white px-4 py-3 text-sm text-[#061524] outline-none" />
          </div>
          <div className="overflow-x-auto bg-[#061524]">
            <table className="w-full min-w-[880px] text-left">
              <thead className="bg-[#081b2e] text-[11px] font-bold uppercase text-[#9cc2d9]">
                <tr>
                  <th className="p-4">Work Date</th>
                  <th className="p-4">Name / Email</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Operation</th>
                  <th className="p-4">Units</th>
                  <th className="p-4">Rate (MMK)</th>
                  <th className="p-4 text-right">Commission (MMK)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, index) => (
                  <tr key={`${row.work_date}-${row.assignee_email}-${row.operation_type}-${index}`}
                    className="border-t border-[#1a3a5c]/70 hover:bg-[#1a3a5c]/30">
                    <td className="p-4 text-xs text-[#c8dff0]">{row.work_date}</td>
                    <td className="p-4 text-xs font-bold text-white">
                      {row.assignee_name || row.assignee_email || "Unassigned"}
                      <div className="text-xs font-normal text-[#9cc2d9]">{row.assignee_email}</div>
                    </td>
                    <td className="p-4 text-xs text-[#c8dff0]">{row.role_code}</td>
                    <td className="p-4 text-xs text-[#c8dff0]">{row.operation_type}</td>
                    <td className="p-4 text-sm">{Number(row.total_units || 0)} {row.unit_type}s</td>
                    <td className="p-4 font-mono text-sm text-sky-300">{Number(row.rate_mmk || 0).toLocaleString()}</td>
                    <td className="p-4 text-right font-mono text-sm font-bold text-emerald-300">
                      {Number(row.commission_mmk || 0).toLocaleString()} Ks
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="p-16 text-center text-[#9cc2d9]">
                  {loading ? "Loading commission records..." : "No commission records for this date range."}
                </td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
