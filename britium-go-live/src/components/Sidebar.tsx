import { useEffect, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
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
import { useAuth } from "@/contexts/AuthContext";
import { filterAuthorizedPaths } from "@/lib/accessControl";

const GLOBAL_FONT = "font-['Poppins','Noto_Sans_Myanmar',sans-serif] antialiased";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "be_sidebar_collapsed_v1";

function initialSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

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
  const { profile } = useAuth();
  const [collapsed,setCollapsed]=useState(initialSidebarCollapsed);

  useEffect(()=>{
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY,collapsed?"1":"0");
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
  },[collapsed]);
  const role = profile?.role;
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    links: filterAuthorizedPaths(role, group.links),
  })).filter((group) => group.links.length > 0);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  return (
    <aside
      data-be-sidebar="true"
      aria-label="Enterprise navigation"
      data-be-sidebar-collapsed={collapsed?"true":"false"}
      className={`flex h-screen shrink-0 flex-col border-r border-[#1a3a5c] bg-[#0a1628] transition-[width] duration-200 ease-out ${collapsed?"w-20":"w-64"} ${GLOBAL_FONT}`}
    >
      <div className={`shrink-0 border-b border-[#1a3a5c] ${collapsed?"p-3":"p-4"}`}>
        <div className={`flex items-center gap-2 ${collapsed?"justify-center":"justify-between"}`}>
          {collapsed ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#f6b84b]/35 bg-[#f6b84b]/10 text-[12px] font-black text-[#f6b84b]" title="Britium Ventures">
              BV
            </div>
          ) : (
            <div className="min-w-0">
              <h1 className="!mb-0 truncate !text-[18px] !font-black uppercase tracking-wider !text-[#f6b84b]">
                Britium Ventures
              </h1>
              <p className="mt-1 truncate text-[8px] font-black uppercase tracking-[0.18em] text-[#4d7a9b]">
                Enterprise Operations
              </p>
            </div>
          )}
          {!collapsed ? (
            <button
              type="button"
              onClick={()=>setCollapsed(true)}
              aria-label="Minimize side menu"
              title="Minimize side menu"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#1a3a5c] bg-[#0f243b] text-[#8db4ce] transition-colors hover:border-[#f6b84b] hover:text-[#f6b84b]"
            >
              <PanelLeftClose size={17}/>
            </button>
          ) : null}
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={()=>setCollapsed(false)}
            aria-label="Expand side menu"
            title="Expand side menu"
            className="mt-2 flex h-9 w-full items-center justify-center rounded-lg border border-[#1a3a5c] bg-[#0f243b] text-[#8db4ce] transition-colors hover:border-[#f6b84b] hover:text-[#f6b84b]"
          >
            <PanelLeftOpen size={17}/>
          </button>
        ) : null}
      </div>

      <nav className={`custom-scrollbar flex-1 overflow-y-auto pb-24 ${collapsed?"space-y-3 p-2":"space-y-6 p-4"}`}>
        {visibleGroups.map((group) => (
          <section key={group.title} aria-labelledby={`nav-${group.title.replaceAll(" ", "-").toLowerCase()}`}>
            {!collapsed ? (
              <div
                id={`nav-${group.title.replaceAll(" ", "-").toLowerCase()}`}
                className="mb-2 px-3 text-[10px] font-black uppercase tracking-widest text-[#4d7a9b]"
              >
                {group.title}
              </div>
            ) : (
              <div aria-hidden="true" className="mx-2 mb-1 border-t border-[#1a3a5c]/80" />
            )}
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
                    aria-label={collapsed?link.name:undefined}
                    title={collapsed?link.name:undefined}
                    className={`flex items-center rounded-xl text-[13px] font-semibold tracking-wide transition-all duration-200 ${collapsed?"justify-center p-3":"gap-3 p-3"} ${
                      active
                        ? "bg-[#1a3a5c] text-[#f6b84b] shadow-md"
                        : "text-[#c8dff0] hover:bg-[#0f243b] hover:text-white"
                    }`}
                  >
                    <Icon size={collapsed?19:16} strokeWidth={active ? 2.5 : 2} />
                    {!collapsed ? <span className="min-w-0 flex-1 truncate">{link.name}</span> : null}
                    {!collapsed && link.badge ? (
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

      <div className={`shrink-0 border-t border-[#1a3a5c] bg-[#0a1628] ${collapsed?"p-2":"p-4"}`}>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label={collapsed?"Sign Out":undefined}
          title={collapsed?"Sign Out":undefined}
          className={`flex w-full cursor-pointer items-center rounded-xl p-3 text-[13px] font-bold tracking-wide text-[#ff4f86] transition-colors hover:bg-[#ff4f86]/10 ${collapsed?"justify-center":"gap-3"}`}
        >
          <LogOut size={18} />
          {!collapsed ? <span>Sign Out</span> : null}
        </button>
      </div>
    </aside>
  );
}
