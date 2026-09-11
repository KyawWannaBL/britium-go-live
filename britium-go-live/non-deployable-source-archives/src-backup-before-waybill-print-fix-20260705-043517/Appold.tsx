import React, { useEffect, useMemo, useState } from "react";
import { invokeBackend } from "./api";
import { supabase } from "./integrations/supabase/client"; // Make sure this path matches your project setup

// --- Types & Config ---
type TemplateDef = {
  key: string;
  title: string;
  file: string;
  description: string;
  columns: string[];
};

const templates: TemplateDef[] = [
  {
    key: "data-entry",
    title: "Data Entry Upload",
    file: "britium_data_entry_template.csv",
    description: "Pickup request, merchant/customer, recipient, parcel, tariff, Pickup ID, Deliver ID, Invoice No, Waybill No.",
    columns: [
      "row_no", "requester_type", "merchant_id", "merchant_code", "merchant_sender_name",
      "sender_phone", "pickup_address", "pickup_township", "pickup_city", "pickup_date",
      "pickup_time", "pickup_parcel_count", "weight_kg", "item_value", "pickup_id",
      "deliver_id", "invoice_no", "waybill_no", "recipient_name", "recipient_phone",
      "delivery_township", "delivery_address", "delivery_fee", "extra_weight_fee",
      "prepaid_amount", "cod_amount", "destination", "payment_method", "service_type",
      "priority", "pickup_by_1", "pickup_by_2", "remarks", "upload_status", "api_message",
    ],
  },
];

function readRoute() {
  return (window.location.hash || "#/dashboard").replace(/^#\/?/, "").replace(/^\//, "") || "dashboard";
}

function downloadCsv(filename: string, columns: string[]) {
  const sample = columns.map((col) => (col === "row_no" ? "1" : ""));
  const csv = [columns.join(","), sample.map((v) => `"${v}"`).join(",")].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ==========================================
// AUTH STATE MANAGEMENT (Live Supabase Auth)
// ==========================================
export default function App() {
  const [session, setSession] = useState<{ user: string; role: string } | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession({ user: session.user.email || "", role: "Admin" });
      }
      setIsInitializing(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSession({ user: session.user.email || "", role: "Admin" });
      } else {
        setSession(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (isInitializing) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "white" }}>Initializing Security...</div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <EnterprisePortal 
      user={session} 
      onLogout={async () => {
        await supabase.auth.signOut();
        setSession(null);
      }} 
    />
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }
    
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "white" }}>
      <form onSubmit={handleLogin} style={{ background: "#1e293b", padding: 40, borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)" }}>
        <h1 style={{ color: "#f97316", margin: "0 0 8px", fontSize: 24 }}>Britium Express</h1>
        <p style={{ color: "#94a3b8", margin: "0 0 24px" }}>Enterprise Portal UAT Login</p>
        
        {error && <div style={{ background: "#fef2f2", color: "#991b1b", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

        <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: "bold" }}>Email Address</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...styles.input, background: "#0f172a", color: "white", border: "1px solid #334155", marginBottom: 16 }} required />
        
        <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: "bold" }}>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...styles.input, background: "#0f172a", color: "white", border: "1px solid #334155", marginBottom: 24 }} required />
        
        <button type="submit" style={{ ...styles.orangeButton, width: "100%", padding: 14 }} disabled={loading}>
          {loading ? "Authenticating..." : "Secure Login"}
        </button>
      </form>
    </div>
  );
}

// ==========================================
// MAIN ENTERPRISE SHELL
// ==========================================
function EnterprisePortal({ user, onLogout }: { user: any; onLogout: () => void }) {
  const [route, setRoute] = useState(readRoute());

  useEffect(() => {
    const sync = () => setRoute(readRoute());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const go = (nextRoute: string) => {
    const clean = nextRoute.replace(/^#\/?/, "").replace(/^\//, "");
    setRoute(clean);
    window.location.hash = `/${clean}`;
  };

  const content = useMemo(() => {
    switch (route) {
      case "dashboard": return <Dashboard />;
      case "branch-office": return <BranchOffice />;
      case "create-delivery": return <CreateDeliveryTemplate />;
      case "way-management": return <WayManagement />;
      case "warehouse-scan": return <WarehouseScan />;
      case "dispatch-board": return <DispatchBoard />;
      case "waybill-queue": return <WaybillQueue />;
      case "finance-invoices": return <FinanceInvoices />;
      case "reporting": return <ReportingPage />;
      case "data-entry-upload": return <UploadPage title="Bulk Upload (Legacy)" template={templates[0]} />;
      case "system-settings": return <SystemSettings />;
      case "mobile-simulator": return <MobileSimulator />;
      case "readiness": return <ReadinessCenter go={go} />;
      default: return <Dashboard />;
    }
  }, [route]);

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <h1 style={styles.brand}>Britium UAT</h1>
        <p style={styles.sidebarText}>Logged in as: <strong>{user.role}</strong></p>

        <NavButton active={route === "dashboard"} onClick={() => go("dashboard")}>Live KPI Dashboard</NavButton>
        <NavButton active={route === "branch-office"} onClick={() => go("branch-office")}>Branch Office</NavButton>
        
        <div style={{ marginTop: 15, marginBottom: 10, borderBottom: "1px solid #334155" }} />
        
        <NavButton active={route === "create-delivery"} onClick={() => go("create-delivery")}>Create Delivery (Web)</NavButton>
        <NavButton active={route === "way-management"} onClick={() => go("way-management")}>Way Management</NavButton>
        <NavButton active={route === "warehouse-scan"} onClick={() => go("warehouse-scan")}>Warehouse Scan</NavButton>
        <NavButton active={route === "dispatch-board"} onClick={() => go("dispatch-board")}>Live Dispatch</NavButton>
        
        <div style={{ marginTop: 15, marginBottom: 10, borderBottom: "1px solid #334155" }} />
        
        <NavButton active={route === "mobile-simulator"} onClick={() => go("mobile-simulator")}>📱 Mobile App Sandbox</NavButton>
        
        <div style={{ marginTop: 15, marginBottom: 10, borderBottom: "1px solid #334155" }} />
        
        <NavButton active={route === "waybill-queue"} onClick={() => go("waybill-queue")}>Label / Waybill Queue</NavButton>
        <NavButton active={route === "finance-invoices"} onClick={() => go("finance-invoices")}>Finance Invoices</NavButton>
        <NavButton active={route === "reporting"} onClick={() => go("reporting")}>Operational Reports</NavButton>
        
        <div style={{ marginTop: 15, marginBottom: 10, borderBottom: "1px solid #334155" }} />

        <NavButton active={route === "data-entry-upload"} onClick={() => go("data-entry-upload")}>Bulk Upload (CSV)</NavButton>
        <NavButton active={route === "system-settings"} onClick={() => go("system-settings")}>System Settings</NavButton>
        <NavButton active={route === "readiness"} onClick={() => go("readiness")}>Readiness Status</NavButton>
        
        <button onClick={onLogout} style={{ ...styles.navButton, marginTop: 20, color: "#f87171" }}>Log Out</button>
      </aside>

      <main style={styles.main}>{content}</main>
    </div>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ ...styles.navButton, ...(active ? styles.navButtonActive : {}) }}>
      {children}
    </button>
  );
}

