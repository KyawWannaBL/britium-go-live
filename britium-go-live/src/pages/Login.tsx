// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { defaultPortalForRole, normalizeRole } from "@/lib/portalRegistry";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
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
  "SYS",
  "APP_OWNER",
  "SUPER_ADMIN",
  "SUPER_A",
  "ADM",
  "MGR",
  "ADMIN",
  "super-admin",
]);

async function loadProfile(userId: string) {
  const { data, error } = await supabase.rpc("be_login_access_profile");
  if (error) throw error;

  const row: any = data || {};
  if (!row.authorized || row.auth_user_id !== userId) {
    const accessMessages: Record<string, string> = {
      ACCOUNT_NOT_REGISTERED: "This login is not registered as a Britium Express account.",
      ACCOUNT_INACTIVE: "This Britium Express account is inactive.",
      ROLE_NOT_ASSIGNED: "No authorized role is assigned to this account.",
      TERRITORY_NOT_ASSIGNED: "No active branch or township territory is assigned to this account.",
      AUTH_REQUIRED: "Your authentication session is no longer valid.",
    };
    throw new Error(accessMessages[row.reason] || "Account access denied by RLS.");
  }

  const rawRole = row.role ?? "GUEST";
  const mustChange = Boolean(row.must_change_password);

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

export default function Login() {
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
  const [showPassword, setShowPassword] = useState(false);
  const [portalType, setPortalType] = useState<
    "enterprise" | "merchant" | "rider" | "finance"
  >("enterprise");

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

  const brand = useMemo(
    () => ({
      title: "BRITIUM",
      subtitleEn: "Welcome to the Enterprise Portal",
      subtitleMy: "Britium Enterprise Portal သို့ ကြိုဆိုပါသည်",
    }),
    []
  );

  useEffect(() => {
    if (lang) setCurrentLang(lang);
  }, [lang]);

  useEffect(() => {
    setConfigMissing(!Boolean(SUPABASE_CONFIGURED));
  }, []);

  const toggleLanguage = () => {
    const next = currentLang === "en" ? "my" : "en";
    setCurrentLang(next);
    if (typeof setLanguage === "function") setLanguage(next);
    else if (typeof toggleLang === "function") toggleLang();
  };

  const clearMessages = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  async function goAfterAuth(role?: string) {
    const from = loc?.state?.from;
    const dst =
      typeof from === "string" && from.startsWith("/")
        ? from
        : defaultPortalForRole(role);

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
    setMfaStage("idle");
    setOtpToken("");
    setMfaQrSvg("");
    setMfaSecret("");
    setMfaFactorId("");
    setMfaChallengeId("");

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const totpFactors = (data?.totp || data?.all || []) as any[];
      const verified =
        totpFactors.find((f) => (f?.status || "").toLowerCase() === "verified") ||
        totpFactors[0];

      if (verified?.id) {
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
          factorId: verified.id,
        });
        if (chErr) throw chErr;

        setMfaFactorId(verified.id);
        setMfaChallengeId(ch?.id || "");
        setMfaStage("verify");
        setSuccessMsg(
          t(
            "Enter your 6-digit authenticator code.",
            "Authenticator code (၆ လုံး) ကို ထည့်ပါ။"
          )
        );
        return;
      }

      const { data: enr, error: enrErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (enrErr) throw enrErr;

      setMfaFactorId(enr?.id || "");
      setMfaQrSvg(enr?.totp?.qr_code || "");
      setMfaSecret(enr?.totp?.secret || "");

      const { data: ch2, error: ch2Err } = await supabase.auth.mfa.challenge({
        factorId: enr.id,
      });
      if (ch2Err) throw ch2Err;

      setMfaChallengeId(ch2?.id || "");
      setMfaStage("enroll");
      setSuccessMsg(
        t(
          "Scan QR with authenticator app, then enter the code.",
          "Authenticator နဲ့ QR စကန်ပြီး code ထည့်ပါ။"
        )
      );
    } catch (e: any) {
      setErrorMsg(e?.message || t("MFA setup failed.", "MFA စတင်မရပါ။"));
      setMfaStage("idle");
    } finally {
      setLoading(false);
    }
  }

  async function verifyMfa(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!otpToken || otpToken.trim().length < 6) {
      return setErrorMsg(t("Enter the 6-digit code.", "Code ၆ လုံး ထည့်ပါ။"));
    }

    setLoading(true);
    try {
      const code = otpToken.trim().replace(/\s+/g, "");
      const { error } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: mfaChallengeId,
        code,
      });
      if (error) throw error;

      const ok = await hasAal2();
      if (!ok) throw new Error("MFA verification incomplete.");

      setSuccessMsg(t("MFA verified. Redirecting…", "MFA အောင်မြင်ပါပြီ။ ဆက်သွားနေသည်…"));
      setTimeout(() => {
        nav(targetPath || "/dashboard", { replace: true });
      }, 400);
    } catch (e: any) {
      setErrorMsg(e?.message || t("Invalid code.", "Code မမှန်ပါ။"));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!SUPABASE_CONFIGURED) {
      setConfigMissing(true);
      return setErrorMsg(t("System configuration is missing.", "System config မပြည့်စုံပါ။"));
    }

    setLoading(true);
    try {
      setRememberMe(remember);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const prof = await loadProfile(data.user.id);
      await auth.refreshProfile();
      setCurrentRole(prof.role);

      const dst = defaultPortalForRole(prof.role);
      setTargetPath(dst || "/dashboard");

      const isDefault = password === "P@ssw0rd1" || password.startsWith("Britium@");

      if (prof.mustChange || isDefault) {
        setView("force_change");
        return;
      }

      const passed = await ensureMfa(prof.role);
      if (!passed) return;

      await goAfterAuth(prof.role);
    } catch (e: any) {
      console.error("Login failed", e);
      await supabase.auth.signOut();
      setErrorMsg(String(e?.message || "Access Denied: Invalid credentials."));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!resetEmail.trim()) {
      return setErrorMsg(t("Enter your email address.", "အီးမေးလ်ထည့်ပါ။"));
    }

    setLoading(true);
    try {
      const normalizedEmail = resetEmail.trim().toLowerCase();
      const response = await fetch("/api/password-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, mode: "portal" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = String(result?.error || "");
        throw new Error(code === "rate_limited" ? "Please wait and try again." : code === "invalid_email" ? "Please enter a valid email address." : "Unable to send reset email.");
      }

      setSuccessMsg(
        t(
          "Password reset link sent. Please check your email.",
          "Password reset link ပို့ပြီးပါပြီ။ Email စစ်ဆေးပါ။"
        )
      );
      setView("login");
    } catch (e: any) {
      console.error("Password recovery failed", e);

      const detail =
        e?.message === "Failed to fetch"
          ? "Password recovery could not reach the authentication service. Check network/DNS and the Supabase recovery URL configuration."
          : e?.message;

      setErrorMsg(
        detail ||
          t("Unable to send reset email.", "Reset email ပို့မရပါ။")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForcePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!newPassword || newPassword.length < 8) {
      return setErrorMsg(
        t(
          "New password must be at least 8 characters.",
          "Password အသစ်သည် အနည်းဆုံး ၈ လုံးရှိရမည်။"
        )
      );
    }

    if (newPassword !== confirmPassword) {
      return setErrorMsg(
        t("Passwords do not match.", "Password နှစ်ခု မတူပါ။")
      );
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { error: profileError } = await supabase.rpc(
          "be_complete_password_change"
        );

        if (profileError) throw profileError;
      }

      setSuccessMsg(
        t(
          "Password updated successfully. Please continue.",
          "Password အသစ်ပြောင်းပြီးပါပြီ။ ဆက်သွားနိုင်ပါသည်။"
        )
      );

      const passed = await ensureMfa(currentRole);
      if (!passed) return;

      await goAfterAuth(currentRole);
    } catch (e: any) {
      setErrorMsg(
        e?.message || t("Unable to update password.", "Password ပြောင်းမရပါ။")
      );
    } finally {
      setLoading(false);
    }
  }

  function FieldLabel({ text }: { text: string }) {
    return (
      <label className="block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
        {text}
      </label>
    );
  }


  if (view === "login") {
    const portalButtonLabel =
      portalType === "merchant"
        ? t("Enter Merchant Portal", "Merchant Portal သို့ဝင်မည်")
        : portalType === "rider"
          ? t("Enter Rider App", "Rider App သို့ဝင်မည်")
          : portalType === "finance"
            ? t("Enter Finance", "Finance သို့ဝင်မည်")
            : t("Enter Enterprise Ops", "Enterprise Ops သို့ဝင်မည်");

    const portalTileClass = (selected: boolean) =>
      [
        "group min-h-[126px] rounded-[22px] border p-5 text-left",
        "transition-all duration-200",
        selected
          ? "border-[#d8a62e] bg-[#31484b] shadow-[0_18px_50px_rgba(216,166,46,0.12)]"
          : "border-[#173b59] bg-[#071a2c] hover:border-[#328ec6] hover:bg-[#0a2238]",
      ].join(" ");

    return (
      <div className="relative min-h-screen overflow-hidden bg-[#061524] text-[#eef8ff]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_24%,rgba(0,184,217,0.40),transparent_34%),radial-gradient(circle_at_38%_73%,rgba(232,175,66,0.54),transparent_33%),linear-gradient(135deg,#03111f_0%,#0a2434_52%,#051522_100%)]" />

        <div className="pointer-events-none absolute inset-0 opacity-25">
          <div className="absolute left-[49%] top-[7%] h-[88%] w-[1px] -rotate-[-10deg] bg-gradient-to-b from-transparent via-cyan-300/30 to-transparent" />
          <div className="absolute left-[42%] top-[8%] h-[88%] w-[1px] rotate-[12deg] bg-gradient-to-b from-transparent via-cyan-300/25 to-transparent" />
          <div className="absolute left-[47%] top-[20%] h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_22px_rgba(52,211,153,0.9)]" />
          <div className="absolute left-[51%] bottom-[10%] h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_22px_rgba(251,191,36,0.9)]" />
        </div>

        <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.35fr_0.9fr]">
          <section className="hidden min-h-screen flex-col justify-end px-[5vw] pb-[8vh] pt-12 lg:flex">
            <div className="max-w-[850px]">
              <div className="mb-16 flex items-center gap-6">
                <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border border-cyan-200/40 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                  <img
                    src="/logo.png"
                    alt="Britium Express"
                    className="h-[88px] w-[88px] object-contain"
                  />
                </div>

                <div>
                  <div className="text-[16px] font-black uppercase tracking-[0.36em] text-[#ffc14d]">
                    Britium Express
                  </div>

                  <h1 className="mt-3 text-[22px] font-black text-white">
                    Enterprise Portal
                  </h1>

                  <p className="mt-2 max-w-[680px] text-[16px] leading-7 text-[#abd1e8]">
                    {t(
                      "Go-live command center for pickup, wayplan, rider verification, data entry, document print, finance and settlement.",
                      "Pickup၊ Wayplan၊ Rider Verification၊ Data Entry၊ Document Print၊ Finance နှင့် Settlement တို့အတွက် Go-live Command Center။",
                    )}
                  </p>
                </div>
              </div>

              <div className="grid max-w-[810px] grid-cols-4 gap-4">
                {[
                  ["OPS", "WORKFLOW"],
                  ["GPS", "LIVE TRACK"],
                  ["COD", "SETTLEMENT"],
                  ["UAT", "READY"],
                ].map(([value, label]) => (
                  <div
                    key={value}
                    className="rounded-[20px] border border-[#195078] bg-[#0a2235]/85 px-6 py-6 shadow-xl backdrop-blur-md"
                  >
                    <div className="text-[27px] font-medium text-[#ffbd42]">
                      {value}
                    </div>
                    <div className="mt-2 text-[14px] font-black tracking-[0.16em] text-[#9fc4df]">
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex max-w-[850px] flex-wrap gap-3">
                {[
                  "Pickup Request",
                  "Supervisor Assign",
                  "Rider Verify",
                  "Data Entry",
                  "Waybill / Invoice",
                  "COD Settlement",
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#24516f] bg-[#092037]/85 px-5 py-3 text-[14px] font-bold text-[#b9d7e9] shadow-lg"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="flex min-h-screen items-center justify-center p-4 sm:p-7 lg:justify-start lg:pr-[5vw]">
            <div className="w-full max-w-[560px] rounded-[34px] border border-[#17486b] bg-[#09283a]/90 p-6 shadow-[0_35px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
              <div className="mb-7 flex items-start justify-between gap-5">
                <div>
                  <div className="flex items-center gap-2 text-[14px] font-black uppercase tracking-[0.12em] text-[#48abe1]">
                    <ShieldCheck className="h-5 w-5" />
                    {t(
                      "Secure Workspace Access",
                      "လုံခြုံသော Workspace ဝင်ရောက်မှု",
                    )}
                  </div>

                  <h2 className="mt-4 text-[20px] font-black text-white">
                    {t("Sign in", "အကောင့်ဝင်မည်")}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleLanguage}
                    className="grid h-10 min-w-10 place-items-center rounded-full border border-[#265574] bg-[#061b2c] px-3 text-xs font-black text-[#67b8e6] hover:border-[#ffb52e]"
                  >
                    <Globe className="h-4 w-4" />
                    <span className="ml-1">
                      {currentLang === "en" ? "MY" : "EN"}
                    </span>
                  </button>

                  <span className="rounded-full border border-[#735f22] bg-[#10293a] px-4 py-2 text-[13px] font-black text-[#ffb82e]">
                    GO-LIVE
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPortalType("enterprise")}
                  className={portalTileClass(portalType === "enterprise")}
                >
                  <ShieldCheck className="h-5 w-5 text-[#49aee8]" />
                  <div className="mt-4 text-center">
                    <div className="text-[15px] font-black text-white">
                      Enterprise Ops
                    </div>
                    <div className="mt-2 text-[12px] leading-5 text-[#9fc4df]">
                      Supervisor, CS, warehouse, branch, admin
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPortalType("merchant")}
                  className={portalTileClass(portalType === "merchant")}
                >
                  <UserPlus className="h-5 w-5 text-[#49aee8]" />
                  <div className="mt-4 text-center">
                    <div className="text-[15px] font-black text-white">
                      Merchant Portal
                    </div>
                    <div className="mt-2 text-[12px] leading-5 text-[#9fc4df]">
                      Pickup request, reports, settlement, wallet
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPortalType("rider")}
                  className={portalTileClass(portalType === "rider")}
                >
                  <RefreshCw className="h-5 w-5 text-[#49aee8]" />
                  <div className="mt-4 text-center">
                    <div className="text-[15px] font-black text-white">
                      Rider App
                    </div>
                    <div className="mt-2 text-[12px] leading-5 text-[#9fc4df]">
                      Pickup verification, delivery, GPS, wallet
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPortalType("finance")}
                  className={portalTileClass(portalType === "finance")}
                >
                  <Download className="h-5 w-5 text-[#49aee8]" />
                  <div className="mt-4 text-center">
                    <div className="text-[15px] font-black text-white">
                      Finance
                    </div>
                    <div className="mt-2 text-[12px] leading-5 text-[#9fc4df]">
                      COD, P&amp;L, ledger, settlement reports
                    </div>
                  </div>
                </button>
              </div>

              {configMissing && (
                <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold text-amber-200">
                  {t(
                    "Supabase configuration is missing. Please check environment variables.",
                    "Supabase configuration မပြည့်စုံပါ။ Environment variables စစ်ဆေးပါ။",
                  )}
                </div>
              )}

              {errorMsg && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-xs font-bold leading-relaxed">
                    {errorMsg}
                  </p>
                </div>
              )}

              {successMsg && (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <p className="text-xs font-bold leading-relaxed">
                    {successMsg}
                  </p>
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-6 space-y-5">
                <div className="space-y-2">
                  <FieldLabel
                    text={t("Email or Staff ID", "Email သို့မဟုတ် Staff ID")}
                  />

                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#43a8dd]" />

                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                      className="h-14 rounded-[18px] border-[#164568] bg-[#061a2c] pl-12 text-white placeholder:text-[#5f8199] focus-visible:ring-[#f6b84b]"
                      placeholder="name@britiumexpress.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel text={t("Password", "စကားဝှက်")} />

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#43a8dd]" />

                    <Input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="h-14 rounded-[18px] border-[#164568] bg-[#061a2c] pl-12 pr-12 text-white placeholder:text-[#5f8199] focus-visible:ring-[#f6b84b]"
                      placeholder={t("Password", "စကားဝှက်")}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#43a8dd] hover:text-white"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <label className="flex cursor-pointer items-center gap-2 font-black uppercase tracking-[0.08em] text-[#a8c8da]">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 accent-[#f6b84b]"
                    />
                    {t(
                      "Remember this workspace",
                      "ဤ Workspace ကို မှတ်ထားမည်",
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setResetEmail(email);
                      setView("forgot");
                    }}
                    className="font-black text-[#4cb0e6] hover:text-[#f6b84b]"
                  >
                    {t("Forgot password?", "Password မေ့နေပါသလား?")}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-[60px] w-full items-center justify-center rounded-[18px] bg-gradient-to-r from-[#ffbd43] to-[#ff754c] px-6 text-[15px] font-black text-[#07121c] shadow-[0_18px_46px_rgba(255,144,64,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      {portalButtonLabel}
                      <ArrowRight className="ml-3 h-5 w-5" />
                    </>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => nav("/signup")}
                className="mt-5 w-full text-center text-[13px] font-black text-[#4baadd] hover:text-[#f6b84b]"
              >
                {t("Request new account", "အကောင့်အသစ် တောင်းဆိုမည်")}
              </button>

              <div className="mt-6 rounded-[20px] border border-[#17486b] bg-[#061b2d] p-4">
                <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-[#ffb82e]">
                  <Download className="h-4 w-4" />
                  Mobile APK downloads
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["Rider APK", "/downloads/britium-rider.apk"],
                    ["Driver APK", "/downloads/britium-driver.apk"],
                    ["Helper APK", "/downloads/britium-helper.apk"],
                  ].map(([label, href]) => (
                    <a
                      key={label}
                      href={href}
                      download
                      className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#17486b] bg-[#0c2b45] px-2 text-center text-[12px] font-black text-[#d6ebf8] hover:border-[#f6b84b] hover:text-[#f6b84b]"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      {label}
                    </a>
                  ))}
                </div>
              </div>

              <p className="mt-4 text-center text-[10px] leading-5 text-[#66879c]">
                Access remains controlled by the authenticated account role.
                Workspace selection does not override permissions.
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#05080F] p-4 text-slate-100">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none grayscale"
      >
        <source src="/background.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_20%,rgba(16,185,129,0.16),transparent_60%)]" />

      <div className="absolute top-6 right-6 z-20">
        <Button
          onClick={toggleLanguage}
          variant="outline"
          className="bg-black/40 border-white/10 text-slate-200 hover:bg-white/5 rounded-full"
        >
          <Globe className="h-4 w-4 mr-2" />
          <span className="text-xs font-black tracking-widest uppercase">
            {currentLang === "en" ? "MY" : "EN"}
          </span>
        </Button>
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6 py-12">
        <div className="text-center space-y-2">
          <div className="mx-auto h-28 w-28 rounded-2xl bg-black/40 border border-white/10 grid place-items-center overflow-hidden shadow-2xl">
            <img src="/logo.png" alt="Britium" className="h-20 w-20 object-contain" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white">{brand.title}</h1>
          <p className="text-sm text-slate-300">
            {t(brand.subtitleEn, brand.subtitleMy)}
          </p>
        </div>

        <Card className="bg-[#0B101B]/85 backdrop-blur-xl border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 to-teal-400" />

          <CardContent className="p-7 md:p-8 space-y-5">
            {configMissing && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-xs font-bold leading-relaxed">
                {t(
                  "Supabase configuration is missing. Please check environment variables.",
                  "Supabase configuration မပြည့်စုံပါ။ Environment variables စစ်ဆေးပါ။"
                )}
              </div>
            )}

            {errorMsg && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-300">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="text-xs font-bold leading-relaxed">{errorMsg}</p>
              </div>
            )}

            {successMsg && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3 text-emerald-200">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="text-xs font-bold leading-relaxed">{successMsg}</p>
              </div>
            )}

            {view === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel text={t("Corporate Email", "အီးမေးလ်")} />
                  <div className="relative">
                    <Mail className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
                    <Input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl pl-12"
                      placeholder={t("Corporate Email", "အီးမေးလ်")}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel text={t("Password", "စကားဝှက်")} />
                  <div className="relative">
                    <Lock className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl pl-12"
                      placeholder={t("Password", "စကားဝှက်")}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="rounded border-white/20 bg-transparent"
                    />
                    <span>{t("Remember me", "မှတ်ထားမည်")}</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setResetEmail(email);
                      setView("forgot");
                    }}
                    className="font-bold uppercase tracking-widest text-slate-400 hover:text-white"
                  >
                    {t("Forgot Password?", "Password မေ့နေပါသလား?")}
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase rounded-xl"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {t("Login", "အကောင့်ဝင်မည်")}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            )}

            {view === "forgot" && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel text={t("Reset Email", "Reset ပြုလုပ်ရန် အီးမေးလ်")} />
                  <div className="relative">
                    <Mail className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
                    <Input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl pl-12"
                      placeholder={t("Corporate Email", "အီးမေးလ်")}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase rounded-xl"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("Send Reset Link", "Reset Link ပို့မည်")
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    clearMessages();
                    setView("login");
                  }}
                  className="w-full h-12 bg-black/30 border-white/10 text-white rounded-xl"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t("Back to Login", "Login သို့ပြန်သွားမည်")}
                </Button>
              </form>
            )}

            {view === "force_change" && (
              <form onSubmit={handleForcePasswordChange} className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-200">
                  <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
                  <div className="text-xs font-bold leading-relaxed">
                    {t(
                      "You must change your password before continuing.",
                      "ဆက်လက်မလုပ်ဆောင်မီ password အသစ်ပြောင်းရန်လိုအပ်ပါသည်။"
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel text={t("New Password", "Password အသစ်")} />
                  <div className="relative">
                    <Lock className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
                    <Input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl pl-12"
                      placeholder={t("New Password", "Password အသစ်")}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel text={t("Confirm Password", "Password ပြန်ရိုက်ပါ")} />
                  <div className="relative">
                    <Lock className="absolute left-4 top-4 h-5 w-5 text-slate-400" />
                    <Input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-black/40 border-white/10 text-white h-12 rounded-xl pl-12"
                      placeholder={t("Confirm Password", "Password ပြန်ရိုက်ပါ")}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase rounded-xl"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t("Update Password", "Password ပြောင်းမည်")
                  )}
                </Button>
              </form>
            )}

            {view === "mfa" && (
              <div className="space-y-5">
                {mfaStage === "enroll" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-center">
                      {mfaQrSvg ? (
                        <div
                          className="mx-auto mb-4 max-w-[220px] [&>svg]:h-auto [&>svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: mfaQrSvg }}
                        />
                      ) : (
                        <div className="text-sm text-slate-400">
                          {t("QR not available.", "QR မရရှိနိုင်ပါ။")}
                        </div>
                      )}

                      {mfaSecret ? (
                        <div className="rounded-lg bg-black/40 px-3 py-2 text-xs font-mono text-emerald-200 break-all">
                          {mfaSecret}
                        </div>
                      ) : null}

                      {mfaSecret ? (
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(mfaSecret)}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 hover:bg-white/5"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {t("Copy Secret", "Secret ကို copy ယူမည်")}
                        </button>
                      ) : null}
                    </div>

                    <form onSubmit={verifyMfa} className="space-y-4">
                      <div className="space-y-2">
                        <FieldLabel text={t("Authenticator Code", "Authenticator Code")} />
                        <Input
                          type="text"
                          required
                          value={otpToken}
                          onChange={(e) => setOtpToken(e.target.value)}
                          className="bg-black/40 border-white/10 text-white h-12 rounded-xl"
                          placeholder="123456"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase rounded-xl"
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t("Verify MFA", "MFA အတည်ပြုမည်")
                        )}
                      </Button>
                    </form>
                  </div>
                )}

                {mfaStage === "verify" && (
                  <form onSubmit={verifyMfa} className="space-y-4">
                    <div className="space-y-2">
                      <FieldLabel text={t("6-digit Code", "၆ လုံးပါ Code")} />
                      <Input
                        type="text"
                        required
                        value={otpToken}
                        onChange={(e) => setOtpToken(e.target.value)}
                        className="bg-black/40 border-white/10 text-white h-12 rounded-xl"
                        placeholder="123456"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase rounded-xl"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("Verify MFA", "MFA အတည်ပြုမည်")
                      )}
                    </Button>
                  </form>
                )}

                {mfaStage === "idle" && (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      onClick={() => void prepareMfa()}
                      disabled={loading}
                      className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black tracking-widest uppercase rounded-xl"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {t("Prepare MFA", "MFA ပြင်ဆင်မည်")}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
