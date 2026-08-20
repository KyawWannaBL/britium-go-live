import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Download,
  FileText,
  Globe2,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Lang = "EN" | "MM";

type ScreenKey =
  | "wayplan"
  | "executive"
  | "finance"
  | "cod"
  | "exceptions"
  | "reports"
  | "wallets"
  | "commission"
  | "merchant";

const SCREEN_COPY: Record<ScreenKey, any> = {
  wayplan: {
    enTitle: "Wayplan Command Center",
    mmTitle: "Wayplan Command Center",
    enSub: "Live route planning, stop sequence control, dispatch assignment and execution monitoring.",
    mmSub: "Route planning, stop sequence, dispatch assignment နှင့် execution monitoring။",
  },
  executive: {
    enTitle: "Executive Operations",
    mmTitle: "Executive Operations",
    enSub: "Leadership view across pickups, delivery execution, COD collections, settlements, and daily trend movement.",
    mmSub: "Pickup, delivery, COD collection, settlement နှင့် daily trend များကို စီမံခန့်ခွဲရေးအမြင်ဖြင့်ကြည့်ရန်။",
  },
  finance: {
    enTitle: "Finance Portal",
    mmTitle: "ဘဏ္ဍာရေး စီမံခန့်ခွဲမှု Portal",
    enSub: "Cashier, Accountant, Finance Manager and Auditor workflow.",
    mmSub: "Cashier, Accountant, Finance Manager နှင့် Auditor အတွက် COD, settlement, finance hold နှင့် audit workflow။",
  },
  cod: {
    enTitle: "COD Settlement Center",
    mmTitle: "COD Settlement Center",
    enSub: "Track rider handovers, merchant settlement batches, and cash verification exceptions.",
    mmSub: "Rider handover, merchant settlement batch နှင့် cash verification exception များကို စောင့်ကြည့်ရန်။",
  },
  exceptions: {
    enTitle: "Exception Master Design",
    mmTitle: "Exception Master Design",
    enSub: "Central exception catalogue for pickup, warehouse, and delivery workflows.",
    mmSub: "Pickup, warehouse, delivery workflow အတွက် exception catalogue။",
  },
  reports: {
    enTitle: "Finance Report Center",
    mmTitle: "Finance Report Center",
    enSub: "Generate Profit & Loss, Ledger, Balance Sheet, COD Settlement and other finance reports.",
    mmSub: "Profit & Loss, Ledger, Balance Sheet, COD Settlement report များထုတ်ရန်။",
  },
  wallets: {
    enTitle: "Rider / Driver / Helper Wallets",
    mmTitle: "Rider / Driver / Helper Wallets",
    enSub: "Backend workforce account wallet visibility and settlement ledger.",
    mmSub: "Rider, Driver, Helper wallet balance နှင့် settlement ledger ကြည့်ရန်။",
  },
  commission: {
    enTitle: "Commission Center",
    mmTitle: "Commission Center",
    enSub: "Commission rules, staff commission records, and role-based payout view.",
    mmSub: "Commission rule, staff commission record နှင့် role-based payout များ။",
  },
  merchant: {
    enTitle: "Merchant Dashboard & Order Picking",
    mmTitle: "Merchant Dashboard & Order Picking",
    enSub: "Submit pickup requests, upload Excel order picking files, track shipments, and print merchant reports.",
    mmSub: "Pickup request, Excel upload, shipment tracking နှင့် merchant report များ။",
  },
};

function money(v: unknown) {
  return `${Number(v || 0).toLocaleString("en-US")} MMK`;
}

function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <div className="text-[#4ea8de] text-xs font-black uppercase tracking-widest">{titleCase(label)}</div>
      <div className="text-[#f6b84b] text-2xl font-black mt-2">{String(value)}</div>
    </div>
  );
}

function DarkButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl border border-[#254b73] bg-[#071a2b] px-4 py-3 text-white font-bold hover:bg-[#123456] ${props.className || ""}`}
    />
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-[#f6b84b] px-5 py-3 text-[#061524] font-black hover:bg-[#ffca63] ${props.className || ""}`}
    />
  );
}