// ==========================================
// A. Live KPI Dashboard
// ==========================================
function Dashboard() {
  const [kpis, setKpis] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);

  useEffect(() => {
    invokeBackend<any>("be_dashboard_kpi_today").then(res => { if (res.success) setKpis(res.data); });
    invokeBackend<any>("be_dashboard_activity_feed", { p_limit: 10 }).then(res => { if (res.success) setFeed(res.data); });
  }, []);

  return (
    <>
      <h1 style={styles.pageTitle}>Live KPI Dashboard</h1>
      <p style={styles.lead}>Real-time overview of network health.</p>

      <div style={styles.statusGrid}>
        <StatusCard title="Pickups Today" value={kpis?.total_pickups_today ?? "..."} />
        <StatusCard title="Pending Assignment" value={kpis?.pending_pickups ?? "..."} />
        <StatusCard title="Active Shipments" value={kpis?.active_shipments ?? "..."} />
        <StatusCard title="Delivered Today" value={kpis?.delivered_today ?? "..."} />
        <StatusCard title="Pending COD" value={`${kpis?.pending_cod ?? "0"} Ks`} />
        <StatusCard title="Exceptions Open" value={kpis?.exceptions_open ?? "..."} />
      </div>

      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>Recent Activity Feed</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {feed?.map((item, i) => (
            <li key={i} style={{ padding: "10px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong style={{ color: "#2563eb" }}>{item.pickup_id}</strong>
                <span style={{ fontSize: 12, color: "#64748b" }}>{new Date(item.created_at).toLocaleTimeString()}</span>
              </div>
              <div style={{ fontSize: 14 }}>
                <span style={styles.badge}>{item.event_type}</span> {item.description}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Merchant: {item.merchant_name} | Role: {item.actor_role}</div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ==========================================
// B. Branch Office Snapshot
// ==========================================
function BranchOffice() {
  const [branchCode, setBranchCode] = useState("MDY");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchBranch = async () => {
    setLoading(true);
    const res = await invokeBackend<any>("be_branch_snapshot", { p_branch: branchCode });
    if (res.success) setSnapshot(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchBranch(); }, [branchCode]);

  return (
    <>
      <h1 style={styles.pageTitle}>Branch Office Dashboard</h1>
      <p style={styles.lead}>Regional manager view for branch-specific volume and staff availability.</p>

      <section style={{...styles.panel, background: "#f8fafc", padding: 16, marginBottom: 20}}>
        <label style={styles.label}>Select Branch</label>
        <select value={branchCode} onChange={e => setBranchCode(e.target.value)} style={{...styles.input, width: 200, display: "inline-block", marginRight: 10}}>
          <option value="YGN">Yangon (YGN)</option>
          <option value="MDY">Mandalay (MDY)</option>
          <option value="NPT">Naypyitaw (NPT)</option>
        </select>
        <button onClick={fetchBranch} style={styles.blueButton} disabled={loading}>Refresh</button>
      </section>

      {snapshot && (
        <>
          <h2 style={{ marginTop: 24 }}>Today's Overview</h2>
          <div style={styles.statusGrid}>
            <StatusCard title="New Shipments" value={snapshot.today?.new_shipments || 0} />
            <StatusCard title="In Transit" value={snapshot.today?.in_transit || 0} />
            <StatusCard title="Delivered" value={snapshot.today?.delivered || 0} />
            <StatusCard title="Revenue (Delivered)" value={`${snapshot.today?.revenue || 0} Ks`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
            <section style={styles.panel}>
              <h2 style={styles.sectionTitle}>Branch Staff (Active)</h2>
              <ul style={{ paddingLeft: 20, fontSize: 14 }}>
                {snapshot.staff?.map((s: any) => (
                  <li key={s.user_id}><strong>{s.full_name}</strong> - <span style={{color: "#64748b"}}>{s.role}</span></li>
                ))}
              </ul>
            </section>
            <section style={styles.panel}>
              <h2 style={styles.sectionTitle}>Recent Branch Shipments</h2>
              <ul style={{ paddingLeft: 20, fontSize: 14 }}>
                {snapshot.recent_shipments?.map((s: any) => (
                  <li key={s.pickup_id}><strong>{s.pickup_id}</strong>: {s.status}</li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}

// ==========================================
// C. Dispatch Center
// ==========================================
function DispatchBoard() {
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [selectedPickups, setSelectedPickups] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [routeLabel, setRouteLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchDispatchData = async () => {
    setLoading(true);
    const unRes = await invokeBackend<any>("be_dispatch_unassigned", { p_limit: 100 });
    const wfRes = await invokeBackend<any>("be_dispatch_workforce");
    if (unRes.success) setUnassigned(unRes.data || []);
    if (wfRes.success) setWorkforce(wfRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDispatchData(); }, []);

  const toggleSelect = (id: string) => {
    setSelectedPickups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleAssign = async () => {
    if (selectedPickups.length === 0 || !selectedAssignee) return alert("Select shipments and an assignee.");
    
    const worker = workforce.find(w => w.user_id === selectedAssignee);
    const res = await invokeBackend<any>("be_dispatch_assign", {
      p_pickup_ids: selectedPickups,
      p_assignee_id: worker.user_id,
      p_assignee_name: worker.full_name,
      p_route_label: routeLabel || "Auto-Route"
    });

    if (res.success) {
      alert(`Successfully assigned ${res.data.assigned} shipments to ${res.data.assignee}.`);
      setSelectedPickups([]);
      setRouteLabel("");
      setSelectedAssignee("");
      fetchDispatchData();
    } else {
      alert(`Error: ${res.error}`);
    }
  };

  return (
    <>
      <h1 style={styles.pageTitle}>Live Dispatch Center</h1>
      <p style={styles.lead}>Assign unassigned warehouse shipments to active riders/drivers to generate live routes.</p>
      
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <section style={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{...styles.sectionTitle, margin: 0}}>Unassigned Shipments ({unassigned.length})</h2>
            <button style={styles.blueButton} onClick={fetchDispatchData} disabled={loading}>Refresh</button>
          </div>
          
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #cbd5e1" }}>
                <th><input type="checkbox" onChange={(e) => setSelectedPickups(e.target.checked ? unassigned.map(u => u.pickup_id) : [])} /></th>
                <th style={{ padding: 8 }}>Pickup ID</th>
                <th style={{ padding: 8 }}>Recipient Address</th>
                <th style={{ padding: 8 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map((u, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td><input type="checkbox" checked={selectedPickups.includes(u.pickup_id)} onChange={() => toggleSelect(u.pickup_id)} /></td>
                  <td style={{ padding: 8, fontWeight: "bold" }}>{u.pickup_id}</td>
                  <td style={{ padding: 8 }}>{u.delivery_address}, {u.delivery_township}</td>
                  <td style={{ padding: 8 }}><span style={styles.badge}>{u.status}</span></td>
                </tr>
              ))}
              {unassigned.length === 0 && <tr><td colSpan={4} style={{padding: 20, textAlign: "center"}}>All clear! No pending dispatches.</td></tr>}
            </tbody>
          </table>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Assign Route</h2>
          <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: "bold" }}>{selectedPickups.length} Shipments Selected</p>
            
            <label style={styles.label}>Select Rider / Driver</label>
            <select value={selectedAssignee} onChange={e => setSelectedAssignee(e.target.value)} style={styles.input}>
              <option value="">-- Choose Assignee --</option>
              {workforce.map(w => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name} ({w.role}) - {w.active_assignments} Active Jobs
                </option>
              ))}
            </select>

            <label style={styles.label}>Route Label (Optional)</label>
            <input value={routeLabel} onChange={e => setRouteLabel(e.target.value)} placeholder="e.g. Zone 1 Morning" style={styles.input} />

            <button onClick={handleAssign} style={{...styles.orangeButton, width: "100%", marginTop: 20}} disabled={selectedPickups.length === 0 || !selectedAssignee}>
              Confirm Dispatch Assignment
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

// ==========================================
// D. System Settings & Rules
// ==========================================
function SystemSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  const fetchSettings = async () => {
    setLoading(true);
    const res = await invokeBackend<any>("be_settings_get_all");
    if (res.success) setSettings(res.data);
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleUpdateTariff = async (tier: string, newBaseFee: number) => {
    const res = await invokeBackend<any>("be_settings_update_tariff", { p_tier: tier, p_base_fee: newBaseFee });
    if (res.success) {
      setUpdateMsg(`Successfully updated ${tier} tariff.`);
      fetchSettings();
    } else {
      setUpdateMsg(`Error: ${res.error}`);
    }
    setTimeout(() => setUpdateMsg(""), 3000);
  };

  return (
    <>
      <h1 style={styles.pageTitle}>System Settings & Configuration</h1>
      <p style={styles.lead}>Manage global enterprise rules, including base tariffs and operational limits.</p>

      {updateMsg && <div style={{ background: "#dcfce7", color: "#065f46", padding: 12, borderRadius: 8, marginBottom: 16 }}>{updateMsg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <section style={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{...styles.sectionTitle, margin: 0}}>Active Tariff Rules</h2>
            <button style={styles.blueButton} onClick={fetchSettings} disabled={loading}>Reload</button>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #cbd5e1" }}>
                <th style={{ padding: 10 }}>Service Tier</th>
                <th style={{ padding: 10 }}>Base Fee (Ks)</th>
                <th style={{ padding: 10 }}>Extra Wgt (Ks/kg)</th>
                <th style={{ padding: 10 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {settings?.tariffs ? settings.tariffs.map((t: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: 10, fontWeight: "bold" }}>{t.tier_name}</td>
                  <td style={{ padding: 10 }}>
                    <input 
                      type="number" 
                      defaultValue={t.base_fee} 
                      style={{...styles.input, width: "80px", marginTop: 0}} 
                      onBlur={(e) => handleUpdateTariff(t.tier_name, Number(e.target.value))}
                    />
                  </td>
                  <td style={{ padding: 10 }}>{t.extra_weight_fee}</td>
                  <td style={{ padding: 10 }}><span style={{fontSize: 12, color: "#64748b"}}>Edit to Save</span></td>
                </tr>
              )) : <tr><td colSpan={4} style={{padding: 10}}>Loading tariffs...</td></tr>}
            </tbody>
          </table>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Global Constraints</h2>
          <div style={styles.statusGrid}>
            <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8 }}>
              <strong>Max Parcel Weight (kg)</strong>
              <input type="number" defaultValue={settings?.constraints?.max_weight || 50} style={styles.input} disabled />
            </div>
            <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8 }}>
              <strong>Default Grace Period (Days)</strong>
              <input type="number" defaultValue={settings?.constraints?.grace_period_days || 3} style={styles.input} disabled />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 16 }}>* Additional system configurations are locked during UAT phase to ensure data consistency across operations.</p>
        </section>
      </div>
    </>
  );
}

// ==========================================
// E. Mobile App Simulator (Sandbox)
// ==========================================
function MobileSimulator() {
  const [form, setForm] = useState({
    pickup_id: "",
    event_type: "DELIVERED",
    lat: "16.8409",
    lng: "96.1735",
    proof_url: "https://example.com/mock-signature.png",
    cod_collected: "0",
    notes: "UAT Field Simulation"
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate the Rider App sending a strict event payload to the backend
    const res = await invokeBackend<any>("be_logistics_apply_workflow_event_strict", {
      p_tracking_reference: form.pickup_id.trim(),
      p_event_code: form.event_type,
      p_operator_id: "SIMULATED-RIDER-001",
      p_gps_lat: parseFloat(form.lat),
      p_gps_lng: parseFloat(form.lng),
      p_proof_url: form.proof_url,
      p_cod_collected: parseFloat(form.cod_collected),
      p_notes: form.notes
    });

    setResult(res);
    setLoading(false);
  };

  return (
    <>
      <h1 style={styles.pageTitle}>📱 Mobile App Sandbox</h1>
      <p style={styles.lead}>Simulate Rider App API payloads to test field exceptions, GPS logging, and COD cash capture logic.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Simulate Field Action</h2>
          <form onSubmit={handleSimulate}>
            <label style={styles.label}>Tracking Number / Pickup ID</label>
            <input value={form.pickup_id} onChange={e=>setForm({...form, pickup_id: e.target.value})} placeholder="P0611-POC-003" style={styles.input} required />

            <label style={styles.label}>Action / Status Code</label>
            <select value={form.event_type} onChange={e=>setForm({...form, event_type: e.target.value})} style={styles.input}>
              <optgroup label="Success States">
                <option value="PICKUP_COMPLETED">PICKUP_COMPLETED (Rider collected parcel)</option>
                <option value="DELIVERED">DELIVERED (Rider completed delivery)</option>
              </optgroup>
              <optgroup label="Exception States">
                <option value="DELIVERY_FAILED">DELIVERY_FAILED</option>
                <option value="CUSTOMER_NOT_AVAILABLE">CUSTOMER_NOT_AVAILABLE</option>
                <option value="WRONG_ADDRESS">WRONG_ADDRESS</option>
              </optgroup>
            </select>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={styles.label}>GPS Latitude</label>
                <input value={form.lat} onChange={e=>setForm({...form, lat: e.target.value})} style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>GPS Longitude</label>
                <input value={form.lng} onChange={e=>setForm({...form, lng: e.target.value})} style={styles.input} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={styles.label}>COD Collected (Ks)</label>
                <input type="number" value={form.cod_collected} onChange={e=>setForm({...form, cod_collected: e.target.value})} style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Proof URL (Photo/Sig)</label>
                <input value={form.proof_url} onChange={e=>setForm({...form, proof_url: e.target.value})} style={styles.input} />
              </div>
            </div>

            <label style={styles.label}>Rider Notes</label>
            <input value={form.notes} onChange={e=>setForm({...form, notes: e.target.value})} style={styles.input} />

            <button type="submit" style={{ ...styles.blueButton, width: "100%", marginTop: 24, padding: 14 }} disabled={loading || !form.pickup_id}>
              {loading ? "Transmitting..." : "Send Payload to Backend"}
            </button>
          </form>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>API Response</h2>
          {result ? (
            <div style={{ padding: 16, background: result.success ? "#ecfdf5" : "#fef2f2", borderRadius: 8, border: `1px solid ${result.success ? "#10b981" : "#ef4444"}` }}>
              <div style={{ fontWeight: "bold", color: result.success ? "#065f46" : "#991b1b", marginBottom: 8 }}>
                {result.success ? "✅ Event Successfully Processed" : "❌ Backend Validation Failed"}
              </div>
              <pre style={{ margin: 0, fontSize: 12, overflowX: "auto" }}>{JSON.stringify(result, null, 2)}</pre>
            </div>
          ) : (
            <div style={{ color: "#64748b", fontSize: 14 }}>Awaiting transmission...</div>
          )}

          <div style={{ marginTop: 24, padding: 16, background: "#f8fafc", borderRadius: 8 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>How this tests the backend:</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#475569" }}>
              <li>Submitting <strong style={{color:"#059669"}}>DELIVERED</strong> updates Way Management and pushes the record to the Finance Invoice queue.</li>
              <li>Submitting <strong style={{color:"#dc2626"}}>CUSTOMER_NOT_AVAILABLE</strong> triggers an Exception hold, preventing settlement until CS resolves it.</li>
              <li>The GPS coordinates mimic physical Rider presence checks required for Proof of Delivery.</li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}

// ==========================================
// F. Additional Components
// ==========================================
function CreateDeliveryTemplate() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [recentPickups, setRecentPickups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tariff, setTariff] = useState<any>(null);

  const [form, setForm] = useState({
    merchant_id: "", merchant_code: "", merchant_name: "", sender_phone: "", pickup_address: "", pickup_township: "", pickup_city: "",
    recipient_name: "", recipient_phone: "", delivery_township: "", delivery_address: "",
    weight_kg: "1", service_tier: "Standard", cod_amount: "0", payment_method: "COD", highway_dropoff: false
  });

  useEffect(() => {
    async function loadInitial() {
      const merRes = await invokeBackend<any>("be_get_merchants_dropdown");
      if (merRes.success) setMerchants(merRes.data || []);
      loadRecent();
    }
    loadInitial();
  }, []);

  const loadRecent = async () => {
    const wayRes = await invokeBackend<any>("be_way_management_list", { p_limit: 5, p_offset: 0 });
    if (wayRes.success) setRecentPickups(wayRes.data.rows || []);
  };

  const handleMerchantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    const selected = merchants.find(m => m.merchant_code === code);
    if (selected) {
      setForm({
        ...form,
        merchant_id: selected.merchant_id, merchant_code: selected.merchant_code, merchant_name: selected.merchant_name,
        sender_phone: selected.contact_phone || "", pickup_address: selected.pickup_address || "", pickup_township: selected.pickup_township || "", pickup_city: selected.pickup_city || "Yangon"
      });
    } else {
      setForm({ ...form, merchant_code: "" });
    }
  };

  const handleCalculateTariff = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    const res = await invokeBackend<any>("be_calculate_tariff", { p_tier: form.service_tier, p_weight: parseFloat(form.weight_kg) || 1, p_highway: form.highway_dropoff });
    if (res.success) setTariff(res.data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await invokeBackend<any>("be_create_delivery", { p_payload: form });
    if (res.success) {
      alert(`Success! Created Pickup ID: ${res.data.pickup_id}`);
      setForm({ ...form, recipient_name: "", recipient_phone: "", delivery_township: "", delivery_address: "", cod_amount: "0" });
      loadRecent();
    } else {
      alert(`Error: ${res.error}`);
    }
    setLoading(false);
  };

  return (
    <>
      <h1 style={styles.pageTitle}>Create Delivery (Web Template)</h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
        <section style={styles.panel}>
          <form onSubmit={handleSubmit}>
            <h3 style={{ marginTop: 0 }}>1. Origin & Masterdata Auto-fill</h3>
            <div style={styles.statusGrid}>
              <div><label style={styles.label}>Select Merchant</label><select value={form.merchant_code} onChange={handleMerchantChange} style={styles.input} required><option value="">-- Choose Merchant --</option>{merchants.map(m => <option key={m.merchant_code} value={m.merchant_code}>{m.merchant_name} ({m.merchant_code})</option>)}</select></div>
              <div><label style={styles.label}>Sender Phone</label><input value={form.sender_phone} readOnly style={{...styles.input, background:"#f1f5f9"}} /></div>
              <div><label style={styles.label}>Pickup Address</label><input value={form.pickup_address} readOnly style={{...styles.input, background:"#f1f5f9"}} /></div>
            </div>
            <h3 style={{ marginTop: 24 }}>2. Destination Details</h3>
            <div style={styles.statusGrid}>
              <div><label style={styles.label}>Recipient Name</label><input value={form.recipient_name} onChange={e=>setForm({...form, recipient_name: e.target.value})} style={styles.input} required /></div>
              <div><label style={styles.label}>Recipient Phone</label><input value={form.recipient_phone} onChange={e=>setForm({...form, recipient_phone: e.target.value})} placeholder="09..." style={styles.input} required pattern="^(09|\+959)[0-9]{7,9}$" /></div>
              <div><label style={styles.label}>Delivery Township</label><input value={form.delivery_township} onChange={e=>setForm({...form, delivery_township: e.target.value})} style={styles.input} required /></div>
            </div>
            <h3 style={{ marginTop: 24 }}>3. Commercials & Tariff</h3>
            <div style={styles.statusGrid}>
              <div><label style={styles.label}>Weight (kg)</label><input type="number" step="0.1" value={form.weight_kg} onChange={e=>setForm({...form, weight_kg: e.target.value})} style={styles.input} required /></div>
              <div><label style={styles.label}>Service Tier</label><select value={form.service_tier} onChange={e=>setForm({...form, service_tier: e.target.value})} style={styles.input}><option value="Standard">Standard</option><option value="Royal">Royal</option></select></div>
              <div><label style={styles.label}>Payment Method</label><select value={form.payment_method} onChange={e=>setForm({...form, payment_method: e.target.value})} style={styles.input}><option value="COD">COD</option><option value="Prepaid">Prepaid</option></select></div>
              <div><label style={styles.label}>COD Amount (MMK)</label><input type="number" value={form.cod_amount} onChange={e=>setForm({...form, cod_amount: e.target.value})} style={styles.input} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20, alignItems: "center" }}>
              <button type="button" onClick={handleCalculateTariff} style={styles.blueButton}>Preview Tariff</button>
              {tariff && <span style={{ fontWeight: "bold", color: "#059669" }}>Calculated Fee: {tariff.total} MMK</span>}
            </div>
            <div style={{ marginTop: 24, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
              <button type="submit" style={{...styles.orangeButton, width: "100%", padding: 14, fontSize: 16}} disabled={loading || !form.merchant_code}>{loading ? "Creating..." : "Create Delivery"}</button>
            </div>
          </form>
        </section>
        <section style={{...styles.panel, marginTop: 0}}>
          <h3 style={{ marginTop: 0 }}>Recent Creations</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
            {recentPickups.map((p, i) => (
              <li key={i} style={{ padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}>
                <strong style={{color: "#2563eb"}}>{p.pickup_id}</strong><br/>
                {p.merchant_name} &rarr; {p.recipient_name}<br/>
                <span style={{color: "#059669"}}>{p.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function WayManagement() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedWay, setSelectedWay] = useState<string | null>(null);

  const fetchWays = async (e?: React.FormEvent) => {
    if(e) e.preventDefault();
    const res = await invokeBackend<any>("be_way_management_list", { p_search: search, p_limit: 50 });
    if (res.success) setRows(res.data.rows || []);
  };

  useEffect(() => { fetchWays(); }, []);

  if (selectedWay) return <WayDetail pickupId={selectedWay} onBack={() => { setSelectedWay(null); fetchWays(); }} />;

  return (
    <>
      <h1 style={styles.pageTitle}>Way Management (Control Tower)</h1>
      <section style={{...styles.panel, background: "#f8fafc", padding: 16, marginBottom: 20}}>
        <form onSubmit={fetchWays} style={{ display: "flex", gap: 10 }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Tracking No..." style={{...styles.input, marginTop: 0, flex: 1}} />
          <button type="submit" style={styles.blueButton}>Search</button>
        </form>
      </section>
      <section style={styles.panel}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #cbd5e1" }}>
              <th style={{ padding: 10 }}>Pickup ID</th>
              <th style={{ padding: 10 }}>Merchant</th>
              <th style={{ padding: 10 }}>Recipient</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 10, fontWeight: "bold" }}>{r.pickup_id}</td>
                <td style={{ padding: 10 }}>{r.merchant_name}</td>
                <td style={{ padding: 10 }}>{r.recipient_name}</td>
                <td style={{ padding: 10 }}><span style={styles.badge}>{r.status}</span></td>
                <td style={{ padding: 10 }}><button onClick={() => setSelectedWay(r.pickup_id)} style={{...styles.blueButton, padding: "6px 12px", fontSize: 12}}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function WayDetail({ pickupId, onBack }: { pickupId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");

  const loadDetail = async () => {
    const res = await invokeBackend<any>("be_way_management_detail", { p_pickup_id: pickupId });
    if (res.success) setDetail(res.data);
  };

  useEffect(() => { loadDetail(); }, [pickupId]);

  const handleUpdateStatus = async () => {
    if (!newStatus || !reason) return alert("Select a status and enter a reason.");
    await invokeBackend<any>("be_way_update_status", { p_pickup_id: pickupId, p_status: newStatus, p_reason: reason });
    setNewStatus(""); setReason(""); loadDetail();
  };

  if (!detail) return <p>Loading details...</p>;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <button onClick={onBack} style={{...styles.orangeButton, background: "#64748b"}}>← Back</button>
        <h1 style={{ margin: 0 }}>Managing: {pickupId}</h1>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Shipment Details</h2>
          <p><strong>Merchant:</strong> {detail.shipment.merchant_name}</p>
          <p><strong>Recipient:</strong> {detail.shipment.recipient_name}</p>
          <p><strong>Status:</strong> <span style={styles.badge}>{detail.shipment.status}</span></p>
          <h3 style={{ marginTop: 24 }}>Force Status Update</h3>
          <select value={newStatus} onChange={e=>setNewStatus(e.target.value)} style={styles.input}>
            <option value="">-- Select Status --</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="FAILED_ATTEMPT">FAILED ATTEMPT</option>
          </select>
          <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason..." style={styles.input} />
          <button onClick={handleUpdateStatus} style={{...styles.blueButton, marginTop: 10, width: "100%"}}>Apply Status</button>
        </section>
        <section style={styles.panel}>
          <h2 style={styles.sectionTitle}>Timeline</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {detail.events.map((e:any, i:number) => (
              <li key={i} style={{ padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>{new Date(e.created_at).toLocaleString()}</span><br/>
                <strong>{e.event_type}</strong>: {e.description}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function WarehouseScan() {
  const [scan, setScan] = useState("");
  const [history, setHistory] = useState<any[]>([]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scan.trim()) return;
    const res = await invokeBackend<any>("be_warehouse_intake_scan", { p_tracking_reference: scan.trim(), p_operator_id: "UAT-TEST", p_branch_code: "MDY" });
    setHistory(prev => [{ val: scan, ok: res.success, msg: res.success ? "Success" : res.error }, ...prev].slice(0, 10));
    setScan("");
  };

  return (
    <>
      <h1 style={styles.pageTitle}>Warehouse Scan</h1>
      <section style={styles.panel}>
        <form onSubmit={handleScan} style={{ display: "flex", gap: 8 }}>
          <input value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan Barcode..." style={styles.input} autoFocus />
          <button style={styles.orangeButton}>Confirm</button>
        </form>
        <ul style={{ marginTop: 20 }}>{history.map((h, i) => <li key={i} style={{ color: h.ok ? "green" : "red" }}>{h.val} - {h.msg}</li>)}</ul>
      </section>
    </>
  );
}

function WaybillQueue() {
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchQueue = async () => {
    setLoading(true);
    const res = await invokeBackend<any>("be_label_queue", { p_limit: 50 });
    if (res.success) setQueue(res.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchQueue(); }, []);

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const markPrinted = async () => {
    if (selected.length === 0) return;
    const res = await invokeBackend<any>("be_mark_waybill_printed", { p_pickup_ids: selected });
    if (res.success) {
      alert(`Marked ${res.data.updated} waybills as printed.`);
      setSelected([]);
      fetchQueue();
    }
  };

  return (
    <>
      <h1 style={styles.pageTitle}>Label / Waybill Queue</h1>
      <section style={styles.panel}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <button style={styles.blueButton} onClick={fetchQueue} disabled={loading}>Refresh Queue</button>
          <button style={styles.orangeButton} onClick={markPrinted} disabled={selected.length === 0}>Mark Selected as Printed ({selected.length})</button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #cbd5e1" }}>
              <th><input type="checkbox" onChange={(e) => setSelected(e.target.checked ? queue.map(q => q.pickup_id) : [])} /></th>
              <th style={{ padding: 10 }}>Waybill No</th>
              <th style={{ padding: 10 }}>Merchant</th>
              <th style={{ padding: 10 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((q, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td><input type="checkbox" checked={selected.includes(q.pickup_id)} onChange={() => toggleSelect(q.pickup_id)} /></td>
                <td style={{ padding: 10, fontWeight: "bold" }}>{q.waybill_no}</td>
                <td style={{ padding: 10 }}>{q.merchant_name}</td>
                <td style={{ padding: 10 }}>{q.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function FinanceInvoices() {
  const [invoices, setInvoices] = useState<any[]>([]);

  const fetchInvoices = async () => {
    const res = await invokeBackend<any>("be_invoice_list", { p_limit: 50 });
    if (res.success) setInvoices(res.data || []);
  };

  useEffect(() => { fetchInvoices(); }, []);

  const approveInvoice = async (pickupId: string, approved: boolean) => {
    const res = await invokeBackend<any>("be_invoice_approve", { p_pickup_id: pickupId, p_approved: approved, p_notes: "UAT Approval" });
    if (res.success) fetchInvoices();
  };

  return (
    <>
      <h1 style={styles.pageTitle}>Finance Invoices</h1>
      <section style={styles.panel}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #cbd5e1" }}>
              <th style={{ padding: 10 }}>Invoice No</th>
              <th style={{ padding: 10 }}>Merchant</th>
              <th style={{ padding: 10 }}>Delivery Fee</th>
              <th style={{ padding: 10 }}>COD</th>
              <th style={{ padding: 10 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 10, fontWeight: "bold" }}>{inv.invoice_no}</td>
                <td style={{ padding: 10 }}>{inv.merchant_name}</td>
                <td style={{ padding: 10 }}>{inv.delivery_fee} Ks</td>
                <td style={{ padding: 10, color: "#059669", fontWeight: "bold" }}>{inv.cod_amount} Ks</td>
                <td style={{ padding: 10 }}>
                  {inv.invoice_approved === null ? (
                    <>
                      <button onClick={() => approveInvoice(inv.pickup_id, true)} style={{ ...styles.blueButton, padding: "6px 10px", fontSize: 12, marginRight: 4 }}>Approve</button>
                      <button onClick={() => approveInvoice(inv.pickup_id, false)} style={{ ...styles.orangeButton, padding: "6px 10px", fontSize: 12, background: "#dc2626" }}>Reject</button>
                    </>
                  ) : inv.invoice_approved ? "Approved" : "Rejected"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function ReportingPage() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10), branch: "" });

  const generateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await invokeBackend<any>("be_report_operational", { p_from: filters.from, p_to: filters.to, p_branch: filters.branch || null });
    if (res.success) setReport(res.data);
    setLoading(false);
  };

  return (
    <>
      <h1 style={styles.pageTitle}>Operational Reports</h1>
      <section style={{...styles.panel, background: "#f8fafc", padding: 16, marginBottom: 20}}>
        <form onSubmit={generateReport} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div><label style={styles.label}>Date From</label><input type="date" value={filters.from} onChange={e=>setFilters({...filters, from: e.target.value})} style={styles.input} required /></div>
          <div><label style={styles.label}>Date To</label><input type="date" value={filters.to} onChange={e=>setFilters({...filters, to: e.target.value})} style={styles.input} required /></div>
          <div><label style={styles.label}>Branch</label><select value={filters.branch} onChange={e=>setFilters({...filters, branch: e.target.value})} style={styles.input}><option value="">ALL Branches</option><option value="YGN">YGN</option></select></div>
          <button type="submit" style={styles.orangeButton} disabled={loading}>{loading ? "Generating..." : "Generate Report"}</button>
        </form>
      </section>
      {report && (
        <div style={styles.statusGrid}>
          <StatusCard title="Total Shipments" value={report.totals?.total_shipments || 0} />
          <StatusCard title="Delivered" value={report.totals?.delivered || 0} />
          <StatusCard title="Delivery Rate" value={`${report.totals?.delivery_rate_pct || 0}%`} />
        </div>
      )}
    </>
  );
}

function UploadPage({ title, template }: { title: string; template: TemplateDef }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return;
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const parsed = lines.slice(1).map(line => {
      const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""));
      return headers.reduce((acc, h, i) => ({ ...acc, [h]: cols[i] || null }), {});
    });
    setRows(parsed);
  };

  const submitBatch = async () => {
    const res = await invokeBackend<any>("be_bulk_submit_batch", { p_rows: rows, p_filename: fileName });
    if (res.success) setResult(res.data);
  };

  return (
    <>
      <h1 style={styles.pageTitle}>{title}</h1>
      <section style={styles.panel}>
        <button style={styles.orangeButton} onClick={() => downloadCsv(template.file, template.columns)}>Download Format</button>
        <br/><br/>
        <input type="file" accept=".csv" onChange={onUpload} style={styles.input} />
        {rows.length > 0 && !result && <button style={{...styles.blueButton, marginTop: 16}} onClick={submitBatch}>Sync to Backend</button>}
        {result && <pre style={{marginTop: 16, padding: 12, background: "#f8fafc"}}>{JSON.stringify(result, null, 2)}</pre>}
      </section>
    </>
  );
}

function ReadinessCenter({ go }: { go: (route: string) => void }) {
  const [masterData, setMasterData] = useState<any>(null);
  useEffect(() => { invokeBackend<any>("be_master_dropdown_snapshot", { p_lang: "en" }).then(res => { if (res.success) setMasterData(res.data); }); }, []);
  return (
    <>
      <h1 style={styles.pageTitle}>Go-Live Readiness Center</h1>
      <div style={styles.statusGrid}>
        <StatusCard title="Active Merchants" value={masterData?.counts?.merchants ?? "..."} />
        <StatusCard title="Active Riders" value={masterData?.counts?.riders ?? "..."} />
      </div>
      <section style={styles.panel}>
        <h2 style={styles.sectionTitle}>UAT Module Checklist</h2>
        <ul style={styles.list}>
          <li>✅ Gateway Security (Auth State Management)</li>
          <li>✅ Mobile Simulation Sandbox</li>
          <li>✅ Master Data Sync</li>
          <li>✅ Web Template Auto-fill & Tariffs</li>
          <li>✅ Way Management, Detail, & Exceptions</li>
          <li>✅ Warehouse Scanning</li>
          <li>✅ Dispatch & Branch Control</li>
          <li>✅ Finance & Waybill Queues</li>
          <li>✅ Reporting & KPI Dashboards</li>
          <li>✅ System Settings & Constraints</li>
        </ul>
      </section>
    </>
  );
}

function StatusCard({ title, value }: { title: string; value: string | number }) {
  return (
    <section style={styles.card}>
      <h2 style={styles.cardTitle}>{title}</h2>
      <p style={styles.greenText}>{value}</p>
    </section>
  );
}

// --- Styles ---
const styles: Record<string, React.CSSProperties> = {
  app: { minHeight: "100vh", display: "grid", gridTemplateColumns: "240px 1fr", background: "#f8fafc", color: "#0f172a" },
  sidebar: { background: "#0f172a", color: "white", padding: 16 },
  brand: { margin: "0 0 8px", color: "#f97316" },
  sidebarText: { color: "#cbd5e1", marginBottom: 20, fontSize: 13, paddingBottom: 16, borderBottom: "1px solid #1e293b" },
  navButton: { display: "block", width: "100%", border: 0, borderRadius: 8, marginBottom: 6, padding: "10px 14px", textAlign: "left", background: "transparent", color: "#cbd5e1", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" },
  navButtonActive: { background: "#1e293b", color: "white" },
  main: { padding: 32 },
  pageTitle: { margin: "0 0 18px" },
  lead: { color: "#64748b", marginBottom: 24 },
  statusGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 },
  card: { background: "white", borderRadius: 12, padding: 20, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" },
  cardTitle: { margin: "0 0 8px", fontSize: 16, color: "#475569" },
  greenText: { color: "#059669", fontWeight: 800, fontSize: 24, margin: 0 },
  badge: { display: "inline-block", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 800, background: "#e0f2fe", color: "#0369a1" },
  panel: { background: "white", borderRadius: 12, padding: 24, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", marginTop: 20 },
  sectionTitle: { marginTop: 0, fontSize: 18 },
  list: { paddingLeft: 20 },
  orangeButton: { border: 0, borderRadius: 8, padding: "10px 16px", background: "#f97316", color: "white", fontWeight: 600, cursor: "pointer" },
  blueButton: { border: 0, borderRadius: 8, padding: "10px 16px", background: "#2563eb", color: "white", fontWeight: 600, cursor: "pointer" },
  label: { display: "block", marginTop: 12, fontWeight: 600, fontSize: 14, color: "#334155" },
  input: { display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", boxSizing: "border-box" },
  uploadBox: { marginTop: 16, borderRadius: 8, background: "#f1f5f9", border: "1px solid #e2e8f0", padding: 16 },
};