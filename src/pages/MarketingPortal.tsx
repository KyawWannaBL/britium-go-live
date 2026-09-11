// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// MarketingPortal.tsx — Production Marketing Portal
// API: /api/v1/marketing-portal/*   Role: marketing / marketer
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  useMarketingOverview, useCampaigns, useCreateCampaign,
  useLeads, useUpdateLead, usePromoCodes, usePartnerships, useZoneLaunches,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";

type Tab = "overview" | "campaigns" | "leads" | "promos" | "partnerships" | "zones";

export default function MarketingPortal() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campForm, setCampForm] = useState({
    campaign_name: "", objective: "", audience: "", budget_mmk: "", start_date: "", end_date: "",
  });

  const overview = useMarketingOverview();
  const campaigns = useCampaigns();
  const createCampaign = useCreateCampaign();
  const leads = useLeads();
  const updateLead = useUpdateLead();
  const promos = usePromoCodes();
  const partnerships = usePartnerships();
  const zones = useZoneLaunches();

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "📊 Overview" },
    { id: "campaigns", label: "🚀 Campaigns" },
    { id: "leads", label: "🎯 Merchant Leads" },
    { id: "promos", label: "🏷️ Promo Codes" },
    { id: "partnerships", label: "🤝 Partnerships" },
    { id: "zones", label: "🗺️ Zone Launches" },
  ];

  const LEAD_STAGES = ["new", "qualified", "demo_scheduled", "proposal_sent", "activated", "lost"];

  return (
    <div style={S.page}>
      <header style={S.header}>
        <span style={S.headerTitle}>📣 Marketing Portal</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={S.userBadge}>{user?.full_name || user?.email}</span>
          <button onClick={logout} style={S.logoutBtn}>Sign Out</button>
        </div>
      </header>

      <nav style={S.tabBar}>
        {tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.tabActive : S.tab}>{t.label}</button>)}
      </nav>

      <main style={S.main}>
        {/* OVERVIEW */}
        {tab === "overview" && (
          <div>
            <h2 style={S.h2}>Marketing Overview</h2>
            {overview.isLoading && <Spin />}
            {overview.data && (
              <div style={S.statsGrid}>
                {([
                  ["Active Campaigns", String((overview.data as Record<string, unknown>).active_campaigns ?? "—"), "#3b82f6"],
                  ["Total Leads", String((overview.data as Record<string, unknown>).total_leads ?? "—"), "#8b5cf6"],
                  ["Activated Merchants", String((overview.data as Record<string, unknown>).activated_merchants ?? "—"), "#10b981"],
                  ["Total Attributed Revenue", String((overview.data as Record<string, unknown>).attributed_revenue ?? "—"), "#f59e0b"],
                ] as [string, string, string][]).map(([label, val, color]) => (
                  <div key={label} style={{ ...S.statCard, borderTop: `4px solid ${color}` }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color }}>{val}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CAMPAIGNS */}
        {tab === "campaigns" && (
          <div>
            <div style={S.sectionHdr}>
              <h2 style={S.h2}>Campaigns</h2>
              <button style={S.addBtn} onClick={() => setShowCampaignForm((v) => !v)}>
                {showCampaignForm ? "Cancel" : "+ New Campaign"}
              </button>
            </div>
            {showCampaignForm && (
              <div style={S.formCard}>
                <h3 style={S.h3}>New Campaign</h3>
                {createCampaign.isError && <ErrBanner msg={createCampaign.error?.message} />}
                {createCampaign.isSuccess && <SuccBanner msg="Campaign created ✓" />}
                <form style={S.form} onSubmit={async (e) => {
                  e.preventDefault();
                  await createCampaign.mutateAsync({ ...campForm, budget_mmk: Number(campForm.budget_mmk) });
                  setShowCampaignForm(false);
                  setCampForm({ campaign_name: "", objective: "", audience: "", budget_mmk: "", start_date: "", end_date: "" });
                }}>
                  {[
                    ["campaign_name", "Campaign Name *", "text", true],
                    ["objective", "Objective", "text", false],
                    ["audience", "Target Audience", "text", false],
                    ["budget_mmk", "Budget (MMK) *", "number", true],
                    ["start_date", "Start Date *", "date", true],
                    ["end_date", "End Date *", "date", true],
                  ].map(([f, label, type, required]) => (
                    <label key={String(f)} style={S.formLabel}>
                      {label as string}
                      <input type={String(type)} required={Boolean(required)} style={S.formInput}
                        value={(campForm as Record<string, string>)[String(f)]}
                        onChange={(e) => setCampForm((c) => ({ ...c, [String(f)]: e.target.value }))} />
                    </label>
                  ))}
                  <button type="submit" style={{ ...S.addBtn, gridColumn: "1/-1" }} disabled={createCampaign.isPending}>
                    {createCampaign.isPending ? "Creating…" : "Create Campaign"}
                  </button>
                </form>
              </div>
            )}
            <DTable
              loading={campaigns.isLoading} error={campaigns.error?.message} data={campaigns.data as unknown[]}
              cols={["Name", "Objective", "Audience", "Budget", "Status", "Start", "End"]}
              rowFn={(r: Record<string, unknown>) => [
                r.campaign_name, r.objective, r.audience,
                `${Number(r.budget_mmk ?? 0).toLocaleString()} MMK`,
                stageBadge(String(r.status ?? "")),
                fmtDate(r.start_date as string), fmtDate(r.end_date as string),
              ]}
            />
          </div>
        )}

        {/* LEADS */}
        {tab === "leads" && (
          <div>
            <h2 style={S.h2}>Merchant Leads</h2>
            {updateLead.isError && <ErrBanner msg={updateLead.error?.message} />}
            {updateLead.isSuccess && <SuccBanner msg="Lead updated ✓" />}
            <DTable
              loading={leads.isLoading} error={leads.error?.message} data={leads.data as unknown[]}
              cols={["Company", "Contact", "Phone", "Source", "Stage", "Update Stage"]}
              rowFn={(r: Record<string, unknown>) => [
                r.company_name, r.contact_name, r.contact_phone, r.source,
                stageBadge(String(r.stage ?? "")),
                <select key="stage" style={S.stageSelect} value={String(r.stage ?? "new")}
                  onChange={(e) => updateLead.mutate({ id: String(r.id), stage: e.target.value })}>
                  {LEAD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>,
              ]}
            />
          </div>
        )}

        {/* PROMO CODES */}
        {tab === "promos" && (
          <div>
            <h2 style={S.h2}>Promo Codes</h2>
            <DTable
              loading={promos.isLoading} error={promos.error?.message} data={promos.data as unknown[]}
              cols={["Code", "Type", "Value", "Status", "Redemptions"]}
              rowFn={(r: Record<string, unknown>) => [
                r.promo_code, r.discount_type, r.discount_value,
                stageBadge(String(r.status ?? "")), String(r.redemption_count ?? 0),
              ]}
            />
          </div>
        )}

        {/* PARTNERSHIPS */}
        {tab === "partnerships" && (
          <div>
            <h2 style={S.h2}>Partnerships</h2>
            <DTable
              loading={partnerships.isLoading} error={partnerships.error?.message} data={partnerships.data as unknown[]}
              cols={["Partner", "Category", "Stage", "Expected Monthly Shipments"]}
              rowFn={(r: Record<string, unknown>) => [r.partner_name, r.category, stageBadge(String(r.stage ?? "")), r.expected_monthly_shipments]}
            />
          </div>
        )}

        {/* ZONE LAUNCHES */}
        {tab === "zones" && (
          <div>
            <h2 style={S.h2}>Zone Launches</h2>
            <DTable
              loading={zones.isLoading} error={zones.error?.message} data={zones.data as unknown[]}
              cols={["Zone", "Launch Date", "Readiness %", "Status"]}
              rowFn={(r: Record<string, unknown>) => [r.zone_name, fmtDate(r.launch_date as string), `${r.readiness_pct ?? 0}%`, stageBadge(String(r.status ?? ""))]}
            />
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
  if (loading) return <Spin />;
  if (error) return <ErrBanner msg={error} />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={S.table}>
        <thead><tr>{cols.map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
        <tbody>
          {!(data ?? []).length ? <tr><td colSpan={cols.length} style={S.empty}>No records.</td></tr>
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

function stageBadge(s: string) {
  const map: Record<string, string> = { active: "#10b981", inactive: "#94a3b8", draft: "#64748b", new: "#3b82f6", qualified: "#8b5cf6", demo_scheduled: "#f59e0b", proposal_sent: "#f97316", activated: "#10b981", lost: "#ef4444", paused: "#f59e0b", completed: "#10b981", planned: "#3b82f6", launched: "#10b981" };
  return <span style={{ background: map[s] ?? "#94a3b8", color: "#fff", borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{s}</span>;
}
function fmtDate(v?: string) { return v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—"; }
function Spin() { return <div style={{ color: "#94a3b8", padding: 16 }}>Loading…</div>; }
function ErrBanner({ msg }: { msg?: string }) { return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#991b1b", marginBottom: 12 }}>⚠️ {msg}</div>; }
function SuccBanner({ msg }: { msg: string }) { return <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534", marginBottom: 12 }}>{msg}</div>; }

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Segoe UI', sans-serif" },
  header: { background: "linear-gradient(90deg,#be185d,#ec4899)", color: "#fff", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontWeight: 800, fontSize: 17 },
  userBadge: { fontSize: 13, opacity: 0.85 },
  logoutBtn: { background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 },
  tabBar: { background: "#fff", borderBottom: "2px solid #e2e8f0", display: "flex", gap: 2, padding: "0 24px", overflowX: "auto" },
  tab: { background: "transparent", border: "none", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#64748b", fontWeight: 500, whiteSpace: "nowrap" },
  tabActive: { background: "transparent", border: "none", borderBottom: "3px solid #ec4899", padding: "12px 16px", cursor: "pointer", fontSize: 13, color: "#be185d", fontWeight: 700, whiteSpace: "nowrap" },
  main: { padding: "24px", maxWidth: 1200, margin: "0 auto" },
  h2: { fontSize: 18, fontWeight: 800, color: "#0f172a", marginBottom: 16 },
  h3: { fontSize: 14, fontWeight: 700, marginBottom: 12 },
  sectionHdr: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  addBtn: { background: "#be185d", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 16, marginBottom: 24 },
  statCard: { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.08)" },
  formCard: { background: "#fff", borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: "0 1px 4px rgba(0,0,0,.08)" },
  form: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  formLabel: { fontSize: 13, fontWeight: 600, color: "#374151", display: "flex", flexDirection: "column", gap: 5 },
  formInput: { border: "1.5px solid #d1d5db", borderRadius: 7, padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: "inherit" },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden", fontSize: 13 },
  th: { background: "#831843", color: "#fff", padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 12 },
  td: { padding: "9px 14px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  empty: { padding: 20, textAlign: "center", color: "#94a3b8" },
  stageSelect: { border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 8px", fontSize: 12, outline: "none" },
};
