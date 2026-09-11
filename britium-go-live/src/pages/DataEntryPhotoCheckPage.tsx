import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Search, RefreshCw, CheckCircle2, XCircle, Image as ImageIcon, RotateCcw, X } from "lucide-react";

function text(value: any) { return String(value ?? "").trim(); }
function getPhoto(row: any) {
  return row.current_photo_url || row.photo_url || row.cargo_photo_url || row.parcel_photo_url || row.payload?.photo_url || row.payload?.cargo_photo_url || row.payload?.proof_photo_data_url || "";
}
function parcelNo(row: any, index = 0) { return Number(row.parcel_sequence || row.line_no || row.row_no || index + 1); }
function reviewStatus(row: any) { return text(row.review_status || row.photo_status || row.payload?.photo_check_status || "PENDING_REVIEW").toUpperCase(); }
function statusClass(status: string) {
  if (["APPROVED", "APPROVED_AFTER_REUPLOAD", "PHOTO_APPROVED"].includes(status)) return "border-[#22c55e]/30 bg-[#22c55e]/10 text-[#22c55e]";
  if (["PHOTO_REJECTED", "REUPLOAD_REQUIRED"].includes(status)) return "border-[#ff4f86]/30 bg-[#ff4f86]/10 text-[#ff4f86]";
  return "border-[#f6b84b]/30 bg-[#f6b84b]/10 text-[#f6b84b]";
}

const REASONS = [
  "BLURRY_IMAGE",
  "BARCODE_UNREADABLE",
  "TRACKING_NUMBER_NOT_VISIBLE",
  "PARCEL_LABEL_MISSING",
  "CROPPED_INFORMATION",
  "WRONG_PARCEL",
  "REQUIRED_INFORMATION_MISSING",
  "OTHER",
];

export default function DataEntryPhotoCheckPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [rejecting, setRejecting] = useState<any>(null);
  const [reason, setReason] = useState("BLURRY_IMAGE");
  const [note, setNote] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row || {}).toLowerCase().includes(q));
  }, [rows, search]);

  const summary = useMemo(() => ({
    total: rows.length,
    approved: rows.filter((r) => ["APPROVED", "APPROVED_AFTER_REUPLOAD", "PHOTO_APPROVED"].includes(reviewStatus(r))).length,
    rejected: rows.filter((r) => ["PHOTO_REJECTED", "REUPLOAD_REQUIRED"].includes(reviewStatus(r))).length,
    pending: rows.filter((r) => !["APPROVED", "APPROVED_AFTER_REUPLOAD", "PHOTO_APPROVED", "PHOTO_REJECTED", "REUPLOAD_REQUIRED"].includes(reviewStatus(r))).length,
  }), [rows]);

  async function load() {
    setLoading(true);
    setMessage(t("Loading photo check queue...", "ဓာတ်ပုံစစ်ဆေးရန် စာရင်းများကို ရယူနေပါသည်..."));
    try {
      let data: any[] = [];
      const reviewRes = await (supabase as any).from("be_parcel_photo_reviews").select("*").order("updated_at", { ascending: false }).limit(1000);
      if (!reviewRes.error && reviewRes.data?.length) data = reviewRes.data;
      if (!data.length) {
        const fallback = await (supabase as any).from("be_data_entry_parcels").select("*").order("created_at", { ascending: false }).limit(1000);
        if (fallback.error) throw fallback.error;
        data = (fallback.data || []).filter((row: any) => getPhoto(row));
      }
      setRows(data);
      setMessage(t(`Loaded ${data.length} parcel photo row(s).`, `ပါဆယ်ဓာတ်ပုံမှတ်တမ်း (${data.length}) ခု ရရှိပါသည်။`));
    } catch (error: any) {
      setMessage(t(`Photo check load failed: ${error.message}`, `ရယူခြင်း မအောင်မြင်ပါ - ${error.message}`));
    } finally {
      setLoading(false);
    }
  }

  async function decide(row: any, decision: "APPROVE" | "REJECT") {
    const payload = {
      review_id: row.id,
      pickup_id: row.pickup_id || row.pickup_request_id,
      parcel_sequence: parcelNo(row),
      delivery_way_id: row.delivery_way_id || null,
      tracking_no: row.tracking_no || row.tracking_number || null,
      action: decision,
      rejection_reason: decision === "REJECT" ? reason : null,
      rejection_note: decision === "REJECT" ? note : null,
      reviewed_by: localStorage.getItem("be_user_email") || localStorage.getItem("be_actor_email") || "data-entry",
    };

    setLoading(true);
    try {
      const rpc = await (supabase as any).rpc("be_review_parcel_photo", { p_payload: payload });
      if (rpc.error) {
        const status = decision === "APPROVE" ? "APPROVED" : "REUPLOAD_REQUIRED";
        const fallback = await (supabase as any).from("be_parcel_photo_reviews").update({
          review_status: status,
          rejection_reason: decision === "REJECT" ? reason : null,
          rejection_note: decision === "REJECT" ? note : null,
          reviewed_by: payload.reviewed_by,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        if (fallback.error) throw rpc.error;
      }
      setMessage(decision === "APPROVE" ? "Photo approved. This parcel can proceed to registration." : "Photo rejected. Rider and warehouse re-upload request created.");
      setRejecting(null); setNote(""); setReason("BLURRY_IMAGE");
      await load();
    } catch (error: any) {
      setMessage(`Photo decision failed: ${error.message}`);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="min-h-screen bg-[#061524] p-6 text-[#eef8ff] notranslate" translate="no">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-7 shadow-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f6b84b]/30 bg-[#1a3a5c] px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#f6b84b]"><ImageIcon size={14} /> Data Entry Photo Validation</div>
          <h1 className="mt-4 text-3xl font-black text-white">Approve, reject, and request clear parcel-photo re-uploads</h1>
          <p className="mt-2 font-medium text-[#9cc2d9]">Rejected photos do not block approved parcel lines. Rider or warehouse can upload a replacement.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Total', summary.total, '#38bdf8'], ['Approved', summary.approved, '#22c55e'], ['Rejected', summary.rejected, '#ff4f86'], ['Pending', summary.pending, '#f6b84b']].map(([label, value, color]) => <div key={String(label)} className="rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4"><div className="text-xs uppercase tracking-widest text-[#4d7a9b]">{label}</div><div className="mt-1 text-2xl font-black" style={{color: String(color)}}>{value}</div></div>)}
          </div>
          {message && <div className="mt-5 rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 p-4 font-bold text-[#38bdf8]">{message}</div>}
          <div className="mt-6 flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1"><Search size={18} className="absolute left-4 top-3.5 text-[#4d7a9b]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pickup, tracking, recipient..." className="w-full rounded-xl border border-[#1a3a5c] bg-[#081b2e] py-3 pl-12 pr-4 font-bold text-white outline-none focus:border-[#f6b84b]" /></div>
            <button onClick={load} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#1a3a5c] px-6 py-3 font-bold text-[#c8dff0] disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((row, index) => {
            const photo = getPhoto(row); const status = reviewStatus(row);
            return <article key={row.id || `${row.pickup_id}-${index}`} className="overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236]">
              <button type="button" onClick={() => setPreview(row)} className="flex h-72 w-full items-center justify-center overflow-hidden bg-[#061524] p-2">
                {photo ? <img src={photo} alt={`Parcel ${parcelNo(row, index)} proof`} className="h-full w-full object-contain" /> : <div className="text-[#4d7a9b]">No photo</div>}
              </button>
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3"><div><div className="font-mono font-black text-[#f6b84b]">{row.pickup_id || row.pickup_request_id || '-'}</div><div className="mt-1 text-sm text-[#9cc2d9]">Parcel {parcelNo(row, index)} · {row.tracking_no || row.delivery_way_id || '-'}</div></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusClass(status)}`}>{status.replaceAll('_',' ')}</span></div>
                {row.rejection_reason && <div className="rounded-xl border border-[#ff4f86]/30 bg-[#ff4f86]/10 p-3 text-sm text-[#ff9abd]">{String(row.rejection_reason).replaceAll('_',' ')}{row.rejection_note ? ` — ${row.rejection_note}` : ''}</div>}
                <div className="grid grid-cols-2 gap-2"><button onClick={() => void decide(row, 'APPROVE')} className="flex items-center justify-center gap-2 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-3 font-bold text-[#22c55e]"><CheckCircle2 size={16}/>Approve</button><button onClick={() => { setRejecting(row); setReason('BLURRY_IMAGE'); setNote(''); }} className="flex items-center justify-center gap-2 rounded-xl border border-[#ff4f86]/30 bg-[#ff4f86]/10 px-3 py-3 font-bold text-[#ff4f86]"><XCircle size={16}/>Reject</button></div>
              </div>
            </article>;
          })}
          {!filtered.length && <div className="col-span-full rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-14 text-center font-bold text-[#4d7a9b]">No parcel photos found.</div>}
        </section>
      </div>

      {preview && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4" onClick={() => setPreview(null)}><div className="max-h-[94vh] max-w-[96vw] rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-3" onClick={(e) => e.stopPropagation()}><div className="mb-3 flex items-center justify-between"><div className="font-mono font-black text-[#f6b84b]">{preview.pickup_id} · Parcel {parcelNo(preview)}</div><button onClick={() => setPreview(null)} className="rounded-lg border border-[#1a3a5c] p-2"><X size={18}/></button></div><div className="flex h-[78vh] w-[90vw] max-w-[1400px] items-center justify-center overflow-hidden rounded-xl bg-[#061524]"><img src={getPhoto(preview)} alt="Full parcel proof" className="h-full w-full object-contain" /></div></div></div>}

      {rejecting && <div className="fixed inset-0 z-[110] grid place-items-center bg-black/75 p-4"><div className="w-full max-w-xl rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-6"><h2 className="text-xl font-black">Reject photo and request re-upload</h2><p className="mt-2 text-sm text-[#9cc2d9]">Rider and warehouse will see this parcel as REUPLOAD REQUIRED.</p><label className="mt-5 block text-sm font-bold text-[#9cc2d9]">Reason<select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white">{REASONS.map((r) => <option key={r} value={r}>{r.replaceAll('_',' ')}</option>)}</select></label><label className="mt-4 block text-sm font-bold text-[#9cc2d9]">Review note<textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-white" placeholder="Explain what is unclear or missing..." /></label><div className="mt-5 flex justify-end gap-3"><button onClick={() => setRejecting(null)} className="rounded-xl border border-[#1a3a5c] px-4 py-3 font-bold"><X size={16} className="mr-2 inline"/>Cancel</button><button onClick={() => void decide(rejecting, 'REJECT')} disabled={loading} className="rounded-xl bg-[#ff4f86] px-4 py-3 font-black text-[#061524]"><RotateCcw size={16} className="mr-2 inline"/>Reject + Request Re-upload</button></div></div></div>}
    </div>
  );
}
