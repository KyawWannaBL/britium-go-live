import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

async function markPasswordChangeComplete(mode: string) {
  try {
    const { error } = await (supabase as any).rpc("be_complete_password_change", {
      p_mode: mode,
    });

    if (error) throw error;
    return;
  } catch (error) {
    console.warn("Password-change completion RPC unavailable. Trying table fallbacks.", error);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user?.id) return;

  if (mode === "rider") {
    try {
      await (supabase as any)
        .from("be_mobile_workforce_accounts")
        .update({
          must_change_password: false,
          force_password_change: false,
          password_changed_at: new Date().toISOString(),
        })
        .eq("auth_user_id", user.id);
    } catch (error) {
      console.warn("Workforce password flag update skipped:", error);
    }
  } else {
    try {
      await (supabase as any)
        .from("be_user_account_registry")
        .update({
          must_change_password: false,
          force_password_change: false,
          password_changed_at: new Date().toISOString(),
        })
        .eq("auth_user_id", user.id);
    } catch (error) {
      console.warn("Registry password flag update skipped:", error);
    }
  }
}

export default function MustChangePasswordClient() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const mode = searchParams.get("mode") === "rider" ? "rider" : "portal";
  const loginPath = mode === "rider" ? "/rider-login" : "/login";

  const nextPath = useMemo(() => {
    return searchParams.get("next") || (mode === "rider" ? "/rider-dashboard" : "/dashboard");
  }, [searchParams, mode]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data?.session?.user) {
        setError("Your reset/change-password session is not active. Please request a new reset link or sign in again.");
      }
      setCheckingSession(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      if (!password || password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await markPasswordChangeComplete(mode);

      setInfo("Password changed successfully. Redirecting...");
      setTimeout(() => navigate(nextPath, { replace: true }), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#061524] text-[#eef8ff] font-sans flex items-center justify-center px-6 py-10">
      <section className="w-full max-w-[520px] rounded-[32px] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-3xl bg-[#061524] border border-[#1a3a5c] flex items-center justify-center">
            <Lock className="h-7 w-7 text-[#f6b84b]" />
          </div>
          <p className="mt-5 text-[#f6b84b] text-[11px] font-black uppercase tracking-[0.35em]">
            {mode === "rider" ? "Rider App Security" : "Portal Security"}
          </p>
          <h1 className="mt-3 text-[30px] font-black">Change Your Password</h1>
          <p className="mt-3 text-[13px] font-semibold leading-6 text-[#9bb7cc]">
            You must set a new password before continuing.
          </p>
        </div>

        {checkingSession ? (
          <div className="mt-8 flex items-center justify-center gap-3 text-[#9bb7cc]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking secure session...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#4d7a9b]">New Password</span>
              <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#1a3a5c] bg-[#061524] px-4 focus-within:border-[#f6b84b]">
                <Lock className="h-5 w-5 text-[#4d7a9b]" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="h-full flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-[#4d7a9b]"
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-[#4d7a9b] hover:text-[#f6b84b]">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-widest text-[#4d7a9b]">Confirm Password</span>
              <div className="flex h-14 items-center gap-3 rounded-2xl border border-[#1a3a5c] bg-[#061524] px-4 focus-within:border-[#f6b84b]">
                <Lock className="h-5 w-5 text-[#4d7a9b]" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="h-full flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-[#4d7a9b]"
                  autoComplete="new-password"
                  required
                />
                <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="text-[#4d7a9b] hover:text-[#f6b84b]">
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>

            {error ? <div className="rounded-2xl border border-[#ff4d8d]/50 bg-[#ff4d8d]/10 p-4 text-sm font-bold text-[#ff8fbd]">{error}</div> : null}
            {info ? (
              <div className="rounded-2xl border border-[#22c55e]/50 bg-[#22c55e]/10 p-4 text-sm font-bold text-[#86efac] flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {info}
              </div>
            ) : null}

            <button
              type="submit"
              className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#f6b84b] px-5 font-black text-[#061524] hover:bg-[#e5a93a] disabled:opacity-60"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {loading ? "Updating..." : "Update Password"}
            </button>

            <Link to={loginPath} className="block text-center text-[12px] font-bold text-[#4ea8de] hover:text-[#f6b84b]">
              Back to login
            </Link>
          </form>
        )}
      </section>
    </main>
  );
}
