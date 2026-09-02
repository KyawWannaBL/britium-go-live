import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bike,
  Building,
  Building2,
  Calculator,
  Car,
  CheckSquare,
  ClipboardList,
  Coins,
  Command,
  Database,
  DollarSign,
  Edit3,
  FileSpreadsheet,
  FileText,
  HeadphonesIcon,
  LayoutDashboard,
  LineChart,
  LogOut,
  Map as MapIcon,
  Megaphone,
  Package,
  PackageSearch,
  PieChart,
  Printer,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  Truck,
  User,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const GLOBAL_FONT = "font-['Poppins','Noto_Sans_Myanmar',sans-serif] antialiased";

type NavLink = {
  name: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
};

type NavGroup = {
  title: string;
  links: NavLink[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    links: [
      { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { name: "Go-Live Readiness", path: "/go-live-readiness", icon: Activity },
      { name: "Analytics", path: "/analytics", icon: LineChart },
    ],
  },
  {
    title: "Customer Service",
    links: [
      { name: "CS Command", path: "/cs-command", icon: HeadphonesIcon },
      { name: "CS Portal", path: "/cs-portal", icon: HeadphonesIcon },
      { name: "Exceptions", path: "/exceptions", icon: AlertTriangle },
    ],
  },
  {
    title: "Data Entry & Forms",
    links: [
      { name: "Data Entry", path: "/data-entry", icon: FileText, badge: "V2" },
      { name: "Waybill Studio", path: "/waybill-studio", icon: QrCode },
      { name: "Pickup Form", path: "/pickup-form", icon: Edit3 },
      { name: "Doc Print Room", path: "/doc-print-room", icon: Printer },
    ],
  },
  {
    title: "Warehouse",
    links: [
      { name: "Warehouse", path: "/warehouse", icon: Package },
      { name: "Warehouse Ops", path: "/warehouse-operations", icon: PackageSearch },
    ],
  },
  {
    title: "Dispatch & Routing",
    links: [
      { name: "Ops Workflow", path: "/ops-workflow", icon: Activity },
      { name: "Dispatch Command", path: "/dispatch-command", icon: Truck },
      { name: "Wayplan Command", path: "/wayplan-command", icon: MapIcon },
    ],
  },
  {
    title: "Management",
    links: [
      { name: "Supervisor", path: "/supervisor", icon: ShieldCheck },
      { name: "Supervisor Pickup", path: "/supervisor-pickup", icon: UserCheck },
      { name: "Supervisor Wayplan", path: "/supervisor-wayplan", icon: CheckSquare },
      { name: "Exec Ops", path: "/exec-ops", icon: Command },
    ],
  },
  {
    title: "Finance & Accounts",
    links: [
      { name: "Finance Portal", path: "/finance", icon: DollarSign },
      { name: "Invoice Studio", path: "/invoice-studio", icon: Receipt },
      { name: "COD Settlement", path: "/cod-settlement", icon: Coins },
      { name: "Workforce Commission", path: "/workforce-commission", icon: Wallet },
      { name: "Rider Settlement", path: "/rider-settlement", icon: Banknote },
    ],
  },
  {
    title: "Client Portals",
    links: [
      { name: "Merchant Portal", path: "/merchant-portal", icon: Store },
      { name: "Customer Portal", path: "/customer-portal", icon: User },
      { name: "Branch Office", path: "/branch-office", icon: Building2 },
      { name: "Branch Admin", path: "/branch-admin", icon: Building },
    ],
  },
  {
    title: "Growth & Master Data",
    links: [
      { name: "Master Data", path: "/master-data", icon: Database },
      { name: "Biz Dev", path: "/biz-dev", icon: PieChart },
      { name: "Marketing", path: "/marketing", icon: Megaphone },
      { name: "Marketing Portal", path: "/marketing-portal", icon: Megaphone },
      { name: "Tariff", path: "/tariff", icon: Calculator },
    ],
  },
  {
    title: "Field Operations",
    links: [
      { name: "Rider Management", path: "/rider", icon: Bike },
      { name: "Mobile Sandbox", path: "/rider-app", icon: Smartphone },
      { name: "Driver Management", path: "/driver", icon: Car },
    ],
  },
  {
    title: "System & HR",
    links: [
      { name: "Admin / HR", path: "/admin-hr", icon: Users },
      { name: "Accounts", path: "/accounts", icon: Users },
      { name: "Profile", path: "/profile", icon: User },
      { name: "Audit Logs", path: "/audit-logs", icon: ClipboardList },
      { name: "Templates", path: "/templates", icon: FileSpreadsheet },
      { name: "Settings", path: "/settings", icon: Settings },
      { name: "Go-Live Control", path: "/go-live-control", icon: ShieldCheck },
    ],
  },
];

function isRouteActive(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  return (
    <aside
      data-be-sidebar="true"
      aria-label="Enterprise navigation"
      className={`flex h-screen w-64 shrink-0 flex-col border-r border-[#1a3a5c] bg-[#0a1628] ${GLOBAL_FONT}`}
    >
      <div className="shrink-0 border-b border-[#1a3a5c] p-6">
        <h1 className="!mb-0 !text-[20px] !font-black uppercase tracking-wider !text-[#f6b84b]">
          Britium Ventures
        </h1>
        <p className="mt-1 text-[9px] font-black uppercase tracking-[0.2em] text-[#4d7a9b]">
          Enterprise Operations
        </p>
      </div>

      <nav className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-4 pb-24">
        {NAV_GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`nav-${group.title.replaceAll(" ", "-").toLowerCase()}`}>
            <div
              id={`nav-${group.title.replaceAll(" ", "-").toLowerCase()}`}
              className="mb-2 px-3 text-[10px] font-black uppercase tracking-widest text-[#4d7a9b]"
            >
              {group.title}
            </div>
            <div className="space-y-1">
              {group.links.map((link) => {
                const active = isRouteActive(location.pathname, link.path);
                const Icon = link.icon;

                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    data-be-nav-path={link.path}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl p-3 text-[13px] font-semibold tracking-wide transition-all duration-200 ${
                      active
                        ? "bg-[#1a3a5c] text-[#f6b84b] shadow-md"
                        : "text-[#c8dff0] hover:bg-[#0f243b] hover:text-white"
                    }`}
                  >
                    <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                    <span className="min-w-0 flex-1 truncate">{link.name}</span>
                    {link.badge ? (
                      <span className="rounded-full border border-[#38bdf8]/40 bg-[#38bdf8]/10 px-1.5 py-0.5 text-[8px] font-black text-[#38bdf8]">
                        {link.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[#1a3a5c] bg-[#0a1628] p-4">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-[13px] font-bold tracking-wide text-[#ff4f86] transition-colors hover:bg-[#ff4f86]/10"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
