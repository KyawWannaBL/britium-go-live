import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Login = { auth_user_id: string; email: string; full_name: string };
const administrators = new Set(["admin", "superadmin", "super-admin", "app-owner", "sys"]);
const input = "min-h-10 w-full rounded-lg border border-[#31506a] bg-[#061524] p-2 text-sm";

export default function ExistingMerchantLoginLink() {
  const { role } = useAuth();
  const allowed = administrators.has(String(role || "").toLowerCase().replace(/[ _]+/g, "-"));
  const [accounts, setAccounts] = useState<Login[]>([]);
  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("be_merchant_account_link");
    if (error) setError(error.message);
    else setAccounts(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  if (!allowed) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !account) return;
    const login = accounts.find(candidate => candidate.auth_user_id === account);
    const normalizedCode = code.trim().toUpperCase();
    if (!login || !window.confirm(`Give ${login.email} access to shipments and settlement records for merchant ${normalizedCode}?`)) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { data, error } = await supabase.rpc("be_merchant_account_link", { p_user_id: account, p_merchant_code: normalizedCode });
      if (error) throw new Error(error.message);
      setStatus(`${login.email} is linked to ${data.merchant_name} (${data.merchant_code}).`);
      setAccount("");
      setCode("");
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The merchant login could not be linked.");
    } finally { setBusy(false); }
  }

  return <section className="space-y-3 rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-4">
    <h2 className="font-bold">Link an existing merchant login</h2>
    {accounts.length ? <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
      <label className="grid min-w-48 flex-1 gap-1 text-sm">Merchant login
        <select className={input} value={account} onChange={event => setAccount(event.target.value)} required>
          <option value="">Select an unlinked login</option>
          {accounts.map(login => <option key={login.auth_user_id} value={login.auth_user_id}>{login.email}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">Merchant master code
        <input className={input} value={code} onChange={event => setCode(event.target.value.toUpperCase())} pattern="[A-Z][A-Z0-9]{1,2}" maxLength={3} required />
      </label>
      <button className="rounded-lg bg-[#f6b84b] px-4 py-2 text-sm font-bold text-[#061524] disabled:opacity-50" disabled={busy}>Link merchant login</button>
    </form> : !error && <p className="text-sm text-[#9cc2d9]">No unlinked active merchant logins.</p>}
    {status && <p role="status" className="text-sm text-emerald-300">{status}</p>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
  </section>;
}
