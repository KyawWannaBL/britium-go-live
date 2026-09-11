import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Users,
  Store,
  Settings as SettingsIcon,
  FileText,
  BarChart3,
  Map,
  Headset,
  UserSquare2,
  ShieldCheck,
  Database,
  Building,
  Warehouse,
  Archive,
  Layers3,
  QrCode,
  Truck,
  Wallet,
  UserCircle2,
  LogOut,
  Briefcase,
  ClipboardCheck,
  BadgeCheck,
  DollarSign,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar as UISidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarRail,
} from "@/components/ui/sidebar";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { normalizeRole } from "@/lib/portalRegistry";

type NavItem = {
  title: string;
  path: string;
  icon: LucideIcon;
};

type SidebarProps = {
  className?: string;
  isExpanded: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocusCapture?: () => void;
};

const coreNav: NavItem[] = [
  { title: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { title: "Profile", path: "/profile", icon: UserCircle2 },
  { title: "Wallet Hub", path: "/wallet", icon: Wallet },
  { title: "Create Delivery", path: "/create-delivery", icon: Package },
  { title: "Way Management", path: "/way-management", icon: Map },
];

const portalNav: NavItem[] = [
  { title: "Supervisor Control", path: "/supervisor", icon: ShieldCheck },
  { title: "Data Entry Portal", path: "/data-entry", icon: Database },
  { title: "Customer Service", path: "/customer-service", icon: Headset },
  { title: "Customer Portal", path: "/customer", icon: UserSquare2 },
  { title: "Merchant Portal", path: "/merchant", icon: Store },
  { title: "Branch Office", path: "/branch-office", icon: Building },
  { title: "Warehouse Portal", path: "/warehouse", icon: Warehouse },
  { title: "WH Inbound", path: "/warehouse/inbound", icon: Package },
  { title: "WH Staging", path: "/warehouse/staging", icon: Layers3 },
  { title: "WH Storage", path: "/warehouse/storage", icon: Archive },
  { title: "WH Outbound", path: "/warehouse/outbound", icon: Truck },
  { title: "WH QR Scanner", path: "/warehouse/qr", icon: QrCode },
  { title: "Admin & HR Portal", path: "/admin-hr", icon: Users },
  { title: "HR Employees", path: "/admin-hr/employees", icon: Briefcase },
  { title: "HR Approvals", path: "/admin-hr/approvals", icon: ClipboardCheck },
  { title: "Admin Controls", path: "/admin-hr/admin", icon: BadgeCheck },
  { title: "HR Reports", path: "/admin-hr/reports", icon: BarChart3 },
  { title: "Deliverymen", path: "/deliverymen", icon: Truck },
  { title: "Financial Center", path: "/finance", icon: DollarSign },
  { title: "Marketing Portal", path: "/marketing", icon: Megaphone },
];

const systemNav: NavItem[] = [
  { title: "Waybill", path: "/waybill", icon: FileText },
  { title: "Reporting", path: "/reporting", icon: BarChart3 },
  { title: "Settings", path: "/settings", icon: SettingsIcon },
];

function mapDisplayRole(value?: string | null) {
  const normalized = normalizeRole(value);
  if (!normalized) return "USER";
  if (normalized === "SYS") return "SUPER_ADMIN";
  return normalized;
}

function pickRoleFromMetadata(user: any) {
  return (
    (user as any)?.user_metadata?.roleCode ||
    (user as any)?.user_metadata?.role_code ||
    (user as any)?.user_metadata?.app_role ||
    (user as any)?.user_metadata?.user_role ||
    (user as any)?.user_metadata?.role ||
    ""
  );
}

function displayName(user: any, profileName?: string | null) {
  return (
    profileName ||
    (user as any)?.user_metadata?.full_name ||
    (user as any)?.user_metadata?.name ||
    user?.email ||
    "Unknown User"
  );
}

function initialsFromName(name: string) {
  const words = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!words.length) return "BU";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

function NavSection({
  title,
  items,
  pathname,
  isExpanded,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  isExpanded: boolean;
}) {
  return (
    <div className="mt-5">
      {isExpanded ? (
        <div className="px-3 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
          {title}
        </div>
      ) : null}

      <SidebarMenu className={cn(isExpanded ? "mt-2" : "mt-1")}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);

          return (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton
                asChild
                isActive={isActive}
                tooltip={item.title}
                className={cn(
                  "h-11 rounded-xl font-semibold text-slate-800 transition-all",
                  "hover:bg-sky-50 hover:text-sky-900",
                  "data-[active=true]:bg-sky-600 data-[active=true]:text-white",
                  isExpanded ? "px-3" : "justify-center px-2"
                )}
              >
                <Link
                  to={item.path}
                  title={item.title}
                  className={cn(
                    "flex w-full items-center",
                    isExpanded ? "gap-3" : "justify-center"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {isExpanded ? <span className="truncate">{item.title}</span> : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </div>
  );
}

export function Sidebar({
  className,
  isExpanded,
  onMouseEnter,
  onMouseLeave,
  onFocusCapture,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [resolvedRole, setResolvedRole] = useState("USER");
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  const userId = user?.id;

  useEffect(() => {
    let active = true;

    async function resolveIdentity() {
      const metaRole = pickRoleFromMetadata(user);
      const metaName = (user as any)?.user_metadata?.full_name || (user as any)?.user_metadata?.name || null;

      if (metaRole) {
        if (!active) return;
        setResolvedRole(mapDisplayRole(metaRole));
        setResolvedName(metaName);
        return;
      }

      if (!userId) {
        if (!active) return;
        setResolvedRole("USER");
        setResolvedName(metaName);
        return;
      }

      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, role, role_code, app_role, user_role")
          .eq("id", userId)
          .maybeSingle();

        if (!active) return;

        const profileRole = data?.role_code || data?.app_role || data?.user_role || data?.role;

        setResolvedRole(mapDisplayRole(profileRole));
        setResolvedName(data?.full_name || metaName);
      } catch {
        if (!active) return;
        setResolvedRole("USER");
        setResolvedName(metaName);
      }
    }

    void resolveIdentity();

    return () => {
      active = false;
    };
  }, [user, userId]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  const shownName = useMemo(() => displayName(user, resolvedName), [user, resolvedName]);
  const initials = useMemo(() => initialsFromName(shownName), [shownName]);

  return (
    <UISidebar
      className={cn("border-r border-slate-200 bg-white", className)}
      variant="inset"
      collapsible="icon"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocusCapture={onFocusCapture}
    >
      <SidebarHeader className="border-b border-slate-200 bg-white/90 p-3">
        {isExpanded ? (
          <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] px-4 py-4 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-700">
              Enterprise Suite
            </div>
            <div className="mt-1 text-2xl font-black text-slate-900">
              Britium Operations
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] py-4 shadow-sm">
            <div className="text-sm font-black tracking-[0.2em] text-cyan-700">BE</div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="overflow-y-auto bg-white px-2 py-3">
        <NavSection title="Core" items={coreNav} pathname={location.pathname} isExpanded={isExpanded} />
        <NavSection title="Portals" items={portalNav} pathname={location.pathname} isExpanded={isExpanded} />
        <NavSection title="System" items={systemNav} pathname={location.pathname} isExpanded={isExpanded} />
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="bg-white p-3">
        {isExpanded ? (
          <>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <div>Signed in as</div>
              <div className="mt-1 truncate font-bold text-slate-900">{shownName}</div>
              <div className="mt-1 truncate text-[11px] text-slate-500">{user?.email || "-"}</div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
                Role: {resolvedRole}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              title={shownName}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-black text-slate-700"
            >
              {initials}
            </div>

            <button
              type="button"
              title="Sign Out"
              onClick={() => void handleSignOut()}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarFooter>

      <SidebarRail />
    </UISidebar>
  );
}

export default Sidebar;