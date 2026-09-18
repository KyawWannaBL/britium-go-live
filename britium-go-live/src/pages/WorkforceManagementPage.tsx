// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Users, Bike, Truck, HandHelping, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type WorkforceRow = {
  workforce_id: string;
  workforce_code: string;
  workforce_name: string;
  workforce_type: "RIDER" | "HELPER" | "DRIVER";
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

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#0f2a42",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  blue: "#38bdf8",
  green: "#34d399",
  purple: "#c084fc",
  red: "#f87171",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function SummaryCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 18, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ color: C.sub, fontSize: 11, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>{label}</div>
          <div style={{ color: C.text, fontSize: 32, lineHeight: 1, fontWeight: 900, marginTop: 9 }}>{value}</div>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 14, display: "grid", placeItems: "center", color, border: `1px solid ${color}55`, background: `${color}14` }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function pillColor(type: string) {
  if (type === "RIDER") return C.blue;
  if (type === "HELPER") return C.purple;
  if (type === "DRIVER") return C.green;
  return C.sub;
}

export default function WorkforceManagementPage() {
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
      const { data, error: auditError } = await supabase
        .from("be_workforce_audit_logs")
        .select("id, field_name, old_value, new_value, reason, changed_by, created_at")
        .eq("workforce_type", row.workforce_type)
        .eq("workforce_id", row.workforce_id)
        .order("created_at", { ascending: false })
        .limit(25);

      if (auditError) throw auditError;
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
    riders: rows.filter((row) => row.workforce_type === "RIDER").length,
    helpers: rows.filter((row) => row.workforce_type === "HELPER").length,
    drivers: rows.filter((row) => row.workforce_type === "DRIVER").length,
  }), [rows]);

  const branches = useMemo(
    () => Array.from(new Set(rows.map((row) => row.branch_code).filter(Boolean))).sort(),
    [rows],
  );

  const employmentTypes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.employment_type).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      const searchMatch = !q || [
        row.workforce_code,
        row.workforce_name,
        row.workforce_type,
        row.branch_code,
        row.employment_type,
      ].some((value) => String(value || "").toLowerCase().includes(q));

      return (
        searchMatch &&
        (!typeFilter || row.workforce_type === typeFilter) &&
        (!branchFilter || row.branch_code === branchFilter) &&
        (!employmentFilter || row.employment_type === employmentFilter)
      );
    });
  }, [rows, search, typeFilter, branchFilter, employmentFilter]);

  return (
    <main style={{ minHeight: "100%", background: C.bg, color: C.text, padding: 4 }}>
      <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: C.gold, fontWeight: 900, letterSpacing: ".22em", fontSize: 11 }}>WORKFORCE MANAGEMENT</div>
            <h1 style={{ margin: "8px 0 4px", fontSize: 24, display: "flex", alignItems: "center", gap: 10 }}>
              <Users size={24} color={C.gold} /> Active Workforce Dashboard
            </h1>
            <p style={{ color: C.sub, margin: 0, fontSize: 13 }}>
              Single operational roster sourced from be_active_workforce_view. Historical assignments remain unchanged.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadWorkforce()}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${C.gold}88`, borderRadius: 12, background: "#f6b84b14", color: C.gold, padding: "10px 14px", fontWeight: 900, cursor: loading ? "wait" : "pointer" }}
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Active Workforce" value={counts.total} icon={<Users size={21} />} color={C.gold} />
        <SummaryCard label="Riders" value={counts.riders} icon={<Bike size={21} />} color={C.blue} />
        <SummaryCard label="Helpers" value={counts.helpers} icon={<HandHelping size={21} />} color={C.purple} />
        <SummaryCard label="Drivers" value={counts.drivers} icon={<Truck size={21} />} color={C.green} />
      </section>

      <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 18, overflow: "hidden" }}>
        <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: `1px solid ${C.border}` }}>
          <label style={{ minWidth: 270, flex: "1 1 300px", position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 11, color: C.sub }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search code, name, branch..."
              style={{ width: "100%", height: 38, padding: "0 12px 0 36px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, outline: "none" }}
            />
          </label>

          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} style={selectStyle}>
            <option value="">All workforce types</option>
            <option value="RIDER">Riders</option>
            <option value="HELPER">Helpers</option>
            <option value="DRIVER">Drivers</option>
          </select>

          <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} style={selectStyle}>
            <option value="">All branches</option>
            {branches.map((branch) => <option key={String(branch)} value={String(branch)}>{String(branch)}</option>)}
          </select>

          <select value={employmentFilter} onChange={(event) => setEmploymentFilter(event.target.value)} style={selectStyle}>
            <option value="">All employment types</option>
            {employmentTypes.map((type) => <option key={String(type)} value={String(type)}>{String(type)}</option>)}
          </select>

          <div style={{ marginLeft: "auto", color: C.sub, fontSize: 12 }}>
            Showing <strong style={{ color: C.text }}>{filtered.length}</strong> / {rows.length}
          </div>
        </div>

        {error ? (
          <div style={{ margin: 16, padding: 12, borderRadius: 12, border: `1px solid ${C.red}`, color: C.red }}>{error}</div>
        ) : loading ? (
          <div style={{ padding: 36, color: C.sub, textAlign: "center" }}>Loading active workforce...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.panel2, color: C.sub }}>
                  {["Code", "Name", "Type", "Branch", "Employment", "Status", ""].map((label) => (
                    <th key={label} style={{ padding: "11px 13px", textAlign: "left", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={`${row.workforce_type}:${row.workforce_id}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={tdStyle}><span style={{ fontFamily: "monospace", color: C.gold, fontWeight: 800 }}>{row.workforce_code || row.workforce_id}</span></td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{row.workforce_name || "—"}</td>
                    <td style={tdStyle}>
                      <span style={{ border: `1px solid ${pillColor(row.workforce_type)}55`, background: `${pillColor(row.workforce_type)}14`, color: pillColor(row.workforce_type), padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 900 }}>{row.workforce_type}</span>
                    </td>
                    <td style={tdStyle}>{row.branch_code || "—"}</td>
                    <td style={tdStyle}>{row.employment_type || "—"}</td>
                    <td style={tdStyle}><span style={{ color: C.green, fontWeight: 800 }}>{row.status || "active"}</span></td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => setSelected(row)}
                        style={{ border: `1px solid ${C.blue}66`, color: C.blue, background: "#38bdf812", borderRadius: 9, padding: "6px 10px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={7} style={{ padding: 34, textAlign: "center", color: C.sub }}>No active workforce matches the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Workforce Profile"
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end", background: "rgba(2, 10, 18, .70)" }}
        >
          <aside
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(540px, 94vw)", height: "100%", overflowY: "auto", background: C.bg, borderLeft: `1px solid ${C.border}`, boxShadow: "-18px 0 44px rgba(0,0,0,.35)", padding: 22 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <div>
                <div style={{ color: C.gold, fontSize: 10, fontWeight: 900, letterSpacing: ".16em" }}>WORKFORCE PROFILE</div>
                <h2 style={{ margin: "7px 0 3px", fontSize: 22 }}>{selected.workforce_name}</h2>
                <div style={{ color: C.sub, fontFamily: "monospace" }}>{selected.workforce_code}</div>
              </div>
              <button type="button" onClick={() => setSelected(null)} style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 10, border: `1px solid ${C.border}`, color: C.text, background: C.panel, cursor: "pointer" }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
              <ProfileField label="Workforce ID" value={selected.workforce_id} />
              <ProfileField label="Code" value={selected.workforce_code} />
              <ProfileField label="Type" value={selected.workforce_type} />
              <ProfileField label="Status" value={selected.status || "active"} />
              <ProfileField label="Branch" value={selected.branch_code || "—"} />
              <ProfileField label="Employment" value={selected.employment_type || "—"} />
            </div>

            <div style={{ marginTop: 24 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Audit History</h3>
              <p style={{ color: C.sub, fontSize: 12, marginTop: 5 }}>Latest changes recorded in be_workforce_audit_logs.</p>
              {auditLoading ? (
                <div style={{ padding: 20, color: C.sub }}>Loading audit history...</div>
              ) : audits.length ? audits.map((audit) => (
                <div key={audit.id} style={{ padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontWeight: 900, fontSize: 12, color: C.gold }}>{audit.field_name}</div>
                  <div style={{ color: C.text, fontSize: 12, marginTop: 4 }}>{audit.old_value ?? "—"} → {audit.new_value ?? "—"}</div>
                  {audit.reason ? <div style={{ color: C.sub, fontSize: 11, marginTop: 4 }}>{audit.reason}</div> : null}
                  <div style={{ color: "#5f88a3", fontSize: 10, marginTop: 5 }}>{formatDate(audit.created_at)}</div>
                </div>
              )) : (
                <div style={{ border: `1px dashed ${C.border}`, borderRadius: 12, padding: 18, color: C.sub, fontSize: 12 }}>No audit entries recorded for this workforce member yet.</div>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 12 }}>
      <div style={{ color: C.sub, fontSize: 9, fontWeight: 900, letterSpacing: ".09em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: C.text, fontSize: 12, fontWeight: 800, marginTop: 5, wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 38,
  minWidth: 150,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  background: C.bg,
  color: C.text,
  padding: "0 10px",
  fontSize: 12,
};

const tdStyle: React.CSSProperties = {
  padding: "11px 13px",
  color: C.text,
  fontSize: 12,
  verticalAlign: "middle",
};
