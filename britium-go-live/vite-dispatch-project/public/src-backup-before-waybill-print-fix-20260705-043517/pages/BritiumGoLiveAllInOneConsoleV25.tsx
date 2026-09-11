import React, { useEffect, useMemo, useState } from "react";
import {
  beApproveCodSettlementV25,
  beApproveReprintV25,
  beGenerateWayplanV25,
  beListTableV25,
  bePostFinanceEntryV25,
  beRegisterDeliveryItemsV25,
  beSubmitCodSettlementV25,
  beUpdateDeliveryStatusV25,
  beWorkflowSnapshotV25,
} from "@/lib/britiumGoLiveAllInOneApiV25";

type TabKey = "snapshot" | "items" | "wayplan" | "delivery" | "cod" | "finance" | "reprint";

const sampleRows = [
  {
    waybill_no: "WB-UAT-001",
    pickup_id: "P-UAT-001",
    merchant_name: "UAT Merchant",
    recipient_name: "UAT Recipient",
    contact_no_1: "09999999999",
    township: "Kamayut",
    recipient_address: "UAT address",
    customer_tier: "STANDARD",
    payment_type: "COD",
    item_price: 42000,
    weight_kg: 1,
    total_delivery_fee: 4000,
    cod: 42000,
    actual_collect: 46000,
    branch_code: "YGN",
  },
];

