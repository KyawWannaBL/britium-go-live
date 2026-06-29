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
  const mustChange =
    Boolean(row.must_change_password) || Boolean(row.requires_password_change);

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

      await auth.refresh?.();

      const prof = await loadProfile(data.user.id);
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
      setErrorMsg(
        t(
          "Access Denied: Invalid credentials.",
          "ဝင်ရောက်ခွင့် ငြင်းပယ်ခံရသည်: အချက်အလက်မှားနေသည်။"
        )
      );
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
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo,
      });
      if (error) throw error;

      setSuccessMsg(
        t(
          "Password reset link sent. Please check your email.",
          "Password reset link ပို့ပြီးပါပြီ။ Email စစ်ဆေးပါ။"
        )
      );
      setView("login");
    } catch (e: any) {
      setErrorMsg(
        e?.message ||
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
        await supabase
          .from("profiles")
          .update({
            must_change_password: false,
            requires_password_change: false,
          })
          .eq("id", user.id);
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
