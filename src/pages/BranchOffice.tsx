import React, { useMemo, useState } from "react";
import {
  Package,
  Truck,
  Bike,
  DollarSign,
  ArrowRightLeft,
  Lock,
  CheckCircle2,
  AlertCircle,
  FileText,
  MapPin,
  Search,
  Download,
  ShieldAlert,
} from "lucide-react";

type View = "dashboard" | "inbound_outbound" | "local_dispatch" | "financials";

type Parcel = {
  id: string;
  tracking: string;
  recipient: string;
  address: string;
  township: string;
  status: "In Transit to Branch" | "At Branch" | "Out for Delivery" | "Delivered";
  codAmount: number;
};

type FinancialRecord = {
  id: string;
  date: string;
  type: "COD Collection" | "Branch Expense" | "Walk-in Revenue";
  amount: number;
  description: string;
  status: "Submitted" | "Pending Verification";
};

const PARCEL_SEED: Parcel[] = [
  { id: "P-101", tracking: "BRT-882190", recipient: "Daw Hla", address: "123 Mahabandoola Rd", township: "Latha", status: "At Branch", codAmount: 45000 },
  { id: "P-102", tracking: "BRT-882191", recipient: "Ko Aung", address: "45 Anawrahta Rd", township: "Lanmadaw", status: "At Branch", codAmount: 0 },
  { id: "P-103", tracking: "BRT-882192", recipient: "Ma Su", address: "78 Insein Rd", township: "Hlaing", status: "At Branch", codAmount: 125000 },
  { id: "P-104", tracking: "BRT-882193", recipient: "U Kyaw", address: "12 Strand Rd", township: "Ahlone", status: "In Transit to Branch", codAmount: 15000 },
  { id: "P-105", tracking: "BRT-882194", recipient: "Ko Myo", address: "88 Baho Rd", township: "Sanchaung", status: "Out for Delivery", codAmount: 25000 },
];

const FINANCE_SEED: FinancialRecord[] = [
  { id: "FIN-001", date: "2026-04-13", type: "COD Collection", amount: 850000, description: "Daily COD Remittance", status: "Submitted" },
  { id: "FIN-002", date: "2026-04-13", type: "Branch Expense", amount: 15000, description: "Stationery & Tape", status: "Submitted" },
  { id: "FIN-003", date: "2026-04-12", type: "Walk-in Revenue", amount: 120000, description: "Counter Drop-offs", status: "Submitted" },
];

function Card({
  title,
  value,
  icon,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-3 text-slate-700">
        {icon}
        <span className="text-xs font-black uppercase tracking-[0.2em]">{title}</span>
      </div>
      <div className="mt-4 text-3xl font-black text-slate-900">{value}</div>
      {subtitle ? <div className="mt-2 text-xs font-bold text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] border border-black/10 bg-white/60 p-6 shadow-sm backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-2xl bg-[#05080F] px-4 py-3 text-xs font-black uppercase tracking-wider text-white"
          : "rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-white/90"
      }
    >
      {children}
    </button>
  );
}

