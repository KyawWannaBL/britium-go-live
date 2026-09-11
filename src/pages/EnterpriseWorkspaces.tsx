import React, { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  CreditCard,
  FolderKanban,
  HandCoins,
  HeartHandshake,
  IdCard,
  Package2,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Truck,
  UserCircle2,
  Users,
  Warehouse,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import {
  getMyProfileActivities,
  getMyWalletAccounts,
  listBranchSettlements,
  listCommissionRuns,
  type WalletAccountType,
} from "@/lib/wallet";

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm ${className}`}>{children}</div>;
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</div>
          <div className="mt-3 text-3xl font-black tracking-tight text-slate-900">{value}</div>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Panel>
  );
}

function Shortcut({
  to,
  title,
  description,
  icon: Icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      to={to}
      className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="inline-flex rounded-2xl bg-slate-100 p-3 text-slate-700">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-4 text-base font-black text-slate-900">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div>
    </Link>
  );
}

function WorkspacePage({
  eyebrow,
  title,
  subtitle,
  metrics,
  areas,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string; icon: React.ComponentType<{ className?: string }> }>;
  areas: Array<{ title: string; description: string; icon: React.ComponentType<{ className?: string }> }>;
}) {
  return (
    <div className="space-y-6">
      <Panel className="overflow-hidden bg-[linear-gradient(135deg,#061120_0%,#0d2340_60%,#16345d_100%)] text-white shadow-[0_24px_70px_rgba(2,6,23,0.22)]">
        <div className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-300">{eyebrow}</div>
        <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/75">{subtitle}</p>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <Metric key={item.label} label={item.label} value={item.value} icon={item.icon} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {areas.map((item) => (
          <Panel key={item.title}>
            <div className="inline-flex rounded-2xl bg-slate-100 p-3 text-slate-700">
              <item.icon className="h-4 w-4" />
            </div>
            <div className="mt-4 text-base font-black text-slate-900">{item.title}</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">{item.description}</div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function WalletPage({
  title,
  summary,
  accountType,
  extraMetricLabel,
  extraMetricValue,
}: {
  title: string;
  summary: string;
  accountType: WalletAccountType;
  extraMetricLabel: string;
  extraMetricValue: string;
}) {
  const [walletCount, setWalletCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const rows = await getMyWalletAccounts(accountType);
        if (mounted) setWalletCount(rows.length);
      } catch {
        if (mounted) setWalletCount(0);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [accountType]);

  return (
    <WorkspacePage
      eyebrow="Wallet Workspace"
      title={title}
      subtitle={summary}
      metrics={[
        { label: "Wallet Accounts", value: String(walletCount), icon: CreditCard },
        { label: "Pending Approvals", value: "0", icon: ShieldCheck },
        { label: "Transactions", value: "0", icon: HandCoins },
        { label: extraMetricLabel, value: extraMetricValue, icon: BadgeDollarSign },
      ]}
      areas={[
        { title: "Transactions", description: "Submit and review wallet transactions tied to the selected role.", icon: HandCoins },
        { title: "Approvals", description: "Track payment approvals, rejects, and finance checkpoints.", icon: ShieldCheck },
        { title: "Records", description: "View submitted records, settlement entries, and payout history.", icon: FolderKanban },
        { title: "Audit", description: "Preserve transaction traceability with operational audit visibility.", icon: Activity },
      ]}
    />
  );
}

export function ProfileDashboardPage() {
  const [email, setEmail] = useState("-");
  const [role, setRole] = useState("USER");
  const [walletCount, setWalletCount] = useState(0);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;
      setEmail(user?.email ?? "-");
      setRole(
        String(
          (user?.app_metadata as any)?.role_code ||
            (user?.app_metadata as any)?.role ||
            (user?.user_metadata as any)?.role_code ||
            (user?.user_metadata as any)?.role ||
            "USER"
        )
      );

      try {
        const [wallets, acts] = await Promise.all([getMyWalletAccounts(), getMyProfileActivities(8)]);
        if (!mounted) return;
        setWalletCount(wallets.length);
        setActivities(acts as any[]);
      } catch {
        if (!mounted) return;
        setWalletCount(0);
        setActivities([]);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <Panel className="overflow-hidden bg-[linear-gradient(135deg,#061120_0%,#0d2340_60%,#16345d_100%)] text-white shadow-[0_24px_70px_rgba(2,6,23,0.22)]">
        <div className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-300">User Profile</div>
        <h1 className="mt-3 text-4xl font-black tracking-tight">My Profile Dashboard</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/75">
          Review your identity, assigned role, wallet visibility, and recent actions from one personal workspace.
        </p>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Email" value={email} icon={UserCircle2} />
        <Metric label="Role" value={role} icon={ShieldCheck} />
        <Metric label="Wallet Accounts" value={String(walletCount)} icon={CreditCard} />
        <Metric label="Activity Count" value={String(activities.length)} icon={Activity} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Workspace Shortcuts</div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Shortcut to="/wallet" title="Wallet Hub" description="Open role-aware wallet and settlement pages." icon={HandCoins} />
            <Shortcut to="/settings" title="Settings" description="Review security controls, preferences, and access visibility." icon={Settings2} />
            <Shortcut to="/reporting" title="Reporting" description="Open the reporting portal and export center." icon={FolderKanban} />
            <Shortcut to="/dashboard" title="Dashboard" description="Return to the enterprise operations dashboard." icon={BriefcaseBusiness} />
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Recent Activities</div>
              <div className="mt-2 text-base font-black text-slate-900">Profile-linked activity feed</div>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-slate-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {activities.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No activity records found yet.</div>
            ) : (
              activities.map((row: any) => (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-slate-900">{row.action || "Action"}</div>
                    <div className="text-xs text-slate-400">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    {(row.entity_type || "entity") + " · " + (row.status || "status")}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function WalletHubPage() {
  return (
    <div className="space-y-6">
      <Panel className="overflow-hidden bg-[linear-gradient(135deg,#061120_0%,#0d2340_60%,#16345d_100%)] text-white shadow-[0_24px_70px_rgba(2,6,23,0.22)]">
        <div className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-300">Wallet & Settlement</div>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Unified Wallet Operations Hub</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-white/75">
          Manage payment transactions, payment approvals, submitted payment records, merchant promotion refunds,
          customer refunds, rider and helper commissions, and branch settlement visibility from one enterprise hub.
        </p>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Transactions Today" value="0" icon={CreditCard} />
        <Metric label="Pending Approvals" value="0" icon={ShieldCheck} />
        <Metric label="Merchant Refunds" value="0" icon={HeartHandshake} />
        <Metric label="Commission Runs" value="0" icon={BadgeDollarSign} />
        <Metric label="Branch Settlements" value="0" icon={Building2} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Shortcut to="/wallet/customer" title="Customer Wallet" description="Customer payments, refunds, and payment records." icon={UserCircle2} />
        <Shortcut to="/wallet/merchant" title="Merchant Wallet" description="Merchant settlement, refunds, credits, and payout review." icon={BriefcaseBusiness} />
        <Shortcut to="/wallet/finance" title="Finance Wallet" description="Finance approvals, ledger checks, and treasury review." icon={BadgeDollarSign} />
        <Shortcut to="/wallet/rider" title="Rider Wallet" description="Commission, trip incentives, and payout visibility." icon={Truck} />
        <Shortcut to="/wallet/branch" title="Branch Wallet" description="Branch COD, office commission, and branch settlement flow." icon={Building2} />
      </div>
    </div>
  );
}

export function CustomerWalletPage() {
  return (
    <WalletPage
      title="Customer Wallet"
      summary="Customer-facing wallet operations for payments, refunds, and stored payment records."
      accountType="CUSTOMER"
      extraMetricLabel="Refund Cases"
      extraMetricValue="0"
    />
  );
}

export function MerchantWalletPage() {
  return (
    <WalletPage
      title="Merchant Wallet"
      summary="Merchant settlement workspace for payout batches, promotion credits, refund submissions, and commission-linked financial records."
      accountType="MERCHANT"
      extraMetricLabel="Promotion Credits"
      extraMetricValue="0"
    />
  );
}

export function FinanceWalletPage() {
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const rows = await listCommissionRuns(10);
        if (mounted) setRuns(rows.length);
      } catch {
        if (mounted) setRuns(0);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <WorkspacePage
      eyebrow="Wallet Workspace"
      title="Finance Wallet Console"
      subtitle="Finance-grade approvals, reconciliation, payment validation, treasury handoff, and enterprise audit checkpoints."
      metrics={[
        { label: "Approvals Pending", value: "0", icon: ShieldCheck },
        { label: "Commission Runs", value: String(runs), icon: BadgeDollarSign },
        { label: "Ledger Exceptions", value: "0", icon: FolderKanban },
        { label: "Refund Reviews", value: "0", icon: HeartHandshake },
      ]}
      areas={[
        { title: "Approval Queue", description: "Review and approve payment and refund records before release.", icon: ShieldCheck },
        { title: "Reconciliation", description: "Compare wallet records, payout runs, and finance source totals.", icon: FolderKanban },
        { title: "Refund Approval", description: "Handle merchant and customer refunds with finance oversight.", icon: HeartHandshake },
        { title: "Treasury Control", description: "Validate payouts, branch handovers, and settlement readiness.", icon: BadgeDollarSign },
      ]}
    />
  );
}

export function RiderWalletPage() {
  return (
    <WalletPage
      title="Rider / Driver Wallet"
      summary="Rider, driver, and helper earnings view for commissions, delivery incentives, and payout history."
      accountType="RIDER"
      extraMetricLabel="Trip Earnings"
      extraMetricValue="0"
    />
  );
}

export function BranchWalletPage() {
  const [settlements, setSettlements] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const rows = await listBranchSettlements(10);
        if (mounted) setSettlements(rows.length);
      } catch {
        if (mounted) setSettlements(0);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <WorkspacePage
      eyebrow="Wallet Workspace"
      title="Branch Office Wallet"
      subtitle="Branch-level settlement and commission workspace for office COD, local cash handling, office incentives, and branch commission calculations."
      metrics={[
        { label: "Branch Accounts", value: "0", icon: Building2 },
        { label: "Settlement Rows", value: String(settlements), icon: HandCoins },
        { label: "Office Commission", value: "0", icon: BadgeDollarSign },
        { label: "Approvals", value: "0", icon: ShieldCheck },
      ]}
      areas={[
        { title: "Branch Settlement", description: "Track COD, expenses, and branch payout balances.", icon: HandCoins },
        { title: "Office Cash Handover", description: "Monitor branch handover records and finance review checkpoints.", icon: Building2 },
        { title: "Branch Commission Calculation", description: "Calculate office commission and local payout totals.", icon: BadgeDollarSign },
        { title: "Branch Approval Queue", description: "Resolve branch-level finance and office settlement approvals.", icon: ShieldCheck },
      ]}
    />
  );
}

export function AdminOperationsPortalPage() {
  return (
    <WorkspacePage
      eyebrow="Admin Workspace"
      title="Admin (Operations)"
      subtitle="Enterprise operations administration for network health, dispatch governance, routing oversight, escalation control, and productivity monitoring."
      metrics={[
        { label: "Open Exceptions", value: "0", icon: ShieldCheck },
        { label: "Dispatch Zones", value: "0", icon: Package2 },
        { label: "Active Ways", value: "0", icon: Truck },
        { label: "Ops Alerts", value: "0", icon: Activity },
      ]}
      areas={[
        { title: "Dispatch Command", description: "Oversee assignment queues, route readiness, and release discipline.", icon: Truck },
        { title: "Operations KPI Board", description: "Monitor SLA, exception aging, and branch performance visibility.", icon: FolderKanban },
        { title: "Escalation Control", description: "Handle incidents and supervisor-level operational overrides.", icon: ShieldCheck },
        { title: "Cross-Team Coordination", description: "Connect customer service, warehouse, rider, and branch operations.", icon: Users },
      ]}
    />
  );
}

export function HRAdminPortalPage() {
  return (
    <WorkspacePage
      eyebrow="Admin Workspace"
      title="Admin (HR & Admin)"
      subtitle="Enterprise HR and administration portal for staffing, access provisioning, employment records, and branch office administration."
      metrics={[
        { label: "Active Staff", value: "0", icon: Users },
        { label: "Open HR Cases", value: "0", icon: ShieldCheck },
        { label: "Pending Joiners", value: "0", icon: IdCard },
        { label: "Office Moves", value: "0", icon: Building2 },
      ]}
      areas={[
        { title: "Staff Directory", description: "Review employee records, placement, and department mapping.", icon: Users },
        { title: "Attendance & Shifts", description: "Manage shifts, attendance cases, and workforce coverage.", icon: Activity },
        { title: "Access Provisioning", description: "Assign platform access based on enterprise role and scope.", icon: ShieldCheck },
        { title: "Admin Services", description: "Handle office assets, internal approvals, and HR escalations.", icon: BriefcaseBusiness },
      ]}
    />
  );
}

export function WarehouseControllerPortalPage() {
  return (
    <WorkspacePage
      eyebrow="Warehouse Control"
      title="Warehouse Controller Console"
      subtitle="Warehouse-control workspace for intake, scan integrity, sort flow, way readiness, dispatch handoff, and dock supervision."
      metrics={[
        { label: "Inbound Queue", value: "0", icon: Warehouse },
        { label: "Pending Scans", value: "0", icon: Package2 },
        { label: "Way Holds", value: "0", icon: Truck },
        { label: "Dock Alerts", value: "0", icon: Activity },
      ]}
      areas={[
        { title: "Inbound Control", description: "Receive, verify, and record parcel intake with scan discipline.", icon: Warehouse },
        { title: "Sorting Governance", description: "Direct sort lanes, bag control, and staging readiness.", icon: FolderKanban },
        { title: "Dispatch Handoff", description: "Release ways and parcels after counts and controller approval.", icon: Truck },
        { title: "Warehouse Exceptions", description: "Investigate missing scans, damages, and warehouse delays.", icon: ShieldCheck },
      ]}
    />
  );
}

export function BranchOfficePortalPage() {
  return (
    <WorkspacePage
      eyebrow="Branch Office"
      title="Branch Office Portal"
      subtitle="Branch office enterprise workspace for local operations, settlement readiness, rider coordination, customer follow-up, and branch productivity controls."
      metrics={[
        { label: "Branch Queue", value: "0", icon: Building2 },
        { label: "Pending Handover", value: "0", icon: HandCoins },
        { label: "Active Riders", value: "0", icon: Truck },
        { label: "Branch Issues", value: "0", icon: ShieldCheck },
      ]}
      areas={[
        { title: "Branch Operations", description: "Track branch workload, customer escalations, and dispatch readiness.", icon: Building2 },
        { title: "Branch Wallet", description: "Review settlement, COD collections, office commissions, and balances.", icon: HandCoins },
        { title: "Local Team Oversight", description: "Monitor rider, helper, and local office staff performance.", icon: Users },
        { title: "Branch Service Control", description: "Review SLA, aging parcels, branch returns, and incident response.", icon: ShieldCheck },
      ]}
    />
  );
}
