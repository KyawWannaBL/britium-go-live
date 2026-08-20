// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
  Printer,
  Clock3,
  AlertTriangle,
  History,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

function pick(row: any, keys: string[], fallback = "—") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
}

function statusClass(value: any) {
  const s = String(value || "").toLowerCase();
  if (s.includes("approved")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s.includes("pending")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (s.includes("reject")) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default function PrintApprovalCenterPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<any>({});
  const [amendments, setAmendments] = useState<any[]>([]);
  const [printRequests, setPrintRequests] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [query, setQuery] = useState("");

  async function actorEmail() {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.email || "mgkyawwanna@gmail.com";
    } catch {
      return "mgkyawwanna@gmail.com";
    }
  }

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const ctx = await getCurrentUserRole();
      const { data, error } = await supabase.rpc("be_governance_approval_center", {
        p_limit: 200,
        p_actor_email: ctx.email,
        p_actor_role: ctx.role,
      });

      if (error) throw error;

      setSummary(data?.summary || {});
      setAmendments(Array.isArray(data?.amendments) ? data.amendments : []);
      setPrintRequests(Array.isArray(data?.print_requests) ? data.print_requests : []);
      setAudit(Array.isArray(data?.audit) ? data.audit : []);
    } catch (e: any) {
      setMessage(e?.message || "Unable to load governance approval center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredAmendments = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return amendments;
    return amendments.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [amendments, query]);

  const filteredPrintRequests = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return printRequests;
    return printRequests.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [printRequests, query]);

  async function approvePrint(row: any) {
    const confirmed = window.confirm(`Approve reprint for ${row.document_type} ${row.document_no}?`);
    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    try {
      const email = await actorEmail();

      const { data, error } = await supabase.rpc("be_document_print_approve", {
        p_payload: {
          document_type: row.document_type,
          document_no: row.document_no,
          actor_email: email,
          actor_role: "superadmin",
          decision_note: "Approved from Governance Approval Center",
        },
      });

      if (error) throw error;

      setMessage(`Print approval updated. Approved requests: ${data?.approved_requests ?? 0}`);
      await loadData();
    } catch (e: any) {
      setMessage(e?.message || "Print approval failed.");
    } finally {
      setSaving(false);
    }
  }

  async function decideAmendment(row: any, decision: "APPROVED" | "REJECTED") {
    const confirmed = window.confirm(`${decision} amendment request ${row.id}?`);
    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    try {
      const email = await actorEmail();

      const { data, error } = await supabase.rpc("be_branch_amendment_decide", {
        p_payload: {
          amendment_id: row.id,
          decision,
          actor_email: email,
          actor_role: "superadmin",
          decision_note: `${decision} from Governance Approval Center`,
        },
      });

      if (error) throw error;

      setMessage(`Amendment ${decision}. Updated rows: ${data?.updated_rows ?? 0}`);
      await loadData();
    } catch (e: any) {
      setMessage(e?.message || "Amendment decision failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-[32px] border border-slate-200 bg-white p-10 shadow-sm">
        <div className="inline-flex items-center gap-3 text-sm font-semibold text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading governance approval center...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-[#0d2c54]" />
              <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                Superadmin Governance
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl">
              Governance Approval Center
            </h1>
            <p className="mt-4 max-w-4xl text-sm font-medium leading-6 text-slate-500 md:text-[15px]">
              Approve waybill/invoice reprints, branch amendments, and review governance audit history.
            </p>
          </div>

          <button
            onClick={() => void loadData()}
            disabled={loading || saving}
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric title="Pending Amendments" value={summary.pending_amendments ?? 0} icon={<AlertTriangle className="h-5 w-5" />} />
        <Metric title="Approved Amendments" value={summary.approved_amendments ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <Metric title="Rejected Amendments" value={summary.rejected_amendments ?? 0} icon={<XCircle className="h-5 w-5" />} />
        <Metric title="Pending Prints" value={summary.pending_print_requests ?? 0} icon={<Printer className="h-5 w-5" />} />
        <Metric title="Audit Events" value={summary.audit_events ?? 0} icon={<History className="h-5 w-5" />} />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="flex h-12 max-w-xl items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search approval records..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Branch Amendment Requests">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-3">Branch</th>
                  <th className="px-3 py-3">Target</th>
                  <th className="px-3 py-3">Requested Data</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAmendments.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-black">{row.branch_code}</td>
                    <td className="px-3 py-3">
                      <div>{row.target_table}</div>
                      <div className="text-xs text-slate-500">{row.target_id}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {JSON.stringify(row.requested_data || {}).slice(0, 140)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass(row.approval_status)}`}>
                        {row.approval_status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {row.approval_status === "PENDING" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => void decideAmendment(row, "APPROVED")}
                            disabled={saving}
                            className="rounded-xl bg-[#0d2c54] px-3 py-2 font-black text-white disabled:opacity-70"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => void decideAmendment(row, "REJECTED")}
                            disabled={saving}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-black text-rose-700 disabled:opacity-70"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Waybill / Invoice Reprint Requests">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-3">Document</th>
                  <th className="px-3 py-3">Requested By</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Consumed</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrintRequests.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-3">
                      <div className="font-black">{row.document_type}</div>
                      <div className="text-xs text-slate-500">{row.document_no}</div>
                    </td>
                    <td className="px-3 py-3">{pick(row, ["requested_by"], "—")}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass(row.approval_status)}`}>
                        {row.approval_status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{row.consumed_at ? "YES" : "NO"}</td>
                    <td className="px-3 py-3 text-right">
                      {row.approval_status === "PENDING" ? (
                        <button
                          onClick={() => void approvePrint(row)}
                          disabled={saving}
                          className="rounded-xl bg-[#0d2c54] px-3 py-2 font-black text-white disabled:opacity-70"
                        >
                          Approve
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">No action</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <Panel title="Governance Audit Log">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {audit.slice(0, 18).map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 p-4">
              <div className="font-black text-slate-900">{row.action}</div>
              <div className="text-sm text-slate-500">{row.module} · {row.actor_email || "system"}</div>
              <div className="text-xs text-slate-400">{row.created_at}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Metric({ title, value, icon }: any) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">
        {icon}
      </div>
      <div className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-black tracking-tight text-[#0d2c54]">{value}</div>
    </div>
  );
}

function Panel({ title, children }: any) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-5 border-b border-slate-200/80 pb-5">
        <div className="text-lg font-black tracking-tight text-[#0d2c54]">{title}</div>
      </div>
      {children}
    </div>
  );
}
