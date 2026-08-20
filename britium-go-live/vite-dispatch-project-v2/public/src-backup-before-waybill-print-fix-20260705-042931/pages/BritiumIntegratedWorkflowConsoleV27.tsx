import React, { useEffect, useMemo, useState } from "react";
import {
  createCrossRoleTaskV27,
  createCustomerServiceCaseV27,
  integratedSnapshotV27,
  listTableV27,
  recordBdActivityV27,
  recordMarketingActivityV27,
  submitVerificationProofV27,
  updateWorkItemStatusV27,
} from "@/lib/britiumIntegratedWorkflowApiV27";

type Tab = "snapshot" | "inbox" | "cs" | "bdm" | "marketing" | "proof";

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "gold" | "blue" | "green" | "dark" }) {
  const tone = props.tone || "gold";
  const cls =
    tone === "blue"
      ? "bg-sky-500 text-white"
      : tone === "green"
        ? "bg-emerald-400 text-slate-950"
        : tone === "dark"
          ? "bg-slate-950 text-white border border-sky-900"
          : "bg-amber-400 text-slate-950";
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
    <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5 shadow">
      <h2 className="mb-4 text-lg font-black text-amber-300">{title}</h2>
      {children}
    </section>
  );
}

function money(v: any) {
  return Number(v || 0).toLocaleString("en-US");
}

