// @ts-nocheck
import React, { useEffect, useState } from "react";
import {
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Server,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

function statusClass(status: any) {
  const s = String(status || "").toUpperCase();
  if (s === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "WARNING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (s === "ERROR") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function statusIcon(status: any) {
  const s = String(status || "").toUpperCase();
  if (s === "READY") return <CheckCircle2 className="h-5 w-5" />;
  if (s === "WARNING") return <AlertTriangle className="h-5 w-5" />;
  if (s === "ERROR") return <XCircle className="h-5 w-5" />;
  return <Activity className="h-5 w-5" />;
}

function pretty(value: any) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function ProductionReadinessPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<any>({});
  const [modules, setModules] = useState<any[]>([]);
  const [generatedAt, setGeneratedAt] = useState("");

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const ctx = await getCurrentUserRole();
      const { data, error } = await supabase.rpc("be_production_readiness_dashboard_plus_plus", {
        p_actor_email: ctx.email,
        p_actor_role: ctx.role,
      });
      if (error) throw error;

      setSummary(data?.summary || {});
      setModules(Array.isArray(data?.modules) ? data.modules : []);
      setGeneratedAt(data?.generated_at || "");
    } catch (e: any) {
      setMessage(e?.message || "Unable to load production readiness dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-[32px] border border-slate-200 bg-white p-10 shadow-sm">
        <div className="inline-flex items-center gap-3 text-sm font-semibold text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading production readiness...
        </div>
      </div>
    );
  }

  const isGreen = Number(summary.error_modules || 0) === 0;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-[#0d2c54]" />
              <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                Go-Live Control
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl">
              Production Readiness Dashboard
            </h1>

            <p className="mt-4 max-w-4xl text-sm font-medium leading-6 text-slate-500 md:text-[15px]">
              One screen to verify operational modules, governance controls, master data, branch operations, and print approval readiness before go-live.
            </p>

            <div className={`mt-5 inline-flex rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${isGreen ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {isGreen ? "Production Ready" : "Action Required"}
            </div>
          </div>

          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#0d2c54] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Total Modules" value={summary.total_modules ?? modules.length} />
        <Metric title="Ready" value={summary.ready_modules ?? 0} />
        <Metric title="Warnings" value={summary.warning_modules ?? 0} />
        <Metric title="Errors" value={summary.error_modules ?? 0} />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="mb-5 flex flex-col gap-2 border-b border-slate-200/80 pb-5">
          <div className="text-lg font-black tracking-tight text-[#0d2c54]">
            Module Readiness
          </div>
          <div className="text-sm text-slate-500">
            Generated at: {generatedAt || "—"}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {modules.map((m, idx) => (
            <div key={`${m.module}-${idx}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-lg font-black text-[#0d2c54]">
                    <Server className="h-5 w-5" />
                    {m.module}
                  </div>
                  {m.error ? (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                      {m.error}
                    </div>
                  ) : null}
                </div>

                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass(m.status)}`}>
                  {statusIcon(m.status)}
                  {m.status}
                </span>
              </div>

              {m.summary ? (
                <pre className="mt-4 max-h-52 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {pretty(m.summary)}
                </pre>
              ) : null}

              {m.detail ? (
                <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {pretty(m.detail)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value }: any) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className="mt-3 text-4xl font-black tracking-tight text-[#0d2c54]">
        {value}
      </div>
    </div>
  );
}
