// @ts-nocheck
import { useMemo, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, ClipboardList, Package, Truck, Warehouse, Building2,
  UserCircle, UserCheck, Wallet, FileText, TrendingUp, Users,
  Eye, EyeOff, Loader2, Shield, Download,
} from "lucide-react";

const C = {
  page: "#0A1628", card: "#0E1E38", cardHi: "#122040",
  border: "#1A3050", borderGold: "#6B5420",
  gold: "#C9A84C", text: "#E8F0FE", sub: "#8BA8D4", muted: "#4A6080",
};

const inp: React.CSSProperties = {
  width:"100%", height:"42px", background:C.cardHi,
  border:`1px solid ${C.border}`, borderRadius:"0.375rem",
  padding:"0 0.875rem", color:C.text, fontSize:"0.84rem",
  fontWeight:500, outline:"none", boxSizing:"border-box", fontFamily:"inherit",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  supervisor: "Supervisor",
  ops_manager: "Operations Manager",
  dispatch: "Dispatch",
  cs_agent: "Customer Service",
  finance: "Finance",
  data_entry: "Data Entry",
  warehouse: "Warehouse",
  rider: "Rider",
  driver: "Driver",
  helper: "Helper",
  branch_admin: "Branch Admin",
  merchant: "Merchant",
  customer: "Customer",
  biz_dev: "Business Development",
};

const ROLES = [
  { value:"super_admin",  icon:ShieldCheck,   accent:"#EF4444" },
  { value:"supervisor",   icon:ShieldCheck,   accent:"#F97316" },
  { value:"ops_manager",  icon:ClipboardList, accent:"#3B82F6" },
  { value:"dispatch",     icon:Package,       accent:"#06B6D4" },
  { value:"cs_agent",     icon:Users,         accent:"#14B8A6" },
  { value:"finance",      icon:Wallet,        accent:"#22C55E" },
  { value:"data_entry",   icon:FileText,      accent:"#8B5CF6" },
  { value:"warehouse",    icon:Warehouse,     accent:"#EAB308" },
  { value:"rider",        icon:Truck,         accent:"#0EA5E9" },
  { value:"driver",       icon:Truck,         accent:"#6366F1" },
  { value:"helper",       icon:Truck,         accent:"#38BDF8" },
  { value:"branch_admin", icon:Building2,     accent:"#EC4899" },
  { value:"merchant",     icon:UserCircle,    accent:"#F59E0B" },
  { value:"customer",     icon:UserCheck,     accent:"#84CC16" },
  { value:"biz_dev",      icon:TrendingUp,    accent:"#F43F5E" },
];

