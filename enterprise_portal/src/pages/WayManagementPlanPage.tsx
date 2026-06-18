// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BadgeCheck, Box, CheckCircle2, Download, Filter, Layers, Loader2, PackagePlus, PackageSearch, RefreshCw, Search, Send, Truck, Undo2, Wallet, X, Zap } from "lucide-react";
import { assignWay, exportWaysCsv, fetchWayManagementLookups, fetchWayManagementPlan, updateWayStatus, type WayRow, type WayView } from "@/lib/wayManagementApi";

const NAV_ITEMS: Array<{ view: WayView; label: string; icon: any }> = [
  { view: "all", label: "All Ways", icon: Activity },
  { view: "pickup", label: "Pickup Way", icon: PackagePlus },
  { view: "pending", label: "Pending Item", icon: PackageSearch },
  { view: "deliver", label: "Deliver Way", icon: Truck },
  { view: "successful", label: "Successful Way", icon: BadgeCheck },
  { view: "failed", label: "Failed Way", icon: AlertTriangle },
  { view: "return", label: "Return Way", icon: Undo2 },
];

const STATUS_OPTIONS = ["pickup_requested", "pickup_assigned", "pickup_verified", "hub_processing", "ready_for_dispatch", "in_transit", "delivered", "failed", "return", "cancelled"];

