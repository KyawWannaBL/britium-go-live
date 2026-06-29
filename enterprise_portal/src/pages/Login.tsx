// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth";
import { defaultPortalForRole, normalizeRole } from "@/lib/portalRegistry";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Globe,
  Loader2, Lock, Mail, ShieldCheck, QrCode, KeyRound, Plane, Ship, Truck
} from "lucide-react";

const REMEMBER_ME_KEY = "britium_remember_me";

const SUPABASE_CONFIGURED = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

function getRememberMe(): boolean {
  try {
    const raw = localStorage.getItem(REMEMBER_ME_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function setRememberMe(next: boolean) {
  try {
    localStorage.setItem(REMEMBER_ME_KEY, next ? "1" : "0");
  } catch {
    // ignore storage failures
  }
}

type View = "login" | "forgot" | "force_change" | "mfa";

const MFA_REQUIRED_ROLES = new Set([
  "SYS", "APP_OWNER", "SUPER_ADMIN", "SUPER_A", "ADM", "MGR", "ADMIN", "super-admin",
]);

async function loadProfile(userId: string) {
  const trySelect = async (sel: string) =>
    supabase.from("profiles").select(sel).eq("id", userId).maybeSingle();

  let { data, error } = await trySelect(
    "id, role, role_code, app_role, user_role, must_change_password, requires_password_change"
  );

  if (error && (error as any).code === "42703") {
    ({ data, error } = await trySelect("id, role, must_change_password"));
  }

  if (error) return { role: "GUEST", mustChange: false };

  const row: any = data || {};
  const rawRole = row.role ?? row.app_role ?? row.user_role ?? row.role_code ?? "GUEST";
  const mustChange = Boolean(row.must_change_password) || Boolean(row.requires_password_change);

  return { role: normalizeRole(rawRole), mustChange };
}

async function hasAal2() {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return false;
    return data?.currentLevel === "aal2";
  } catch {
    return false;
  }
}

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const auth = useAuth();
  const { lang, setLanguage, toggleLang } = useLanguage();

  const [currentLang, setCurrentLang] = useState(lang || "en");
  const t = (en: string, my: string) => (currentLang === "en" ? en : my);

  const [view, setView] = useState<View>("login");
  const [loading, setLoading] = useState(false);
  const [configMissing, setConfigMissing] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState<boolean>(() => getRememberMe());

  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [otpToken, setOtpToken] = useState("");
  const [targetPath, setTargetPath] = useState<string>("/dashboard");
  const [currentRole, setCurrentRole] = useState<string>("GUEST");

  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [mfaStage, setMfaStage] = useState<"idle" | "enroll" | "verify">("idle");
  const [mfaFactorId, setMfaFactorId] = useState<string>("");
  const [mfaChallengeId, setMfaChallengeId] = useState<string>("");
  const [mfaQrSvg, setMfaQrSvg] = useState<string>("");
  const [mfaSecret, setMfaSecret] = useState<string>("");

  const brand = useMemo(() => ({
    title: "BRITIUM",
    subtitleEn: "Enterprise Logistics Portal",
    subtitleMy: "Britium Enterprise Portal သို့ ကြိုဆိုပါသည်",
  }), []);

  useEffect(() => { if (lang) setCurrentLang(lang); }, [lang]);

  useEffect(() => { setConfigMissing(!Boolean(SUPABASE_CONFIGURED)); }, []);

  const toggleLanguage = () => {
    const next = currentLang === "en" ? "my" : "en";
    setCurrentLang(next);
    if (typeof setLanguage === "function") setLanguage(next);
    else if (typeof toggleLang === "function") toggleLang();
  };

  const clearMessages = () => { setErrorMsg(""); setSuccessMsg(""); };

  async function goAfterAuth(role?: string) {
    const from = loc?.state?.from;
    const dst = typeof from === "string" && from.startsWith("/") ? from : defaultPortalForRole(role);
    setTargetPath(dst);
    nav(dst || "/dashboard", { replace: true });
  }

  async function ensureMfa(role?: string) {
    const r = normalizeRole(role);
    if (!MFA_REQUIRED_ROLES.has(r)) return true;
    const ok = await hasAal2();
    if (ok) return true;
    setView("mfa");
    await prepareMfa();
    return false;
  }

  async function prepareMfa() {
    setMfaStage("idle"); setOtpToken(""); setMfaQrSvg(""); setMfaSecret(""); setMfaFactorId(""); setMfaChallengeId("");
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const totpFactors = (data?.totp || data?.all || []) as any[];
      const verified = totpFactors.find((f) => (f?.status || "").toLowerCase() === "verified") || totpFactors[0];

      if (verified?.id) {
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: verified.id });
        if (chErr) throw chErr;
        setMfaFactorId(verified.id); setMfaChallengeId(ch?.id || ""); setMfaStage("verify");
        setSuccessMsg(t("Enter your 6-digit authenticator code.", "Authenticator code (၆ လုံး) ကို ထည့်ပါ။"));
        return;
      }

      const { data: enr, error: enrErr } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (enrErr) throw enrErr;

      setMfaFactorId(enr?.id || ""); setMfaQrSvg(enr?.totp?.qr_code || ""); setMfaSecret(enr?.totp?.secret || "");
      const { data: ch2, error: ch2Err } = await supabase.auth.mfa.challenge({ factorId: enr.id });
      if (ch2Err) throw ch2Err;

      setMfaChallengeId(ch2?.id || ""); setMfaStage("enroll");
      setSuccessMsg(t("Scan QR with authenticator app, then enter the code.", "Authenticator နဲ့ QR စကန်ပြီး code ထည့်ပါ။"));
    } catch (e: any) {
      setErrorMsg(e?.message || t("MFA setup failed.", "MFA စတင်မရပါ။")); setMfaStage("idle");
    } finally { setLoading(false); }
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault(); clearMessages();
    if (!otpToken || otpToken.trim().length < 6) return setErrorMsg(t("Enter the 6-digit code.", "Code ၆ လုံး ထည့်ပါ။"));
    setLoading(true);
    try {
      const code = otpToken.trim().replace(/\s+/g, "");
      const { error } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: mfaChallengeId, code });
      if (error) throw error;
      const ok = await hasAal2();
      if (!ok) throw new Error("MFA verification incomplete.");
      setSuccessMsg(t("MFA verified. Redirecting…", "MFA အောင်မြင်ပါပြီ။ ဆက်သွားနေသည်…"));
      setTimeout(() => { nav(targetPath || "/dashboard", { replace: true }); }, 400);
    } catch (e: any) { setErrorMsg(e?.message || t("Invalid code.", "Code မမှန်ပါ။")); } finally { setLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); clearMessages();
    if (!SUPABASE_CONFIGURED) { setConfigMissing(true); return setErrorMsg(t("System configuration is missing.", "System config မပြည့်စုံပါ။")); }
    setLoading(true);
    try {
      setRememberMe(remember);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await auth.refresh?.();
      const prof = await loadProfile(data.user.id);
      setCurrentRole(prof.role);
      const dst = defaultPortalForRole(prof.role);
      setTargetPath(dst || "/dashboard");
      const isDefault = password === "P@ssw0rd1" || password.startsWith("Britium@");
      if (prof.mustChange || isDefault) { setView("force_change"); return; }
      const passed = await ensureMfa(prof.role);
      if (!passed) return;
      await goAfterAuth(prof.role);
    } catch (e: any) { setErrorMsg(t("Access Denied: Invalid credentials.", "ဝင်ရောက်ခွင့် ငြင်းပယ်ခံရသည်: အချက်အလက်မှားနေသည်။")); } finally { setLoading(false); }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault(); clearMessages();
    if (!resetEmail.trim()) return setErrorMsg(t("Enter your email address.", "အီးမေးလ်ထည့်ပါ။"));
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
      if (error) throw error;
      setSuccessMsg(t("Password reset link sent. Please check your email.", "Password reset link ပို့ပြီးပါပြီ။ Email စစ်ဆေးပါ။"));
      setView("login");
    } catch (e: any) { setErrorMsg(e?.message || t("Unable to send reset email.", "Reset email ပို့မရပါ။")); } finally { setLoading(false); }
  }

  async function handleForcePasswordChange(e: React.FormEvent) {
    e.preventDefault(); clearMessages();
    if (!newPassword || newPassword.length < 8) return setErrorMsg(t("New password must be at least 8 characters.", "Password အသစ်သည် အနည်းဆုံး ၈ လုံးရှိရမည်။"));
    if (newPassword !== confirmPassword) return setErrorMsg(t("Passwords do not match.", "Password နှစ်ခု မတူပါ။"));
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase.from("profiles").update({ must_change_password: false, requires_password_change: false }).eq("id", user.id);
      }
      setSuccessMsg(t("Password updated successfully. Please continue.", "Password အသစ်ပြောင်းပြီးပါပြီ။ ဆက်သွားနိုင်ပါသည်။"));
      const passed = await ensureMfa(currentRole);
      if (!passed) return;
      await goAfterAuth(currentRole);
    } catch (e: any) { setErrorMsg(e?.message || t("Unable to update password.", "Password ပြောင်းမရပါ။")); } finally { setLoading(false); }
  }

  function FieldLabel({ text }: { text: string }) {
    return <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#90b4ce] mb-1.5 ml-1">{text}</label>;
  }

  return (
    <div className="min-h-screen w-full flex bg-[#061524] text-[#eef8ff] font-sans overflow-hidden">
      
      {/* ─── LEFT PANEL: CINEMATIC TECHNICAL MOTIF ─── */}
      <div className="hidden lg:flex lg:w-5/12 relative flex-col justify-between p-12 border-r border-[#1a3a5c]/50 bg-[#030914] overflow-hidden">
        
        {/* Abstract Geometry & Glows */}
        <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] bg-[#1a3a5c] rounded-full mix-blend-screen filter blur-[120px] opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#f6b84b] rounded-full mix-blend-screen filter blur-[150px] opacity-10" />
        
        {/* Technical Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a3a5c1a_1px,transparent_1px),linear-gradient(to_bottom,#1a3a5c1a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

        {/* Video Background Integration */}
        <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-[0.15] mix-blend-screen pointer-events-none grayscale">
          <source src="/background.mp4" type="video/mp4" />
        </video>

        {/* Header / Logo */}
        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f6b84b] to-[#d49933] flex items-center justify-center shadow-lg shadow-[#f6b84b]/20">
            <Globe className="w-7 h-7 text-black" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">{brand.title}</h1>
            <p className="text-[#f6b84b] text-sm font-medium tracking-widest uppercase">EXPRESS</p>
          </div>
        </div>

        {/* Value Proposition & Aesthetics */}
        <div className="relative z-10 max-w-md mt-12">
          <h2 className="text-4xl font-semibold leading-[1.15] mb-6 text-white">
            Global reach, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f6b84b] to-[#f9d792]">
              precision delivery.
            </span>
          </h2>
          <p className="text-[#90b4ce] text-lg leading-relaxed mb-10 font-light">
            {t(brand.subtitleEn, brand.subtitleMy)}
          </p>
          
          <div className="flex gap-8 text-[#4d7a9b]">
            <div className="flex flex-col items-center gap-2 group">
              <Plane className="w-7 h-7 group-hover:text-[#f6b84b] transition-colors" />
              <div className="h-1 w-1 rounded-full bg-[#1a3a5c] group-hover:bg-[#f6b84b] transition-colors" />
            </div>
            <div className="flex flex-col items-center gap-2 group">
              <Ship className="w-7 h-7 group-hover:text-[#f6b84b] transition-colors" />
              <div className="h-1 w-1 rounded-full bg-[#1a3a5c] group-hover:bg-[#f6b84b] transition-colors" />
            </div>
            <div className="flex flex-col items-center gap-2 group">
              <Truck className="w-7 h-7 group-hover:text-[#f6b84b] transition-colors" />
              <div className="h-1 w-1 rounded-full bg-[#1a3a5c] group-hover:bg-[#f6b84b] transition-colors" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-[#4d7a9b] font-light tracking-wide">
          © {new Date().getFullYear()} Britium Ventures Company Limited. <br />
          System Portal v2.0 • Secured Telemetry Node
        </div>
      </div>

      {/* ─── RIGHT PANEL: AUTHENTICATION FLOW ─── */}
      <div className="w-full lg:w-7/12 flex items-center justify-center p-6 sm:p-12 relative bg-[#061524]">
        
        {/* Mobile-only logo */}
        <div className="absolute top-6 left-6 lg:hidden flex items-center gap-3 z-20">
          <div className="w-8 h-8 rounded-lg bg-[#f6b84b] flex items-center justify-center">
            <Globe className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">{brand.title}</h1>
        </div>

        {/* Language Toggle */}
        <div className="absolute top-6 right-6 z-20">
          <Button 
            onClick={toggleLanguage} 
            variant="ghost" 
            className="text-[#90b4ce] hover:text-white hover:bg-[#1a3a5c]/50 rounded-full h-10 px-4 transition-all"
          >
            <Globe className="h-4 w-4 mr-2 opacity-70" />
            <span className="text-xs font-bold tracking-widest uppercase">{currentLang === "en" ? "MY" : "EN"}</span>
          </Button>
        </div>

        <div className="w-full max-w-md relative z-10">
          
          <div className="mb-10">
            <h2 className="text-3xl font-semibold text-white mb-2">
              {view === "login" ? t("Sign In", "အကောင့်ဝင်ရန်") : 
               view === "forgot" ? t("Reset Password", "စကားဝှက်အသစ်ရယူရန်") : 
               view === "mfa" ? t("Security Verification", "လုံခြုံရေးအတည်ပြုခြင်း") : 
               t("Update Password", "စကားဝှက်အသစ်ပြောင်းရန်")}
            </h2>
            <p className="text-[#90b4ce] text-sm">
              {view === "login" ? t("Access the unified logistics command center.", "ဗဟိုထိန်းချုပ်မှုစနစ်သို့ ဝင်ရောက်ပါ။") :
               view === "forgot" ? t("Enter your email to receive a recovery link.", "အီးမေးလ်ထည့်၍ link ကိုရယူပါ။") :
               view === "mfa" ? t("Two-factor authentication is required for this role.", "အဆင့်မြင့်လုံခြုံရေး အတည်ပြုရန်လိုအပ်ပါသည်။") :
               t("Please set a secure password to continue.", "လုံခြုံသော စကားဝှက်အသစ် သတ်မှတ်ပါ။")}
            </p>
          </div>

          <Card className="bg-[#0b2236]/80 backdrop-blur-2xl border-[#1a3a5c] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#f6b84b] to-[#d49933]" />
            <CardContent className="p-8 space-y-6">
              
              {/* System Messages */}
              {configMissing && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs leading-relaxed">
                  {t("System configuration is missing. Please contact administration.", "System config မပြည့်စုံပါ။")}
                </div>
              )}
              {errorMsg && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 opacity-80" />
                  <p className="text-sm font-medium leading-relaxed">{errorMsg}</p>
                </div>
              )}
              {successMsg && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3 text-emerald-400">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 opacity-80" />
                  <p className="text-sm font-medium leading-relaxed">{successMsg}</p>
                </div>
              )}

              {/* ─── 1. LOGIN VIEW ─── */}
              {view === "login" && (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-1.5 group">
                    <FieldLabel text={t("Corporate Email", "အီးမေးလ်")} />
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d7a9b] group-focus-within:text-[#f6b84b] transition-colors" />
                      <Input 
                        type="email" required value={email} onChange={(e) => setEmail(e.target.value)} 
                        className="bg-[#061524] border-[#1a3a5c] text-white h-12 rounded-xl pl-12 focus:ring-1 focus:ring-[#f6b84b] focus:border-[#f6b84b] transition-all placeholder:text-[#4d7a9b]/50" 
                        placeholder="admin@britium.local" 
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 group">
                    <div className="flex justify-between items-center">
                      <FieldLabel text={t("Password", "စကားဝှက်")} />
                      <button type="button" onClick={() => { clearMessages(); setResetEmail(email); setView("forgot"); }} className="text-xs font-medium text-[#f6b84b] hover:text-[#f9d792] transition-colors mb-1.5">
                        {t("Forgot password?", "Password မေ့နေပါသလား?")}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d7a9b] group-focus-within:text-[#f6b84b] transition-colors" />
                      <Input 
                        type="password" required value={password} onChange={(e) => setPassword(e.target.value)} 
                        className="bg-[#061524] border-[#1a3a5c] text-white h-12 rounded-xl pl-12 focus:ring-1 focus:ring-[#f6b84b] focus:border-[#f6b84b] transition-all placeholder:text-[#4d7a9b]/50" 
                        placeholder="••••••••" 
                      />
                    </div>
                  </div>

                  <div className="flex items-center text-sm pt-1">
                    <label className="flex items-center gap-2.5 text-[#90b4ce] cursor-pointer hover:text-white transition-colors">
                      <input 
                        type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} 
                        className="rounded border-[#4d7a9b] bg-[#061524] text-[#f6b84b] focus:ring-[#f6b84b] focus:ring-offset-[#0b2236]" 
                      />
                      <span>{t("Stay signed in", "မှတ်ထားမည်")}</span>
                    </label>
                  </div>

                  <Button type="submit" disabled={loading} className="w-full h-12 mt-2 bg-gradient-to-r from-[#f6b84b] to-[#d49933] hover:from-[#f9d792] hover:to-[#f6b84b] text-black font-semibold text-[15px] rounded-xl shadow-[0_0_15px_rgba(246,184,75,0.15)] hover:shadow-[0_0_25px_rgba(246,184,75,0.3)] transition-all">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>{t("Authenticate", "အကောင့်ဝင်မည်")}<ArrowRight className="ml-2 h-5 w-5 opacity-70" /></>}
                  </Button>
                </form>
              )}

              {/* ─── 2. FORGOT PASSWORD VIEW ─── */}
              {view === "forgot" && (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-1.5 group">
                    <FieldLabel text={t("Recovery Email", "အီးမေးလ်")} />
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d7a9b] group-focus-within:text-[#f6b84b] transition-colors" />
                      <Input type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="bg-[#061524] border-[#1a3a5c] text-white h-12 rounded-xl pl-12 focus:border-[#f6b84b]" />
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-[#f6b84b] to-[#d49933] text-black font-semibold rounded-xl transition-all">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("Send Link", "Link ပို့မည်")}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => { clearMessages(); setView("login"); }} className="w-full h-12 text-[#90b4ce] hover:text-white hover:bg-[#1a3a5c]/50 rounded-xl">
                    <ArrowLeft className="mr-2 h-4 w-4" />{t("Return to login", "Login သို့ပြန်သွားမည်")}
                  </Button>
                </form>
              )}

              {/* ─── 3. FORCE PASSWORD CHANGE VIEW ─── */}
              {view === "force_change" && (
                <form onSubmit={handleForcePasswordChange} className="space-y-5">
                  <div className="space-y-1.5 group">
                    <FieldLabel text={t("New Password", "စကားဝှက်အသစ်")} />
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d7a9b] group-focus-within:text-[#f6b84b] transition-colors" />
                      <Input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-[#061524] border-[#1a3a5c] text-white h-12 rounded-xl pl-12 focus:border-[#f6b84b]" />
                    </div>
                  </div>
                  <div className="space-y-1.5 group">
                    <FieldLabel text={t("Confirm Password", "စကားဝှက် အတည်ပြုပါ")} />
                    <div className="relative">
                      <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d7a9b] group-focus-within:text-[#f6b84b] transition-colors" />
                      <Input type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-[#061524] border-[#1a3a5c] text-white h-12 rounded-xl pl-12 focus:border-[#f6b84b]" />
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-[#f6b84b] to-[#d49933] text-black font-semibold rounded-xl transition-all">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("Update Secure Key", "စကားဝှက်ပြောင်းမည်")}
                  </Button>
                </form>
              )}

              {/* ─── 4. MFA VIEW ─── */}
              {view === "mfa" && (
                <div className="space-y-6">
                  {mfaStage === "enroll" && (
                    <div className="flex flex-col items-center justify-center p-6 bg-[#061524] rounded-xl border border-[#1a3a5c] space-y-4">
                      <QrCode className="h-8 w-8 text-[#f6b84b]" />
                      {mfaQrSvg && <div className="bg-white p-3 rounded-lg" dangerouslySetInnerHTML={{ __html: mfaQrSvg }} />}
                      <div className="text-center">
                        <p className="text-sm text-[#90b4ce] mb-1">{t("Manual Code:", "Manual ထည့်ရန်:")}</p>
                        <code className="px-3 py-1.5 bg-[#0b2236] border border-[#1a3a5c] rounded text-[#f6b84b] font-mono text-sm tracking-wider select-all">{mfaSecret}</code>
                      </div>
                    </div>
                  )}

                  {(mfaStage === "enroll" || mfaStage === "verify") && (
                    <form onSubmit={verifyMfa} className="space-y-5">
                      <div className="space-y-1.5 group">
                        <FieldLabel text={t("Authentication Code", "Authentication Code")} />
                        <div className="relative">
                          <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#4d7a9b] group-focus-within:text-[#f6b84b] transition-colors" />
                          <Input 
                            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} required 
                            value={otpToken} onChange={(e) => setOtpToken(e.target.value)} 
                            className="bg-[#061524] border-[#1a3a5c] text-white h-12 rounded-xl pl-12 text-center text-lg tracking-[0.5em] focus:border-[#f6b84b]" 
                            placeholder="000000" 
                          />
                        </div>
                      </div>
                      <Button type="submit" disabled={loading} className="w-full h-12 bg-gradient-to-r from-[#f6b84b] to-[#d49933] text-black font-semibold rounded-xl transition-all">
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("Verify Identity", "အတည်ပြုမည်")}
                      </Button>
                    </form>
                  )}
                </div>
              )}

            </CardContent>
          </Card>
          
          {/* Status Indicator */}
          <div className="mt-8 flex items-center justify-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f6b84b] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f6b84b]"></span>
            </span>
            <span className="text-xs text-[#4d7a9b] font-medium uppercase tracking-widest">Systems Online</span>
          </div>

        </div>
      </div>
    </div>
  );
}