import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
  UserPlus,
  FileText,
  BellRing,
  CheckCircle2,
  XCircle,
  Briefcase,
  Building2,
  Clock3,
  BookOpen,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type ViewKey = "overview" | "employees" | "approvals" | "admin" | "reports";

function currentView(pathname: string): ViewKey {
  if (pathname.includes("/employees")) return "employees";
  if (pathname.includes("/approvals")) return "approvals";
  if (pathname.includes("/admin")) return "admin";
  if (pathname.includes("/reports")) return "reports";
  return "overview";
}

function tt(en: string, mm: string) {
  return `${en} / ${mm}`;
}

function labelize(value: unknown) {
  return String(value || "unknown")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pick(source: any, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function statusClass(value: unknown) {
  const status = String(value || "").toLowerCase();
  if (
    status.includes("approve") ||
    status.includes("active") ||
    status.includes("complete") ||
    status.includes("resolved")
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (
    status.includes("reject") ||
    status.includes("fail") ||
    status.includes("inactive") ||
    status.includes("disciplinary")
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status.includes("pending") || status.includes("review") || status.includes("hold")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function isLeaveActive(row: any) {
  const status = String(row?.status || "").toLowerCase();
  if (status !== "approved") return false;

  const today = new Date();
  const start = row?.start_date ? new Date(row.start_date) : null;
  const end = row?.end_date ? new Date(row.end_date) : null;
  if (!start || !end) return false;

  return today >= start && today <= end;
}

function summarizeAttendance(rows: any[], employeeId: string) {
  return rows.filter((row) => String(row?.employee_id || "") === String(employeeId || "")).length;
}

async function fetchRows(table: string, orderColumn = "created_at", ascending = false) {
  try {
    let query = supabase.from(table).select("*");
    if (orderColumn) query = query.order(orderColumn, { ascending });
    const { data, error } = await query;
    if (error) {
      console.warn(`[AdminHrPortal] ${table}`, error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn(`[AdminHrPortal] ${table}`, err);
    return [];
  }
}

async function createAuditLog(action: string, refType?: string, refId?: string | null) {
  try {
    await supabase.from("audit_logs").insert({
      portal: "admin_hr",
      action,
      ref_type: refType || null,
      ref_id: refId || null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // ignore audit failures
  }
}

export default function AdminHrPortal() {
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setView] = useState<ViewKey>(currentView(location.pathname));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [roleBindings, setRoleBindings] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<any[]>([]);
  const [disciplinaryCases, setDisciplinaryCases] = useState<any[]>([]);
  const [assetAssignments, setAssetAssignments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [employeeForm, setEmployeeForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    employee_type: "Operations Staff",
    department: "Operations",
    title: "Executive",
    branch_id: "",
    employment_status: "active",
  });

  const [leaveForm, setLeaveForm] = useState({
    employee_id: "",
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const [notificationForm, setNotificationForm] = useState({
    title: "",
    body: "",
    route: "/admin-hr",
    priority: "normal",
  });

  useEffect(() => {
    setView(currentView(location.pathname));
  }, [location.pathname]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      const [
        branchRows,
        userRows,
        roleRows,
        roleBindingRows,
        employeeRows,
        attendanceRows,
        leaveRows,
        documentRows,
        trainingRows,
        disciplinaryRows,
        assetRows,
        notificationRows,
        auditRows,
      ] = await Promise.all([
        fetchRows("branches", "code", true),
        fetchRows("users", "created_at", false),
        fetchRows("roles", "name", true),
        fetchRows("role_bindings", "created_at", false),
        fetchRows("employees", "created_at", false),
        fetchRows("attendance", "attendance_date", false),
        fetchRows("leave_requests", "created_at", false),
        fetchRows("hr_documents", "created_at", false),
        fetchRows("training_records", "created_at", false),
        fetchRows("disciplinary_cases", "created_at", false),
        fetchRows("asset_assignments", "created_at", false),
        fetchRows("notifications", "created_at", false),
        fetchRows("audit_logs", "created_at", false),
      ]);

      const currentEmployee =
        employeeRows.find(
          (row: any) =>
            String(pick(row, ["user_id", "auth_user_id"])) === String(authUser?.id || "") ||
            String(pick(row, ["email"])) === String(authUser?.email || "")
        ) || null;

      const currentUser =
        userRows.find(
          (row: any) =>
            String(pick(row, ["id", "auth_user_id"])) === String(authUser?.id || "") ||
            String(pick(row, ["email"])) === String(authUser?.email || "")
        ) || null;

      setProfile({
        ...currentUser,
        ...currentEmployee,
        email: pick(currentUser, ["email"], pick(currentEmployee, ["email"], authUser?.email || "")),
      });

      setBranches(branchRows);
      setUsers(userRows);
      setRoles(roleRows);
      setRoleBindings(roleBindingRows);
      setEmployees(employeeRows);
      setAttendance(attendanceRows);
      setLeaveRequests(leaveRows);
      setDocuments(documentRows);
      setTrainingRecords(trainingRows);
      setDisciplinaryCases(disciplinaryRows);
      setAssetAssignments(assetRows);
      setNotifications(notificationRows);
      setAuditLogs(auditRows);

      setEmployeeForm((prev) => ({
        ...prev,
        branch_id: prev.branch_id || pick(branchRows?.[0], ["id"], ""),
      }));
      setLeaveForm((prev) => ({
        ...prev,
        employee_id: prev.employee_id || pick(currentEmployee, ["id"], pick(employeeRows?.[0], ["id"], "")),
      }));
    } catch (err: any) {
      setError(err?.message || "Unable to load Admin & HR portal data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createEmployee() {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .insert({
          ...employeeForm,
          branch_id: employeeForm.branch_id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .maybeSingle();

      if (error) throw error;

      await createAuditLog("employee_created", "employee", data?.id || null);

      setEmployeeForm({
        full_name: "",
        email: "",
        phone: "",
        employee_type: "Operations Staff",
        department: "Operations",
        title: "Executive",
        branch_id: employeeForm.branch_id,
        employment_status: "active",
      });

      await loadData();
    } catch (err) {
      console.error(err);
      setError("Unable to create employee.");
    } finally {
      setSaving(false);
    }
  }

  async function createLeaveRequest() {
    if (!leaveForm.employee_id) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("leave_requests")
        .insert({
          employee_id: leaveForm.employee_id,
          leave_type: leaveForm.leave_type,
          start_date: leaveForm.start_date,
          end_date: leaveForm.end_date,
          reason: leaveForm.reason,
          status: "pending",
          created_at: new Date().toISOString(),
        })
        .select("*")
        .maybeSingle();

      if (error) throw error;

      await createAuditLog("leave_requested", "leave_request", data?.id || null);

      setLeaveForm((prev) => ({
        ...prev,
        start_date: "",
        end_date: "",
        reason: "",
      }));

      await loadData();
    } catch (err) {
      console.error(err);
      setError("Unable to create leave request.");
    } finally {
      setSaving(false);
    }
  }

  async function updateLeaveStatus(row: any, nextStatus: string) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (error) throw error;

      await createAuditLog(`leave_${nextStatus}`, "leave_request", row.id);
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Unable to update leave request.");
    } finally {
      setSaving(false);
    }
  }

  async function createNotification() {
    if (!notificationForm.title || !notificationForm.body) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .insert({
          user_id: null,
          title: notificationForm.title,
          body: notificationForm.body,
          route: notificationForm.route,
          priority: notificationForm.priority,
          created_at: new Date().toISOString(),
        })
        .select("*")
        .maybeSingle();

      if (error) throw error;

      await createAuditLog("broadcast_notification_created", "notification", data?.id || null);

      setNotificationForm({
        title: "",
        body: "",
        route: "/admin-hr",
        priority: "normal",
      });

      await loadData();
    } catch (err) {
      console.error(err);
      setError("Unable to create notice.");
    } finally {
      setSaving(false);
    }
  }

  const roleMap = useMemo(() => {
    const map = new Map<string, any>();
    roles.forEach((row: any) => map.set(String(row.id), row));
    return map;
  }, [roles]);

  const branchMap = useMemo(() => {
    const map = new Map<string, any>();
    branches.forEach((row: any) => map.set(String(row.id), row));
    return map;
  }, [branches]);

  const employeeStats = useMemo(() => {
    const active = employees.filter(
      (row: any) => String(pick(row, ["employment_status"], "active")).toLowerCase() === "active"
    ).length;
    const onLeave = leaveRequests.filter(isLeaveActive).length;
    const pendingApprovals = leaveRequests.filter(
      (row: any) => String(row?.status || "").toLowerCase() === "pending"
    ).length;
    const assetsInUse = assetAssignments.filter(
      (row: any) => String(row?.status || "").toLowerCase() !== "returned"
    ).length;
    const openCases = disciplinaryCases.filter(
      (row: any) => !["resolved", "closed"].includes(String(row?.status || "").toLowerCase())
    ).length;
    const completedTraining = trainingRecords.filter(
      (row: any) => String(row?.status || "").toLowerCase() === "completed"
    ).length;

    return { active, onLeave, pendingApprovals, assetsInUse, openCases, completedTraining };
  }, [employees, leaveRequests, assetAssignments, disciplinaryCases, trainingRecords]);

  const branchSummary = useMemo(() => {
    return branches.map((branch: any) => {
      const team = employees.filter((row: any) => String(row?.branch_id || "") === String(branch.id || ""));
      const pending = leaveRequests.filter(
        (row: any) =>
          String(row?.branch_id || "") === String(branch.id || "") &&
          String(row?.status || "").toLowerCase() === "pending"
      );

      return {
        id: branch.id,
        code: pick(branch, ["code"], "—"),
        name: pick(branch, ["name", "city"], "Branch"),
        headcount: team.length,
        pending: pending.length,
      };
    });
  }, [branches, employees, leaveRequests]);

  const employeeCards = useMemo(() => {
    return employees.map((row: any) => {
      const employeeId = String(row?.id || "");
      const bindingRows = roleBindings.filter(
        (binding: any) =>
          String(binding?.employee_id || "") === employeeId ||
          String(binding?.user_id || "") === String(row?.user_id || "")
      );

      const roleNames = bindingRows
        .map((binding: any) => roleMap.get(String(binding.role_id)))
        .filter(Boolean)
        .map((role: any) => role.name);

      return {
        ...row,
        roleNames,
        attendanceCount: summarizeAttendance(attendance, employeeId),
        documentCount: documents.filter(
          (doc: any) => String(doc?.employee_id || "") === employeeId
        ).length,
        trainingCount: trainingRecords.filter(
          (doc: any) => String(doc?.employee_id || "") === employeeId
        ).length,
        assetCount: assetAssignments.filter(
          (doc: any) =>
            String(doc?.employee_id || "") === employeeId &&
            String(doc?.status || "").toLowerCase() !== "returned"
        ).length,
      };
    });
  }, [employees, roleBindings, roleMap, attendance, documents, trainingRecords, assetAssignments]);

  const report = useMemo(() => {
    const totalEmployees = employees.length;
    const activeEmployees = employeeStats.active;
    const pendingApprovals = employeeStats.pendingApprovals;
    const documentCoverage = totalEmployees
      ? Math.round((documents.length / totalEmployees) * 100)
      : 0;
    const trainingCoverage = totalEmployees
      ? Math.round((employeeStats.completedTraining / totalEmployees) * 100)
      : 0;
    const unreadNotifications = notifications.filter((row: any) => !row?.read_at).length;

    return {
      totalEmployees,
      activeEmployees,
      pendingApprovals,
      documentCoverage,
      trainingCoverage,
      unreadNotifications,
    };
  }, [employees, employeeStats, documents, notifications]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-[32px] border border-slate-200 bg-white p-10 shadow-sm">
        <div className="inline-flex items-center gap-3 text-sm font-semibold text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading Admin & HR portal...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HeroCard
        title={tt("Admin & HR Portal", "Admin & HR Portal")}
        subtitle={tt(
          "Workforce operations, approvals, governance, and branch support.",
          "ဝန်ထမ်းစီမံခန့်ခွဲမှု၊ approvals၊ governance နှင့် branch support"
        )}
        actions={
          <ActionButton onClick={() => void loadData()} disabled={loading || saving}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </ActionButton>
        }
      />

      <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 md:grid-cols-5">
        <TabButton active={view === "overview"} onClick={() => navigate("/admin-hr")}>
          Overview
        </TabButton>
        <TabButton active={view === "employees"} onClick={() => navigate("/admin-hr/employees")}>
          Employees
        </TabButton>
        <TabButton active={view === "approvals"} onClick={() => navigate("/admin-hr/approvals")}>
          Approvals
        </TabButton>
        <TabButton active={view === "admin"} onClick={() => navigate("/admin-hr/admin")}>
          Admin Controls
        </TabButton>
        <TabButton active={view === "reports"} onClick={() => navigate("/admin-hr/reports")}>
          Reports
        </TabButton>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {view === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard title="Active Employees" value={employeeStats.active} icon={<Users className="h-5 w-5" />} />
            <MetricCard title="On Leave" value={employeeStats.onLeave} icon={<Clock3 className="h-5 w-5" />} />
            <MetricCard title="Pending Approvals" value={employeeStats.pendingApprovals} icon={<ClipboardList className="h-5 w-5" />} />
            <MetricCard title="Assets In Use" value={employeeStats.assetsInUse} icon={<Briefcase className="h-5 w-5" />} />
            <MetricCard title="Open Cases" value={employeeStats.openCases} icon={<AlertTriangle className="h-5 w-5" />} />
            <MetricCard title="Training Complete" value={employeeStats.completedTraining} icon={<BookOpen className="h-5 w-5" />} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
            <Panel title="Workforce Snapshot" subtitle={pick(profile, ["full_name", "name", "email"], "Britium Express")}>
              <div className="space-y-3">
                {employeeCards.slice(0, 8).map((row: any) => (
                  <InfoCard
                    key={row.id}
                    title={pick(row, ["full_name", "name"], "Unnamed Employee")}
                    subtitle={`${pick(row, ["title", "employee_type", "department"], "Team Member")} · ${pick(branchMap.get(String(row?.branch_id || "")), ["name", "code"], "All Branches")}`}
                    meta={`${pick(row, ["email"], "—")} · ${pick(row, ["phone"], "—")}`}
                    status={pick(row, ["employment_status"], "active")}
                    pills={[
                      `${row.attendanceCount} attendance`,
                      `${row.documentCount} docs`,
                      `${row.trainingCount} training`,
                      `${row.assetCount} assets`,
                      ...row.roleNames.slice(0, 2),
                    ]}
                  />
                ))}
              </div>
            </Panel>

            <div className="space-y-6">
              <Panel title="Branch Coverage">
                <div className="space-y-3">
                  {branchSummary.slice(0, 6).map((row: any) => (
                    <div key={row.id} className="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        <div className="text-sm text-slate-500">{row.code}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-slate-900">{row.headcount}</div>
                        <div className="text-sm text-slate-500">{row.pending} pending</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Recent Alerts">
                <div className="space-y-3">
                  {notifications.slice(0, 5).map((row: any) => (
                    <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-slate-900">{pick(row, ["title"], "Alert")}</div>
                        <StatusBadge label={pick(row, ["priority"], "normal")} />
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{pick(row, ["body"], "")}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}

      {view === "employees" && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
            <Panel
              title="Employee Directory"
              subtitle="Create and manage branch-level workforce records."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <TextInput placeholder="Full Name" value={employeeForm.full_name} onChange={(v) => setEmployeeForm({ ...employeeForm, full_name: v })} />
                <TextInput placeholder="Email" value={employeeForm.email} onChange={(v) => setEmployeeForm({ ...employeeForm, email: v })} />
                <TextInput placeholder="Phone" value={employeeForm.phone} onChange={(v) => setEmployeeForm({ ...employeeForm, phone: v })} />
                <TextInput placeholder="Department" value={employeeForm.department} onChange={(v) => setEmployeeForm({ ...employeeForm, department: v })} />
                <TextInput placeholder="Job Title" value={employeeForm.title} onChange={(v) => setEmployeeForm({ ...employeeForm, title: v })} />
                <TextInput placeholder="Employee Type" value={employeeForm.employee_type} onChange={(v) => setEmployeeForm({ ...employeeForm, employee_type: v })} />
                <TextInput placeholder="Branch ID" value={employeeForm.branch_id} onChange={(v) => setEmployeeForm({ ...employeeForm, branch_id: v })} />
                <TextInput placeholder="Status" value={employeeForm.employment_status} onChange={(v) => setEmployeeForm({ ...employeeForm, employment_status: v })} />
              </div>
              <div className="mt-4">
                <ActionButton onClick={() => void createEmployee()} disabled={saving}>
                  <UserPlus className="h-4 w-4" />
                  Save Employee
                </ActionButton>
              </div>
            </Panel>

            <Panel title="HR Snapshot">
              <div className="space-y-3">
                {employeeCards.slice(0, 8).map((row: any) => (
                  <InfoCard
                    key={row.id}
                    title={pick(row, ["full_name", "name"], "Unnamed Employee")}
                    subtitle={`${pick(row, ["department", "employee_type"], "Operations")} · ${pick(row, ["title"], "Staff")}`}
                    meta={`${pick(row, ["email"], "—")} · ${pick(row, ["phone"], "—")}`}
                    status={pick(row, ["employment_status"], "active")}
                    pills={[
                      pick(branchMap.get(String(row?.branch_id || "")), ["code", "name"], "Branch"),
                      ...row.roleNames.length ? row.roleNames : ["No role binding"],
                      `${row.attendanceCount} attendance`,
                      `${row.documentCount} docs`,
                      `${row.trainingCount} training`,
                      `${row.assetCount} assets`,
                    ]}
                  />
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {view === "approvals" && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
            <Panel title="Leave Request Queue">
              <div className="space-y-3">
                {leaveRequests.map((row: any) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {pick(
                            employees.find((employee: any) => String(employee.id) === String(row.employee_id)),
                            ["full_name", "name"],
                            String(row.employee_id || "Employee")
                          )}
                        </div>
                        <div className="text-sm text-slate-500">
                          {labelize(row.leave_type)} · {pick(row, ["start_date"], "")} → {pick(row, ["end_date"], "")}
                        </div>
                        <div className="text-sm text-slate-500">{pick(row, ["reason"], "")}</div>
                      </div>
                      <StatusBadge label={pick(row, ["status"], "pending")} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <SecondaryButton
                        onClick={() => void updateLeaveStatus(row, "approved")}
                        disabled={saving || String(row?.status || "").toLowerCase() === "approved"}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve
                      </SecondaryButton>
                      <SecondaryButton
                        onClick={() => void updateLeaveStatus(row, "rejected")}
                        disabled={saving || String(row?.status || "").toLowerCase() === "rejected"}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </SecondaryButton>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Submit Leave Request">
              <div className="space-y-3">
                <TextInput placeholder="Employee ID" value={leaveForm.employee_id} onChange={(v) => setLeaveForm({ ...leaveForm, employee_id: v })} />
                <TextInput placeholder="Leave Type" value={leaveForm.leave_type} onChange={(v) => setLeaveForm({ ...leaveForm, leave_type: v })} />
                <TextInput type="date" value={leaveForm.start_date} onChange={(v) => setLeaveForm({ ...leaveForm, start_date: v })} />
                <TextInput type="date" value={leaveForm.end_date} onChange={(v) => setLeaveForm({ ...leaveForm, end_date: v })} />
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                  placeholder="Reason"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                />
                <ActionButton onClick={() => void createLeaveRequest()} disabled={saving}>
                  <Save className="h-4 w-4" />
                  Create Request
                </ActionButton>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {view === "admin" && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
            <Panel
              title="Access Governance"
              subtitle="Role bindings, branch scoping, and audit visibility."
            >
              <div className="space-y-3">
                {users.slice(0, 10).map((row: any) => {
                  const userBindings = roleBindings.filter(
                    (binding: any) => String(binding?.user_id || "") === String(row?.id || "")
                  );
                  const userRoleNames = userBindings
                    .map((binding: any) => roleMap.get(String(binding.role_id)))
                    .filter(Boolean)
                    .map((role: any) => role.name);

                  return (
                    <InfoCard
                      key={row.id}
                      title={pick(row, ["full_name", "name", "email"], "User")}
                      subtitle={pick(row, ["email"], "—")}
                      meta={userRoleNames.length ? userRoleNames.join(", ") : "No role binding"}
                      status={pick(row, ["status", "role"], "active")}
                    />
                  );
                })}
              </div>
            </Panel>

            <Panel title="Broadcast Notice">
              <div className="space-y-3">
                <TextInput placeholder="Title" value={notificationForm.title} onChange={(v) => setNotificationForm({ ...notificationForm, title: v })} />
                <TextInput placeholder="Route" value={notificationForm.route} onChange={(v) => setNotificationForm({ ...notificationForm, route: v })} />
                <TextInput placeholder="Priority" value={notificationForm.priority} onChange={(v) => setNotificationForm({ ...notificationForm, priority: v })} />
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                  placeholder="Message"
                  value={notificationForm.body}
                  onChange={(e) => setNotificationForm({ ...notificationForm, body: e.target.value })}
                />
                <ActionButton onClick={() => void createNotification()} disabled={saving}>
                  <BellRing className="h-4 w-4" />
                  Send Notice
                </ActionButton>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Branch Directory">
              <div className="space-y-3">
                {branches.map((row: any) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{pick(row, ["name", "code"], "Branch")}</div>
                      <div className="text-sm text-slate-500">{pick(row, ["address", "city"], "")}</div>
                    </div>
                    <StatusBadge label={pick(row, ["code"], "—")} />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Audit Stream">
              <div className="space-y-3">
                {auditLogs.slice(0, 8).map((row: any) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-900">{pick(row, ["action"], "activity")}</div>
                      <StatusBadge label={pick(row, ["portal"], "system")} />
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{pick(row, ["created_at"], "")}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {view === "reports" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard title="Total Employees" value={report.totalEmployees} icon={<Users className="h-5 w-5" />} />
            <MetricCard title="Active" value={report.activeEmployees} icon={<CheckCircle2 className="h-5 w-5" />} />
            <MetricCard title="Pending" value={report.pendingApprovals} icon={<ClipboardList className="h-5 w-5" />} />
            <MetricCard title="Doc Coverage" value={`${report.documentCoverage}%`} icon={<FileText className="h-5 w-5" />} />
            <MetricCard title="Training Coverage" value={`${report.trainingCoverage}%`} icon={<BookOpen className="h-5 w-5" />} />
            <MetricCard title="Unread Notices" value={report.unreadNotifications} icon={<BellRing className="h-5 w-5" />} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_420px]">
            <Panel title="Branch Workforce Report">
              <div className="space-y-3">
                {branchSummary.map((row: any) => (
                  <div key={row.id} className="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{row.name}</div>
                      <div className="text-sm text-slate-500">{row.code}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-900">{row.headcount}</div>
                      <div className="text-sm text-slate-500">{row.pending} pending</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Admin Summary">
              <div className="space-y-3">
                <SummaryLine label="Profile" value={pick(profile, ["full_name", "name", "email"], "—")} />
                <SummaryLine label="Branches" value={String(branches.length)} />
                <SummaryLine label="Users" value={String(users.length)} />
                <SummaryLine label="Roles" value={String(roles.length)} />
                <SummaryLine label="Notifications" value={String(notifications.length)} />
                <SummaryLine label="Audit Events" value={String(auditLogs.length)} />
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function HeroCard({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-[#0d2c54]" />
            <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
              Admin & HR
            </span>
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-4xl text-sm font-medium leading-6 text-slate-500 md:text-[15px]">
            {subtitle}
          </p>
        </div>
        {actions}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-5 border-b border-slate-200/80 pb-5">
        <div className="text-lg font-black tracking-tight text-[#0d2c54]">{title}</div>
        {subtitle ? <div className="mt-2 text-sm text-slate-500">{subtitle}</div> : null}
      </div>
      {children}
    </section>
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
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
        active ? "bg-white shadow-sm text-[#0d2c54]" : "text-slate-600 hover:bg-white/60"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-2xl bg-[#0d2c54] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-70"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-70"
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">
        {icon}
      </div>
      <div className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight text-[#0d2c54]">{value}</div>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] ${statusClass(label)}`}>
      {labelize(label)}
    </span>
  );
}

function InfoCard({
  title,
  subtitle,
  meta,
  status,
  pills = [],
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  status?: string;
  pills?: string[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="text-sm text-slate-500">{subtitle}</div> : null}
          {meta ? <div className="text-sm text-slate-500">{meta}</div> : null}
        </div>
        {status ? <StatusBadge label={status} /> : null}
      </div>
      {pills.length ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
          {pills.map((pill) => (
            <span key={pill} className="rounded-full bg-slate-100 px-2 py-1">
              {pill}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
    />
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-black text-[#0d2c54]">{value}</span>
    </div>
  );
}