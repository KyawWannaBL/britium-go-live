import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Search, RefreshCw, CheckCircle2, XCircle, Image as ImageIcon } from "lucide-react";

function getPhoto(row: any) {
  return (
    row.photo_url ||
    row.cargo_photo_url ||
    row.parcel_photo_url ||
    row.payload?.photo_url ||
    row.payload?.cargo_photo_url ||
    row.payload?.proof_photo_data_url ||
    ""
  );
}

export default function DataEntryPhotoCheckPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row || {}).toLowerCase().includes(q));
  }, [rows, search]);

  async function load() {
    setLoading(true);
    setMessage(t("Loading photo check queue...", "ဓာတ်ပုံစစ်ဆေးရန် စာရင်းများကို ရယူနေပါသည်..."));

    const { data, error } = await (supabase as any)
      .from("be_data_entry_parcels")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      setMessage(t(`Photo check load failed: ${error.message}`, `ရယူခြင်း မအောင်မြင်ပါ - ${error.message}`));
      setLoading(false);
      return;
    }

    const photoRows = (data || []).filter((row: any) => getPhoto(row));
    setRows(photoRows);
    setMessage(t(`Loaded ${photoRows.length} rider uploaded photo row(s).`, `ပို့ဆောင်သူမှ တင်ပို့ထားသော ဓာတ်ပုံမှတ်တမ်း (${photoRows.length}) ခု ရရှိပါသည်။`));
    setLoading(false);
  }

  async function decide(row: any, status: "photo_approved" | "photo_rejected") {
    const { error } = await (supabase as any)
      .from("be_data_entry_parcels")
      .update({
        photo_status: status,
        data_entry_status: status === "photo_approved" ? "photo_checked" : "photo_rejected",
        updated_at: new Date().toISOString(),
        payload: {
          ...(row.payload || {}),
          photo_check_status: status,
          photo_checked_at: new Date().toISOString(),
          photo_check_source: "data_entry_photo_check",
        },
      })
      .eq("id", row.id);

    if (error) {
      setMessage(t(`Photo decision failed: ${error.message}`, `အတည်ပြုချက် မှားယွင်းနေပါသည် - ${error.message}`));
      return;
    }

    setMessage(t(`Photo ${status.replace("photo_", "")} for ${row.pickup_id || row.pickup_request_id || row.id}.`, `မှတ်တမ်း ${row.pickup_id || row.id} အတွက် ဓာတ်ပုံ အတည်ပြုပြီးပါပြီ။`));
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  const thCls = "p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-left whitespace-nowrap bg-[#081b2e] sticky top-0";
  const tdCls = "p-4 border-b border-[#1a3a5c]/50 align-top text-[13px]";

  return (
    <div className="min-h-screen bg-[#061524] p-6 text-[#eef8ff] notranslate" translate="no">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f6b84b]/30 bg-[#1a3a5c] px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#f6b84b]">
            <ImageIcon size={14} /> <span>{t('Data Entry Verification', 'အချက်အလက် စာရင်းသွင်း အတည်ပြုခြင်း')}</span>
          </div>
          <h1 className="mt-4 text-3xl font-black text-white">
            <span>{t('Data Entry Photo Check', 'အချက်အလက်စာရင်းသွင်းရေး - ဓာတ်ပုံစစ်ဆေးခြင်း')}</span>
          </h1>
          <p className="mt-2 font-medium text-[#4d7a9b]">
            <span>{t('Review parcel photos uploaded from Rider App pickup verification and approve or reject for Data Entry.', 'ပို့ဆောင်သူမှ တင်ပို့ထားသော ပါဆယ်ဓာတ်ပုံများကို စစ်ဆေး၍ အချက်အလက်စာရင်းသွင်းရန် အတည်ပြု (သို့) ပယ်ချ ပါ။')}</span>
          </p>

          {message && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 p-4 font-bold text-[#38bdf8]">
              <CheckCircle2 size={18} /> <span>{message}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search pickup ID, waybill, recipient, phone...", "တောင်းဆိုမှုအမှတ်၊ လမ်းညွှန်စာရွက်၊ ဖုန်းနံပါတ် ရှာဖွေရန်...")}
                className="w-full rounded-xl border border-[#1a3a5c] bg-[#081b2e] py-3 pl-12 pr-4 font-bold text-white outline-none focus:border-[#f6b84b] transition-colors"
              />
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-[#1a3a5c] border border-[#1a3a5c] px-6 py-3 font-bold text-[#c8dff0] hover:bg-[#0f2a42] hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              <span>{t("Refresh", "အချက်အလက် ပြန်လည်ရယူမည်")}</span>
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] overflow-hidden shadow-xl min-h-[500px] flex flex-col">
          <div className="flex-1 overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left border-collapse">
              <thead>
                <tr>
                  <th className={thCls}><span>{t('Pickup ID', 'တောင်းဆိုမှုအမှတ်')}</span></th>
                  <th className={thCls}><span>{t('Line', 'စဉ်')}</span></th>
                  <th className={thCls}><span>{t('Waybill', 'လမ်းညွှန်စာရွက်')}</span></th>
                  <th className={thCls}><span>{t('Recipient', 'လက်ခံမည့်သူ')}</span></th>
                  <th className={thCls}><span>{t('Phone', 'ဖုန်းနံပါတ်')}</span></th>
                  <th className={thCls}><span>{t('Address', 'လိပ်စာ')}</span></th>
                  <th className={thCls}><span>{t('Photo', 'ဓာတ်ပုံ')}</span></th>
                  <th className={thCls}><span>{t('Status', 'အခြေအနေ')}</span></th>
                  <th className={thCls}><span>{t('Action', 'လုပ်ဆောင်ချက်')}</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const photo = getPhoto(row);
                  return (
                    <tr key={row.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#1a3a5c]/20 transition-colors">
                      <td className={`${tdCls} font-mono font-black text-[#f6b84b]`}><span>{row.pickup_id || row.pickup_request_id || "-"}</span></td>
                      <td className={`${tdCls} font-black text-white`}><span>{row.line_no || row.row_no || "-"}</span></td>
                      <td className={`${tdCls} font-mono font-black text-[#38bdf8]`}><span>{row.waybill_no || row.tracking_number || row.tracking_no || "-"}</span></td>
                      <td className={`${tdCls} font-bold text-white`}><span>{row.recipient_name || "-"}</span></td>
                      <td className={`${tdCls} font-bold text-[#c8dff0]`}><span>{row.recipient_phone || "-"}</span></td>
                      <td className={`${tdCls} max-w-sm font-medium text-[#c8dff0]`}><span>{row.delivery_address || "-"}</span></td>
                      <td className={tdCls}>
                        <a href={photo} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-bold text-[#f6b84b] hover:text-[#e5a93a] transition-colors">
                          <ImageIcon size={14} /> <span>{t('View Photo', 'ဓာတ်ပုံကြည့်မည်')}</span>
                        </a>
                      </td>
                      <td className={tdCls}>
                        <span className="rounded-md border border-[#1a3a5c] bg-[#061524] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b]">
                          <span>{String(row.photo_status || "pending").replace(/_/g, ' ')}</span>
                        </span>
                      </td>
                      <td className={tdCls}>
                        <div className="flex gap-2">
                          <button onClick={() => decide(row, "photo_approved")} className="flex items-center gap-1 rounded-lg bg-[#22c55e]/10 border border-[#22c55e]/30 px-3 py-2 font-bold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors">
                            <CheckCircle2 size={14} /> <span>{t('Approve', 'အတည်ပြုမည်')}</span>
                          </button>
                          <button onClick={() => decide(row, "photo_rejected")} className="flex items-center gap-1 rounded-lg bg-[#ff4f86]/10 border border-[#ff4f86]/30 px-3 py-2 font-bold text-[#ff4f86] hover:bg-[#ff4f86]/20 transition-colors">
                            <XCircle size={14} /> <span>{t('Reject', 'ပယ်ချမည်')}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-16 text-center font-bold text-[#4d7a9b]">
                      <span>{t('No Rider App uploaded parcel photos found.', 'ပို့ဆောင်သူမှ တင်ပို့ထားသော ဓာတ်ပုံမှတ်တမ်းများ မတွေ့ရှိပါ။')}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}