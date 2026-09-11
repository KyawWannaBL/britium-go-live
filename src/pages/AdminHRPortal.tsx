// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// AdminHRPortal.tsx — Production Admin & HR Portal
// API: /api/v1/admin-hr/*   Role: admin / super_admin / hr
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  useEmployees, useCreateEmployee, useAttendance,
  useLeaveRequests, useLeaveAction, useApprovals,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";

type Tab = "employees" | "attendance" | "leave" | "approvals" | "new-employee";

export default function AdminHRPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("employees");
  const [search, setSearch] = useState("");

  // New employee form
  const [empForm, setEmpForm] = useState({
    full_name: "", email: "", phone: "", department: "", branch: "", role: "rider", employment_status: "active",
  });

  const employees = useEmployees(search ? { search } : undefined);
  const createEmp = useCreateEmployee();
  const attendance = useAttendance();
  const leave = useLeaveRequests({ status: "pending" });
  const leaveAction = useLeaveAction();
  const approvals = useApprovals();

  const tabs: { id: Tab; label: string }[] = [
    { id: "employees", label: "👥 Employees" },
    { id: "attendance", label: "🕐 Attendance" },
    { id: "leave", label: "📋 Leave Requests" },
    { id: "approvals", label: "✅ Approvals" },
    { id: "new-employee", label: "➕ Add Employee" },
  ];

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.headerTitle}>👥 Admin & HR Portal</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={S.userBadge}>{user?.full_name || user?.email}</span>
          <button onClick={logout} style={S.logoutBtn}>Sign Out</button>
        </div>
      </header>

      <nav style={S.tabBar}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.tabActive : S.tab}>
            {t.label}
          </button>
        ))}
      </nav>

      <main style={S.main}>
        {/* EMPLOYEES */}
        {tab === "employees" && (
          <div>
            <div style={S.searchRow}>
              <h2 style={S.h2}>Employees</h2>
              <input
                style={S.searchInput}
                placeholder="Search by name / email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <DTable
              loading={employees.isLoading}
              error={employees.error?.message}
              data={employees.data as unknown[]}
              cols={["Name", "Email", "Phone", "Department", "Branch", "Role", "Status", "Joined"]}
              rowFn={(r: Record<string, unknown>) => [
                r.full_name, r.email, r.phone, r.department, r.branch, r.role,
                statusBadge(String(r.employment_status ?? r.status ?? "")),
                fmtDate(r.joined_date as string),
              ]}
            />
          </div>
        )}

        {/* ATTENDANCE */}
        {tab === "attendance" && (
          <div>
            <h2 style={S.h2}>Today's Attendance</h2>
            <DTable
              loading={attendance.isLoading}
              error={attendance.error?.message}
              data={attendance.data as unknown[]}
              cols={["Employee", "Date", "Check In", "Check Out", "Status"]}
              rowFn={(r: Record<string, unknown>) => [
                r.employee_id, fmtDate(r.attendance_date as string),
                fmtDate(r.check_in_at as string), fmtDate(r.check_out_at as string),
                statusBadge(String(r.attendance_status ?? "")),
              ]}
            />
          </div>
        )}

        {/* LEAVE */}
        {tab === "leave" && (
          <div>
            <h2 style={S.h2}>Pending Leave Requests</h2>
            {leaveAction.isError && <ErrBanner msg={leaveAction.error?.message} />}
            {leaveAction.isSuccess && <SuccBanner msg="Action saved ✓" />}
            <DTable
              loading={leave.isLoading}
              error={leave.error?.message}
              data={leave.data as unknown[]}
              cols={["Employee", "Type", "Start", "End", "Status", "Actions"]}
              rowFn={(r: Record<string, unknown>) => [
                r.employee_id, r.leave_type,
                fmtDate(r.start_date as string), fmtDate(r.end_date as string),
                statusBadge(String(r.status ?? "")),
                r.status === "pending" ? (
                  <span key="acts" style={{ display: "flex", gap: 6 }}>
                    <button style={S.approveBtn} onClick={() => leaveAction.mutate({ id: String(r.id), action: "approve" })}>Approve</button>
                    <button style={S.rejectBtn} onClick={() => leaveAction.mutate({ id: String(r.id), action: "reject" })}>Reject</button>
                  </span>
                ) : "—",
              ]}
            />
          </div>
        )}

        {/* APPROVALS */}
        {tab === "approvals" && (
          <div>
            <h2 style={S.h2}>All Approvals</h2>
            <DTable
              loading={approvals.isLoading}
              error={approvals.error?.message}
              data={approvals.data as unknown[]}
              cols={["Type", "Reference", "Status", "Decided At"]}
              rowFn={(r: Record<string, unknown>) => [
                r.approval_type, r.reference_no,
                statusBadge(String(r.status ?? "")), fmtDate(r.decided_at as string),
              ]}
            />
          </div>
        )}

        {/* NEW EMPLOYEE */}
        {tab === "new-employee" && (
          <div style={S.formCard}>
            <h2 style={S.h2}>Add New Employee</h2>
            {createEmp.isError && <ErrBanner msg={createEmp.error?.message} />}
            {createEmp.isSuccess && <SuccBanner msg="Employee created ✓" />}
            <form
              style={S.form}
              onSubmit={async (e) => {
                e.preventDefault();
                await createEmp.mutateAsync(empForm);
                setEmpForm({ full_name: "", email: "", phone: "", department: "", branch: "", role: "rider", employment_status: "active" });
              }}
            >
              {[
                { field: "full_name", label: "Full Name *", type: "text", required: true },
                { field: "email", label: "Email *", type: "email", required: true },
                { field: "phone", label: "Phone Number", type: "tel", required: false },
                { field: "department", label: "Department", type: "text", required: false },
                { field: "branch", label: "Branch Location", type: "text", required: false },
              ].map(({ field, label, type, required }) => (
                <label key={field} style={S.formLabel}>
                  {label}
                  <input
                    type={type}
                    style={S.formInput}
                    required={required}
                    value={(empForm as Record<string, string>)[field]}
                    onChange={(e) => setEmpForm((f) => ({ ...f, [field]: e.target.value }))}
                  />
                </label>
              ))}
              <label style={S.formLabel}>
                System Role *
                <select
                  style={S.formInput}
                  value={empForm.role}
                  onChange={(e) => setEmpForm((f) => ({ ...f, role: e.target.value }))}
                >
                  {["rider", "warehouse", "branch", "data_entry", "customer_service", "supervisor", "finance", "marketing", "hr", "admin", "super_admin", "merchant"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label style={S.formLabel}>
                Employment Status
                <select
                  style={S.formInput}
                  value={empForm.employment_status}
                  onChange={(e) => setEmpForm((f) => ({ ...f, employment_status: e.target.value }))}
                >
                  {["active", "inactive", "on_leave", "terminated"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button type="submit" style={S.submitBtn} disabled={createEmp.isPending}>
                {createEmp.isPending ? "Creating…" : "Create Employee"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

function DTable({ loading, error, data, cols, rowFn }: {
  loading: boolean; error?: string; data: unknown[];
  cols: string[]; rowFn: (r: Record<string, unknown>) => (string | React.ReactNode)[];
}) {
  if (loading) return <div style={{ color: "#94a3b8", padding: 16 }}>Loading…</div>;
  if (error) return <ErrBanner msg={error} />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={S.table}>
        <thead><tr>{cols.map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
        <tbody>
          {!(data ?? []).length
            ? <tr><td colSpan={cols.length} style={S.empty}>No records.</td></tr>
            : (data as Record<string, unknown>[]).map((r, i) => (
                <tr key={String(r.id ?? i)} style={i % 2 === 0 ? {} : { background: "#f8fafc" }}>
                  {rowFn(r).map((v, j) => <td key={j} style={S.td}>{v}</td>)}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function statusBadge(s: string) {
  const map: Record<string, string> = { active: "#10b981", inactive: "#94a3b8", pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444", on_leave: "#3b82f6", terminated: "#ef4444", present: "#10b981", absent: "#ef4444", late: "#f59e0b" };
  return <span style={{ background: map[s] ?? "#94a3b8", color: "#fff", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{s}</span>;
}
function fmtDate(v?: string) { return v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"; }
function ErrBanner({ msg }: { msg?: string }) { return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 12 }}>⚠️ {msg}</div>; }
function SuccBanner({ msg }: { msg: string }) { return <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", marginBottom: 12 }}>{msg}</div>; }

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "linear-gradient(90deg,#065f46,#10b981)", color: "#fff", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontWeight: 800, fontSize: 17 },
  userBadge: { fontSize: 13, opacity: 0.85 },
  logoutBtn: { background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 },
  tabBar: { background: "#fff", borderBottom: "2px solid #e2e8f0", display: "flex", gap: 2, padding: "0 24px", overflowX: "auto" },
  tab: { background: "transparent", border: "none", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" },
  tabActive: { background: "transparent", border: "none", borderBottom: "3px solid #10b981", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#065f46", fontWeight: 700, whiteSpace: "nowrap" },
  main: { padding: "24px", maxWidth: 1200, margin: "0 auto" },
  h2: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  searchRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" },
  searchInput: { border: "1.5px solid #d1d5db", borderRadius: 8, padding: "8px 14px", fontSize: 13, outline: "none", minWidth: 240 },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", fontSize: 13 },
  th: { background: "#065f46", color: "#fff", padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12 },
  td: { padding: "9px 14px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  empty: { padding: 20, textAlign: "center", color: "#94a3b8" },
  formCard: { background: "#fff", borderRadius: 12, padding: 28, maxWidth: 640, boxShadow: "0 1px 4px rgba(0,0,0,.08)" },
  form: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  formLabel: { fontSize: 13, fontWeight: 600, color: "#374151", display: "flex", flexDirection: "column", gap: 5 },
  formInput: { border: "1.5px solid #d1d5db", borderRadius: 7, padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: "inherit" },
  submitBtn: { gridColumn: "1 / -1", marginTop: 8, background: "linear-gradient(90deg,#065f46,#10b981)", color: "#fff", border: "none", borderRadius: 9, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  approveBtn: { background: "#10b981", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 },
  rejectBtn: { background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 },
};
