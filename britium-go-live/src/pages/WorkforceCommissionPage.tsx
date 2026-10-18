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

type FinanceReviewRow = {
  commission_event_id: string;
  work_date: string;
  source_key: string;
  operation_type: string;
  role_code: string;
  assignee_name: string | null;
  assignee_email: string;
  unit_count: number;
  rate_mmk: number;
  commission_mmk: number;
  event_status: string;
  finance_decision: string;
  evidence_status: string;
  pickup_verification_count: number;
  pickup_photo_count: number;
  pickup_photo_reviews_pending: number;
  delivered_proof_count: number;
  wallet_match_count: number;
  wallet_amount: number;
  reviewed_at?: string | null;
  reviewed_by_email?: string | null;
  review_note?: string | null;
};

type FinanceReviewSummary = {
  record_count: number;
  amount_mmk: number;
  on_hold: number;
  evidence_blockers: number;
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
  const [reviewRows, setReviewRows] = useState<FinanceReviewRow[]>([]);
  const [reviewSummary, setReviewSummary] = useState<FinanceReviewSummary | null>(null);
  const [canFinanceReview, setCanFinanceReview] = useState(false);
  const [reviewBusy, setReviewBusy] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");

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

  const loadReviewQueue = async () => {
    const start = Date.parse(fromDate + "T00:00:00Z");
    const end = Date.parse(toDate + "T00:00:00Z");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 31 * 86400000) {
      setReviewError("Select a valid reporting period of at most 32 days.");
      return;
    }
    setReviewLoading(true);
    setReviewError("");
    try {
      const [queue, authority] = await Promise.all([
        (supabase as any).rpc("be_workforce_commission_review_queue_v210", { p_from: fromDate, p_to: toDate }),
        (supabase as any).rpc("be_accounting_current_authority_v2"),
      ]);
      if (queue.error) throw queue.error;
      if (queue.data?.ok === false) throw new Error(queue.data?.message || "Unable to read Finance review queue");
      setReviewRows(Array.isArray(queue.data?.rows) ? queue.data.rows : []);
      setReviewSummary(queue.data?.summary || null);
      setCanFinanceReview(!authority.error && authority.data?.can_review === true);
    } catch (error: any) {
      setReviewError(error?.message || "Unable to load Finance review queue.");
      setReviewRows([]);
      setReviewSummary(null);
      setCanFinanceReview(false);
    } finally {
      setReviewLoading(false);
    }
  };

  const decideFinanceReview = async (row: FinanceReviewRow, decision: "APPROVE" | "HOLD") => {
    const note = (reviewNotes[row.commission_event_id] || "").trim();
    if (note.length < 12) {
      setReviewError("Enter a Finance review note of at least 12 characters before making a decision.");
      return;
    }
    if (decision === "APPROVE" && row.evidence_status !== "READY_FOR_FINANCE_REVIEW") {
      setReviewError("This commission has an unresolved evidence or wallet discrepancy and cannot be approved.");
      return;
    }
    setReviewBusy(row.commission_event_id);
    setReviewError("");
    setReviewMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_workforce_commission_review_decide_v210", {
        p_event_ids: [row.commission_event_id],
        p_decision: decision,
        p_note: note,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.message || "Finance review decision failed.");
      setReviewMessage(`${decision === "APPROVE" ? "Approved for separate payout review" : "Held for investigation"}: ${row.source_key}. No payment was sent.`);
      setReviewNotes((old) => ({ ...old, [row.commission_event_id]: "" }));
      await loadReviewQueue();
    } catch (error: any) {
      setReviewError(error?.message || "Could not save Finance review decision.");
    } finally {
      setReviewBusy("");
    }
  };

  useEffect(() => {
    void fetchPayouts(false);
    void loadReviewQueue();
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

        <section className="overflow-hidden rounded-3xl border border-[#1a3a5c] bg-[#0b2236] shadow-xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-[#1a3a5c] bg-[#081b2e] p-5">
            <div>
              <h2 className="text-base font-bold text-white">Finance Commission Review Queue</h2>
              <p className="mt-1 text-xs text-[#9cc2d9]">
                Review pickup photos, delivered proofs, assigned payees and pending wallet entries.
                Approval authorizes independent payment processing; it does not issue or confirm a payout.
              </p>
            </div>
            <button disabled={reviewLoading || !!reviewBusy} onClick={() => void loadReviewQueue()}
              className="flex items-center gap-2 rounded-xl border border-[#31506a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              <RefreshCw size={15} className={reviewLoading ? "animate-spin" : ""} /> Refresh Finance Review
            </button>
          </div>
          <div className="flex flex-wrap gap-5 px-5 py-4 text-xs font-semibold text-[#c8dff0]">
            <span>Records: {reviewSummary?.record_count ?? 0}</span>
            <span>Total: {Number(reviewSummary?.amount_mmk || 0).toLocaleString()} MMK</span>
            <span>Evidence blockers: {reviewSummary?.evidence_blockers ?? 0}</span>
            <span>On hold: {reviewSummary?.on_hold ?? 0}</span>
            <span>{canFinanceReview ? "Finance review access verified" : "Read-only or no Finance review authority"}</span>
          </div>
          {reviewError && <p className="mx-5 mb-3 text-sm font-semibold text-rose-300" role="alert">{reviewError}</p>}
          {reviewMessage && <p className="mx-5 mb-3 text-sm font-semibold text-emerald-300" role="status">{reviewMessage}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-left text-xs">
              <thead className="bg-[#081b2e] uppercase font-black text-[#9cc2d9]">
                <tr>
                  <th className="p-3">Date / Source</th>
                  <th className="p-3">Worker / Role</th>
                  <th className="p-3">Commission</th>
                  <th className="p-3">Evidence / Wallet</th>
                  <th className="p-3">Decision</th>
                  <th className="p-3 min-w-[270px]">Finance Review &amp; Note</th>
                </tr>
              </thead>
              <tbody>
                {reviewRows.map((row) => {
                  const busy = reviewBusy === row.commission_event_id;
                  const note = reviewNotes[row.commission_event_id] || "";
                  const evidenceReady = row.evidence_status === "READY_FOR_FINANCE_REVIEW";
                  return (
                    <tr key={row.commission_event_id} className="border-t border-[#1a3a5c]/70 align-top">
                      <td className="p-3">
                        <div className="text-[#c8dff0]">{row.work_date}</div>
                        <div className="mt-1 font-mono font-semibold text-white">{row.source_key}</div>
                        <div className="mt-1 text-[#9cc2d9]">{row.operation_type}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-white">{row.assignee_name || row.assignee_email}</div>
                        <div className="mt-1 break-all text-[#9cc2d9]">{row.assignee_email}</div>
                        <div className="mt-1 text-sky-300">{row.role_code}</div>
                      </td>
                      <td className="p-3 font-mono text-white">
                        <div className="font-bold text-emerald-300">{Number(row.commission_mmk || 0).toLocaleString()} MMK</div>
                        <div className="mt-1 text-[#9cc2d9]">{Number(row.unit_count || 0)} × {Number(row.rate_mmk || 0).toLocaleString()}</div>
                      </td>
                      <td className="p-3">
                        <div className={evidenceReady ? "font-bold text-emerald-300" : "font-bold text-amber-300"}>
                          {row.evidence_status.replaceAll("_", " ")}
                        </div>
                        {row.operation_type === "PICKUP"
                          ? <div className="mt-1 text-[#c8dff0]">Photos: {row.pickup_photo_count}/{row.unit_count} · Pending photo reviews: {row.pickup_photo_reviews_pending}</div>
                          : <div className="mt-1 text-[#c8dff0]">Delivered proof: {row.delivered_proof_count}</div>}
                        <div className="mt-1 text-[#9cc2d9]">Wallet entries: {row.wallet_match_count}; {Number(row.wallet_amount || 0).toLocaleString()} MMK</div>
                      </td>
                      <td className="p-3">
                        <div className={row.finance_decision === "APPROVED" ? "font-bold text-emerald-300" : row.finance_decision === "HELD" ? "font-bold text-amber-300" : "font-semibold text-[#c8dff0]"}>
                          {row.finance_decision.replaceAll("_", " ")}
                        </div>
                        {row.reviewed_by_email && <div className="mt-1 break-all text-[#9cc2d9]">Reviewer: {row.reviewed_by_email}</div>}
                        {row.review_note && <div className="mt-1 text-[#9cc2d9]">Note: {row.review_note}</div>}
                      </td>
                      <td className="p-3">
                        <textarea value={note} rows={2} maxLength={500}
                          onChange={(event) => setReviewNotes((old) => ({...old, [row.commission_event_id]: event.target.value}))}
                          placeholder="Record evidence checked and the reason for approval or hold (12+ characters)."
                          className="w-full resize-y rounded-lg border border-[#31506a] bg-white p-2 text-xs text-[#061524]"
                          disabled={!canFinanceReview || busy || reviewLoading} />
                        <div className="mt-2 flex gap-2">
                          <button disabled={!canFinanceReview || !evidenceReady || busy || note.trim().length < 12 || reviewLoading}
                            onClick={() => void decideFinanceReview(row, "APPROVE")}
                            className="rounded-lg bg-emerald-500 px-3 py-2 font-bold text-[#061524] disabled:opacity-40">
                            {busy ? "Saving..." : "Approve"}
                          </button>
                          <button disabled={!canFinanceReview || busy || note.trim().length < 12 || reviewLoading}
                            onClick={() => void decideFinanceReview(row, "HOLD")}
                            className="rounded-lg border border-amber-400 px-3 py-2 font-bold text-amber-200 disabled:opacity-40">
                            Hold
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {reviewRows.length === 0 && (
                  <tr><td colSpan={6} className="p-10 text-center text-[#9cc2d9]">
                    {reviewLoading ? "Loading Finance review records..." : reviewError || "No commission records in this selected date range."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[#1a3a5c] p-5 text-xs text-[#9cc2d9]">
            Financial safeguards: incomplete evidence cannot be approved. A different authorized Finance poster must confirm
            a payment using the existing wallet settlement procedure with an actual payment reference and proof.
            Neither Approve nor Hold sends money.
          </p>
        </section>
      </div>
    </div>
  );
}
