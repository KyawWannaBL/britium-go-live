import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  parcel_id: string;
  delivery_way_id: string;
  merchant_id: string;
  merchant_name: string;
  counterparty_type: string;
  recipient_name?: string | null;
  status: string;
  customer_total_collection: number;
  net_system_delivery_charge: number;
  delivery_difference: number | null;
  merchant_final_settlement_amount: number | null;
  merchant_receivable: number;
  settlement_direction: string;
  validation_status: string;
  validation_message?: string | null;
  settlement_eligible: boolean;
  settlement_state: string;
  financial_settled_at?: string | null;
};

const money = (value: unknown) => `${Number(value || 0).toLocaleString("en-US")} MMK`;

export default function FinanceMerchantSettlementPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [merchant, setMerchant] = useState("");
  const [state, setState] = useState("READY_TO_SETTLE");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true); setMessage("");
    const { data, error } = await (supabase as any).from("be_v_finance_merchant_settlement_queue_v2").select("*").order("calculated_at", { ascending: false }).limit(1000);
    if (error) setMessage(error.message); else setRows((data || []) as Row[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const merchants = useMemo(() => [...new Map(rows.map((r) => [r.merchant_id, r.merchant_name || r.merchant_id])).entries()], [rows]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!merchant || r.merchant_id === merchant) && (!state || r.settlement_state === state) && (!q || [r.delivery_way_id, r.merchant_name, r.merchant_id, r.recipient_name].some((v) => String(v || "").toLowerCase().includes(q))));
  }, [rows, merchant, state, search]);
  const selectedRows = rows.filter((r) => selected[r.parcel_id] && r.settlement_eligible);

  const totals = useMemo(() => selectedRows.reduce((a, r) => ({
    customer: a.customer + Number(r.customer_total_collection || 0),
    merchant: a.merchant + Number(r.merchant_final_settlement_amount || 0),
    revenue: a.revenue + Number(r.net_system_delivery_charge || 0),
    receivable: a.receivable + Number(r.merchant_receivable || 0),
  }), { customer: 0, merchant: 0, revenue: 0, receivable: 0 }), [selectedRows]);

  function toggleVisible() {
    const eligible = visible.filter((r) => r.settlement_eligible);
    const all = eligible.length > 0 && eligible.every((r) => selected[r.parcel_id]);
    setSelected((old) => {
      const next = { ...old };
      eligible.forEach((r) => { if (all) delete next[r.parcel_id]; else next[r.parcel_id] = true; });
      return next;
    });
  }

  async function settleSelected() {
    if (!selectedRows.length) return setMessage("Select at least one READY TO SETTLE parcel.");
    if (!window.confirm(`Settle ${selectedRows.length} parcel(s)? Merchant net: ${money(totals.merchant)}`)) return;
    setBusy(true); setMessage("");
    const { data: authData } = await supabase.auth.getUser();
    const batchId = crypto.randomUUID();
    const { data, error } = await (supabase as any).rpc("be_finance_settle_batch_v2", {
      p_parcel_ids: selectedRows.map((r) => r.parcel_id),
      p_actor: authData.user?.id || null,
      p_settlement_batch_id: batchId,
    });
    if (error) setMessage(error.message);
    else {
      setMessage(`Settlement completed. Batch ${(data as any)?.settlement_batch_id || batchId}`);
      setSelected({});
      await load();
    }
    setBusy(false);
  }

  return <main className="min-h-screen bg-[#061524] p-5 text-[#eef8ff]">
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-xs font-black uppercase tracking-[0.18em] text-[#f6b84b]">Finance · Parcel Financial V2.2</div><h1 className="mt-1 text-2xl">Merchant / Online Seller Settlement</h1><p className="text-xs text-[#9cc2d9]">Settle delivered parcels from stored tariff snapshots. Customer collection, company revenue and merchant settlement stay separate.</p></div>
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#102b45] px-4 py-2 text-xs font-black"><RefreshCw size={15}/>Refresh</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          <Kpi label="Selected Parcels" value={selectedRows.length.toLocaleString()} />
          <Kpi label="Customer Collection" value={money(totals.customer)} />
          <Kpi label="Merchant Net" value={money(totals.merchant)} />
          <Kpi label="Company Delivery Revenue" value={money(totals.revenue)} />
          <Kpi label="Merchant Receivable" value={money(totals.receivable)} warning={totals.receivable > 0} />
        </div>
      </header>

      <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4">
        <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
          <label className="relative"><Search size={15} className="absolute left-3 top-3 text-[#5d87a4]"/><input className="w-full rounded-xl border border-[#1a3a5c] bg-white py-2 pl-9 pr-3 text-sm text-[#061524]" placeholder="Way ID, merchant, receiver" value={search} onChange={(e)=>setSearch(e.target.value)}/></label>
          <select className="rounded-xl border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-[#061524]" value={merchant} onChange={(e)=>setMerchant(e.target.value)}><option value="">All merchants / sellers</option>{merchants.map(([id,name])=><option key={id} value={id}>{name} · {id}</option>)}</select>
          <select className="rounded-xl border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-[#061524]" value={state} onChange={(e)=>setState(e.target.value)}><option value="">All states</option><option value="READY_TO_SETTLE">Ready to settle</option><option value="REVIEW_REQUIRED">Review required</option><option value="WAITING_DELIVERY">Waiting delivery</option><option value="SETTLED">Settled</option></select>
          <button onClick={toggleVisible} className="rounded-xl bg-[#38bdf8] px-4 py-2 text-xs font-black text-[#061524]">Select Visible</button>
          <button disabled={busy || !selectedRows.length} onClick={settleSelected} className="flex items-center justify-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2 text-xs font-black text-[#061524] disabled:opacity-40">{busy?<Loader2 className="animate-spin" size={15}/>:<Wallet size={15}/>}Settle Selected</button>
        </div>

        {message && <div className="mt-3 rounded-xl border border-[#f6b84b]/40 bg-[#f6b84b]/10 p-3 text-xs text-[#f6b84b]">{message}</div>}

        <div className="mt-4 overflow-auto rounded-xl border border-[#1a3a5c]">
          <table className="min-w-[1400px] w-full border-collapse text-xs">
            <thead className="bg-[#f6b84b] text-[#061524]"><tr>{["Select","Way ID","Merchant / Seller","Receiver","Customer Collection","System Delivery","Difference","Merchant Settlement","Direction","Validation","State"].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
            <tbody>{loading?<tr><td colSpan={11} className="p-10 text-center"><Loader2 className="mx-auto animate-spin"/></td></tr>:visible.map((r)=><tr key={r.parcel_id} className="border-t border-[#1a3a5c] hover:bg-[#102b45]">
              <td className="p-3"><input type="checkbox" disabled={!r.settlement_eligible} checked={!!selected[r.parcel_id]} onChange={()=>setSelected((o)=>({...o,[r.parcel_id]:!o[r.parcel_id]}))}/></td>
              <td className="p-3 font-black text-[#f6b84b]">{r.delivery_way_id}</td><td className="p-3"><div className="font-bold">{r.merchant_name}</div><div className="text-[10px] text-[#7ea9c6]">{r.counterparty_type} · {r.merchant_id}</div></td><td className="p-3">{r.recipient_name || "—"}</td>
              <td className="p-3 font-bold">{money(r.customer_total_collection)}</td><td className="p-3">{money(r.net_system_delivery_charge)}</td><td className={`p-3 font-black ${Number(r.delivery_difference||0)<0?"text-rose-400":"text-emerald-400"}`}>{r.delivery_difference==null?"—":`${Number(r.delivery_difference)>=0?"+":""}${money(r.delivery_difference)}`}</td><td className="p-3 font-black">{r.merchant_final_settlement_amount==null?"—":money(r.merchant_final_settlement_amount)}</td><td className="p-3">{r.settlement_direction?.replaceAll("_"," ")}</td>
              <td className="p-3">{r.validation_status==="OK"?<CheckCircle2 size={16} className="text-emerald-400"/>:<AlertTriangle size={16} className="text-amber-400"/>}</td><td className="p-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${r.settlement_eligible?"border-emerald-500/40 text-emerald-300":"border-amber-500/40 text-amber-300"}`}>{r.settlement_state.replaceAll("_"," ")}</span></td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  </main>;
}

function Kpi({label,value,warning=false}:{label:string;value:string|number;warning?:boolean}){return <div className="rounded-xl border border-[#1a3a5c] bg-[#081b2e] p-3"><div className="text-[9px] uppercase tracking-wider text-[#7ea9c6]">{label}</div><div className={`mt-1 text-lg font-black ${warning?"text-rose-400":"text-[#eef8ff]"}`}>{value}</div></div>}
