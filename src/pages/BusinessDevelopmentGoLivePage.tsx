// @ts-nocheck
import { useEffect, useState } from "react";
import { RefreshCw, Globe2, Headphones, Megaphone, BarChart3, Package, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function money(v: any) {
  return `${Number(v || 0).toLocaleString()} MMK`;
}

export default function BusinessDevelopmentGoLivePage() {
  const [snapshot, setSnapshot] = useState<any>({ summary: {}, merchants: [], pickups: [], territories: [] });
  const [message, setMessage] = useState("Loading live business development data...");
  const [active, setActive] = useState("Territory Overview");
  const [loading, setLoading] = useState(false);

  const summary = snapshot.summary || {};
  const merchants = Array.isArray(snapshot.merchants) ? snapshot.merchants : [];
  const pickups = Array.isArray(snapshot.pickups) ? snapshot.pickups : [];
  const territories = Array.isArray(snapshot.territories) ? snapshot.territories : [];

  async function load() {
    setLoading(true);
    setMessage("Synchronizing BD live data...");
    const { data, error } = await (supabase as any).rpc("be_business_development_portal_snapshot", {
      p_payload: { territory: "ALL" },
    });
    setLoading(false);

    if (error) {
      setMessage(`Unable to load live data: ${error.message}`);
      return;
    }

    setSnapshot(data || {});
    setMessage("BD live data loaded from Supabase RPC.");
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <section className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-5">
            <div className="grid h-20 w-20 place-items-center rounded-3xl bg-slate-950 text-white shadow-xl">
              <Globe2 className="h-10 w-10" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-600">Britium Express</p>
              <h1 className="mt-2 text-4xl font-black text-slate-950">Business Development</h1>
              <p className="mt-1 text-lg font-semibold text-slate-600">
                Territory oversight, customer growth, marketing coordination, and enterprise performance.
              </p>
            </div>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-950 px-6 font-black text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Sync Live Data
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-blue-50 p-4 font-bold text-blue-900">{message}</div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Stat label="Consolidated Revenue" value={money(summary.consolidated_revenue)} />
          <Stat label="Royalty / Mgmt Fee" value={money(summary.royalty_management_fee)} tone="blue" />
          <Stat label="Success Rate" value={`${Number(summary.success_rate || 0).toFixed(1)}%`} tone="green" />
          <Stat label="Open Issues" value={summary.open_issues || 0} tone="rose" />
        </div>
      </section>

      <section className="mt-6 rounded-3xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          {[
            ["Territory Overview", Globe2],
            ["Regional Operations", BarChart3],
            ["Enterprise Inventory", Package],
            ["CS & Complaints", Headphones],
            ["Marketing Strategy", Megaphone],
            ["KPIs & Finance", BarChart3],
          ].map(([label, Icon]: any) => (
            <button
              key={label}
              onClick={() => setActive(label)}
              className={`rounded-2xl px-4 py-4 text-sm font-black ${
                active === label ? "bg-slate-950 text-white shadow-xl" : "border bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className="mx-auto mb-2 h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title={active}>
          {active === "Territory Overview" && (
            <div className="space-y-3">
              {territories.map((t: any) => (
                <div key={t.territory} className="rounded-2xl border p-4">
                  <p className="font-black">{t.territory} · {t.name}</p>
                  <p className="text-sm font-bold text-slate-500">{t.status}</p>
                </div>
              ))}
              {territories.length === 0 && <Empty />}
            </div>
          )}

          {active !== "Territory Overview" && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 font-semibold text-amber-900">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p>This module is connected to live backend summary data. Detailed workflow cards can be expanded after production data grows.</p>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Live Merchant Pipeline">
          <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
            {merchants.slice(0, 30).map((m: any) => (
              <div key={m.id || m.merchant_code || m.merchant_name} className="rounded-2xl border p-4">
                <p className="font-black">{m.merchant_code || "-"} · {m.merchant_name || m.contact_person || "-"}</p>
                <p className="text-sm font-semibold text-slate-500">{m.township || "-"} · {m.customer_tier || "STANDARD"} · {m.status || "Active"}</p>
              </div>
            ))}
            {merchants.length === 0 && <Empty />}
          </div>
        </Panel>

        <Panel title="Recent Pickup Activity">
          <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
            {pickups.slice(0, 30).map((p: any) => (
              <div key={p.id || p.pickup_id} className="rounded-2xl border p-4">
                <p className="font-mono font-black text-blue-700">{p.pickup_id || p.pickup_way_id || "-"}</p>
                <p className="font-bold">{p.merchant_name || p.merchant_code || "-"}</p>
                <p className="text-sm font-semibold text-slate-500">{p.status || "-"} · {money(p.cod_amount)}</p>
              </div>
            ))}
            {pickups.length === 0 && <Empty />}
          </div>
        </Panel>

        <Panel title="BD Operating Rules">
          <div className="space-y-3 text-sm font-semibold text-slate-600">
            <p>Customer acquisition must synchronize with Master Data before CS pickup intake.</p>
            <p>Merchant tier updates feed tariff calculation, Data Entry, Customer Service, Finance, and Merchant Portal.</p>
            <p>Issues escalated by CS or Operations must remain visible to BD for commercial follow-up.</p>
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Stat({ label, value, tone = "slate" }: { label: string; value: any; tone?: string }) {
  const toneClass =
    tone === "blue" ? "text-blue-700" :
    tone === "green" ? "text-emerald-600" :
    tone === "rose" ? "text-rose-600" :
    "text-slate-950";

  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: any }) {
  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <h2 className="text-2xl font-black">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="rounded-2xl border p-4 text-center font-bold text-slate-500">No live rows.</p>;
}