export default function BritiumIntegratedWorkflowConsoleV27() {
  const [tab, setTab] = useState<Tab>("snapshot");
  const [snapshot, setSnapshot] = useState<any>({});
  const [inbox, setInbox] = useState<any[]>([]);
  const [proofs, setProofs] = useState<any[]>([]);
  const [log, setLog] = useState("No action yet.");
  const [busy, setBusy] = useState(false);

  const [waybillNo, setWaybillNo] = useState("");
  const [issueType, setIssueType] = useState("DELIVERY_EXCEPTION");
  const [issueDetail, setIssueDetail] = useState("");
  const [targetRole, setTargetRole] = useState("operations_manager");

  const [companyName, setCompanyName] = useState("");
  const [bdStage, setBdStage] = useState("NEW");
  const [phone, setPhone] = useState("");
  const [expectedVolume, setExpectedVolume] = useState("0");

  const [campaignName, setCampaignName] = useState("");
  const [leadsGenerated, setLeadsGenerated] = useState("0");

  const [proofStatus, setProofStatus] = useState("DELIVERED");
  const [proofPhotoUrl, setProofPhotoUrl] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [codCollected, setCodCollected] = useState("0");
  const [failureReason, setFailureReason] = useState("");

  const tabs: { key: Tab; label: string }[] = [
    { key: "snapshot", label: "Integrated Snapshot" },
    { key: "inbox", label: "Role Inbox" },
    { key: "cs", label: "Customer Service" },
    { key: "bdm", label: "BD Manager" },
    { key: "marketing", label: "Marketing" },
    { key: "proof", label: "Verification / Proof" },
  ];

  async function refresh() {
    const [s, i, p] = await Promise.all([
      integratedSnapshotV27().catch((e) => ({ error: e.message })),
      listTableV27("be_v_role_inbox_v27", 200).catch(() => []),
      listTableV27("be_v_delivery_proof_integrity_v27", 200).catch(() => []),
    ]);
    setSnapshot(s);
    setInbox(i);
    setProofs(p);
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

  const statCards = useMemo(
    () => [
      ["Open Cross-Role Tasks", snapshot.open_cross_role_tasks],
      ["Operations Manager Tasks", snapshot.ops_manager_tasks],
      ["BDM Tasks", snapshot.bdm_tasks],
      ["Customer Service Tasks", snapshot.cs_tasks],
      ["Marketing Tasks", snapshot.marketing_tasks],
      ["Open CS Cases", snapshot.open_cs_cases],
      ["Active BD Leads", snapshot.active_bd_leads],
      ["Active Campaigns", snapshot.active_marketing_campaigns],
      ["Proof Exceptions", snapshot.proof_exceptions],
      ["Delivered", snapshot.delivered_count],
      ["Failed Delivery", snapshot.failed_delivery_count],
      ["Unsettled COD", money(snapshot.unsettled_cod)],
    ],
    [snapshot],
  );

  return (
    <main className="min-h-screen bg-[#061525] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-400">BRITIUM EXPRESS</p>
          <h1 className="mt-2 text-2xl font-black">Integrated Department Workflow v27</h1>
          <p className="mt-1 text-sm text-sky-200">
            Operations Manager, BDM, Customer Service, Marketing, Delivery Verification and Proof Process are wired into one workflow backbone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button key={t.key} tone={tab === t.key ? "gold" : "dark"} onClick={() => setTab(t.key)}>
                {t.label}
              </Button>
            ))}
            <Button tone="blue" disabled={busy} onClick={() => run("Refresh", refresh)}>
              Refresh
            </Button>
          </div>
        </section>

        {tab === "snapshot" && (
          <Card title="Integrated Management Snapshot">
            <div className="grid gap-3 md:grid-cols-4">
              {statCards.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-sky-900 bg-slate-950 p-4">
                  <p className="text-xs uppercase text-sky-300">{label}</p>
                  <p className="mt-2 text-xl font-black text-amber-300">{value ?? 0}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "inbox" && (
          <Card title="Cross-Role Task Inbox">
            <div className="overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950">
                  <tr>
                    <th className="p-2">Target</th>
                    <th className="p-2">Source</th>
                    <th className="p-2">Process</th>
                    <th className="p-2">Waybill</th>
                    <th className="p-2">Title</th>
                    <th className="p-2">Priority</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.map((x) => (
                    <tr key={x.id} className="border-t border-sky-900">
                      <td className="p-2">{x.target_role}</td>
                      <td className="p-2">{x.source_role}</td>
                      <td className="p-2">{x.process_area}</td>
                      <td className="p-2">{x.waybill_no}</td>
                      <td className="p-2 text-amber-300">{x.title}</td>
                      <td className="p-2">{x.priority}</td>
                      <td className="p-2">{x.status}</td>
                      <td className="p-2">
                        <Button tone="green" disabled={busy} onClick={() => run("Resolve task", () => updateWorkItemStatusV27(x.id, "RESOLVED", "Resolved from v27 console"))}>
                          Resolve
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "cs" && (
          <Card title="Customer Service Case → Operations / BDM / Finance Handoff">
            <div className="grid gap-3 md:grid-cols-3">
              <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Waybill No." />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Customer Phone" />
              <Select value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>
                <option value="operations_manager">Operations Manager</option>
                <option value="business_development_manager">Business Development Manager</option>
                <option value="finance">Finance</option>
              </Select>
              <Input value={issueType} onChange={(e) => setIssueType(e.target.value)} placeholder="Issue Type" />
              <Input value={issueDetail} onChange={(e) => setIssueDetail(e.target.value)} placeholder="Issue Detail" className="md:col-span-2" />
              <Button
                tone="green"
                disabled={busy}
                onClick={() => run("Create CS case", () => createCustomerServiceCaseV27({ waybillNo, phone, issueType, issueDetail, targetRole }))}
              >
                Create Case & Handoff
              </Button>
            </div>
          </Card>
        )}

        {tab === "bdm" && (
          <Card title="Business Development Manager Activity → CS / Operations Handoff">
            <div className="grid gap-3 md:grid-cols-4">
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company / Merchant" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
              <Select value={bdStage} onChange={(e) => setBdStage(e.target.value)}>
                <option>NEW</option>
                <option>CONTACTED</option>
                <option>QUALIFIED</option>
                <option>PROPOSAL</option>
                <option>NEGOTIATION</option>
                <option>WON</option>
                <option>HANDED_TO_CS</option>
                <option>HANDED_TO_OPS</option>
                <option>LOST</option>
              </Select>
              <Input value={expectedVolume} onChange={(e) => setExpectedVolume(e.target.value)} placeholder="Expected Monthly Ways" />
              <Button
                tone="green"
                disabled={busy}
                onClick={() =>
                  run("Record BDM activity", () =>
                    recordBdActivityV27({
                      companyName,
                      phone,
                      stage: bdStage,
                      expectedVolume: Number(expectedVolume || 0),
                      note: "BDM activity from v27 console",
                    }),
                  )
                }
              >
                Save BDM Activity
              </Button>
            </div>
          </Card>
        )}

        {tab === "marketing" && (
          <Card title="Marketing Activity → BDM Lead Follow-up">
            <div className="grid gap-3 md:grid-cols-4">
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Campaign Name" />
              <Input value={leadsGenerated} onChange={(e) => setLeadsGenerated(e.target.value)} placeholder="Leads Generated" />
              <Button
                tone="green"
                disabled={busy}
                onClick={() =>
                  run("Record marketing activity", () =>
                    recordMarketingActivityV27({
                      campaignName,
                      leadsGenerated: Number(leadsGenerated || 0),
                      note: "Marketing activity from v27 console",
                    }),
                  )
                }
              >
                Save Campaign Activity
              </Button>
            </div>
          </Card>
        )}

        {tab === "proof" && (
          <Card title="Delivery Verification and Proof Process">
            <div className="grid gap-3 md:grid-cols-4">
              <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Waybill No." />
              <Select value={proofStatus} onChange={(e) => setProofStatus(e.target.value)}>
                <option>DELIVERED</option>
                <option>DELIVERY_FAILED</option>
                <option>PICKUP_SUCCESS</option>
                <option>RETURNED_TO_HUB</option>
              </Select>
              <Input value={proofPhotoUrl} onChange={(e) => setProofPhotoUrl(e.target.value)} placeholder="Proof Photo URL" />
              <Input value={signatureData} onChange={(e) => setSignatureData(e.target.value)} placeholder="Signature Data / Ref" />
              <Input value={codCollected} onChange={(e) => setCodCollected(e.target.value)} placeholder="COD Collected" />
              <Input value={failureReason} onChange={(e) => setFailureReason(e.target.value)} placeholder="Failure Reason" />
              <Button
                tone="green"
                disabled={busy || !waybillNo}
                onClick={() =>
                  run("Submit verification/proof", () =>
                    submitVerificationProofV27({
                      waybillNo,
                      status: proofStatus,
                      photoUrl: proofPhotoUrl,
                      signatureData,
                      codCollected: Number(codCollected || 0),
                      failureReason,
                    }),
                  )
                }
              >
                Save Verification / Proof
              </Button>
            </div>

            <div className="mt-4 overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950">
                  <tr>
                    <th className="p-2">Waybill</th>
                    <th className="p-2">Delivery Status</th>
                    <th className="p-2">Proof Status</th>
                    <th className="p-2">Verification</th>
                    <th className="p-2">Integrity</th>
                    <th className="p-2">COD</th>
                  </tr>
                </thead>
                <tbody>
                  {proofs.map((p) => (
                    <tr key={p.waybill_no} className="border-t border-sky-900">
                      <td className="p-2 text-amber-300">{p.waybill_no}</td>
                      <td className="p-2">{p.delivery_status}</td>
                      <td className="p-2">{p.proof_status}</td>
                      <td className="p-2">{p.verification_status}</td>
                      <td className="p-2">{p.integrity_status}</td>
                      <td className="p-2">{p.cod_collected || 0}</td>
                    </tr>
                  ))}
                </tbody>
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