export default function OperationalScreenPage({ screen }: { screen: ScreenKey }) {
  const [lang, setLang] = useState<Lang>("EN");
  const [data, setData] = useState<any>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const copy = SCREEN_COPY[screen];

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("be_get_operations_screen", {
      p_payload: { screen },
    });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setData(data || {});
  }

  useEffect(() => {
    void load();
  }, [screen]);

  const rows = useMemo(() => {
    const raw = data?.rows || data?.settlements || [];
    const query = q.toLowerCase().trim();
    if (!query) return raw;
    return raw.filter((r: any) => JSON.stringify(r).toLowerCase().includes(query));
  }, [data, q]);

  const stats = data?.stats || {};

  return (
    <div className="min-h-screen bg-[#061524] text-[#eef8ff] font-['Poppins',sans-serif]">
      <header className="sticky top-0 z-20 bg-[#071a2b] border-b border-[#1a3a5c] px-5 py-3 flex justify-between">
        <div className="text-[#4ea8de] text-xs">Britium Express · Enterprise Management System</div>
        <div className="flex gap-2">
          <DarkButton onClick={() => setLang(lang === "EN" ? "MM" : "EN")}>
            <Globe2 size={14} className="inline mr-2" /> {lang === "EN" ? "မြန်မာ" : "English"}
          </DarkButton>
          <PrimaryButton onClick={load}>
            <RefreshCcw size={14} className="inline mr-2" /> {loading ? "Loading..." : "Refresh"}
          </PrimaryButton>
        </div>
      </header>

      <main className="p-6">
        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[#f6b84b] text-xs font-black uppercase tracking-[0.3em]">Britium Express</div>
              <h1 className="text-2xl font-black text-white mt-2 uppercase">
                {lang === "EN" ? copy.enTitle : copy.mmTitle}
              </h1>
              <p className="text-[#9fc4df] mt-2">{lang === "EN" ? copy.enSub : copy.mmSub}</p>
            </div>
            <div className="flex gap-2">
              {screen === "merchant" && (
                <PrimaryButton>
                  <Plus size={14} className="inline mr-2" /> New Pickup Request
                </PrimaryButton>
              )}
              <DarkButton>
                <Download size={14} className="inline mr-2" /> Export CSV
              </DarkButton>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-4 mb-6">
          {Object.entries(stats).map(([k, v]) => (
            <StatCard key={k} label={k} value={typeof v === "number" && k.includes("cod") || k.includes("settlement") || k.includes("revenue") || k.includes("fee") || k.includes("variance") ? money(v) : v} />
          ))}
        </section>

        {screen === "wayplan" && <WayplanPanel rows={rows} reload={load} />}
        {screen === "executive" && <ExecutivePanel stats={stats} />}
        {screen === "finance" && <FinancePanel rows={rows} />}
        {screen === "cod" && <CodPanel rows={rows} />}
        {screen === "exceptions" && <ExceptionPanel rows={rows} />}
        {screen === "reports" && <ReportsPanel stats={stats} />}
        {screen === "wallets" && <WalletPanel rows={rows} />}
        {screen === "commission" && <CommissionPanel rows={rows} stats={stats} />}
        {screen === "merchant" && <MerchantPanel rows={rows} />}

        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 mt-6">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-3.5 text-[#4ea8de]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search records..."
              className="w-full rounded-xl bg-[#061524] border border-[#254b73] px-11 py-3 text-white outline-none"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function WayplanPanel({ rows, reload }: { rows: any[]; reload: () => void }) {
  async function update(row: any, status: string) {
    const { error } = await supabase.rpc("be_operations_action", {
      p_payload: {
        module: "wayplan",
        action: "WAYPLAN_UPDATE",
        ref_id: row.wayplan_id || row.delivery_way_id || row.pickup_id,
        status,
        actor: "wayplan-command",
      },
    });
    if (error) alert(error.message);
    await reload();
  }

  return (
    <section className="grid grid-cols-1 xl:grid-cols-[300px_1fr_280px] gap-5">
      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <h2 className="font-black text-white mb-4">Wayplan Queue</h2>
        <div className="space-y-3">
          {rows.slice(0, 10).map((r) => (
            <div key={r.id} className="rounded-xl border border-[#f6b84b] bg-[#071a2b] p-4">
              <div className="text-[#f6b84b] font-black">{r.wayplan_id || r.pickup_id || "Wayplan"}</div>
              <div className="text-[#9fc4df] text-sm">{r.merchant_name || r.customer_name}</div>
              <div className="text-[#4ea8de] text-xs">{r.vehicle_no || "No vehicle"}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 overflow-x-auto">
        <h2 className="font-black text-white mb-4">Stop Sequence Control</h2>
        <table className="w-full text-sm">
          <thead className="bg-[#071a2b] text-[#4ea8de]">
            <tr>
              {["Seq", "Shipment / Customer", "Township", "Status", "Actions"].map((h) => (
                <th key={h} className="p-3 text-left uppercase text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#1a3a5c]">
                <td className="p-3 text-[#f6b84b] font-black">{r.sequence_no}</td>
                <td className="p-3">
                  <div className="text-[#4ea8de] font-black">{r.delivery_way_id || r.pickup_id}</div>
                  <div>{r.customer_name || r.merchant_name}</div>
                  <div className="text-[#9fc4df] text-xs">{r.address}</div>
                </td>
                <td className="p-3">{r.township}</td>
                <td className="p-3"><span className="rounded-full border border-[#f6b84b] text-[#f6b84b] px-3 py-1 text-xs font-bold">{r.stop_status}</span></td>
                <td className="p-3">
                  <DarkButton onClick={() => update(r, "completed")}>Update</DarkButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-5">
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
          <h2 className="font-black text-white mb-4">Dispatch Assignment</h2>
          <select className="w-full bg-[#061524] border border-[#254b73] rounded-xl px-3 py-3 mb-3"><option>Select rider</option></select>
          <select className="w-full bg-[#061524] border border-[#254b73] rounded-xl px-3 py-3 mb-3"><option>Select vehicle</option></select>
          <textarea className="w-full bg-[#061524] border border-[#254b73] rounded-xl px-3 py-3 mb-3" placeholder="Dispatcher note" />
          <PrimaryButton className="w-full">Assign Dispatch Team</PrimaryButton>
        </div>
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
          <h2 className="font-black text-white mb-4">Go-Live Validation</h2>
          {["Wayplan data sync", "Stop sequence sync", "Rider master sync", "Fleet master sync"].map((x, i) => (
            <div key={x} className={`rounded-xl border ${i === 2 ? "border-[#f6b84b]" : "border-emerald-500"} p-3 mb-2`}>
              <div className="font-bold">{x}</div>
              <div className="text-xs text-[#9fc4df]">Expected · Actual</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExecutivePanel({ stats }: { stats: any }) {
  return (
    <>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 mb-6">
        <h2 className="font-black text-white mb-5"><BarChart3 className="inline text-[#4ea8de] mr-2" /> Last 7 Days Trend</h2>
        <div className="min-h-[120px] bg-[#071a2b] flex items-center justify-center text-[#4ea8de]">No trend data available.</div>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {["Pickup Pipeline", "Delivery Status", "Settlement Control"].map((x) => (
          <div key={x} className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
            <h2 className="font-black text-white mb-4">{x}</h2>
            {["Draft", "Saved", "Submitted"].map((y) => (
              <div key={y} className="rounded-xl border border-[#254b73] px-4 py-3 mb-2 flex justify-between">
                <span>{y}</span><span className="text-[#f6b84b] font-black">0</span>
              </div>
            ))}
          </div>
        ))}
      </section>
    </>
  );
}

function FinancePanel({ rows }: { rows: any[] }) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
      <aside className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        {["Overview", "Cashier", "Settlement", "Finance Hold", "Audit", "Bulk Upload", "Rules"].map((x) => (
          <button key={x} className="w-full text-left rounded-xl border border-[#254b73] px-4 py-3 mb-3">{x}</button>
        ))}
      </aside>
      <div className="space-y-5">
        <div className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
          <h2 className="font-black text-white mb-4"><ShieldCheck className="inline text-emerald-400 mr-2" /> Go-Live စစ်ဆေးချက်</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {["Finance role resolved", "Permission matrix loaded", "Finance logistics rules linked", "Settlement tables reachable", "Audit history reachable"].map((x) => (
              <div key={x} className="rounded-xl border border-[#f6b84b] bg-[#2d2a16] p-4 text-[#f6b84b] font-bold">{x}</div>
            ))}
          </div>
        </div>
        <Table title="Recent Settlement Batches" rows={rows} />
      </div>
    </section>
  );
}

function CodPanel({ rows }: { rows: any[] }) {
  return (
    <>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 mb-6">
        <h2 className="font-black text-white mb-5">Rider COD Handover Status — 10 States</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {["Pending Collection", "Collected", "Awaiting Handover", "Submitted", "Under Verification", "Handed Over", "Shortage", "Excess", "Disputed", "Locked"].map((x) => (
            <div key={x} className="rounded-xl border border-[#254b73] bg-[#071a2b] p-4">
              <div className="text-[#4ea8de] text-xs font-black uppercase">{x}</div>
              <div className="text-[#f6b84b] text-2xl font-black mt-2">0</div>
            </div>
          ))}
        </div>
      </section>
      <Table title="COD Handover Tracker" rows={rows} />
    </>
  );
}

function ExceptionPanel({ rows }: { rows: any[] }) {
  return (
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <h2 className="font-black text-white mb-4"><AlertTriangle className="inline text-[#f6b84b] mr-2" /> Pickup Exception Catalogue</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#071a2b] text-[#4ea8de] uppercase text-xs">
            <tr>
              {["Code", "Exception Name", "Mapped Status", "Severity", "Photo", "Call Log", "Reschedule", "Next Action", "Customer Message"].map((h) => (
                <th key={h} className="p-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b border-[#1a3a5c]">
                <td className="p-3 text-[#4ea8de] font-black">{r.code}</td>
                <td className="p-3">{r.exception_name}<br /><span className="text-[#9fc4df]">{r.exception_name_mm}</span></td>
                <td className="p-3 text-pink-300">{r.mapped_status}</td>
                <td className="p-3 text-[#f6b84b]">{r.severity}</td>
                <td className="p-3">{r.photo_required ? "YES" : "NO"}</td>
                <td className="p-3">{r.call_log_required ? "YES" : "NO"}</td>
                <td className="p-3">{r.reschedule_allowed ? "YES" : "NO"}</td>
                <td className="p-3 text-[#f6b84b] font-black">{r.next_action}</td>
                <td className="p-3">{r.customer_message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportsPanel({ stats }: { stats: any }) {
  const rows = [
    ["Revenue", money(stats.revenue)],
    ["Delivery Fee", money(stats.delivery_fee)],
    ["COD Collected", money(stats.cod_collected)],
    ["Commission", money(stats.commission)],
    ["Settlement Pending", money(stats.settlement_pending)],
    ["Net Position", money(stats.net_position)],
  ];
  return (
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <h2 className="font-black text-white mb-5"><FileText className="inline mr-2" /> Profit & Loss</h2>
      <table className="w-full">
        <thead className="text-[#9fc4df] uppercase"><tr><th className="p-3 text-left">Metric</th><th className="p-3 text-left">Amount</th><th>Status</th></tr></thead>
        <tbody>{rows.map(([a,b]) => <tr key={a} className="border-b border-[#1a3a5c]"><td className="p-3 font-bold">{a}</td><td>{b}</td><td className="text-[#f6b84b]">Backend-ready</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function WalletPanel({ rows }: { rows: any[] }) {
  return <Table title="Rider / Driver / Helper Wallets" rows={rows} />;
}

function CommissionPanel({ rows, stats }: { rows: any[]; stats: any }) {
  return (
    <>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 mb-5 text-center">
        <div className="text-[#4ea8de] uppercase text-xs font-black">Commission Total</div>
        <div className="text-[#f6b84b] text-3xl font-black">{money(stats.total)}</div>
        <div className="text-[#4ea8de]">{stats.records || 0} records</div>
      </section>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 mb-5">
        <h2 className="font-black text-white mb-4">Commission Rate Ref</h2>
        <table className="w-full"><tbody>
          <tr className="border-b border-[#1a3a5c]"><td className="p-3 text-[#f6b84b]">PICKUP</td><td>+150 MMK</td><td>+75 MMK</td><td>+75 MMK</td></tr>
          <tr><td className="p-3 text-[#f6b84b]">DELIVERY</td><td>+300 MMK</td><td>+150 MMK</td><td>+150 MMK</td></tr>
        </tbody></table>
      </section>
      <Table title="Commission Records" rows={rows} />
    </>
  );
}

function MerchantPanel({ rows }: { rows: any[] }) {
  return (
    <>
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {["Pickup Requests", "Live Tracking", "Settlement", "Notifications"].map((x) => (
          <div key={x} className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
            <div className="text-[#4ea8de] uppercase text-xs">{x}</div>
            <div className="text-[#f6b84b] text-2xl font-black mt-2">0</div>
            <div className="text-[#9fc4df] mt-2">Operational and customer service alerts</div>
          </div>
        ))}
      </section>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        {["Order Picking Excel", "Customer Service", "Merchant Wallet"].map((x) => (
          <div key={x} className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
            <h2 className="font-black text-white mb-3">{x}</h2>
            <p className="text-[#9fc4df] mb-4">Download template, upload files, or open linked workflow.</p>
            <PrimaryButton>{x === "Order Picking Excel" ? "Upload Excel" : "Open"}</PrimaryButton>
          </div>
        ))}
      </section>
      <Table title="Merchant Records" rows={rows} />
    </>
  );
}

function Table({ title, rows }: { title: string; rows: any[] }) {
  const keys = Object.keys(rows?.[0] || {}).slice(0, 8);
  return (
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <h2 className="font-black text-white mb-4">{title}</h2>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#254b73] p-12 text-center text-[#4ea8de]">No records found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#071a2b] text-[#4ea8de] uppercase text-xs">
              <tr>{keys.map((k) => <th key={k} className="p-3 text-left">{titleCase(k)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-[#1a3a5c]">
                  {keys.map((k) => <td key={k} className="p-3">{String(r[k] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
