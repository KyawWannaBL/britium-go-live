// @ts-nocheck
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { clearLocalMockData, GO_LIVE_TEMPLATE_SCHEMAS, GO_LIVE_WORKFLOW_STEPS } from "@/lib/britiumGoLiveTemplateSchemas";

type CheckResult = {
  key: string;
  label: string;
  status: "pending" | "pass" | "warning" | "fail";
  detail: string;
};

const defaultChecks: CheckResult[] = [
  { key: "master", label: "Master Data", status: "pending", detail: "Waiting for backend readiness snapshot." },
  { key: "runtime", label: "Runtime Cleanup", status: "pending", detail: "Sample/mock/demo rows must be zero in active runtime screens." },
  { key: "pickup", label: "Unified Pickup Workflow", status: "pending", detail: "Merchant, Customer, and CS must submit into the same pickup workflow." },
  { key: "dispatch", label: "Dispatch Counters", status: "pending", detail: "Counters stay zero until real routes are generated." },
  { key: "warehouse", label: "Warehouse Intake", status: "pending", detail: "Warehouse intake and scan rows are backend-only." },
  { key: "branch", label: "MDY/NPT Branches", status: "pending", detail: "Branch Office loads Mandalay and Naypyitaw safely." },
  { key: "finance", label: "Finance / COD", status: "pending", detail: "COD and settlement states are separated from operational edits." },
  { key: "templates", label: "Upload Templates", status: "pending", detail: "Header-only UAT templates are available for Data Entry, Merchant/Customer, and Warehouse." },
];

function statusClass(status: CheckResult["status"]) {
  if (status === "pass") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "warning") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "fail") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
}

export default function UATGoLiveCommandCenterPage() {
  const [checks, setChecks] = useState<CheckResult[]>(defaultChecks);
  const [message, setMessage] = useState("UAT workspace is using production-mode runtime rules. No mock/demo rows are rendered by these go-live screens.");
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);

  const totals = useMemo(() => {
    return {
      pass: checks.filter((check) => check.status === "pass").length,
      warning: checks.filter((check) => check.status === "warning").length,
      fail: checks.filter((check) => check.status === "fail").length,
      pending: checks.filter((check) => check.status === "pending").length,
    };
  }, [checks]);

  async function runReadinessCheck() {
    setLoading(true);
    setMessage("Running backend readiness snapshot...");
    try {
      const { data, error } = await (supabase as any).rpc("be_go_live_readiness_snapshot");
      if (error) throw error;
      setSnapshot(data || null);

      const summary = data?.summary || {};
      setChecks(defaultChecks.map((check) => {
        const item = data?.checks?.[check.key] || {};
        const status = item.status || (summary[check.key] === true ? "pass" : "warning");
        return {
          ...check,
          status: ["pass", "warning", "fail"].includes(status) ? status : "warning",
          detail: item.detail || check.detail,
        };
      }));
      setMessage("Backend readiness snapshot loaded.");
    } catch (error: any) {
      setChecks(defaultChecks.map((check) => ({
        ...check,
        status: check.key === "templates" ? "pass" : "warning",
        detail: check.key === "templates" ? "Templates are included in this release package." : "RPC unavailable or not deployed yet. Apply the included SQL migration, then re-run.",
      })));
      setMessage(error?.message || "Unable to run backend readiness snapshot.");
    } finally {
      setLoading(false);
    }
  }

  async function clearMockRuntime() {
    const localCleared = clearLocalMockData();
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("be_go_live_archive_and_cleanup_runtime", {
        p_reason: "UAT_GO_LIVE_FRONTEND_CONTROL",
      });
      if (error) throw error;
      setMessage(`Runtime cleanup RPC completed. Local mock keys cleared: ${localCleared}. Backend result: ${JSON.stringify(data || {})}`);
      await runReadinessCheck();
    } catch (error: any) {
      setMessage(`Local mock keys cleared: ${localCleared}. Backend cleanup RPC is not available yet: ${error?.message || "unknown error"}`);
      setChecks((old) => old.map((check) => check.key === "runtime" ? { ...check, status: "warning", detail: "Local mock/demo runtime cleared. Backend migration must be applied for database cleanup." } : check));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950">
      <section className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-700">UAT / Go-Live Version</p>
            <h1 className="mt-2 text-4xl font-black">Britium Go-Live Command Center</h1>
            <p className="mt-3 max-w-5xl text-sm font-semibold leading-6 text-slate-600">
              Enhanced workflow workspace for Customer Service intake, Data Entry uploads, Warehouse scan intake, Dispatch, Branch Office, Finance, and operational readiness. These screens intentionally render backend data only and block mock/sample/demo rows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runReadinessCheck} disabled={loading} className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black uppercase text-white disabled:opacity-60">
              {loading ? "Working..." : "Run Readiness Check"}
            </button>
            <button type="button" onClick={clearMockRuntime} disabled={loading} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black uppercase text-white disabled:opacity-60">
              Clear Mock Runtime
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 ring-1 ring-blue-100">{message}</div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {[
            ["Passed", totals.pass, "text-emerald-700"],
            ["Warnings", totals.warning, "text-amber-700"],
            ["Failed", totals.fail, "text-rose-700"],
            ["Pending", totals.pending, "text-slate-700"],
          ].map(([label, value, cls]) => (
            <div key={label} className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
              <p className={`mt-2 text-4xl font-black ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-3">
        <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200 xl:col-span-2">
          <h2 className="text-2xl font-black">Go-Live Checks</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {checks.map((check) => (
              <article key={check.key} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black text-slate-950">{check.label}</h3>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ring-1 ${statusClass(check.status)}`}>{check.status}</span>
                </div>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{check.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-[28px] bg-slate-950 p-5 text-white shadow-sm">
          <h2 className="text-2xl font-black">Required UAT Screens</h2>
          <div className="mt-4 grid gap-2">
            {[
              ["/templates", "Template Center"],
              ["/data-entry", "Data Entry Upload"],
              ["/merchant/upload", "Merchant Upload"],
              ["/warehouse/upload", "Warehouse Upload"],
              ["/dispatch", "Dispatch"],
              ["/branch-office", "Branch Office"],
              ["/cod-settlement", "COD Settlement"],
            ].map(([href, label]) => (
              <Link key={href} to={href} className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10 hover:bg-white/15">
                {label}
              </Link>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-black">Wired Workflow Process</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {GO_LIVE_WORKFLOW_STEPS.map((step, index) => (
            <span key={step} className="rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
              {index + 1}. {step}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-2xl font-black">Included Header-Only Templates</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {GO_LIVE_TEMPLATE_SCHEMAS.map((schema) => (
            <article key={schema.key} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <h3 className="font-black">{schema.title}</h3>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{schema.description}</p>
              <div className="mt-4 flex gap-2">
                <a className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-black uppercase text-white" href={schema.xlsxFile} download>XLSX</a>
                <a className="rounded-xl bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 ring-1 ring-slate-200" href={schema.csvFile} download>CSV</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {snapshot ? (
        <section className="mt-5 rounded-[28px] bg-slate-900 p-5 text-white">
          <h2 className="text-xl font-black">Backend Snapshot</h2>
          <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-black/30 p-4 text-xs text-slate-200">{JSON.stringify(snapshot, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  );
}
