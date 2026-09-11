import React, { useEffect, useMemo, useState } from "react";
import {
  beV32ApproveCodSettlement,
  beV32ApproveReprint,
  beV32CreateCsCase,
  beV32GenerateWayplan,
  beV32List,
  beV32RecordBdmActivity,
  beV32RecordMarketing,
  beV32Snapshot,
  beV32SubmitCodSettlement,
  beV32WarehouseScan,
} from "@/lib/britiumCompleteWireupApiV32";

type Tab = "snapshot" | "tasks" | "wayplan" | "cs" | "bdm" | "marketing" | "warehouse" | "finance" | "reprint";

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "gold" | "green" | "blue" | "dark" }) {
  const tone = props.tone || "gold";
  const cls = tone === "green" ? "bg-emerald-400 text-slate-950" : tone === "blue" ? "bg-sky-500 text-white" : tone === "dark" ? "bg-slate-950 text-white border border-sky-900" : "bg-amber-400 text-slate-950";
  return <button {...props} className={`rounded-xl px-4 py-2 text-sm font-black disabled:opacity-50 ${cls} ${props.className || ""}`} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-11 rounded-xl border border-sky-800 bg-slate-950 px-3 text-sm text-white outline-none ${props.className || ""}`} />;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5 shadow"><h2 className="mb-4 text-lg font-black text-amber-300">{title}</h2>{children}</section>;
}

function money(v: any) { return Number(v || 0).toLocaleString("en-US"); }

export default function BritiumWireupCommandCenterV32() {
  const [tab, setTab] = useState<Tab>("snapshot");
  const [snapshot, setSnapshot] = useState<any>({});
  const [tasks, setTasks] = useState<any[]>([]);
  const [parcels, setParcels] = useState<any[]>([]);
  const [wayplans, setWayplans] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [reprints, setReprints] = useState<any[]>([]);
  const [log, setLog] = useState("Ready.");
  const [busy, setBusy] = useState(false);

  const [waybillNo, setWaybillNo] = useState("");
  const [pickupId, setPickupId] = useState("");
  const [riderEmail, setRiderEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("0");
  const [settlementId, setSettlementId] = useState("");

  const tabs: { key: Tab; label: string }[] = [
    { key: "snapshot", label: "Snapshot" },
    { key: "tasks", label: "Role Inbox" },
    { key: "wayplan", label: "Wayplan" },
    { key: "cs", label: "Customer Service" },
    { key: "bdm", label: "BD Manager" },
    { key: "marketing", label: "Marketing" },
    { key: "warehouse", label: "Warehouse" },
    { key: "finance", label: "Finance / COD" },
    { key: "reprint", label: "Reprint Approval" },
  ];

  async function refresh() {
    const [s, t, p, w, c, r] = await Promise.all([
      beV32Snapshot().catch((e) => ({ error: e.message })),
      beV32List("be_v32_role_inbox", 200).catch(() => []),
      beV32List("be_v32_parcels", 200).catch(() => []),
      beV32List("be_v32_wayplans", 100).catch(() => []),
      beV32List("be_v32_cod_settlements", 100).catch(() => []),
      beV32List("be_v32_reprint_requests", 100).catch(() => []),
    ]);
    setSnapshot(s || {});
    setTasks(t);
    setParcels(p);
    setWayplans(w);
    setSettlements(c);
    setReprints(r);
  }

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(true);
    try {
      const result = await fn();
      setLog(`${label}\n${JSON.stringify(result, null, 2)}`);
      await refresh();
    } catch (error: any) {
      setLog(`${label} FAILED\n${error?.message || String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const statCards = useMemo(() => [
    ["Total Parcels", snapshot.total_parcels],
    ["Ready for Wayplan", snapshot.ready_for_wayplan],
    ["Active Wayplans", snapshot.active_wayplans],
    ["Delivered", snapshot.delivered],
    ["Failed", snapshot.failed],
    ["Proof Exceptions", snapshot.proof_exceptions],
    ["Open Tasks", snapshot.open_tasks],
    ["Pending Reprints", snapshot.pending_reprints],
    ["Unsettled COD", money(snapshot.unsettled_cod)],
  ], [snapshot]);

  return (
    <main className="min-h-screen bg-[#061525] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-400">BRITIUM EXPRESS GO-LIVE</p>
          <h1 className="mt-2 text-2xl font-black">Complete Wireup Command Center v32</h1>
          <p className="mt-1 text-sm text-sky-200">CS, Supervisor, Rider, Data Entry, Printing, Warehouse and Finance are connected through the v32 workflow backbone.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((t) => <Button key={t.key} tone={tab === t.key ? "gold" : "dark"} onClick={() => setTab(t.key)}>{t.label}</Button>)}
            <Button tone="blue" onClick={() => run("Refresh", refresh)} disabled={busy}>Refresh</Button>
          </div>
        </section>

        {tab === "snapshot" && <Card title="Management Snapshot"><div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">{statCards.map(([label, value]) => <div key={label} className="rounded-2xl border border-sky-900 bg-slate-950 p-4"><p className="text-xs uppercase text-sky-300">{label}</p><p className="mt-2 text-xl font-black text-amber-300">{value ?? 0}</p></div>)}</div></Card>}

        {tab === "tasks" && <Card title="Cross-Role Inbox"><Table rows={tasks} cols={["target_role","source_role","process_area","waybill_no","pickup_id","title","priority","status"]} /></Card>}

        {tab === "wayplan" && <Card title="Supervisor Wayplan Generation">
          <div className="grid gap-3 md:grid-cols-4">
            <Input value={riderEmail} onChange={(e) => setRiderEmail(e.target.value)} placeholder="Rider email" />
            <Button tone="green" disabled={busy} onClick={() => run("Generate Wayplan", () => beV32GenerateWayplan({ riderEmail, branchCode: "YGN", vehicleType: "Bike" }))}>Generate YGN Bike Wayplan</Button>
          </div>
          <div className="mt-4"><Table rows={wayplans} cols={["wayplan_id","status","rider_email","vehicle_type","total_stops","total_cod","total_delivery_fee"]} /></div>
        </Card>}

        {tab === "cs" && <Card title="Customer Service Case / Escalation">
          <div className="grid gap-3 md:grid-cols-5">
            <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Waybill No" />
            <Input value={pickupId} onChange={(e) => setPickupId(e.target.value)} placeholder="Pickup ID" />
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
            <Button tone="green" disabled={busy} onClick={() => run("Create CS Case", () => beV32CreateCsCase({ waybillNo, pickupId, phone, issueType: "CUSTOMER_QUERY", issueDetail: "Created from v32 command center", targetRole: "supervisor" }))}>Create CS Case</Button>
          </div>
        </Card>}

        {tab === "bdm" && <Card title="Business Development Manager">
          <div className="grid gap-3 md:grid-cols-4">
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company / Merchant" />
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
            <Button tone="green" disabled={busy} onClick={() => run("BDM Activity", () => beV32RecordBdmActivity({ companyName, phone, stage: "HANDED_TO_OPS", expectedVolume: 1500, note: "BDM handoff from v32" }))}>Save + Handoff to Ops</Button>
          </div>
        </Card>}

        {tab === "marketing" && <Card title="Marketing Activity">
          <div className="grid gap-3 md:grid-cols-4">
            <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign name" />
            <Button tone="green" disabled={busy} onClick={() => run("Marketing Activity", () => beV32RecordMarketing({ campaignName, leadsGenerated: 10, note: "Marketing lead flow from v32" }))}>Save + Send Leads to BDM</Button>
          </div>
        </Card>}

        {tab === "warehouse" && <Card title="Warehouse Scan">
          <div className="grid gap-3 md:grid-cols-4">
            <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Waybill No" />
            <Button tone="green" disabled={busy || !waybillNo} onClick={() => run("Warehouse Received", () => beV32WarehouseScan({ waybillNo, scanType: "RECEIVED" }))}>Mark Received</Button>
            <Button tone="gold" disabled={busy || !waybillNo} onClick={() => run("Warehouse Dispatched", () => beV32WarehouseScan({ waybillNo, scanType: "DISPATCHED" }))}>Mark Dispatched</Button>
          </div>
          <div className="mt-4"><Table rows={parcels} cols={["waybill_no","pickup_id","status","warehouse_status","delivery_status","wayplan_id","assigned_rider"]} /></div>
        </Card>}

        {tab === "finance" && <Card title="COD Settlement / Finance Posting">
          <div className="grid gap-3 md:grid-cols-5">
            <Input value={riderEmail} onChange={(e) => setRiderEmail(e.target.value)} placeholder="Rider email" />
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Counted amount" />
            <Input value={settlementId} onChange={(e) => setSettlementId(e.target.value)} placeholder="Settlement UUID" />
            <Button tone="green" disabled={busy} onClick={() => run("Submit COD Settlement", () => beV32SubmitCodSettlement({ riderEmail, countedAmount: Number(amount || 0) }))}>Submit COD</Button>
            <Button tone="gold" disabled={busy || !settlementId} onClick={() => run("Approve COD", () => beV32ApproveCodSettlement(settlementId, "Approved from v32"))}>Approve & Post</Button>
          </div>
          <div className="mt-4"><Table rows={settlements} cols={["settlement_id","rider_email","expected_amount","counted_amount","variance_amount","status"]} /></div>
        </Card>}

        {tab === "reprint" && <Card title="Superadmin Reprint Approval">
          <Table rows={reprints} cols={["request_id","document_type","document_no","requested_by","reason","status","approved_by"]} />
          <p className="mt-3 text-xs text-sky-200">Open pending request IDs can be approved in SQL or by custom Superadmin page using be_v32_approve_reprint().</p>
        </Card>}

        <section className="rounded-3xl border border-sky-900 bg-slate-950 p-4"><h2 className="mb-2 font-black text-amber-300">Last Action</h2><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-sky-100">{log}</pre></section>
      </div>
    </main>
  );
}

function Table({ rows, cols }: { rows: any[]; cols: string[] }) {
  return <div className="overflow-auto rounded-2xl border border-sky-900"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-amber-400 text-slate-950"><tr>{cols.map((c) => <th key={c} className="p-2 font-black">{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id || row.waybill_no || row.request_id || row.settlement_id || i} className="border-t border-sky-900">{cols.map((c) => <td key={c} className="p-2 text-xs">{String(row[c] ?? "")}</td>)}</tr>)}</tbody></table></div>;
}
