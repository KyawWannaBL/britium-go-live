import React, { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Image as ImageIcon, RefreshCw, UploadCloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import WarehouseWayplanCenterPage from "./WarehouseWayplanCenterPage";

function text(value: any) { return String(value ?? "").trim(); }
function getPhoto(row: any) { return row.current_photo_url || row.photo_url || ""; }

export default function WarehouseLifecyclePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<Record<string, File | undefined>>({});

  const openRows = useMemo(() => rows.filter((r) => ["PHOTO_REJECTED", "REUPLOAD_REQUIRED"].includes(text(r.review_status).toUpperCase())), [rows]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).from("be_parcel_photo_reviews").select("*").in("review_status", ["PHOTO_REJECTED", "REUPLOAD_REQUIRED"]).order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      setRows(data || []);
      setMessage(`Loaded ${(data || []).length} photo rework item(s).`);
    } catch (error: any) {
      setMessage(`Photo rework queue unavailable: ${error.message}. Run the included migration.`);
      setRows([]);
    } finally { setLoading(false); }
  }

  async function uploadReplacement(row: any) {
    const file = files[row.id];
    if (!file) return setMessage("Select or capture a clear replacement photo first.");
    if (!file.type.startsWith("image/")) return setMessage("Only image files are allowed.");
    if (file.size < 80 * 1024) return setMessage("Replacement photo may be too small or unclear.");

    setLoading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `warehouse-reuploads/${row.pickup_id}/${row.parcel_sequence || 1}-${Date.now()}-${safeName}`;
      const upload = await supabase.storage.from("rider-proofs").upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upload.error) throw upload.error;
      const publicUrl = supabase.storage.from("rider-proofs").getPublicUrl(path).data.publicUrl;
      const result = await (supabase as any).rpc("be_parcel_photo_reupload", { p_payload: {
        review_id: row.id,
        pickup_id: row.pickup_id,
        parcel_sequence: row.parcel_sequence,
        delivery_way_id: row.delivery_way_id,
        tracking_no: row.tracking_no,
        photo_url: publicUrl,
        uploaded_by: localStorage.getItem("be_user_email") || "warehouse",
        uploaded_role: "WAREHOUSE",
      }});
      if (result.error) throw result.error;
      setMessage(`Replacement photo uploaded for ${row.tracking_no || row.delivery_way_id || row.pickup_id}. Data Entry review is pending.`);
      setFiles((old) => ({ ...old, [row.id]: undefined }));
      await load();
    } catch (error: any) { setMessage(`Re-upload failed: ${error.message}`); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return <div className="space-y-6">
    <WarehouseWayplanCenterPage />
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6 text-[#eef8ff]">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-[#f6b84b]"><ImageIcon size={15}/>Warehouse Photo Rework</div><h2 className="mt-2 text-xl font-black">Replace rejected parcel photos after physical receiving</h2><p className="mt-1 text-sm text-[#9cc2d9]">Photos are shown with object-contain so the complete label and required information remain visible.</p></div><button onClick={load} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#1a3a5c] px-5 py-3 font-bold"><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Refresh</button></div>
      {message && <div className="mt-5 rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 p-4 font-bold text-[#38bdf8]">{message}</div>}
      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {openRows.map((row) => <article key={row.id} className="overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#061524]">
          <div className="flex h-64 items-center justify-center overflow-hidden p-2">{getPhoto(row) ? <img src={getPhoto(row)} alt="Rejected parcel proof" className="h-full w-full object-contain"/> : <div className="text-[#4d7a9b]">No existing photo</div>}</div>
          <div className="space-y-3 border-t border-[#1a3a5c] p-4"><div className="flex justify-between gap-3"><div><div className="font-mono font-black text-[#f6b84b]">{row.pickup_id}</div><div className="text-sm text-[#9cc2d9]">{row.tracking_no || row.delivery_way_id || `Parcel ${row.parcel_sequence || '-'}`}</div></div><span className="h-fit rounded-full border border-[#ff4f86]/30 bg-[#ff4f86]/10 px-3 py-1 text-[10px] font-black text-[#ff4f86]">REUPLOAD REQUIRED</span></div><div className="rounded-xl border border-[#ff4f86]/30 bg-[#ff4f86]/10 p-3 text-sm text-[#ff9abd]">{text(row.rejection_reason).replaceAll('_',' ') || 'Unclear or incomplete parcel photo'}{row.rejection_note ? ` — ${row.rejection_note}` : ''}</div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-3 py-3 font-bold"><Camera size={16}/>Capture / Select Replacement<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFiles((old) => ({...old, [row.id]: e.target.files?.[0]}))}/></label>{files[row.id] && <div className="text-xs text-[#22c55e]">Selected: {files[row.id]?.name}</div>}<button onClick={() => void uploadReplacement(row)} disabled={loading || !files[row.id]} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-3 font-black text-[#061524] disabled:opacity-50"><UploadCloud size={17}/>Upload for Data Entry Review</button></div>
        </article>)}
        {!openRows.length && <div className="col-span-full rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/10 p-10 text-center font-bold text-[#22c55e]"><CheckCircle2 className="mx-auto mb-2"/>No rejected parcel-photo rework is waiting.</div>}
      </div>
    </section>
  </div>;
}
