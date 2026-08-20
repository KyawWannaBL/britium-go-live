import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, UserCog } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

export const ACCOUNTS_PRODUCTION_BUILD =
  "ACCOUNTS_TRUSTED_ADMIN_BOUNDARY_NO_DEMO_V56_2026_07_31";

type SessionAccount = {
  id: string;
  email: string;
  created_at?: string | null;
  last_sign_in_at?: string | null;
};

export default function AccountsPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<SessionAccount | null>(null);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const user = data.user;
      setAccount(
        user
          ? {
              id: user.id,
              email: user.email || "",
              created_at: user.created_at || null,
              last_sign_in_at: user.last_sign_in_at || null,
            }
          : null,
      );
    } catch (loadError: any) {
      setAccount(null);
      setError(loadError?.message || "Unable to read the authenticated account session.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="space-y-6" data-build={ACCOUNTS_PRODUCTION_BUILD}>
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div className="flex items-start gap-4">
          <div className="hidden rounded-xl bg-[#1a3a5c] p-3 md:block">
            <UserCog className="text-[#f6b84b]" size={20} />
          </div>
          <div>
            <h1 className="mb-1 text-[16px] uppercase text-[#f6b84b]">
              {t("ACCOUNT MANAGEMENT", "အကောင့် စီမံခန့်ခွဲမှု")}
            </h1>
            <p className="text-[13px] text-[#4d7a9b]">
              {t(
                "Trusted account administration boundary and current authenticated session.",
                "ယုံကြည်ရသော အကောင့်စီမံခန့်ခွဲမှု နယ်နိမိတ်နှင့် လက်ရှိအကောင့်။",
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-4 py-2.5 text-[13px] text-[#eef8ff] transition-colors hover:border-[#f6b84b] disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} />
          <span className="hidden md:inline">{t("Refresh", "ပြန်လည်စတင်ရန်")}</span>
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-700 bg-amber-950/25 p-4 text-[12px] leading-6 text-amber-100">
        <AlertTriangle size={17} className="mt-1 shrink-0" />
        <div>
          <div className="font-black uppercase tracking-wider">Privileged operations are disabled</div>
          <p className="mt-1">
            The supplied production source does not include the trusted account-admin Edge Function or a reviewed account-registry snapshot contract. Create, reset, block, role, permission, branch, and expiry actions are intentionally unavailable instead of performing direct browser administration.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-700 bg-rose-950/25 px-4 py-3 text-[12px] text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric label="CURRENT SESSION" value={account ? "1" : "0"} />
        <Metric label="ACCOUNT REGISTRY" value="NOT CONNECTED" muted />
        <Metric label="ADMIN MUTATIONS" value="DISABLED" muted />
      </div>

      <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236]">
        <div className="flex items-center gap-2 border-b border-[#1a3a5c] p-4 text-[14px] uppercase tracking-widest text-[#eef8ff]">
          <ShieldCheck size={16} className="text-[#f6b84b]" />
          Authenticated Session
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead className="bg-[#061524] text-[11px] uppercase tracking-widest text-[#4d7a9b]">
              <tr>
                <th className="p-4">User ID</th>
                <th className="p-4">Email</th>
                <th className="p-4">Created</th>
                <th className="p-4">Last Sign-In</th>
                <th className="p-4">Scope</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-[#4d7a9b]">Loading authenticated session...</td></tr>
              ) : account ? (
                <tr className="border-t border-[#1a3a5c] text-[#eef8ff]">
                  <td className="p-4 font-mono text-[11px]">{account.id}</td>
                  <td className="p-4">{account.email || "—"}</td>
                  <td className="p-4 text-[#8fb4d0]">{formatDate(account.created_at)}</td>
                  <td className="p-4 text-[#8fb4d0]">{formatDate(account.last_sign_in_at)}</td>
                  <td className="p-4"><span className="rounded-full border border-cyan-600/40 bg-cyan-900/20 px-2 py-1 text-[10px] font-black text-cyan-300">SELF SESSION ONLY</span></td>
                </tr>
              ) : (
                <tr><td colSpan={5} className="p-8 text-center text-[#4d7a9b]">No authenticated session account is available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#4d7a9b]">{label}</div>
      <div className={`text-[18px] font-black ${muted ? "text-amber-300" : "text-[#f6b84b]"}`}>{value}</div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
