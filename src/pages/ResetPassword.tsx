import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

function readRecoveryTokens() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);

  return {
    accessToken: hash.get("access_token") || search.get("access_token"),
    refreshToken: hash.get("refresh_token") || search.get("refresh_token"),
    type: hash.get("type") || search.get("type"),
  };
}

export default function ResetPassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [booting, setBooting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const passwordMismatch = useMemo(() => {
    return confirmPassword.length > 0 && password !== confirmPassword;
  }, [password, confirmPassword]);

  useEffect(() => {
    let active = true;

    async function initRecovery() {
      try {
        const { accessToken, refreshToken, type } = readRecoveryTokens();

        if (type !== "recovery" || !accessToken || !refreshToken) {
          throw new Error("Invalid or expired password reset link.");
        }

        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) throw error;

        if (active) setReady(true);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to verify reset link.");
          setReady(false);
        }
      } finally {
        if (active) setBooting(false);
      }
    }

    void initRecovery();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!password.trim()) {
      setError("New password is required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw error;

      setSuccess("Password updated successfully. Please sign in again.");

      await supabase.auth.signOut();

      window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fbff_0%,#eef4fb_54%,#f8fafc_100%)] px-4">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-[#0d2c54]">Reset Password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set a new password for your Britium Express account.
        </p>

        {booting ? (
          <div className="mt-8 inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying reset link...
          </div>
        ) : !ready ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error || "This reset link is invalid or expired."}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                New Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                  placeholder="Enter new password"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none transition focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            {passwordMismatch ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Passwords do not match.
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>{error}</span>
              </div>
            ) : null}

            {success ? (
              <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4" />
                <span>{success}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || passwordMismatch}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0d2c54] px-4 text-sm font-black uppercase tracking-[0.16em] text-white disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating
                </>
              ) : (
                "Update Password"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}