export default function BranchOfficePage() {
  const [view, setView] = useState<View>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");

  const stats = useMemo(() => {
    return {
      atBranch: PARCEL_SEED.filter((p) => p.status === "At Branch").length,
      inTransit: PARCEL_SEED.filter((p) => p.status === "In Transit to Branch").length,
      outForDelivery: PARCEL_SEED.filter((p) => p.status === "Out for Delivery").length,
      totalCOD: PARCEL_SEED.reduce((acc, curr) => acc + curr.codAmount, 0),
    };
  }, []);

  const displayParcels = useMemo(() => {
    if (!searchQuery.trim()) return PARCEL_SEED;
    return PARCEL_SEED.filter((p) =>
      [p.tracking, p.recipient, p.township, p.address]
        .join(" ")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
    );
  }, [searchQuery]);

  const isDowntown = (township: string) =>
    ["Latha", "Lanmadaw", "Pabedan", "Kyauktada", "Botahtaung", "Pazundaung"].includes(township);

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="rounded-[36px] border border-black/10 bg-white/55 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-slate-500">
              <MapPin className="h-4 w-4" />
              Ahlone Branch Office
            </div>
            <h1 className="mt-2 text-4xl font-black text-slate-950">Branch Operations</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-700">
              Manage inbound hub transfers, optimize local dispatch assignments, and securely submit daily
              financial reports.
              <strong className="ml-1 text-rose-600">
                Note: All financial submissions are final and immutable.
              </strong>
            </p>
          </div>

          <button className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-800 hover:bg-white">
            <Download className="h-4 w-4" />
            End of Day Manifest
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card
            title="At Branch"
            value={String(stats.atBranch)}
            icon={<Package className="h-5 w-5 text-emerald-600" />}
            subtitle="Pending sorting or dispatch"
          />
          <Card
            title="Inbound Transfer"
            value={String(stats.inTransit)}
            icon={<ArrowRightLeft className="h-5 w-5 text-amber-600" />}
            subtitle="Arriving from Main Hub"
          />
          <Card
            title="Out for Delivery"
            value={String(stats.outForDelivery)}
            icon={<Truck className="h-5 w-5 text-blue-600" />}
            subtitle="Currently with local fleet"
          />
          <Card
            title="Pending COD"
            value={`${stats.totalCOD.toLocaleString()} Ks`}
            icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
            subtitle="Unremitted local collection"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <TabButton active={view === "dashboard"} onClick={() => setView("dashboard")}>
            Overview
          </TabButton>
          <TabButton active={view === "inbound_outbound"} onClick={() => setView("inbound_outbound")}>
            Inbound / Outbound
          </TabButton>
          <TabButton active={view === "local_dispatch"} onClick={() => setView("local_dispatch")}>
            Local Dispatch
          </TabButton>
          <TabButton active={view === "financials"} onClick={() => setView("financials")}>
            Financials (Locked)
          </TabButton>
        </div>
      </div>

      {view === "dashboard" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <Panel title="Recent Activities">
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                <div>
                  <div className="font-bold text-slate-900">Hub Transfer Received</div>
                  <div className="text-sm text-slate-600">
                    Manifest #TRX-9982 (45 parcels) verified and scanned into branch inventory.
                  </div>
                  <div className="mt-1 text-xs text-slate-500">10 mins ago by Branch Admin</div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4">
                <Truck className="mt-0.5 h-5 w-5 text-blue-600" />
                <div>
                  <div className="font-bold text-slate-900">Van Fleet Dispatched</div>
                  <div className="text-sm text-slate-600">
                    Driver Ko Min departed for Hlaing / Insein route (18 parcels).
                  </div>
                  <div className="mt-1 text-xs text-slate-500">1 hour ago</div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl bg-white/70 p-4">
                <Lock className="mt-0.5 h-5 w-5 text-slate-600" />
                <div>
                  <div className="font-bold text-slate-900">Financial Submission Locked</div>
                  <div className="text-sm text-slate-600">
                    Yesterday&apos;s walk-in revenue and COD remittance successfully submitted to HQ.
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Yesterday at 18:30</div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Branch Notices">
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
              <div className="flex items-center gap-2 font-black text-amber-900">
                <AlertCircle className="h-5 w-5" />
                Heavy Traffic Alert (Downtown)
              </div>
              <p className="mt-2 text-sm text-amber-800">
                Due to roadworks on Anawrahta Rd, strictly utilize bicycle fleet for Latha and
                Lanmadaw deliveries today. Route vans exclusively to outer townships.
              </p>
            </div>
          </Panel>
        </div>
      )}

      {view === "inbound_outbound" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_300px]">
          <Panel title="Inventory Scanner">
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Scan or type tracking number..."
                className="w-full rounded-2xl border border-black/10 bg-white/75 py-3 pl-11 pr-4 text-sm font-mono text-slate-900 outline-none focus:border-[#05080F]"
                autoFocus
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-xs font-black uppercase text-slate-500">
                    <th className="pb-3 pl-2">Tracking</th>
                    <th className="pb-3">Township</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 pr-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {displayParcels
                    .filter((p) => ["In Transit to Branch", "At Branch"].includes(p.status))
                    .map((parcel) => (
                      <tr key={parcel.id} className="hover:bg-white/40">
                        <td className="py-3 pl-2 font-mono font-bold text-slate-900">
                          {parcel.tracking}
                        </td>
                        <td className="py-3 text-slate-700">{parcel.township}</td>
                        <td className="py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                              parcel.status === "At Branch"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {parcel.status}
                          </span>
                        </td>
                        <td className="py-3 pr-2 text-right">
                          {parcel.status === "In Transit to Branch" ? (
                            <button className="rounded-lg bg-[#05080F] px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                              Receive
                            </button>
                          ) : (
                            <button className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                              Mark Outbound
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Quick Actions">
            <div className="space-y-3">
              <button className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 hover:bg-emerald-100">
                Receive Manifest
                <ArrowRightLeft className="h-4 w-4" />
              </button>

              <button className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                Return to Hub
                <Truck className="h-4 w-4" />
              </button>
            </div>
          </Panel>
        </div>
      )}

      {view === "local_dispatch" && (
        <div className="mt-6">
          <Panel title="Smart Local Dispatch (Ahlone Context)">
            <p className="mb-4 text-sm text-slate-600">
              Assign parcels to the local fleet. System logic automatically recommends bicycles
              for congested downtown routes and vans for outer townships.
            </p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PARCEL_SEED.filter((p) => p.status === "At Branch").map((parcel) => {
                const downtown = isDowntown(parcel.township);

                return (
                  <div
                    key={parcel.id}
                    className="flex flex-col justify-between rounded-2xl border border-black/10 bg-white/70 p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-sm font-black text-slate-900">
                          {parcel.tracking}
                        </span>

                        {downtown ? (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-800">
                            <Bike className="h-3 w-3" />
                            Bike
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black uppercase text-blue-800">
                            <Truck className="h-3 w-3" />
                            Van
                          </span>
                        )}
                      </div>

                      <div className="mt-2 text-sm font-bold text-slate-700">
                        {parcel.recipient}
                      </div>
                      <div className="text-xs text-slate-500">
                        {parcel.address}, {parcel.township}
                      </div>

                      {parcel.codAmount > 0 ? (
                        <div className="mt-2 text-xs font-bold text-rose-600">
                          COD: {parcel.codAmount.toLocaleString()} Ks
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 border-t border-black/5 pt-3">
                      <select className="w-full rounded-xl border border-black/10 bg-white/50 px-3 py-2 text-xs font-bold text-slate-700 outline-none">
                        <option value="">Assign Deliveryman...</option>
                        {downtown ? (
                          <>
                            <option>Zaw Min (Bike - 01)</option>
                            <option>Hlaing Bwa (Bike - 02)</option>
                          </>
                        ) : (
                          <>
                            <option>Aung Kyaw (Van - 01)</option>
                            <option>Wai Yan (Van - 02)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      )}

      {view === "financials" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_400px]">
          <Panel title="Branch Financial Ledger (Read-Only)">
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <div>
                <strong>Strict Compliance Rule:</strong> Financial records are permanently locked
                upon submission. Branch Managers cannot edit or delete historical data. Contact
                Central Operations Admin for adjustments.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-xs font-black uppercase text-slate-500">
                    <th className="pb-3 pl-2">Date</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Description</th>
                    <th className="pb-3 text-right">Amount (MMK)</th>
                    <th className="pb-3 pr-2 text-right">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {FINANCE_SEED.map((record) => (
                    <tr key={record.id} className="bg-slate-50/50">
                      <td className="py-3 pl-2 text-slate-700">{record.date}</td>
                      <td className="py-3 font-bold text-slate-900">{record.type}</td>
                      <td className="py-3 text-slate-600">{record.description}</td>
                      <td className="py-3 text-right font-mono font-bold text-slate-900">
                        {record.amount.toLocaleString()}
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-1 text-[10px] font-black uppercase text-slate-600">
                          <Lock className="h-3 w-3" />
                          Locked
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Submit Daily Report">
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Record Type
                </label>
                <select className="w-full rounded-xl border border-black/10 bg-white/75 px-4 py-3 text-sm outline-none">
                  <option>COD Collection Remittance</option>
                  <option>Walk-in Counter Revenue</option>
                  <option>Branch Petty Cash Expense</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Amount (MMK)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-full rounded-xl border border-black/10 bg-white/75 px-4 py-3 text-sm outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Description / Reference
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide details..."
                  className="w-full resize-none rounded-xl border border-black/10 bg-white/75 px-4 py-3 text-sm outline-none"
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#05080F] px-4 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-slate-800"
              >
                <FileText className="h-4 w-4" />
                Submit & Lock Record
              </button>
            </form>
          </Panel>
        </div>
      )}
    </div>
  );
}
