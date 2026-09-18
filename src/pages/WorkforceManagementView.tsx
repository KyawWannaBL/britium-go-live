// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  DataTable,
  ErrorBlock,
  LoadingBlock,
  StatCard,
  StatusPill,
  TextInput,
} from "../components/PortalLayout";
import { supabase } from "../integrations/supabase/client";

type WorkforceRow = {
  workforce_id: string;
  workforce_code: string;
  workforce_name: string;
  workforce_type: "RIDER" | "HELPER" | "DRIVER" | string;
  branch_code: string | null;
  employment_type: string | null;
  status: string;
};

type AuditRow = {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  RIDER: "Rider",
  HELPER: "Helper",
  DRIVER: "Driver",
};

function safeDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function WorkforceManagementView() {
  const [rows, setRows] = useState<WorkforceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [selected, setSelected] = useState<WorkforceRow | null>(null);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  async function loadWorkforce() {
    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("be_active_workforce_view")
        .select("workforce_id, workforce_code, workforce_name, workforce_type, branch_code, employment_type, status")
        .order("workforce_type", { ascending: true })
        .order("workforce_code", { ascending: true });

      if (queryError) throw queryError;
      setRows((data || []) as WorkforceRow[]);
    } catch (e: any) {
      setError(e?.message || "Unable to load active workforce.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit(row: WorkforceRow) {
    setAuditLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from("be_workforce_audit_logs")
        .select("id, field_name, old_value, new_value, reason, changed_by, created_at")
        .eq("workforce_type", row.workforce_type)
        .eq("workforce_id", row.workforce_id)
        .order("created_at", { ascending: false })
        .limit(25);

      if (queryError) throw queryError;
      setAudits((data || []) as AuditRow[]);
    } catch {
      setAudits([]);
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkforce();
  }, []);

  useEffect(() => {
    if (!selected) {
      setAudits([]);
      return;
    }
    void loadAudit(selected);
  }, [selected?.workforce_id, selected?.workforce_type]);

  const counts = useMemo(() => ({
    total: rows.length,
    riders: rows.filter((r) => r.workforce_type === "RIDER").length,
    helpers: rows.filter((r) => r.workforce_type === "HELPER").length,
    drivers: rows.filter((r) => r.workforce_type === "DRIVER").length,
  }), [rows]);

  const branches = useMemo(
    () => Array.from(new Set(rows.map((r) => r.branch_code).filter(Boolean))).sort(),
    [rows]
  );

  const employmentTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.employment_type).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !q || [
        row.workforce_code,
        row.workforce_name,
        row.workforce_type,
        row.branch_code,
        row.employment_type,
      ].some((value) => String(value || "").toLowerCase().includes(q));

      return (
        matchesSearch &&
        (!typeFilter || row.workforce_type === typeFilter) &&
        (!branchFilter || row.branch_code === branchFilter) &&
        (!employmentFilter || row.employment_type === employmentFilter)
      );
    });
  }, [rows, search, typeFilter, branchFilter, employmentFilter]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>👥 Workforce Management</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            Live active roster from be_active_workforce_view. This release is read-focused; master edits remain controlled separately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadWorkforce()}
          disabled={loading}
          style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155", padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}
        >
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <StatCard label="Active Workforce" value={counts.total} icon="👥" color="#0f172a" />
        <StatCard label="Active Riders" value={counts.riders} icon="🛵" color="#2563eb" />
        <StatCard label="Active Helpers" value={counts.helpers} icon="🤝" color="#7c3aed" />
        <StatCard label="Active Drivers" value={counts.drivers} icon="🚚" color="#059669" />
      </div>

      <Card title="Active workforce directory">
        <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ minWidth: 240, flex: "1 1 260px" }}>
            <TextInput value={search} onChange={setSearch} placeholder="Search code, name, branch…" />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="">All workforce types</option>
            <option value="RIDER">Riders</option>
            <option value="HELPER">Helpers</option>
            <option value="DRIVER">Drivers</option>
          </select>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} style={selectStyle}>
            <option value="">All branches</option>
            {branches.map((branch) => <option key={String(branch)} value={String(branch)}>{String(branch)}</option>)}
          </select>
          <select value={employmentFilter} onChange={(e) => setEmploymentFilter(e.target.value)} style={selectStyle}>
            <option value="">All employment types</option>
            {employmentTypes.map((type) => <option key={String(type)} value={String(type)}>{String(type)}</option>)}
          </select>
          <div style={{ fontSize: 12, color: "#64748b", marginLeft: "auto", paddingBottom: 8 }}>
            Showing <strong>{filtered.length}</strong> of {rows.length}
          </div>
        </div>

        {loading ? <LoadingBlock /> : error ? <div style={{ padding: 16 }}><ErrorBlock message={error} /></div> : (
          <DataTable
            columns={[
              { key: "code", label: "Code" },
              { key: "name", label: "Name" },
              { key: "type", label: "Type" },
              { key: "branch", label: "Branch" },
              { key: "employment", label: "Employment" },
              { key: "status", label: "Status" },
              { key: "actions", label: "" },
            ]}
            rows={filtered.map((row) => ({
              code: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{row.workforce_code || row.workforce_id}</span>,
              name: <strong>{row.workforce_name || "—"}</strong>,
              type: TYPE_LABELS[row.workforce_type] || row.workforce_type,
              branch: row.branch_code || "—",
              employment: row.employment_type || "—",
              status: <StatusPill status={row.status || "active"} />,
              actions: (
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  View profile
                </button>
              ),
            }))}
            emptyMsg="No active workforce matches the selected filters."
          />
        )}
      </Card>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Workforce profile"
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", zIndex: 400, display: "flex", justifyContent: "flex-end" }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(520px, 94vw)", height: "100%", background: "#fff", boxShadow: "-12px 0 30px rgba(15,23,42,.18)", overflowY: "auto", padding: 24 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
              <div>
                <div style={{ color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Workforce profile</div>
                <h3 style={{ margin: "6px 0 0", fontSize: 22 }}>{selected.workforce_name}</h3>
                <div style={{ marginTop: 6, fontFamily: "monospace", color: "#475569" }}>{selected.workforce_code}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={{ border: "none", background: "#f1f5f9", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 22 }}>
              <ProfileField label="Type" value={TYPE_LABELS[selected.workforce_type] || selected.workforce_type} />
              <ProfileField label="Status" value={selected.status || "active"} />
              <ProfileField label="Branch" value={selected.branch_code || "—"} />
              <ProfileField label="Employment" value={selected.employment_type || "—"} />
              <ProfileField label="Workforce ID" value={selected.workforce_id} />
              <ProfileField label="Code" value={selected.workforce_code} />
            </div>

            <div style={{ marginTop: 26 }}>
              <h4 style={{ margin: 0, fontSize: 14 }}>Recent audit history</h4>
              <p style={{ margin: "5px 0 12px", fontSize: 12, color: "#64748b" }}>
                Latest master-data changes recorded in be_workforce_audit_logs.
              </p>
              {auditLoading ? (
                <div style={{ padding: 18, color: "#94a3b8" }}>Loading audit history…</div>
              ) : audits.length === 0 ? (
                <div style={{ padding: 18, border: "1px dashed #cbd5e1", borderRadius: 10, color: "#94a3b8", fontSize: 12 }}>No audit entries yet.</div>
              ) : audits.map((audit) => (
                <div key={audit.id} style={{ borderBottom: "1px solid #e2e8f0", padding: "12px 0" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{audit.field_name}</div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>
                    {audit.old_value ?? "—"} → {audit.new_value ?? "—"}
                  </div>
                  {audit.reason ? <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{audit.reason}</div> : null}
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{safeDate(audit.created_at)}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "#94a3b8", fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 13, color: "#1e293b", fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 36,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  padding: "0 10px",
  fontSize: 12,
  color: "#334155",
};