export default function SignupPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") === "rider" ? "rider" : "portal";
  const presetRole = searchParams.get("role") || (mode === "rider" ? "rider" : "");
  const loginPath = mode === "rider" ? "/rider-login" : "/login";
  const apkHref = useMemo(() => "/downloads/britium-rider-app.apk", []);
  const [step, setStep] = useState<1|2>(presetRole ? 2 : 1);
  const [role, setRole] = useState(presetRole);
  const [form, setForm] = useState({ name:"", email:"", phone:"", password:"", confirm:"" });
  const [showPwd, setShowPwd] = useState(false);
  const [showCfm, setShowCfm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const allowedRoles = mode === "rider"
    ? ROLES.filter((role) => ["rider", "driver", "helper"].includes(role.value))
    : ROLES;

  const roleObj = ROLES.find(r => r.value === role);
  const roleLabel = ROLE_LABELS[role] || role;

  function pick(v: string) { setRole(v); setError(""); }

  function toForm() {
    if (!role) { setError("Please select a role."); return; }
    setStep(2); setError("");
  }

  function set(k: string) { return (e: any) => { setForm(p => ({ ...p, [k]: e.target.value })); setError(""); }; }

  async function submit(e: any) {
    e.preventDefault();
    if (!role) { setError("Please select a role."); return; }
    if (!form.name.trim())  { setError("Please enter your full name."); return; }
    if (!form.email.trim()) { setError("Please enter your email."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }

    setLoading(true); setError("");

    try {
      const metadata = {
        full_name: form.name.trim(),
        phone: form.phone.trim(),
        role,
        signup_mode: mode,
        must_change_password: false,
        approval_status: "PENDING",
      };

      const { error: authErr } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: { data: metadata },
      });

      if (authErr) throw authErr;

      try {
        await (supabase as any).rpc("be_submit_signup_request", {
          p_payload: {
            full_name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            requested_role: role,
            signup_mode: mode,
            status: "PENDING",
          },
        });
      } catch {
        try {
          await (supabase as any).from("be_signup_requests").insert({
            full_name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            requested_role: role,
            signup_mode: mode,
            status: "PENDING",
          });
        } catch {
          // Signup can still proceed through Supabase Auth if the request table is not installed yet.
        }
      }

      setSuccess(true);
      setTimeout(() => nav(loginPath), 2600);
    } catch (err: any) {
      setError(err?.message || "Registration failed.");
    } finally { setLoading(false); }
  }

  if (success) return (
    <div style={{ minHeight:"100vh", background:C.page, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Inter,'Pyidaungsu',sans-serif" }}>
      <div style={{ textAlign:"center", padding:"2rem" }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(34,197,94,0.15)", border:"2px solid #22c55e", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 1rem" }}>
          <UserCheck size={28} color="#22c55e" />
        </div>
        <h2 style={{ fontSize:"1.4rem", fontWeight:800, color:C.text, marginBottom:"0.5rem" }}>Signup submitted</h2>
        <p style={{ fontSize:"0.82rem", color:C.sub }}>Your {roleLabel} account request was submitted. Redirecting to login...</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.page, fontFamily:"Inter,'Pyidaungsu',sans-serif", color:C.text, display:"flex", flexDirection:"column", alignItems:"center", padding:"2rem 1rem" }}>
      <div style={{ textAlign:"center", marginBottom:"1.75rem" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:"0.4rem", background:"rgba(201,168,76,0.1)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:"999px", padding:"0.3rem 0.9rem", marginBottom:"0.75rem" }}>
          <Shield size={12} color={C.gold} />
          <span style={{ fontSize:"0.65rem", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:C.gold }}>
            {mode === "rider" ? "Rider App Signup" : "Enterprise Portal Signup"}
          </span>
        </div>
        <h1 style={{ fontSize:"1.6rem", fontWeight:800, color:C.text, margin:0 }}>Create Account</h1>
        {step === 1 && <p style={{ fontSize:"0.8rem", color:C.sub, marginTop:"0.35rem", maxWidth:440 }}>Select the account role to request.</p>}
        {step === 2 && <p style={{ fontSize:"0.8rem", color:C.sub, marginTop:"0.35rem" }}>Registering for: {roleLabel}</p>}
      </div>

      {step === 1 && (
        <div style={{ width:"100%", maxWidth:900 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:"0.75rem", marginBottom:"1.25rem" }}>
            {allowedRoles.map(({ value, icon: Icon, accent }) => {
              const sel = role === value;
              return (
                <button key={value} onClick={() => pick(value)} style={{
                  background: sel ? `${accent}18` : C.card,
                  border: `1.5px solid ${sel ? accent : C.border}`,
                  borderRadius:"0.625rem", padding:"0.875rem 0.75rem",
                  cursor:"pointer", textAlign:"left", transition:"all 0.15s",
                  boxShadow: sel ? `0 0 0 2px ${accent}30` : "none",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", marginBottom:"0.45rem" }}>
                    <Icon size={16} color={sel ? accent : C.muted} />
                    <span style={{ fontSize:"0.78rem", fontWeight:700, color: sel ? C.text : C.sub }}>{ROLE_LABELS[value]}</span>
                  </div>
                  <p style={{ fontSize:"0.68rem", color: sel ? C.sub : C.muted, margin:0, lineHeight:1.45 }}>Request access for {ROLE_LABELS[value]} workflow.</p>
                </button>
              );
            })}
          </div>

          {error && <p style={{ textAlign:"center", color:"#FCA5A5", fontSize:"0.78rem", marginBottom:"0.75rem" }}>{error}</p>}

          <div style={{ textAlign:"center" }}>
            <button onClick={toForm} style={{
              background:`linear-gradient(135deg, ${C.gold} 0%, #9A7530 100%)`,
              color:"#0A1628", padding:"0.65rem 2.5rem", borderRadius:"0.5rem",
              border:"none", fontWeight:700, fontSize:"0.85rem", cursor:"pointer", letterSpacing:"0.02em",
            }}>Continue</button>
          </div>

          <p style={{ textAlign:"center", fontSize:"0.78rem", color:C.muted, marginTop:"1.25rem" }}>
            Already have an account?{" "}
            <Link to={loginPath} style={{ color:C.gold, fontWeight:600, textDecoration:"none" }}>Sign In</Link>
          </p>
        </div>
      )}

      {step === 2 && (
        <div style={{ width:"100%", maxWidth:440 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:C.card, border:`1px solid ${C.borderGold}`, borderRadius:"0.5rem", padding:"0.625rem 0.875rem", marginBottom:"1.25rem" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
              {roleObj && <roleObj.icon size={15} color={roleObj.accent} />}
              <div>
                <p style={{ fontSize:"0.62rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold, margin:0 }}>Selected Role</p>
                <p style={{ fontSize:"0.84rem", fontWeight:700, color:C.text, margin:0 }}>{roleLabel}</p>
              </div>
            </div>
            {!presetRole && (
              <button onClick={() => { setStep(1); setError(""); }} style={{ fontSize:"0.72rem", fontWeight:600, color:C.gold, background:"transparent", border:`1px solid ${C.borderGold}`, borderRadius:"0.25rem", padding:"0.2rem 0.5rem", cursor:"pointer" }}>
                Change
              </button>
            )}
          </div>

          <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:"0.875rem" }}>
            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>Full Name</span>
              <input style={inp} value={form.name} onChange={set("name")} placeholder="Enter full name" />
            </label>

            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>Email</span>
              <input style={inp} type="email" value={form.email} onChange={set("email")} placeholder="name@britiumexpress.com" />
            </label>

            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>Phone</span>
              <input style={inp} value={form.phone} onChange={set("phone")} placeholder="09xxxxxxxxx" />
            </label>

            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>Password</span>
              <div style={{ position:"relative" }}>
                <input style={{ ...inp, paddingRight:"2.5rem" }} type={showPwd ? "text":"password"} value={form.password} onChange={set("password")} placeholder="Minimum 8 characters" />
                <button type="button" onClick={() => setShowPwd(p=>!p)} style={{ position:"absolute", right:"0.75rem", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  {showPwd ? <EyeOff size={14} color={C.muted}/> : <Eye size={14} color={C.muted}/>}
                </button>
              </div>
            </label>

            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>Confirm Password</span>
              <div style={{ position:"relative" }}>
                <input style={{ ...inp, paddingRight:"2.5rem" }} type={showCfm ? "text":"password"} value={form.confirm} onChange={set("confirm")} placeholder="Confirm password" />
                <button type="button" onClick={() => setShowCfm(p=>!p)} style={{ position:"absolute", right:"0.75rem", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  {showCfm ? <EyeOff size={14} color={C.muted}/> : <Eye size={14} color={C.muted}/>}
                </button>
              </div>
            </label>

            {error && <p style={{ color:"#FCA5A5", fontSize:"0.78rem", margin:0 }}>{error}</p>}

            <button type="submit" disabled={loading} style={{
              height:"44px", width:"100%",
              background:`linear-gradient(135deg, ${C.gold} 0%, #9A7530 100%)`,
              color:"#0A1628", border:"none", borderRadius:"0.5rem",
              fontWeight:700, fontSize:"0.85rem", cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:"0.4rem",
              opacity: loading ? 0.7 : 1, marginTop:"0.25rem",
            }}>
              {loading ? <><Loader2 size={15} style={{ animation:"b-spin 1s linear infinite" }}/> Submitting...</> : "Submit Signup"}
            </button>

            {mode === "rider" ? (
              <a href={apkHref} download style={{ display:"flex", height:44, alignItems:"center", justifyContent:"center", gap:8, border:`1px solid ${C.border}`, borderRadius:"0.5rem", color:C.text, textDecoration:"none", fontSize:"0.78rem", fontWeight:700 }}>
                <Download size={15} color={C.gold} /> Download Rider APK
              </a>
            ) : null}

            <p style={{ textAlign:"center", fontSize:"0.78rem", color:C.muted, marginTop:"0.25rem" }}>
              Already have an account?{" "}
              <Link to={loginPath} style={{ color:C.gold, fontWeight:600, textDecoration:"none" }}>Sign In</Link>
            </p>
          </form>
        </div>
      )}
      <style>{`@keyframes b-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
