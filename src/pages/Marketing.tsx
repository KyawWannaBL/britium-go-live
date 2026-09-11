import React, { useMemo, useState } from "react";
import {
  Megaphone,
  Users,
  Store,
  Target,
  TrendingUp,
  ClipboardList,
  Search,
  Download,
  CalendarDays,
  Phone,
  MapPin,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type View = "overview" | "registry" | "kpi" | "plans" | "reports" | "progress";

type Lead = {
  id: string;
  type: "Customer" | "Merchant";
  name: string;
  phone: string;
  township: string;
  source: string;
  status: string;
};

type Plan = {
  id: string;
  title: string;
  destination: string;
  method: string;
  expectedLeads: number;
  date: string;
};

type Report = {
  id: string;
  staff: string;
  date: string;
  visits: number;
  leads: number;
  conversions: number;
};

const leadsSeed: Lead[] = [
  { id: "L-001", type: "Merchant", name: "Shwe Mart", phone: "09 77111222", township: "Kamayut", source: "FIELD_VISIT", status: "Qualified" },
  { id: "L-002", type: "Customer", name: "Daw Mya", phone: "09 88222333", township: "Hlaing", source: "FACEBOOK", status: "New" },
  { id: "L-003", type: "Merchant", name: "Royal Fashion", phone: "09 66333444", township: "Bahan", source: "REFERRAL", status: "Converted" },
  { id: "L-004", type: "Customer", name: "Ko Lin", phone: "09 55444555", township: "Sanchaung", source: "WALK_IN", status: "Follow Up" },
];

const planSeed: Plan[] = [
  { id: "P-001", title: "North Yangon Merchant Push", destination: "North Okkalapa", method: "Field Visit", expectedLeads: 18, date: "2026-04-15" },
  { id: "P-002", title: "SME Referral Drive", destination: "Downtown Yangon", method: "Referral", expectedLeads: 12, date: "2026-04-16" },
  { id: "P-003", title: "Facebook Conversion Sprint", destination: "Online", method: "Digital", expectedLeads: 30, date: "2026-04-18" },
];

const reportSeed: Report[] = [
  { id: "R-001", staff: "Ma Su", date: "2026-04-12", visits: 12, leads: 7, conversions: 2 },
  { id: "R-002", staff: "Ko Min", date: "2026-04-12", visits: 9, leads: 5, conversions: 1 },
  { id: "R-003", staff: "Ma Ei", date: "2026-04-13", visits: 14, leads: 8, conversions: 3 },
];

function Card({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-3 text-slate-700">
        {icon}
        <span className="text-xs font-black uppercase tracking-[0.2em]">{title}</span>
      </div>
      <div className="mt-4 text-3xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] border border-black/10 bg-white/60 p-6 shadow-sm backdrop-blur-md">
      <h2 className="text-lg font-black text-slate-900">{title}</h2>
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
          ? "rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-wider text-white"
          : "rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700"
      }
    >
      {children}
    </button>
  );
}

