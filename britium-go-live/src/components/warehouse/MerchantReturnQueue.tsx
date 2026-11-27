import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type MerchantReturn = {
  delivery_way_id: string;
  waybill_no: string;
  merchant_id: string;
  warehouse_code: string;
  warehouse_return_at: string | null;
  dispatched_at: string | null;
  dispatch_reference: string | null;
  received_at: string | null;
  receipt_reference: string | null;
};
type Action = "DISPATCH" | "RECEIPT";

const inputClass = "rounded-lg bg-white px-3 py-2 text-sm text-slate-900";
const buttonClass = "rounded-lg border border-sky-600 px-3 py-2 text-sm font-semibold disabled:opacity-50";
const time = (value: string | null) => value
  ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Yangon" })
  : "—";

export default function MerchantReturnQueue({ readOnly = false, merchant }: {
  readOnly?: boolean;
  merchant?: string;
}) {
  const [rows, setRows] = useState<MerchantReturn[]>([]);
  const [search, setSearch] = useState("");
  const [request, setRequest] = useState({ search: "" });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ row: MerchantReturn; action: Action } | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    void supabase.rpc("be_merchant_return_queue_v1", {
      p_search: request.search || null, p_merchant: merchant || null,
    }).then(({ data, error }) => {
      if (!current) return;
      setLoading(false);
      setRows(error ? [] : data ?? []);
      if (error) setError(error.message);
    });
    return () => { current = false; };
  }, [merchant, request]);

  async function record() {
    if (!selected || !reference.trim() || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error } = await supabase.rpc("be_record_merchant_return_v1", {
        p_way_id: selected.row.delivery_way_id,
        p_action: selected.action,
        p_reference: reference.trim(),
      });
      if (error || !data?.delivery_way_id) throw new Error(error?.message || "The return record could not be saved.");
      setNotice(selected.action === "DISPATCH" ? "Return dispatch recorded." : "Merchant receipt confirmed.");
      setSelected(null);
      setRequest(current => ({ ...current }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "The return record could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-slate-100">
    <h3 className="font-bold text-amber-300">Returns to Merchant / ကုန်သည်ထံ ပြန်အပ်ခြင်း</h3>
    <p className="text-sm text-slate-300">
      {readOnly
        ? "Use the Way ID and merchant receipt reference to verify the handover before reviewing any return charge."
        : "After the Warehouse Return Scan, record the return dispatch when the parcel leaves for the merchant. Confirm receipt when the merchant acknowledges it. For counter collection, record both steps at handover."}
    </p>
    <form onSubmit={event => { event.preventDefault(); setRequest({ search: search.trim() }); }} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs">Way ID or merchant code
        <input className={inputClass} value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <button className={buttonClass} type="submit" disabled={loading || busy}>Search / Refresh</button>
    </form>
    {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    {selected && <form className="space-y-2 rounded-lg border border-amber-500 p-3"
      onSubmit={event => { event.preventDefault(); void record(); }}>
      <p className="font-semibold">{selected.action === "DISPATCH" ? "Dispatch to merchant" : "Confirm merchant receipt"} · {selected.row.waybill_no} · {selected.row.merchant_id}</p>
      <label className="flex flex-col gap-1 text-sm">
        {selected.action === "DISPATCH" ? "Manifest reference or person taking custody" : "Signed receipt reference or merchant representative who confirmed receipt"}
        <input autoFocus className={inputClass} value={reference} onChange={event => setReference(event.target.value)} required maxLength={250} disabled={busy} />
      </label>
      <div className="flex gap-2">
        <button className={buttonClass + " bg-amber-400 text-slate-950"} type="submit" disabled={busy || !reference.trim()}>{busy ? "Saving…" : "Confirm handover"}</button>
        <button className={buttonClass} type="button" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
      </div>
    </form>}
    {loading ? <p role="status">Loading returns…</p> : <div className="overflow-auto">
      <table className="w-full min-w-[700px] text-left text-xs">
        <thead className="text-slate-300"><tr>
          <th className="p-2">Way ID / Merchant</th><th className="p-2">Status</th><th className="p-2">Warehouse return</th>
          <th className="p-2">Return dispatch</th><th className="p-2">Merchant receipt</th>{!readOnly && <th className="p-2">Action</th>}
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.delivery_way_id} className="border-t border-slate-700 align-top">
          <td className="p-2"><strong>{row.waybill_no}</strong><div>{row.merchant_id}</div>{row.waybill_no !== row.delivery_way_id && <div>{row.delivery_way_id}</div>}</td>
          <td className="p-2 font-semibold">{row.received_at ? "Received by merchant" : row.dispatched_at ? "Dispatched to merchant" : "At warehouse"}</td>
          <td className="p-2">{time(row.warehouse_return_at)}<div>{row.warehouse_code}</div></td>
          <td className="p-2">{time(row.dispatched_at)}<div>{row.dispatch_reference}</div></td>
          <td className="p-2">{time(row.received_at)}<div>{row.receipt_reference}</div></td>
          {!readOnly && <td className="p-2">{!row.received_at && <button type="button" disabled={busy} className={buttonClass}
            onClick={() => { setSelected({ row, action: row.dispatched_at ? "RECEIPT" : "DISPATCH" }); setReference(""); setError(""); setNotice(""); }}>
            {row.dispatched_at ? "Confirm receipt" : "Record return dispatch"}
          </button>}</td>}
        </tr>)}</tbody>
      </table>
      {!error && rows.length === 0 && <p className="p-3 text-sm text-slate-400">No matching confirmed warehouse RTOs or merchant handovers.</p>}
    </div>}
  </section>;
}
