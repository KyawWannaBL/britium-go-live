// ─────────────────────────────────────────────────────────────────────────────
// SuperAdminPortal.tsx — Britium Express Super Admin Dashboard
// Full platform overview: shipments, finance, warehouse, HR, exceptions, users
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import PortalLayout, {
  StatCard, Card, DataTable, LoadingBlock, ErrorBlock,
  StatusPill, PrimaryBtn, TextInput, NavItem,
} from "../components/PortalLayout";
import {
  usePlatformOverview,
  useAllUsers,
  usePatchUser,
  useShipments as useAllShipments,
  useExceptions as useAllExceptions,
  useSettlements as useAllSettlements,
  useEmployees as useHrEmployees,
} from "../hooks/useApi";
import { API_ROUTES } from "../lib/config";
import type {
  PlatformOverview, UserProfile, Shipment, Exception,
  Settlement, Employee,
} from "../types";

// ── Nav ───────────────────────────────────────────────────────────────────────
const NAV: NavItem[] = [
  { key: "overview",    label: "Platform Overview",  icon: "📊" },
  { key: "shipments",   label: "All Shipments",       icon: "📦" },
  { key: "exceptions",  label: "Exceptions",          icon: "⚠️" },
  { key: "finance",     label: "Finance Summary",     icon: "💰" },
  { key: "users",       label: "User Management",     icon: "👤" },
  { key: "employees",   label: "HR Overview",         icon: "👥" },
  { key: "settings",    label: "System Settings",     icon: "⚙️" },
];

// ── Sub-views ─────────────────────────────────────────────────────────────────
function OverviewView() {
  const { data, isLoading, error } = usePlatformOverview();
  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error.message} />;
  const d = data as PlatformOverview;
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📊 Platform Overview</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Shipments Today"    value={d?.total_shipments_today ?? 0}           icon="📦" color="#1a56db" />
        <StatCard label="Delivered Today"    value={d?.delivered_today ?? 0}                  icon="✅" color="#059669" />
        <StatCard label="Failed Today"       value={d?.failed_today ?? 0}                     icon="❌" color="#dc2626" />
        <StatCard label="In Transit"         value={d?.in_transit ?? 0}                       icon="🚚" color="#7c3aed" />
        <StatCard label="Revenue Today"      value={`MMK ${(d?.revenue_today ?? 0).toLocaleString()}`} icon="💰" color="#d97706" />
        <StatCard label="Active Merchants"   value={d?.active_merchants ?? 0}                 icon="🛍️" color="#0891b2" />
        <StatCard label="Active Riders"      value={d?.active_riders ?? 0}                    icon="🛵" color="#059669" />
        <StatCard label="Open Exceptions"    value={d?.open_exceptions ?? 0}                  icon="⚠️" color="#dc2626" />
      </div>
      <div style={{ background: "#fff8ed", border: "1px solid #fbbf24", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400e" }}>
        💡 <strong>Pending Settlements:</strong> MMK {(d?.pending_settlements_amount ?? 0).toLocaleString()} — review in Finance tab.
      </div>
    </>
  );
}

function ShipmentsView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const params: Record<string, string> = {};
  if (search) params.q = search;
  if (statusFilter) params.status = statusFilter;
  const { data, isLoading, error } = useAllShipments(params);
  const shipments = (data as any)?.data ?? [];

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>📦 All Shipments</h2>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <TextInput placeholder="Search AWB / name / phone…" value={search} onChange={setSearch} />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }}
        >
          <option value="">All Statuses</option>
          {["created","picked_up","at_hub","in_transit","out_for_delivery","delivered","failed_delivery","returned"].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={error.message} /> : (
        <Card>
          <DataTable
            columns={[
              { key: "awb",       label: "AWB / Tracking" },
              { key: "merchant",  label: "Merchant" },
              { key: "receiver",  label: "Receiver" },
              { key: "township",  label: "Township" },
              { key: "cod",       label: "COD (MMK)" },
              { key: "status",    label: "Status" },
              { key: "created",   label: "Created" },
            ]}
            rows={shipments.map((s: Shipment) => ({
              awb:      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{s.tracking_no}</span>,
              merchant: s.merchant_name,
              receiver: <div><div>{s.receiver_name}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{s.receiver_phone}</div></div>,
              township: s.receiver_township,
              cod:      s.cod_amount > 0 ? s.cod_amount.toLocaleString() : <span style={{ color: "#94a3b8" }}>—</span>,
              status:   <StatusPill status={s.status} />,
              created:  new Date(s.created_at).toLocaleDateString(),
            }))}
            emptyMsg="No shipments found."
          />
        </Card>
      )}
    </>
  );
}

function ExceptionsView() {
  const { data, isLoading, error } = useAllExceptions({ status: "open" });
  const exceptions = (data as any)?.data ?? [];
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>⚠️ Open Exceptions</h2>
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={error.message} /> : (
        <Card>
          <DataTable
            columns={[
              { key: "awb",     label: "AWB" },
              { key: "type",    label: "Type" },
              { key: "status",  label: "Status" },
              { key: "desc",    label: "Description" },
              { key: "created", label: "Created" },
            ]}
            rows={exceptions.map((e: Exception) => ({
              awb:     <span style={{ fontFamily: "monospace", fontSize: 12 }}>{e.tracking_no}</span>,
              type:    <StatusPill status={e.type} />,
              status:  <StatusPill status={e.status} />,
              desc:    e.description,
              created: new Date(e.created_at).toLocaleDateString(),
            }))}
            emptyMsg="No open exceptions."
          />
        </Card>
      )}
    </>
  );
}

