import React, { useEffect, useState } from "react";
import {
  approveCodSettlementV33,
  approveReprintV33,
  bdmActivityV33,
  createCsCaseV33,
  generateWayplanV33,
  marketingActivityV33,
  snapshotV33,
  submitCodSettlementV33,
  submitProofV33,
  tableV33,
  warehouseScanV33,
} from "@/lib/britiumCompleteWireupApiV33";

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "gold" | "blue" | "green" | "dark" }) {
  const tone = props.tone || "gold";
  const cls =
    tone === "blue" ? "bg-sky-500 text-white" :
    tone === "green" ? "bg-emerald-400 text-slate-950" :
    tone === "dark" ? "bg-slate-950 text-white border border-sky-900" :
    "bg-amber-400 text-slate-950";
  return <button {...props} className={`rounded-xl px-4 py-2 text-sm font-black disabled:opacity-50 ${cls} ${props.className || ""}`} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-11 rounded-xl border border-sky-800 bg-slate-950 px-3 text-sm text-white outline-none ${props.className || ""}`} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-11 rounded-xl border border-sky-800 bg-slate-950 px-3 text-sm text-white outline-none ${props.className || ""}`} />;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5">
      <h2 className="mb-4 text-lg font-black text-amber-300">{title}</h2>
      {children}
    </section>
  );
}

function money(v: any) {
  return Number(v || 0).toLocaleString("en-US");
}