export default function MarketingPortalPage() {
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");

  const leads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leadsSeed;
    return leadsSeed.filter((row) =>
      [row.name, row.phone, row.township, row.source, row.status, row.type]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  const stats = useMemo(() => {
    const merchantCount = leadsSeed.filter((x) => x.type === "Merchant").length;
    const customerCount = leadsSeed.filter((x) => x.type === "Customer").length;
    const converted = leadsSeed.filter((x) => x.status === "Converted").length;
    const totalLeads = leadsSeed.length;

    return { merchantCount, customerCount, converted, totalLeads };
  }, []);

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="rounded-[36px] border border-black/10 bg-white/55 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">
              Marketing & Growth
            </div>
            <h1 className="mt-2 text-4xl font-black text-slate-950">
              Britium Express Marketing Portal
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-700">
              Marketing-only workspace for lead generation, customer and merchant onboarding,
              KPI tracking, campaign planning, daily activity reporting, and conversion progress.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-800"
          >
            <Download className="h-4 w-4" />
            Export Marketing Data
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card title="Total Leads" value={String(stats.totalLeads)} icon={<Users className="h-5 w-5" />} />
          <Card title="Merchant Leads" value={String(stats.merchantCount)} icon={<Store className="h-5 w-5" />} />
          <Card title="Customer Leads" value={String(stats.customerCount)} icon={<Megaphone className="h-5 w-5" />} />
          <Card title="Conversions" value={String(stats.converted)} icon={<TrendingUp className="h-5 w-5" />} />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <TabButton active={view === "overview"} onClick={() => setView("overview")}>Overview</TabButton>
          <TabButton active={view === "registry"} onClick={() => setView("registry")}>Registry</TabButton>
          <TabButton active={view === "kpi"} onClick={() => setView("kpi")}>KPI</TabButton>
          <TabButton active={view === "plans"} onClick={() => setView("plans")}>Plans</TabButton>
          <TabButton active={view === "reports"} onClick={() => setView("reports")}>Reports</TabButton>
          <TabButton active={view === "progress"} onClick={() => setView("progress")}>Progress</TabButton>
        </div>

        <div className="mt-6 relative max-w-xl">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads, merchants, township, source..."
            className="w-full rounded-2xl border border-black/10 bg-white/75 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none"
          />
        </div>
      </div>

      {view === "overview" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <Panel title="Lead Pipeline Overview">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white/70 p-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Qualified Leads</div>
                <div className="mt-2 text-3xl font-black text-slate-900">9</div>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Follow Ups</div>
                <div className="mt-2 text-3xl font-black text-slate-900">6</div>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Monthly Target Parcels</div>
                <div className="mt-2 text-3xl font-black text-slate-900">1,250</div>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Actual Parcels</div>
                <div className="mt-2 text-3xl font-black text-slate-900">894</div>
              </div>
            </div>
          </Panel>

          <Panel title="Today’s Marketing Focus">
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">
                <CalendarDays className="mb-2 h-5 w-5" />
                Visit 8 priority merchants in Kamayut and Hlaing.
              </div>
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">
                <Target className="mb-2 h-5 w-5" />
                Convert at least 2 enterprise merchant prospects.
              </div>
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">
                <ClipboardList className="mb-2 h-5 w-5" />
                Submit end-of-day report with lead sources and blockers.
              </div>
            </div>
          </Panel>
        </div>
      )}

      {view === "registry" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Lead Registry">
            <div className="grid gap-4 md:grid-cols-2">
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Lead / Merchant name" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Phone number" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Township" />
              <select className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm">
                <option>FIELD_VISIT</option>
                <option>FACEBOOK</option>
                <option>REFERRAL</option>
                <option>CALL_CENTER</option>
                <option>WALK_IN</option>
              </select>
            </div>
            <button className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
              <CheckCircle2 className="h-4 w-4" />
              Save Lead
            </button>
          </Panel>

          <Panel title="Current Leads">
            <div className="space-y-3">
              {leads.map((row) => (
                <div key={row.id} className="rounded-2xl border border-black/10 bg-white/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-slate-900">{row.name}</div>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black uppercase text-white">
                      {row.status}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    <Phone className="mr-1 inline h-4 w-4" /> {row.phone}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    <MapPin className="mr-1 inline h-4 w-4" /> {row.township} • {row.source} • {row.type}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {view === "kpi" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <Panel title="Merchant KPI Target Setting">
            <div className="grid gap-4">
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Merchant name" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Monthly target parcels" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Monthly target revenue (MMK)" />
              <input type="month" className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" />
            </div>
            <button className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
              <Target className="h-4 w-4" />
              Save KPI
            </button>
          </Panel>

          <Panel title="KPI Summary">
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">Target Parcels: 1,250</div>
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">Actual Parcels: 894</div>
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">Target Revenue: 28,000,000 MMK</div>
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">Actual Revenue: 21,450,000 MMK</div>
            </div>
          </Panel>
        </div>
      )}

      {view === "plans" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Campaign / Field Plan">
            <div className="grid gap-4 md:grid-cols-2">
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Plan title" />
              <input type="date" className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Destination area" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Marketing method" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Expected leads" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Objective" />
            </div>
            <button className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
              <Megaphone className="h-4 w-4" />
              Save Plan
            </button>
          </Panel>

          <Panel title="Planned Activities">
            <div className="space-y-3">
              {planSeed.map((row) => (
                <div key={row.id} className="rounded-2xl border border-black/10 bg-white/70 p-4">
                  <div className="font-black text-slate-900">{row.title}</div>
                  <div className="mt-1 text-sm text-slate-700">
                    {row.destination} • {row.method} • {row.date}
                  </div>
                  <div className="mt-2 text-sm text-slate-800">
                    Expected leads: <span className="font-black">{row.expectedLeads}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {view === "reports" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Daily Marketing Report">
            <div className="grid gap-4 md:grid-cols-2">
              <input type="date" className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Visited merchants" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="New leads" />
              <input className="rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Conversions" />
            </div>
            <textarea className="mt-4 min-h-[120px] w-full rounded-2xl border border-black/10 bg-white/75 px-4 py-3 text-sm" placeholder="Issues, blockers, action taken, next step..." />
            <button className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white">
              <ClipboardList className="h-4 w-4" />
              Submit Report
            </button>
          </Panel>

          <Panel title="Submitted Reports">
            <div className="space-y-3">
              {reportSeed.map((row) => (
                <div key={row.id} className="rounded-2xl border border-black/10 bg-white/70 p-4">
                  <div className="font-black text-slate-900">{row.staff}</div>
                  <div className="mt-1 text-sm text-slate-700">{row.date}</div>
                  <div className="mt-2 text-sm text-slate-800">
                    Visits: {row.visits} • Leads: {row.leads} • Conversions: {row.conversions}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {view === "progress" && (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <Panel title="Conversion Progress">
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">
                Merchant conversion rate: <span className="font-black">32%</span>
              </div>
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">
                Customer lead response rate: <span className="font-black">67%</span>
              </div>
              <div className="rounded-2xl bg-white/70 p-4 text-slate-800">
                Campaign completion score: <span className="font-black">74%</span>
              </div>
            </div>
          </Panel>

          <Panel title="Priority Attention List">
            <div className="space-y-3">
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                <AlertTriangle className="mb-2 h-5 w-5" />
                4 qualified merchants have not been revisited in 5 days.
              </div>
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
                <CheckCircle2 className="mb-2 h-5 w-5" />
                Royal Fashion converted successfully this week.
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