function fmtMoney(value: any) {
  return `${Number(value || 0).toLocaleString()} Ks`;
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function clean(value: any, fallback = "-") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function statusClass(status?: string) {
  const s = String(status || "").toLowerCase();
  if (s.includes("delivered") || s.includes("success")) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (s.includes("failed")) return "border-red-500/30 bg-red-500/10 text-red-300";
  if (s.includes("return")) return "border-violet-500/30 bg-violet-500/10 text-violet-300";
  if (s.includes("transit") || s.includes("dispatch")) return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  if (s.includes("pickup")) return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

export default function WayManagementPlanPage() {
  const [view, setView] = useState<WayView>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [rows, setRows] = useState<WayRow[]>([]);
  const [source, setSource] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [metrics, setMetrics] = useState({ pendingPickups: 0, hubProcessing: 0, activeDispatch: 0, delivered: 0, failed: 0, returnCount: 0, successRate: 0, codToCollect: 0 });
  const [lookups, setLookups] = useState<{ merchants: any[]; staff: any[]; townships: any[] }>({ merchants: [], staff: [], townships: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<WayRow | null>(null);
  const [panel, setPanel] = useState<"none" | "filters" | "detail" | "assign">("none");
  const [saving, setSaving] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [primaryStaff, setPrimaryStaff] = useState("");
  const [secondaryStaff, setSecondaryStaff] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const [snapshot, lookupData] = await Promise.all([
        fetchWayManagementPlan({ view, search, status: statusFilter, merchant: merchantFilter, assignedTo: assignedFilter, limit: 1500 }),
        fetchWayManagementLookups(),
      ]);
      setRows(snapshot.rows);
      setSource(snapshot.source);
      setWarnings(snapshot.warnings);
      setMetrics(snapshot.metrics);
      setLookups(lookupData);
    } catch (error: any) {
      setMessage(error?.message || "Unable to load way management plan.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const title = useMemo(() => NAV_ITEMS.find((item) => item.view === view)?.label || "All Ways", [view]);

  function openDetail(row: WayRow) {
    setSelected(row);
    setEditStatus(row.status || "");
    setEditRemarks(row.remarks || "");
    setPrimaryStaff(row.assigned_primary_id || "");
    setSecondaryStaff(row.assigned_secondary_id || "");
    setPanel("detail");
  }

  function openAssign(row: WayRow) {
    setSelected(row);
    setPrimaryStaff(row.assigned_primary_id || "");
    setSecondaryStaff(row.assigned_secondary_id || "");
    setEditRemarks(row.remarks || "");
    setPanel("assign");
  }

  async function saveStatus() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      await updateWayStatus({ wayId: selected.way_id, status: editStatus, remarks: editRemarks });
      setPanel("none");
      setSelected(null);
      setMessage(`${selected.way_id} updated.`);
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Unable to update way status.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    try {
      await assignWay({ wayId: selected.way_id, primaryStaffId: primaryStaff || null, secondaryStaffId: secondaryStaff || null, remarks: editRemarks });
      setPanel("none");
      setSelected(null);
      setMessage(`${selected.way_id} assignment updated.`);
      await load();
    } catch (error: any) {
      setMessage(error?.message || "Unable to assign way.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-[#0A192F] text-slate-100">
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[#FBBF24]/30 bg-[#112240]/80 backdrop-blur lg:flex">
          <div className="border-b border-[#FBBF24]/20 px-5 py-5">
            <div className="text-sm font-black tracking-wide text-white">Britium Express</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Way Management</div>
          </div>
          <nav className="flex-1 overflow-y-auto py-3">
            <p className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Way Management Plan</p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view === item.view;
              return (
                <button key={item.view} type="button" onClick={() => setView(item.view)} className={`flex w-full items-center gap-3 border-l-2 px-5 py-2.5 text-left text-xs font-bold transition ${active ? "border-[#FBBF24] bg-[#FBBF24]/10 text-[#FBBF24]" : "border-transparent text-slate-400 hover:border-[#FBBF24]/60 hover:bg-[#FBBF24]/5 hover:text-[#FBBF24]"}`}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
            <p className="mt-5 px-5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Backend Source</p>
            <div className="mx-5 rounded-xl border border-[#FBBF24]/10 bg-[#0A192F]/60 p-3 text-[11px] font-semibold text-slate-400">
              <div className="break-words text-[#FBBF24]">{source || "No source loaded"}</div>
              <div className="mt-2">Rows: {rows.length}</div>
            </div>
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-[#FBBF24]/30 bg-[#0A192F] px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h1 className="text-xl font-black text-white sm:text-2xl">{title}</h1>
                <p className="mt-1 text-xs font-semibold text-slate-400">Live backend way management. No mock data, no sample rows, no hard-coded operational records.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-[280px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#FBBF24]" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="Scan / WAY-ID / phone / merchant" className="h-10 w-full rounded-xl border border-[#FBBF24]/25 bg-[#112240] pl-10 pr-3 text-xs font-semibold text-white outline-none focus:border-[#FBBF24]" />
                </div>
                <ToolbarButton onClick={() => setPanel("filters")} icon={Filter} label="Filter" />
                <ToolbarButton onClick={load} icon={loading ? Loader2 : RefreshCw} label="Refresh" spin={loading} />
                <button type="button" onClick={() => exportWaysCsv(rows)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FBBF24] px-4 py-2 text-xs font-black text-[#0A192F]">
                  <Download className="h-4 w-4" /> CSV
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {message ? <div className="mb-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm font-bold text-blue-200">{message}</div> : null}
            {warnings.length ? (
              <details className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                <summary className="cursor-pointer font-black">Backend warnings ({warnings.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.slice(0, 8).map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
              </details>
            ) : null}

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Kpi icon={Box} label="Pending Pickup" value={`${metrics.pendingPickups}`} suffix="bags" />
              <Kpi icon={Layers} label="Hub Processing" value={`${metrics.hubProcessing}`} suffix="ways" />
              <Kpi icon={Truck} label="Active Dispatch" value={`${metrics.activeDispatch}`} />
              <Kpi icon={CheckCircle2} label="Success Rate" value={`${metrics.successRate}%`} green />
              <Kpi icon={Wallet} label="COD To Collect" value={fmtMoney(metrics.codToCollect)} />
            </section>

            <section className="mt-5 overflow-hidden rounded-2xl border border-[#FBBF24]/30 bg-[#112240]">
              <div className="flex flex-col gap-3 border-b border-[#FBBF24]/20 bg-[#0A192F]/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {NAV_ITEMS.map((item) => (
                    <button key={item.view} type="button" onClick={() => setView(item.view)} className={`rounded-lg px-3 py-1.5 text-xs font-black ${view === item.view ? "bg-[#FBBF24]/10 text-[#FBBF24] ring-1 ring-[#FBBF24]/30" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs font-bold text-slate-400">{rows.length} live way(s)</div>
              </div>

              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full min-w-[1320px] text-left text-xs">
                  <thead className="sticky top-0 bg-[#0A192F] text-[10px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Way ID</th>
                      <th className="px-4 py-3">Pickup</th>
                      <th className="px-4 py-3">Merchant</th>
                      <th className="px-4 py-3">Receiver / Phone</th>
                      <th className="px-4 py-3">Township</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">COD</th>
                      <th className="px-4 py-3">Assigned</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FBBF24]/10">
                    {loading ? (
                      <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#FBBF24]" />Loading live backend records...</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">No live way records found. Backend returned empty data.</td></tr>
                    ) : rows.map((row) => (
                      <tr key={row.way_id} className="hover:bg-[#FBBF24]/5">
                        <td className="px-4 py-3 font-mono font-black text-[#FBBF24]">{row.way_id}</td>
                        <td className="px-4 py-3 font-mono text-slate-300">{clean(row.pickup_id)}</td>
                        <td className="px-4 py-3"><div className="font-bold text-white">{clean(row.merchant_name || row.merchant_code)}</div><div className="text-[10px] text-slate-500">{clean(row.merchant_code, "")}</div></td>
                        <td className="px-4 py-3"><div className="font-bold text-white">{clean(row.receiver_name)}</div><div className="font-mono text-[10px] text-slate-400">{clean(row.receiver_phone)}</div></td>
                        <td className="px-4 py-3"><div>{clean(row.township)}</div><div className="text-[10px] text-slate-500">{clean(row.zone, "")}</div></td>
                        <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(row.status)}`}>{clean(row.status)}</span></td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-white">{fmtMoney(row.cod_amount)}</td>
                        <td className="px-4 py-3"><div>{clean(row.assigned_primary_name || row.assigned_primary_id)}</div><div className="text-[10px] text-slate-500">{clean(row.assigned_secondary_name || row.assigned_secondary_id, "")}</div></td>
                        <td className="px-4 py-3 text-slate-400">{fmtDate(row.last_event_at)}</td>
                        <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => openAssign(row)} className="rounded-lg border border-[#FBBF24]/20 px-3 py-1.5 text-[10px] font-black text-[#FBBF24] hover:bg-[#FBBF24]/10">Assign</button><button type="button" onClick={() => openDetail(row)} className="rounded-lg bg-[#FBBF24] px-3 py-1.5 text-[10px] font-black text-[#0A192F]">Open</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-3 xl:hidden">
                {loading ? <EmptyState text="Loading live backend records..." loading /> : rows.length === 0 ? <EmptyState text="No live way records found." /> : rows.map((row) => (
                  <div key={row.way_id} className="rounded-2xl border border-[#FBBF24]/20 bg-[#0A192F]/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="font-mono text-sm font-black text-[#FBBF24]">{row.way_id}</div><div className="mt-1 text-sm font-bold text-white">{clean(row.merchant_name || row.merchant_code)}</div><div className="text-xs text-slate-400">{clean(row.receiver_name)} · {clean(row.receiver_phone)}</div></div>
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusClass(row.status)}`}>{clean(row.status)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                      <div>Pickup: <span className="font-mono text-slate-200">{clean(row.pickup_id)}</span></div><div>Township: <span className="text-slate-200">{clean(row.township)}</span></div><div>COD: <span className="font-mono text-slate-200">{fmtMoney(row.cod_amount)}</span></div><div>Assigned: <span className="text-slate-200">{clean(row.assigned_primary_name || row.assigned_primary_id)}</span></div>
                    </div>
                    <div className="mt-4 flex gap-2"><button type="button" onClick={() => openAssign(row)} className="flex-1 rounded-xl border border-[#FBBF24]/20 px-3 py-2 text-xs font-black text-[#FBBF24]">Assign</button><button type="button" onClick={() => openDetail(row)} className="flex-1 rounded-xl bg-[#FBBF24] px-3 py-2 text-xs font-black text-[#0A192F]">Open</button></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>

      {panel !== "none" ? <div className="fixed inset-0 z-40 bg-[#0A192F]/80 backdrop-blur-sm" onClick={() => setPanel("none")} /> : null}

      {panel === "filters" ? (
        <SidePanel title="Dispatch Filters" subtitle="Filter live backend records" onClose={() => setPanel("none")}>
          <Field label="Status"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 w-full rounded-xl border border-[#FBBF24]/25 bg-[#0A192F] px-3 text-sm text-white"><option value="all">All Statuses</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
          <Field label="Merchant"><select value={merchantFilter} onChange={(event) => setMerchantFilter(event.target.value)} className="h-11 w-full rounded-xl border border-[#FBBF24]/25 bg-[#0A192F] px-3 text-sm text-white"><option value="all">All Merchants</option>{lookups.merchants.map((m) => <option key={m.id || m.code || m.name} value={m.name || m.code || m.id}>{m.label || m.name || m.code}</option>)}</select></Field>
          <Field label="Assigned To"><input value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)} className="h-11 w-full rounded-xl border border-[#FBBF24]/25 bg-[#0A192F] px-3 text-sm text-white" placeholder="Rider / driver / helper" /></Field>
          <div className="flex gap-2 pt-3"><button type="button" onClick={() => { setStatusFilter("all"); setMerchantFilter("all"); setAssignedFilter(""); }} className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-black text-slate-300">Reset</button><button type="button" onClick={() => { setPanel("none"); void load(); }} className="flex-1 rounded-xl bg-[#FBBF24] px-4 py-2 text-sm font-black text-[#0A192F]">Apply Filters</button></div>
        </SidePanel>
      ) : null}

      {panel === "detail" && selected ? (
        <SidePanel title="Shipment / Way Detail" subtitle={selected.way_id} onClose={() => setPanel("none")} wide>
          <DetailGrid row={selected} />
          <Field label="Status"><select value={editStatus} onChange={(event) => setEditStatus(event.target.value)} className="h-11 w-full rounded-xl border border-[#FBBF24]/25 bg-[#0A192F] px-3 text-sm text-white">{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
          <Field label="Remarks"><textarea value={editRemarks} onChange={(event) => setEditRemarks(event.target.value)} className="min-h-[110px] w-full rounded-xl border border-[#FBBF24]/25 bg-[#0A192F] p-3 text-sm text-white" /></Field>
          <button type="button" onClick={saveStatus} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FBBF24] px-4 py-3 text-sm font-black text-[#0A192F] disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}Save Status</button>
        </SidePanel>
      ) : null}

      {panel === "assign" && selected ? (
        <SidePanel title="Assign Rider / Driver / Helper" subtitle={selected.way_id} onClose={() => setPanel("none")}>
          <Field label="Primary Assignee"><select value={primaryStaff} onChange={(event) => setPrimaryStaff(event.target.value)} className="h-11 w-full rounded-xl border border-[#FBBF24]/25 bg-[#0A192F] px-3 text-sm text-white"><option value="">-- Select primary assignee --</option>{lookups.staff.map((s) => <option key={s.id || s.code || s.name} value={s.id || s.code || s.name}>{s.label || s.name || s.code}</option>)}</select></Field>
          <Field label="Secondary Assignee"><select value={secondaryStaff} onChange={(event) => setSecondaryStaff(event.target.value)} className="h-11 w-full rounded-xl border border-[#FBBF24]/25 bg-[#0A192F] px-3 text-sm text-white"><option value="">-- Select helper / secondary --</option>{lookups.staff.map((s) => <option key={s.id || s.code || s.name} value={s.id || s.code || s.name}>{s.label || s.name || s.code}</option>)}</select></Field>
          <Field label="Dispatch Notes"><textarea value={editRemarks} onChange={(event) => setEditRemarks(event.target.value)} className="min-h-[110px] w-full rounded-xl border border-[#FBBF24]/25 bg-[#0A192F] p-3 text-sm text-white" placeholder="Notes for rider/driver/helper" /></Field>
          <button type="button" onClick={saveAssignment} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FBBF24] px-4 py-3 text-sm font-black text-[#0A192F] disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Save Assignment</button>
        </SidePanel>
      ) : null}
    </main>
  );
}

function ToolbarButton({ onClick, icon: Icon, label, spin }: { onClick: () => void; icon: any; label: string; spin?: boolean }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#FBBF24]/25 bg-[#112240] px-4 py-2 text-xs font-black text-slate-300 hover:text-white"><Icon className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} />{label}</button>;
}

function Kpi({ icon: Icon, label, value, suffix, green }: { icon: any; label: string; value: string; suffix?: string; green?: boolean }) {
  return <div className="rounded-2xl border border-[#FBBF24]/25 bg-[#112240] p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><h2 className={`mt-2 text-xl font-black ${green ? "text-emerald-300" : "text-white"}`}>{value} {suffix ? <span className="text-xs font-semibold text-slate-400">{suffix}</span> : null}</h2></div><Icon className="h-5 w-5 text-[#FBBF24]" /></div></div>;
}

function EmptyState({ text, loading }: { text: string; loading?: boolean }) {
  return <div className="rounded-2xl border border-[#FBBF24]/10 p-8 text-center text-slate-400">{loading ? <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#FBBF24]" /> : null}{text}</div>;
}

function SidePanel({ title, subtitle, children, onClose, wide }: { title: string; subtitle: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <aside className={`fixed right-0 top-0 z-50 h-full ${wide ? "w-full max-w-3xl" : "w-full max-w-lg"} border-l border-[#FBBF24]/30 bg-[#112240] shadow-2xl`}><div className="flex items-start justify-between gap-3 border-b border-[#FBBF24]/20 bg-[#0A192F]/80 px-5 py-4"><div><h2 className="text-sm font-black text-white">{title}</h2><p className="mt-1 text-xs font-semibold text-slate-400">{subtitle}</p></div><button type="button" onClick={onClose} className="rounded-xl border border-[#FBBF24]/20 p-2 text-slate-300 hover:text-white"><X className="h-4 w-4" /></button></div><div className="h-[calc(100%-72px)] space-y-5 overflow-y-auto p-5">{children}</div></aside>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-400">{label}</span>{children}</label>;
}

function DetailGrid({ row }: { row: WayRow }) {
  const items = [["Way ID", row.way_id], ["Pickup ID", row.pickup_id], ["Merchant", row.merchant_name || row.merchant_code], ["Receiver", row.receiver_name], ["Phone", row.receiver_phone], ["Address", row.receiver_address], ["Township", row.township], ["Zone", row.zone], ["COD", fmtMoney(row.cod_amount)], ["Weight", `${row.weight_kg || 0} kg`], ["Primary", row.assigned_primary_name || row.assigned_primary_id], ["Secondary", row.assigned_secondary_name || row.assigned_secondary_id], ["Pickup By", row.pickup_by_name || row.pickup_by_id], ["Collection", row.collection_date], ["Delivery", row.delivery_date], ["Updated", fmtDate(row.last_event_at)]];
  return <div className="grid gap-3 sm:grid-cols-2">{items.map(([label, value]) => <div key={label} className="rounded-xl border border-[#FBBF24]/10 bg-[#0A192F]/50 p-3"><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div><div className="mt-1 break-words text-sm font-bold text-white">{clean(value)}</div></div>)}</div>;
}
