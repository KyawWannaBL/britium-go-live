// @ts-nocheck
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/lib/i18n";
import {
  ShieldCheck, ClipboardList, Package, Truck, Warehouse, Building2,
  UserCircle, UserCheck, Wallet, FileText, TrendingUp, Users,
  Eye, EyeOff, Loader2, ChevronLeft, Shield,
} from "lucide-react";

/* ── Britium Tokens ── */
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

const DASHBOARD_ROUTES: Record<string,string> = {
  super_admin:"/dashboard", supervisor:"/supervisor", ops_manager:"/ops-manager",
  dispatch:"/dispatch", cs_agent:"/customer-service", finance:"/finance",
  data_entry:"/data-entry", warehouse:"/warehouse", rider:"/rider-dashboard",
  driver:"/driver", branch_admin:"/branch-office", merchant:"/merchant",
  customer:"/customer", biz_dev:"/biz-dev",
};

/* ── Role catalog (value used to look up t() keys) ── */
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
  { value:"branch_admin", icon:Building2,     accent:"#EC4899" },
  { value:"merchant",     icon:UserCircle,    accent:"#F59E0B" },
  { value:"customer",     icon:UserCheck,     accent:"#84CC16" },
  { value:"biz_dev",      icon:TrendingUp,    accent:"#F43F5E" },
];