export default function BritiumWireupCommandCenterV33() {
  const [tab, setTab] = useState("snapshot");
  const [snapshot, setSnapshot] = useState<any>({});
  const [tasks, setTasks] = useState<any[]>([]);
  const [reprints, setReprints] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [log, setLog] = useState("No action yet.");
  const [busy, setBusy] = useState(false);

  const [waybillNo, setWaybillNo] = useState("");
  const [pickupId, setPickupId] = useState("P0624-BBG-010");
  const [riderEmail, setRiderEmail] = useState("");
  const [countedAmount, setCountedAmount] = useState("0");
  const [settlementId, setSettlementId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [issueDetail, setIssueDetail] = useState("");
  const [proofStatus, setProofStatus] = useState("DELIVERED");
  const [codCollected, setCodCollected] = useState("0");

  async function refresh() {
    const [s, t, r, c] = await Promise.all([
      snapshotV33().catch((e) => ({ error: e.message })),
      tableV33("be_v32_role_inbox", 200).catch(() => []),
      tableV33("be_v32_reprint_requests", 100).catch(() => []),
      tableV33("be_v32_cod_settlements", 100).catch(() => []),
    ]);
    setSnapshot(s || {});
    setTasks(t);
    setReprints(r);
    setSettlements(c);
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

  useEffect(() => {
    void refresh();
  }, []);

  const tabs = [
    ["snapshot", "Snapshot"],
    ["tasks", "Role Inbox"],
    ["cs", "Customer Service"],
    ["wayplan", "Supervisor / Wayplan"],
    ["rider", "Rider Proof"],
    ["warehouse", "Warehouse"],
    ["finance", "Finance"],
    ["bdm", "BDM / Marketing"],
    ["reprint", "Reprint Approval"],
  ];

  const stats = [
    ["Total Parcels", snapshot.total_parcels],
    ["Ready for Wayplan", snapshot.ready_for_wayplan],
    ["Active Wayplans", snapshot.active_wayplans],
    ["Delivered", snapshot.delivered],
    ["Failed", snapshot.failed],
    ["Proof Exceptions", snapshot.proof_exceptions],
    ["Open Tasks", snapshot.open_tasks],
    ["Pending Reprints", snapshot.pending_reprints],
    ["Unsettled COD", money(snapshot.unsettled_cod)],
  ];

  return (
    <main className="min-h-screen bg-[#061525] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-400">BRITIUM EXPRESS</p>
          <h1 className="mt-2 text-2xl font-black">Complete Portal + Rider Wireup Command Center v33</h1>
          <p className="mt-1 text-sm text-sky-200">
            CS → Supervisor → Rider → Data Entry → Print → Warehouse → Finance workflow backbone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map(([key, label]) => <Button key={key} tone={tab === key ? "gold" : "dark"} onClick={() => setTab(key)}>{label}</Button>)}
            <Button tone="blue" onClick={() => run("Refresh", refresh)} disabled={busy}>Refresh</Button>
          </div>
        </section>

        {tab === "snapshot" && (
          <Card title="Go-Live Wireup Snapshot">
            <div className="grid gap-3 md:grid-cols-4">
              {stats.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-sky-900 bg-slate-950 p-4">
                  <p className="text-xs uppercase text-sky-300">{label}</p>
                  <p className="mt-2 text-xl font-black text-amber-300">{value ?? 0}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "tasks" && (
          <Card title="Cross-Role Inbox">
            <div className="overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950">
                  <tr><th className="p-2">Target</th><th className="p-2">Source</th><th className="p-2">Process</th><th className="p-2">Waybill</th><th className="p-2">Title</th><th className="p-2">Priority</th><th className="p-2">Status</th></tr>
                </thead>
                <tbody>{tasks.map((x) => <tr key={x.id} className="border-t border-sky-900"><td className="p-2">{x.target_role}</td><td className="p-2">{x.source_role}</td><td className="p-2">{x.process_area}</td><td className="p-2">{x.waybill_no}</td><td className="p-2 text-amber-300">{x.title}</td><td className="p-2">{x.priority}</td><td className="p-2">{x.status}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "cs" && (
          <Card title="Customer Service → Supervisor / Operations / Finance">
            <div className="grid gap-3 md:grid-cols-5">
              <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Waybill No." />
              <Input value={pickupId} onChange={(e) => setPickupId(e.target.value)} placeholder="Pickup ID" />
              <Input value={issueDetail} onChange={(e) => setIssueDetail(e.target.value)} placeholder="Issue detail" className="md:col-span-2" />
              <Button tone="green" disabled={busy} onClick={() => run("Create CS case", () => createCsCaseV33({ waybillNo, pickupId, issueType: "DELIVERY_EXCEPTION", issueDetail, targetRole: "supervisor" }))}>Create CS Handoff</Button>
            </div>
          </Card>
        )}

        {tab === "wayplan" && (
          <Card title="Supervisor Wayplan Generation">
            <div className="grid gap-3 md:grid-cols-5">
              <Input value={riderEmail} onChange={(e) => setRiderEmail(e.target.value)} placeholder="Rider email" />
              <Button tone="green" disabled={busy} onClick={() => run("Generate wayplan", () => generateWayplanV33({ riderEmail, branchCode: "YGN", vehicleType: "Bike" }))}>Generate Wayplan</Button>
            </div>
          </Card>
        )}

        {tab === "rider" && (
          <Card title="Rider Verification / Proof Process">
            <div className="grid gap-3 md:grid-cols-5">
              <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Waybill No." />
              <Input value={pickupId} onChange={(e) => setPickupId(e.target.value)} placeholder="Pickup ID" />
              <Select value={proofStatus} onChange={(e) => setProofStatus(e.target.value)}><option>DELIVERED</option><option>DELIVERY_FAILED</option><option>PICKUP_SUCCESS</option><option>RETURNED_TO_HUB</option></Select>
              <Input value={codCollected} onChange={(e) => setCodCollected(e.target.value)} placeholder="COD collected" />
              <Button tone="green" disabled={busy || !waybillNo} onClick={() => run("Submit proof", () => submitProofV33({ waybillNo, pickupId, status: proofStatus, codCollected: Number(codCollected || 0) }))}>Submit Proof</Button>
            </div>
          </Card>
        )}

        {tab === "warehouse" && (
          <Card title="Warehouse Scan">
            <div className="grid gap-3 md:grid-cols-4">
              <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Waybill No." />
              <Button tone="green" disabled={busy || !waybillNo} onClick={() => run("Warehouse received", () => warehouseScanV33({ waybillNo, scanType: "RECEIVED" }))}>Received</Button>
              <Button tone="gold" disabled={busy || !waybillNo} onClick={() => run("Warehouse dispatched", () => warehouseScanV33({ waybillNo, scanType: "DISPATCHED" }))}>Dispatched</Button>
            </div>
          </Card>
        )}

        {tab === "finance" && (
          <Card title="COD Settlement + Finance Posting">
            <div className="grid gap-3 md:grid-cols-5">
              <Input value={riderEmail} onChange={(e) => setRiderEmail(e.target.value)} placeholder="Rider email" />
              <Input value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} placeholder="Counted amount" />
              <Button tone="green" disabled={busy} onClick={() => run("Submit COD settlement", () => submitCodSettlementV33({ riderEmail, countedAmount: Number(countedAmount || 0) }))}>Submit COD</Button>
              <Input value={settlementId} onChange={(e) => setSettlementId(e.target.value)} placeholder="Settlement UUID" />
              <Button tone="gold" disabled={busy || !settlementId} onClick={() => run("Approve COD settlement", () => approveCodSettlementV33(settlementId, "Approved from v33"))}>Approve/Post</Button>
            </div>
            <div className="mt-4 overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950"><tr><th className="p-2">Settlement</th><th className="p-2">Rider</th><th className="p-2">Expected</th><th className="p-2">Counted</th><th className="p-2">Status</th></tr></thead>
                <tbody>{settlements.map((s) => <tr key={s.settlement_id} className="border-t border-sky-900"><td className="p-2 text-xs text-amber-300">{s.settlement_id}</td><td className="p-2">{s.rider_email}</td><td className="p-2">{money(s.expected_amount)}</td><td className="p-2">{money(s.counted_amount)}</td><td className="p-2">{s.status}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "bdm" && (
          <Card title="BDM + Marketing Sync">
            <div className="grid gap-3 md:grid-cols-5">
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company / Merchant" />
              <Button tone="green" disabled={busy || !companyName} onClick={() => run("BDM won/handoff", () => bdmActivityV33({ companyName, stage: "WON", expectedVolume: 1500 }))}>BDM Won/Handoff</Button>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign name" />
              <Button tone="gold" disabled={busy || !campaignName} onClick={() => run("Marketing lead follow-up", () => marketingActivityV33({ campaignName, leadsGenerated: 10 }))}>Marketing → BDM</Button>
            </div>
          </Card>
        )}

        {tab === "reprint" && (
          <Card title="Superadmin Reprint Approval">
            <div className="overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950"><tr><th className="p-2">Request</th><th className="p-2">Type</th><th className="p-2">Document</th><th className="p-2">Requested By</th><th className="p-2">Reason</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead>
                <tbody>{reprints.map((r) => <tr key={r.request_id} className="border-t border-sky-900"><td className="p-2 text-xs text-amber-300">{r.request_id}</td><td className="p-2">{r.document_type}</td><td className="p-2">{r.document_no}</td><td className="p-2">{r.requested_by}</td><td className="p-2">{r.reason}</td><td className="p-2">{r.status}</td><td className="p-2">{r.status === "PENDING" ? <div className="flex gap-2"><Button tone="green" onClick={() => run("Approve reprint", () => approveReprintV33(r.request_id, "APPROVED", "Approved"))}>Approve</Button><Button tone="dark" onClick={() => run("Reject reprint", () => approveReprintV33(r.request_id, "REJECTED", "Rejected"))}>Reject</Button></div> : "-"}</td></tr>)}</tbody>
              </table>
            </div>
          </Card>
        )}

        <section className="rounded-3xl border border-sky-900 bg-slate-950 p-4">
          <h2 className="mb-2 font-black text-amber-300">Last Action Result</h2>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-sky-100">{log}</pre>
        </section>
      </div>
    </main>
  );
}