function FinanceView() {
  const { data, isLoading, error } = useAllSettlements({ status: "pending_approval" });
  const settlements = (data as any)?.data ?? [];
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>💰 Finance — Pending Settlements</h2>
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={error.message} /> : (
        <Card>
          <DataTable
            columns={[
              { key: "batch",    label: "Batch #" },
              { key: "merchant", label: "Merchant" },
              { key: "gross",    label: "Gross COD" },
              { key: "fee",      label: "Service Fee" },
              { key: "net",      label: "Net Payable" },
              { key: "status",   label: "Status" },
            ]}
            rows={settlements.map((s: Settlement) => ({
              batch:    s.batch_no,
              merchant: s.merchant_name,
              gross:    `MMK ${s.gross_cod.toLocaleString()}`,
              fee:      `MMK ${s.service_fee.toLocaleString()}`,
              net:      <strong>MMK {s.net_payable.toLocaleString()}</strong>,
              status:   <StatusPill status={s.status} />,
            }))}
            emptyMsg="No pending settlements."
          />
        </Card>
      )}
    </>
  );
}

function UsersView() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const params: Record<string, string> = {};
  if (search) params.q = search;
  if (roleFilter) params.role = roleFilter;
  const { data, isLoading, error } = useAllUsers(params);
  const users = (data as any)?.data ?? [];
  const patchUser = usePatchUser();

  const roles = ["super_admin","admin","hr","finance","marketing","supervisor","warehouse",
                 "customer_service","data_entry","merchant","branch","rider","customer"];

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>👤 User Management</h2>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <TextInput placeholder="Search name / email…" value={search} onChange={setSearch} />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }}
        >
          <option value="">All Roles</option>
          {roles.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={error.message} /> : (
        <Card>
          <DataTable
            columns={[
              { key: "name",    label: "Name" },
              { key: "email",   label: "Email" },
              { key: "role",    label: "Role" },
              { key: "branch",  label: "Branch" },
              { key: "status",  label: "Status" },
              { key: "actions", label: "Actions" },
            ]}
            rows={users.map((u: UserProfile) => ({
              name:    u.full_name,
              email:   <span style={{ fontSize: 12, color: "#64748b" }}>{u.email}</span>,
              role:    <StatusPill status={u.role} />,
              branch:  u.branch_name ?? "—",
              status:  <StatusPill status={u.status} />,
              actions: (
                <div style={{ display: "flex", gap: 6 }}>
                  {u.status === "active" ? (
                    <button
                      onClick={() => patchUser.mutate({ id: u.id, status: "suspended" })}
                      style={{ background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      onClick={() => patchUser.mutate({ id: u.id, status: "active" })}
                      style={{ background: "#d1fae5", color: "#065f46", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    >
                      Activate
                    </button>
                  )}
                </div>
              ),
            }))}
            emptyMsg="No users found."
          />
        </Card>
      )}
    </>
  );
}

function EmployeesView() {
  const { data, isLoading, error } = useHrEmployees();
  const employees = (data as any)?.data ?? [];
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>👥 HR Overview</h2>
      {isLoading ? <LoadingBlock /> : error ? <ErrorBlock message={error.message} /> : (
        <Card>
          <DataTable
            columns={[
              { key: "name",    label: "Name" },
              { key: "dept",    label: "Department" },
              { key: "branch",  label: "Branch" },
              { key: "type",    label: "Employment" },
              { key: "status",  label: "Status" },
              { key: "joined",  label: "Joined" },
            ]}
            rows={employees.map((e: Employee) => ({
              name:   e.full_name,
              dept:   e.department,
              branch: e.branch_name ?? "—",
              type:   e.employment_type.replace(/_/g, " "),
              status: <StatusPill status={e.status} />,
              joined: new Date(e.joined_at).toLocaleDateString(),
            }))}
            emptyMsg="No employees found."
          />
        </Card>
      )}
    </>
  );
}

function SettingsView() {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>⚙️ System Settings</h2>
      <div style={{ background: "#fff8ed", border: "1px solid #fbbf24", borderRadius: 10, padding: 16, fontSize: 13, color: "#92400e" }}>
        System configuration panels are managed through the backend admin interface.
        Contact your system engineer for schema changes, feature flags, or environment updates.
      </div>
    </div>
  );
}

// ── Main Portal ───────────────────────────────────────────────────────────────
export default function SuperAdminPortal() {
  const [active, setActive] = useState("overview");
  const overviewData = usePlatformOverview();
  const openExceptions = ((overviewData.data as PlatformOverview)?.open_exceptions) ?? 0;

  const navWithBadges: NavItem[] = NAV.map((n) => {
    if (n.key === "exceptions" && openExceptions > 0) return { ...n, badge: openExceptions };
    return n;
  });

  const viewMap: Record<string, React.ReactNode> = {
    overview:   <OverviewView />,
    shipments:  <ShipmentsView />,
    exceptions: <ExceptionsView />,
    finance:    <FinanceView />,
    users:      <UsersView />,
    employees:  <EmployeesView />,
    settings:   <SettingsView />,
  };

  return (
    <PortalLayout
      title="Super Admin Portal"
      subtitle="Full platform access"
      accentColor="#0f172a"
      navItems={navWithBadges}
      activeKey={active}
      onNav={setActive}
    >
      {viewMap[active] ?? <OverviewView />}
    </PortalLayout>
  );
}