export default function SignupPage() {
  const { lang } = useLanguage();
  const nav = useNavigate();
  const [step, setStep] = useState<1|2>(1);
  const [role, setRole] = useState("");
  const [form, setForm] = useState({ name:"", email:"", phone:"", password:"", confirm:"" });
  const [showPwd, setShowPwd] = useState(false);
  const [showCfm, setShowCfm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const roleObj = ROLES.find(r => r.value === role);
  const roleLabel = role ? t(`role.${role}`, lang) : "";

  function pick(v: string) { setRole(v); setError(""); }

  function toForm() {
    if (!role) { setError(t("signup.error.role", lang)); return; }
    setStep(2); setError("");
  }

  function set(k: string) { return (e: any) => { setForm(p => ({ ...p, [k]: e.target.value })); setError(""); }; }

  async function submit(e: any) {
    e.preventDefault();
    if (!form.name.trim())  { setError(t("signup.error.name", lang)); return; }
    if (!form.email.trim()) { setError(t("signup.error.email", lang)); return; }
    if (form.password.length < 8) { setError(t("signup.error.password", lang)); return; }
    if (form.password !== form.confirm) { setError(t("signup.error.confirm", lang)); return; }
    setLoading(true); setError("");
    try {
      const { error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.name, phone: form.phone, role } },
      });
      if (authErr) throw authErr;
      setSuccess(true);
      setTimeout(() => nav(DASHBOARD_ROUTES[role] || "/dashboard"), 2200);
    } catch (err: any) {
      setError(err?.message || "Registration failed.");
    } finally { setLoading(false); }
  }

  /* ── Success screen ── */
  if (success) return (
    <div style={{ minHeight:"100vh", background:C.page, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Inter,'Pyidaungsu',sans-serif" }}>
      <div style={{ textAlign:"center", padding:"2rem" }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:"rgba(34,197,94,0.15)", border:"2px solid #22c55e", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 1rem" }}>
          <UserCheck size={28} color="#22c55e" />
        </div>
        <h2 style={{ fontSize:"1.4rem", fontWeight:800, color:C.text, marginBottom:"0.5rem" }}>{t("signup.success.title", lang)}</h2>
        <p style={{ fontSize:"0.82rem", color:C.sub }}>{t("signup.success.redirect", lang).replace("{role}", roleLabel)}</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.page, fontFamily:"Inter,'Pyidaungsu',sans-serif", color:C.text, display:"flex", flexDirection:"column", alignItems:"center", padding:"2rem 1rem" }}>

      {/* ── Logo / Badge ── */}
      <div style={{ textAlign:"center", marginBottom:"1.75rem" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:"0.4rem", background:"rgba(201,168,76,0.1)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:"999px", padding:"0.3rem 0.9rem", marginBottom:"0.75rem" }}>
          <Shield size={12} color={C.gold} />
          <span style={{ fontSize:"0.65rem", fontWeight:700, letterSpacing:"0.14em", textTransform:"uppercase", color:C.gold }}>{t("signup.badge", lang)}</span>
        </div>
        <h1 style={{ fontSize:"1.6rem", fontWeight:800, color:C.text, margin:0 }}>{t("signup.title", lang)}</h1>
        {step === 1 && <p style={{ fontSize:"0.8rem", color:C.sub, marginTop:"0.35rem", maxWidth:440 }}>{t("signup.step.role", lang)}</p>}
        {step === 2 && <p style={{ fontSize:"0.8rem", color:C.sub, marginTop:"0.35rem" }}>{t("signup.step.form", lang).replace("{role}", roleLabel)}</p>}
      </div>

      {/* ── Step 1: Role Selection ── */}
      {step === 1 && (
        <div style={{ width:"100%", maxWidth:900 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:"0.75rem", marginBottom:"1.25rem" }}>
            {ROLES.map(({ value, icon: Icon, accent }) => {
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
                    <span style={{ fontSize:"0.78rem", fontWeight:700, color: sel ? C.text : C.sub }}>{t(`role.${value}`, lang)}</span>
                  </div>
                  <p style={{ fontSize:"0.68rem", color: sel ? C.sub : C.muted, margin:0, lineHeight:1.45 }}>{t(`role.${value}.desc`, lang)}</p>
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
            }}>{t("signup.continue", lang)}</button>
          </div>

          <p style={{ textAlign:"center", fontSize:"0.78rem", color:C.muted, marginTop:"1.25rem" }}>
            {t("signup.login_link", lang)}{" "}
            <Link to="/login" style={{ color:C.gold, fontWeight:600, textDecoration:"none" }}>Sign In</Link>
          </p>
        </div>
      )}

      {/* ── Step 2: Registration Form ── */}
      {step === 2 && (
        <div style={{ width:"100%", maxWidth:440 }}>
          {/* Selected role chip */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:C.card, border:`1px solid ${C.borderGold}`, borderRadius:"0.5rem", padding:"0.625rem 0.875rem", marginBottom:"1.25rem" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"0.5rem" }}>
              {roleObj && <roleObj.icon size={15} color={roleObj.accent} />}
              <div>
                <p style={{ fontSize:"0.62rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold, margin:0 }}>{t("signup.selected_role", lang)}</p>
                <p style={{ fontSize:"0.84rem", fontWeight:700, color:C.text, margin:0 }}>{roleLabel}</p>
              </div>
            </div>
            <button onClick={() => { setStep(1); setError(""); }} style={{ fontSize:"0.72rem", fontWeight:600, color:C.gold, background:"transparent", border:`1px solid ${C.borderGold}`, borderRadius:"0.25rem", padding:"0.2rem 0.5rem", cursor:"pointer" }}>
              {t("signup.change", lang)}
            </button>
          </div>

          <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:"0.875rem" }}>
            {/* Full Name */}
            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>{t("signup.label.full_name", lang)}</span>
              <input style={inp} value={form.name} onChange={set("name")} placeholder={t("signup.placeholder.name", lang)} />
            </label>
            {/* Email */}
            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>{t("signup.label.email", lang)}</span>
              <input style={inp} type="email" value={form.email} onChange={set("email")} placeholder={t("signup.placeholder.email", lang)} />
            </label>
            {/* Phone */}
            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>{t("signup.label.phone", lang)}</span>
              <input style={inp} value={form.phone} onChange={set("phone")} placeholder={t("signup.placeholder.phone", lang)} />
            </label>
            {/* Password */}
            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>{t("signup.label.password", lang)}</span>
              <div style={{ position:"relative" }}>
                <input style={{ ...inp, paddingRight:"2.5rem" }} type={showPwd ? "text":"password"} value={form.password} onChange={set("password")} placeholder={t("signup.placeholder.password", lang)} />
                <button type="button" onClick={() => setShowPwd(p=>!p)} style={{ position:"absolute", right:"0.75rem", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  {showPwd ? <EyeOff size={14} color={C.muted}/> : <Eye size={14} color={C.muted}/>}
                </button>
              </div>
            </label>
            {/* Confirm */}
            <label style={{ display:"flex", flexDirection:"column", gap:"0.3rem" }}>
              <span style={{ fontSize:"0.68rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.gold }}>{t("signup.label.confirm", lang)}</span>
              <div style={{ position:"relative" }}>
                <input style={{ ...inp, paddingRight:"2.5rem" }} type={showCfm ? "text":"password"} value={form.confirm} onChange={set("confirm")} placeholder={t("signup.placeholder.password", lang)} />
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
              {loading ? <><Loader2 size={15} style={{ animation:"b-spin 1s linear infinite" }}/> {t("signup.submitting", lang)}</> : t("signup.submit", lang)}
            </button>

            <p style={{ textAlign:"center", fontSize:"0.78rem", color:C.muted, marginTop:"0.25rem" }}>
              {t("signup.login_link", lang)}{" "}
              <Link to="/login" style={{ color:C.gold, fontWeight:600, textDecoration:"none" }}>Sign In</Link>
            </p>
          </form>
        </div>
      )}
      <style>{`@keyframes b-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
