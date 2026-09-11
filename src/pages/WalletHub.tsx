import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CreditCard,
  Landmark,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";

type View = "overview" | "transactions" | "accounts" | "settlements";

type WalletAccountRow = {
  id: string;
  accountName: string;
  currency: string;
  balance: number;
  available: number;
  pending: number;
  updatedAt: string;
};

type WalletTransactionRow = {
  id: string;
  referenceNo: string;
  type: string;
  amount: number;
  status: string;
  channel: string;
  createdAt: string;
};

type ToastTone = "ok" | "warn" | "err";

function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] border border-black/10 bg-white/55 p-6 shadow-sm backdrop-blur-md">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-700">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  tone = "default",
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-slate-950";

  return (
    <div className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm">
      <div className="flex items-center gap-3 text-slate-600">{icon}</div>
      <div className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
        {title}
      </div>
      <div className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-2xl bg-[#0d2c54] px-4 py-3 text-xs font-black uppercase tracking-wider text-white"
          : "rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-white/90"
      }
    >
      {children}
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-black/10 bg-white/40 p-10 text-center">
      <div className="text-lg font-black text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{description}</div>
    </div>
  );
}

function mmk(value: number) {
  return `${Number(value || 0).toLocaleString()} Ks`;
}

export default function WalletHub() {
  const navigate = useNavigate();

  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<WalletAccountRow[]>([]);
  const [transactions, setTransactions] = useState<WalletTransactionRow[]>([]);
  const [toast, setToast] = useState<{ tone: ToastTone; message: string } | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    void loadWallet();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadWallet() {
    setLoading(true);
    setLoadError("");

    try {
      const [accountsRes, txRes] = await Promise.all([
        supabase
          .from("wallet_accounts")
          .select(
            "id, account_name, currency, balance, available_balance, pending_balance, updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("wallet_transactions")
          .select(
            "id, reference_no, transaction_type, amount, status, channel, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (accountsRes.error) {
        throw new Error(`wallet_accounts: ${accountsRes.error.message}`);
      }

      if (txRes.error) {
        throw new Error(`wallet_transactions: ${txRes.error.message}`);
      }

      setAccounts(
        (accountsRes.data || []).map((row: any) => ({
          id: String(row.id),
          accountName: row.account_name || "Wallet Account",
          currency: row.currency || "MMK",
          balance: Number(row.balance || 0),
          available: Number(row.available_balance || 0),
          pending: Number(row.pending_balance || 0),
          updatedAt: row.updated_at || "-",
        }))
      );

      setTransactions(
        (txRes.data || []).map((row: any) => ({
          id: String(row.id),
          referenceNo: row.reference_no || `TX-${row.id}`,
          type: row.transaction_type || "Transaction",
          amount: Number(row.amount || 0),
          status: row.status || "POSTED",
          channel: row.channel || "Wallet",
          createdAt: row.created_at || "-",
        }))
      );

      setToast({
        tone: "ok",
        message: "Wallet hub refreshed from Supabase.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load wallet data.";
      setLoadError(message);
      setAccounts([]);
      setTransactions([]);
      setToast({
        tone: "err",
        message: "Wallet hub could not load backend data.",
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((row) =>
      [row.referenceNo, row.type, row.status, row.channel]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [transactions, query]);

  const totals = useMemo(() => {
    const totalBalance = accounts.reduce((sum, row) => sum + row.balance, 0);
    const totalAvailable = accounts.reduce((sum, row) => sum + row.available, 0);
    const totalPending = accounts.reduce((sum, row) => sum + row.pending, 0);
    const settlementOut = transactions
      .filter((row) => row.type.toLowerCase().includes("settlement"))
      .reduce((sum, row) => sum + Math.abs(Math.min(row.amount, 0)), 0);

    return {
      totalBalance,
      totalAvailable,
      totalPending,
      settlementOut,
    };
  }, [accounts, transactions]);

  const settlementRows = useMemo(() => {
    return transactions.filter(
      (row) =>
        row.type.toLowerCase().includes("settlement") ||
        row.type.toLowerCase().includes("cod")
    );
  }, [transactions]);

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="rounded-[36px] border border-black/10 bg-white/55 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">
              Finance / Treasury
            </div>
            <h1 className="mt-2 text-4xl font-black text-slate-950">Wallet Hub</h1>
            <p className="mt-3 max-w-4xl text-sm text-slate-700">
              Live wallet balances, COD holdings, settlements, and transaction monitoring from the backend only.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate("/create-delivery")}
              className="rounded-2xl border border-black/10 bg-white/80 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-800 hover:bg-white"
            >
              Open Create Delivery
            </button>
            <button
              type="button"
              onClick={() => void loadWallet()}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#0d2c54] px-4 py-3 text-xs font-black uppercase tracking-wider text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh Wallet
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <TabButton active={view === "overview"} onClick={() => setView("overview")}>
            Overview
          </TabButton>
          <TabButton active={view === "transactions"} onClick={() => setView("transactions")}>
            Transactions
          </TabButton>
          <TabButton active={view === "accounts"} onClick={() => setView("accounts")}>
            Accounts
          </TabButton>
          <TabButton active={view === "settlements"} onClick={() => setView("settlements")}>
            Settlements
          </TabButton>
        </div>
      </div>

      {toast ? (
        <div
          className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            toast.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : toast.tone === "warn"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      ) : null}

      {view === "overview" ? (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Total Wallet Balance"
              value={mmk(totals.totalBalance)}
              icon={<Wallet className="h-5 w-5 text-slate-600" />}
            />
            <StatCard
              title="Available Balance"
              value={mmk(totals.totalAvailable)}
              icon={<CreditCard className="h-5 w-5 text-emerald-600" />}
              tone="good"
            />
            <StatCard
              title="Pending Hold"
              value={mmk(totals.totalPending)}
              icon={<Landmark className="h-5 w-5 text-amber-600" />}
              tone="warn"
            />
            <StatCard
              title="Settlement Outflow"
              value={mmk(totals.settlementOut)}
              icon={<Building2 className="h-5 w-5 text-slate-600" />}
            />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Panel
              title="Wallet Accounts"
              subtitle="Loaded from wallet_accounts."
            >
              {accounts.length === 0 ? (
                <EmptyState
                  title="No wallet accounts found"
                  description="Create or sync wallet account records in Supabase to display balances here."
                />
              ) : (
                <div className="space-y-3">
                  {accounts.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-[24px] border border-black/10 bg-white/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-black text-slate-950">{row.accountName}</div>
                          <div className="mt-1 text-sm text-slate-600">{row.currency}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-black text-slate-950">
                            {mmk(row.balance)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Updated {row.updatedAt}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Available
                          </div>
                          <div className="mt-1 font-black text-emerald-700">
                            {mmk(row.available)}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-white p-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                            Pending
                          </div>
                          <div className="mt-1 font-black text-amber-700">
                            {mmk(row.pending)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Recent Wallet Activity"
              subtitle="Loaded from wallet_transactions."
            >
              {transactions.length === 0 ? (
                <EmptyState
                  title="No transactions found"
                  description="Wallet movements will appear here after backend transactions are posted."
                />
              ) : (
                <div className="space-y-3">
                  {transactions.slice(0, 6).map((row) => (
                    <div
                      key={row.id}
                      className="rounded-[24px] border border-black/10 bg-white/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="rounded-2xl bg-white p-3">
                            {row.amount >= 0 ? (
                              <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <ArrowUpRight className="h-5 w-5 text-rose-600" />
                            )}
                          </div>
                          <div>
                            <div className="font-black text-slate-950">{row.type}</div>
                            <div className="mt-1 text-sm text-slate-600">{row.referenceNo}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {row.channel} · {row.createdAt}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`text-right text-xl font-black ${
                            row.amount >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {row.amount >= 0 ? "+" : "-"}
                          {mmk(Math.abs(row.amount))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      ) : null}

      {view === "transactions" ? (
        <div className="mt-6">
          <Panel
            title="Wallet Transactions"
            subtitle="Search references, transaction types, statuses, and channels."
            action={
              <div className="relative w-full md:w-[320px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search transactions"
                  className="h-11 w-full rounded-xl border border-black/10 bg-white/80 pl-10 pr-4 text-sm outline-none"
                />
              </div>
            }
          >
            {filteredTransactions.length === 0 ? (
              <EmptyState
                title="No matching transactions"
                description="No backend wallet transactions matched your current search."
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-black/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/80 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-black">Reference</th>
                      <th className="px-4 py-3 font-black">Type</th>
                      <th className="px-4 py-3 font-black">Channel</th>
                      <th className="px-4 py-3 font-black">Status</th>
                      <th className="px-4 py-3 font-black">Created</th>
                      <th className="px-4 py-3 font-black text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((row) => (
                      <tr key={row.id} className="border-t border-black/5 bg-white/50">
                        <td className="px-4 py-3 font-semibold text-slate-950">
                          {row.referenceNo}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.type}</td>
                        <td className="px-4 py-3 text-slate-700">{row.channel}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-700">
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.createdAt}</td>
                        <td
                          className={`px-4 py-3 text-right font-black ${
                            row.amount >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {row.amount >= 0 ? "+" : "-"}
                          {mmk(Math.abs(row.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {view === "accounts" ? (
        <div className="mt-6">
          <Panel
            title="Wallet Accounts"
            subtitle="Treasury accounts, settlement accounts, and pending reserves."
          >
            {accounts.length === 0 ? (
              <EmptyState
                title="No wallet accounts available"
                description="The backend returned no wallet account records."
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {accounts.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-[28px] border border-black/10 bg-white/70 p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                          {row.id}
                        </div>
                        <div className="mt-2 text-2xl font-black text-slate-950">
                          {row.accountName}
                        </div>
                      </div>
                      <Wallet className="h-6 w-6 text-slate-500" />
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl bg-white p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          Total
                        </div>
                        <div className="mt-2 font-black text-slate-950">
                          {mmk(row.balance)}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          Available
                        </div>
                        <div className="mt-2 font-black text-emerald-700">
                          {mmk(row.available)}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          Pending
                        </div>
                        <div className="mt-2 font-black text-amber-700">
                          {mmk(row.pending)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {view === "settlements" ? (
        <div className="mt-6">
          <Panel
            title="Settlement Queue"
            subtitle="Current settlement-facing wallet transactions."
          >
            {settlementRows.length === 0 ? (
              <EmptyState
                title="No settlement records"
                description="No COD or settlement transactions were returned from the backend."
              />
            ) : (
              <div className="space-y-3">
                {settlementRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-[24px] border border-black/10 bg-white/70 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-black text-slate-950">{row.referenceNo}</div>
                        <div className="mt-1 text-sm text-slate-700">{row.type}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {row.channel} · {row.createdAt}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-700">
                          {row.status}
                        </span>
                        <div
                          className={`text-lg font-black ${
                            row.amount >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {row.amount >= 0 ? "+" : "-"}
                          {mmk(Math.abs(row.amount))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}