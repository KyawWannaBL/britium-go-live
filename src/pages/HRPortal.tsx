// src/pages/HRPortal.tsx
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { getPortalBanner } from "@/lib/portalBanner";
import { safeText } from "@/lib/displayValue";
import { PortalBanner } from "@/components/portal/PortalBanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

function tt(language: string, en: string, mm: string) {
  return language === "mm" ? mm : en;
}

function currentView(pathname: string) {
  if (pathname.includes("/attendance")) return "attendance";
  if (pathname.includes("/leave")) return "leave";
  return "employees";
}

function labelize(value: unknown) {
  return String(value || "unknown")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

async function safeLoad(table: string, orderColumn: string, ascending = false) {
  const { data, error } = await supabase.from(table).select("*").order(orderColumn, { ascending });
  if (error) {
    console.warn(`[HRPortal] ${table}`, error.message);
    return [];
  }
  return data || [];
}

export default function HRPortal() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const [view, setView] = useState(currentView(location.pathname));
  const [loading, setLoading] = useState(true);
  const [staffRows, setStaffRows] = useState<any[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<any[]>([]);
  const [leaveRows, setLeaveRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [attendanceForm, setAttendanceForm] = useState({
    staff_id: "",
    attendance_date: new Date().toISOString().slice(0, 10),
    status: "present",
    notes: "",
  });

  const [leaveForm, setLeaveForm] = useState({
    staff_id: "",
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
  });

  useEffect(() => {
    setView(currentView(location.pathname));
  }, [location.pathname]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [staffData, attData, leaveData] = await Promise.all([
        safeLoad("staff_master", "full_name", true),
        safeLoad("hr_attendance", "attendance_date", false),
        safeLoad("hr_leave_requests", "created_at", false),
      ]);

      setStaffRows(staffData);
      setAttendanceRows(attData);
      setLeaveRows(leaveData);
    } catch (e: any) {
      setError(e?.message || "Failed to load HR data");
      setStaffRows([]);
      setAttendanceRows([]);
      setLeaveRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const staffMap = useMemo(() => new Map(staffRows.map((r: any) => [r.id, r])), [staffRows]);

  async function saveAttendance() {
    setError(null);
    const { error } = await supabase.from("hr_attendance").upsert({
      staff_id: attendanceForm.staff_id,
      attendance_date: attendanceForm.attendance_date,
      status: attendanceForm.status,
      check_in_at: new Date().toISOString(),
      notes: attendanceForm.notes || null,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setError(error.message);
      return;
    }

    setAttendanceForm({
      staff_id: "",
      attendance_date: new Date().toISOString().slice(0, 10),
      status: "present",
      notes: "",
    });

    await loadData();
  }

  async function saveLeave() {
    setError(null);
    const { error } = await supabase.from("hr_leave_requests").insert({
      staff_id: leaveForm.staff_id,
      leave_type: leaveForm.leave_type,
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      reason: leaveForm.reason,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setError(error.message);
      return;
    }

    setLeaveForm({
      staff_id: "",
      leave_type: "annual",
      start_date: "",
      end_date: "",
      reason: "",
    });

    await loadData();
  }

  async function setLeaveStatus(id: string, status: "approved" | "rejected") {
    setError(null);
    const { error } = await supabase
      .from("hr_leave_requests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    await loadData();
  }

  return (
    <div className="space-y-6">
      <PortalBanner
        image={getPortalBanner(view === "attendance" ? "hr_attendance" : view === "leave" ? "hr_leave" : "hr")}
        title={tt(language, "HR Portal", "HR Portal")}
        subtitle={tt(language, "Employees, attendance, and leave requests.", "ဝန်ထမ်း၊ attendance နှင့် leave request များ")}
      >
        <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {tt(language, "Refresh", "ပြန်လည်ရယူမည်")}
        </Button>
      </PortalBanner>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-2 rounded-2xl bg-muted p-1 md:grid-cols-3">
        <button
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === "employees" ? "bg-background shadow-sm" : ""}`}
          onClick={() => navigate("/hr/employees")}
        >
          {tt(language, "Employees", "Employees")}
        </button>
        <button
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === "attendance" ? "bg-background shadow-sm" : ""}`}
          onClick={() => navigate("/hr/attendance")}
        >
          {tt(language, "Attendance", "Attendance")}
        </button>
        <button
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === "leave" ? "bg-background shadow-sm" : ""}`}
          onClick={() => navigate("/hr/leave")}
        >
          {tt(language, "Leave Requests", "Leave Requests")}
        </button>
      </div>

      {view === "employees" && (
        <Card>
          <CardHeader>
            <CardTitle>{tt(language, "Employee Directory", "Employee Directory")}</CardTitle>
            <CardDescription>{tt(language, "Live staff master data for HR visibility.", "HR အတွက် live staff master data")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {staffRows.map((row: any) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border p-4">
                <div>
                  <div className="font-semibold">{row.full_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {safeText(row.staff_code)} · {safeText(row.staff_type)} · {safeText(row.role_name)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {safeText(row.phone)} · {safeText(row.email)}
                  </div>
                </div>
                <Badge>{row.is_active ? tt(language, "Active", "Active") : tt(language, "Inactive", "Inactive")}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {view === "attendance" && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, "Record Attendance", "Attendance မှတ်တမ်းတင်ရန်")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={attendanceForm.staff_id}
                onChange={(e) => setAttendanceForm({ ...attendanceForm, staff_id: e.target.value })}
              >
                <option value="">{tt(language, "Select Staff", "Staff ရွေးပါ")}</option>
                {staffRows.map((row: any) => (
                  <option key={row.id} value={row.id}>
                    {row.full_name}
                  </option>
                ))}
              </select>

              <Input
                type="date"
                value={attendanceForm.attendance_date}
                onChange={(e) => setAttendanceForm({ ...attendanceForm, attendance_date: e.target.value })}
              />

              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={attendanceForm.status}
                onChange={(e) => setAttendanceForm({ ...attendanceForm, status: e.target.value })}
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="leave">Leave</option>
                <option value="remote">Remote</option>
              </select>

              <textarea
                className="min-h-[100px] w-full rounded-md border p-3 text-sm"
                value={attendanceForm.notes}
                onChange={(e) => setAttendanceForm({ ...attendanceForm, notes: e.target.value })}
                placeholder={tt(language, "Notes", "မှတ်ချက်")}
              />

              <Button onClick={() => void saveAttendance()}>
                <Save className="mr-2 h-4 w-4" />
                {tt(language, "Save Attendance", "Attendance သိမ်းမည်")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tt(language, "Attendance Ledger", "Attendance Ledger")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {attendanceRows.map((row: any) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="font-semibold">{staffMap.get(row.staff_id)?.full_name || "Unknown staff"}</div>
                  <div className="text-sm text-muted-foreground">
                    {row.attendance_date || "—"} · {labelize(row.status)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {fmtDate(row.check_in_at)} → {fmtDate(row.check_out_at)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {view === "leave" && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{tt(language, "Create Leave Request", "Leave Request ဖန်တီးရန်")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={leaveForm.staff_id}
                onChange={(e) => setLeaveForm({ ...leaveForm, staff_id: e.target.value })}
              >
                <option value="">{tt(language, "Select Staff", "Staff ရွေးပါ")}</option>
                {staffRows.map((row: any) => (
                  <option key={row.id} value={row.id}>
                    {row.full_name}
                  </option>
                ))}
              </select>

              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={leaveForm.leave_type}
                onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
              >
                <option value="annual">Annual</option>
                <option value="medical">Medical</option>
                <option value="casual">Casual</option>
                <option value="maternity">Maternity</option>
                <option value="unpaid">Unpaid</option>
                <option value="other">Other</option>
              </select>

              <Input type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} />
              <Input type="date" value={leaveForm.end_date} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} />

              <textarea
                className="min-h-[100px] w-full rounded-md border p-3 text-sm"
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                placeholder={tt(language, "Reason", "အကြောင်းပြချက်")}
              />

              <Button onClick={() => void saveLeave()}>
                <Save className="mr-2 h-4 w-4" />
                {tt(language, "Save Request", "Request သိမ်းမည်")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tt(language, "Leave Queue", "Leave Queue")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {leaveRows.map((row: any) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{staffMap.get(row.staff_id)?.full_name || "Unknown staff"}</div>
                      <div className="text-sm text-muted-foreground">
                        {labelize(row.leave_type)} · {row.start_date} → {row.end_date}
                      </div>
                      <div className="text-sm text-muted-foreground">{safeText(row.reason)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge>{labelize(row.status)}</Badge>
                      {row.status === "pending" ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => void setLeaveStatus(row.id, "approved")}>
                            {tt(language, "Approve", "ခွင့်ပြုမည်")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void setLeaveStatus(row.id, "rejected")}>
                            {tt(language, "Reject", "ငြင်းပယ်မည်")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}