function money(value: any) {
  return Number(value || 0).toLocaleString("en-US");
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5 shadow">
      <h2 className="mb-4 text-lg font-black text-amber-300">{title}</h2>
      {children}
    </section>
  );
}

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "gold" | "green" | "blue" | "dark" }) {
  const tone = props.tone || "gold";
  const cls =
    tone === "green"
      ? "bg-emerald-400 text-slate-950"
      : tone === "blue"
        ? "bg-sky-500 text-white"
        : tone === "dark"
          ? "bg-slate-950 text-white border border-sky-900"
          : "bg-amber-400 text-slate-950";
  return (
    <button
      {...props}
      className={`rounded-xl px-4 py-2 text-sm font-black disabled:opacity-50 ${cls} ${props.className || ""}`}
    />
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 rounded-xl border border-sky-800 bg-slate-950 px-3 text-sm text-white outline-none ${props.className || ""}`}
    />
  );
}

export default function BritiumGoLiveAllInOneConsoleV25() {
  const [tab, setTab] = useState<TabKey>("snapshot");
  const [snapshot, setSnapshot] = useState<any>({});
  const [items, setItems] = useState<any[]>([]);
  const [wayplans, setWayplans] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [reprints, setReprints] = useState<any[]>([]);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const [jsonRows, setJsonRows] = useState(JSON.stringify(sampleRows, null, 2));
  const [branchCode, setBranchCode] = useState("YGN");
  const [vehicleType, setVehicleType] = useState("Bike");
  const [riderEmail, setRiderEmail] = useState("");
  const [waybillNo, setWaybillNo] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("DELIVERED");
  const [failureReason, setFailureReason] = useState("");
  const [codAmount, setCodAmount] = useState("0");
  const [settlementId, setSettlementId] = useState("");
  const [financeAmount, setFinanceAmount] = useState("0");

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(false);
    try {
      const result = await fn();
      setLog(`${label}\n${JSON.stringify(result, null, 2)}`);
      await refreshAll();
    } catch (error: any) {
      setLog(`${label} FAILED\n${error?.message || String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAll() {
    const [s, i, w, c, l, r] = await Promise.all([
      beWorkflowSnapshotV25().catch((e) => ({ error: e.message })),
      beListTableV25("be_delivery_items_v25", 200).catch(() => []),
      beListTableV25("be_wayplans_v25", 100).catch(() => []),
      beListTableV25("be_cod_settlements_v25", 100).catch(() => []),
      beListTableV25("be_finance_ledger_v25", 100).catch(() => []),
      beListTableV25("be_v_waybill_reprint_requests_v25", 100).catch(() => []),
    ]);
    setSnapshot(s);
    setItems(i);
    setWayplans(w);
    setSettlements(c);
    setLedger(l);
    setReprints(r);
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "snapshot", label: "Snapshot" },
    { key: "items", label: "Data / Items" },
    { key: "wayplan", label: "Wayplan" },
    { key: "delivery", label: "Delivery" },
    { key: "cod", label: "COD Settlement" },
    { key: "finance", label: "Finance" },
    { key: "reprint", label: "Reprint Approval" },
  ];

  const statCards = useMemo(
    () => [
      ["Delivery Items", snapshot.total_delivery_items],
      ["Ready for Wayplan", snapshot.ready_for_wayplan],
      ["Active Wayplans", snapshot.active_wayplans],
      ["Delivered", snapshot.delivered_count],
      ["Failed", snapshot.failed_count],
      ["Unsettled COD", money(snapshot.unsettled_cod)],
      ["Pending Reprints", snapshot.pending_reprint_approvals],
    ],
    [snapshot],
  );

  return (
    <main className="min-h-screen bg-[#061525] p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl border border-sky-900 bg-[#0b2940] p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-400">BRITIUM GO-LIVE UAT</p>
          <h1 className="mt-2 text-2xl font-black">All-in-One Workflow Console v25</h1>
          <p className="mt-1 text-sm text-sky-200">
            Wayplan generation, delivery status, COD settlement, finance ledger, and superadmin reprint approval.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button key={t.key} tone={tab === t.key ? "gold" : "dark"} onClick={() => setTab(t.key)}>
                {t.label}
              </Button>
            ))}
            <Button tone="blue" onClick={() => run("Refresh", refreshAll)} disabled={busy}>
              Refresh
            </Button>
          </div>
        </section>

        {tab === "snapshot" && (
          <Card title="Go-Live Snapshot">
            <div className="grid gap-3 md:grid-cols-4">
              {statCards.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-sky-900 bg-slate-950 p-4">
                  <p className="text-xs uppercase text-sky-300">{label}</p>
                  <p className="mt-2 text-2xl font-black text-amber-300">{value ?? 0}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "items" && (
          <Card title="Data Entry / Excel Delivery Item Registration">
            <p className="mb-3 text-sm text-sky-200">
              Paste JSON rows from Data Entry / Excel to register canonical delivery items.
            </p>
            <textarea
              value={jsonRows}
              onChange={(e) => setJsonRows(e.target.value)}
              className="h-72 w-full rounded-2xl border border-sky-800 bg-slate-950 p-3 font-mono text-xs text-white outline-none"
            />
            <div className="mt-3 flex gap-2">
              <Button
                tone="green"
                disabled={busy}
                onClick={() =>
                  run("Register delivery items", async () => {
                    const rows = JSON.parse(jsonRows);
                    return beRegisterDeliveryItemsV25(rows);
                  })
                }
              >
                Register / Update Items
              </Button>
              <Button tone="dark" onClick={() => setJsonRows(JSON.stringify(sampleRows, null, 2))}>
                Load Sample
              </Button>
            </div>
          </Card>
        )}

        {tab === "wayplan" && (
          <Card title="Wayplan Generation">
            <div className="grid gap-3 md:grid-cols-4">
              <TextInput value={branchCode} onChange={(e) => setBranchCode(e.target.value)} placeholder="Branch Code" />
              <TextInput value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="Vehicle Type" />
              <TextInput value={riderEmail} onChange={(e) => setRiderEmail(e.target.value)} placeholder="Rider Email" />
              <Button
                tone="green"
                disabled={busy}
                onClick={() =>
                  run("Generate wayplan", () =>
                    beGenerateWayplanV25({
                      branchCode,
                      vehicleType,
                      riderEmail,
                    }),
                  )
                }
              >
                Generate Wayplan
              </Button>
            </div>
            <div className="mt-4 overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950">
                  <tr>
                    <th className="p-2">Wayplan</th>
                    <th className="p-2">Vehicle</th>
                    <th className="p-2">Rider</th>
                    <th className="p-2">Stops</th>
                    <th className="p-2">COD</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {wayplans.map((w) => (
                    <tr key={w.wayplan_id} className="border-t border-sky-900">
                      <td className="p-2 font-bold text-amber-300">{w.wayplan_id}</td>
                      <td className="p-2">{w.vehicle_type}</td>
                      <td className="p-2">{w.rider_email}</td>
                      <td className="p-2">{w.total_stops}</td>
                      <td className="p-2">{money(w.total_cod)}</td>
                      <td className="p-2">{w.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "delivery" && (
          <Card title="Delivery Process">
            <div className="grid gap-3 md:grid-cols-5">
              <TextInput value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Waybill No." />
              <select
                value={deliveryStatus}
                onChange={(e) => setDeliveryStatus(e.target.value)}
                className="h-11 rounded-xl border border-sky-800 bg-slate-950 px-3 text-sm text-white outline-none"
              >
                <option>OUT_FOR_DELIVERY</option>
                <option>ARRIVED_AT_STOP</option>
                <option>DELIVERED</option>
                <option>DELIVERY_FAILED</option>
                <option>RETURNED_TO_HUB</option>
              </select>
              <TextInput value={failureReason} onChange={(e) => setFailureReason(e.target.value)} placeholder="Failure Reason" />
              <TextInput value={codAmount} onChange={(e) => setCodAmount(e.target.value)} placeholder="COD Collected" />
              <Button
                tone="green"
                disabled={busy || !waybillNo}
                onClick={() =>
                  run("Update delivery status", () =>
                    beUpdateDeliveryStatusV25({
                      waybillNo,
                      status: deliveryStatus,
                      failureReason,
                      codCollected: Number(codAmount || 0),
                    }),
                  )
                }
              >
                Save Delivery Status
              </Button>
            </div>
          </Card>
        )}

        {tab === "cod" && (
          <Card title="COD Settlement">
            <div className="grid gap-3 md:grid-cols-5">
              <TextInput value={riderEmail} onChange={(e) => setRiderEmail(e.target.value)} placeholder="Rider Email" />
              <TextInput value={settlementId} onChange={(e) => setSettlementId(e.target.value)} placeholder="Settlement ID for approval" />
              <TextInput value={codAmount} onChange={(e) => setCodAmount(e.target.value)} placeholder="Counted Amount" />
              <Button
                tone="green"
                disabled={busy}
                onClick={() =>
                  run("Submit COD settlement", () =>
                    beSubmitCodSettlementV25({
                      riderEmail,
                      countedAmount: Number(codAmount || 0),
                    }),
                  )
                }
              >
                Submit Settlement
              </Button>
              <Button
                tone="gold"
                disabled={busy || !settlementId}
                onClick={() => run("Approve COD settlement", () => beApproveCodSettlementV25(settlementId, "Approved from v25 console"))}
              >
                Approve & Post
              </Button>
            </div>
            <div className="mt-4 overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950">
                  <tr>
                    <th className="p-2">Settlement</th>
                    <th className="p-2">Rider</th>
                    <th className="p-2">Expected</th>
                    <th className="p-2">Counted</th>
                    <th className="p-2">Variance</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.settlement_id} className="border-t border-sky-900">
                      <td className="p-2 text-xs text-amber-300">{s.settlement_id}</td>
                      <td className="p-2">{s.rider_email}</td>
                      <td className="p-2">{money(s.expected_amount)}</td>
                      <td className="p-2">{money(s.counted_amount)}</td>
                      <td className="p-2">{money(s.variance_amount)}</td>
                      <td className="p-2">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "finance" && (
          <Card title="Finance Process">
            <div className="grid gap-3 md:grid-cols-5">
              <TextInput value={financeAmount} onChange={(e) => setFinanceAmount(e.target.value)} placeholder="Amount" />
              <Button
                tone="green"
                disabled={busy}
                onClick={() =>
                  run("Post finance entry", () =>
                    bePostFinanceEntryV25({
                      entryType: "MANUAL_UAT",
                      debitAccount: "Operations Expense",
                      creditAccount: "Cash",
                      amount: Number(financeAmount || 0),
                      note: "Manual UAT finance entry",
                    }),
                  )
                }
              >
                Post Finance Entry
              </Button>
            </div>
            <div className="mt-4 overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950">
                  <tr>
                    <th className="p-2">Entry</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Debit</th>
                    <th className="p-2">Credit</th>
                    <th className="p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id} className="border-t border-sky-900">
                      <td className="p-2 text-amber-300">{l.entry_no}</td>
                      <td className="p-2">{l.entry_type}</td>
                      <td className="p-2">{l.debit_account}</td>
                      <td className="p-2">{l.credit_account}</td>
                      <td className="p-2">{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === "reprint" && (
          <Card title="Superadmin Waybill Reprint Approval">
            <div className="overflow-auto rounded-2xl border border-sky-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-amber-400 text-slate-950">
                  <tr>
                    <th className="p-2">Request</th>
                    <th className="p-2">Waybill</th>
                    <th className="p-2">Requested By</th>
                    <th className="p-2">Reason</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {reprints.map((r) => (
                    <tr key={r.id} className="border-t border-sky-900">
                      <td className="p-2 text-xs text-amber-300">{r.id}</td>
                      <td className="p-2">{r.waybill_no}</td>
                      <td className="p-2">{r.requested_by}</td>
                      <td className="p-2">{r.reason}</td>
                      <td className="p-2">{r.status}</td>
                      <td className="p-2">
                        {r.status === "PENDING" ? (
                          <div className="flex gap-2">
                            <Button tone="green" onClick={() => run("Approve reprint", () => beApproveReprintV25(r.id, "APPROVED", "Approved"))}>
                              Approve
                            </Button>
                            <Button tone="dark" onClick={() => run("Reject reprint", () => beApproveReprintV25(r.id, "REJECTED", "Rejected"))}>
                              Reject
                            </Button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <section className="rounded-3xl border border-sky-900 bg-slate-950 p-4">
          <h2 className="mb-2 font-black text-amber-300">Last Action Result</h2>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-sky-100">{log || "No action yet."}</pre>
        </section>
      </div>
    </main>
  );
}
