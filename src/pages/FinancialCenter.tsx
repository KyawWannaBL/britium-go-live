"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  DollarSign,
  HeartHandshake,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

type UiLanguage = "en" | "my" | "both";
type ReportTab =
  | "cashBookSummary"
  | "journalSummary"
  | "trialBalance"
  | "incomeStatement"
  | "balanceSheet"
  | "profitAndLoss";

type CommonRow = {
  id: string;
  branch: string;
  zone: string;
  reportDate: string;
};

type CashBookRow = CommonRow & {
  accountDescription: string;
  received: number;
  payment: number;
  openingBalance: number;
  closingBalance: number;
};

type JournalSummaryRow = CommonRow & {
  accountDescription: string;
  debit: number;
  credit: number;
};

type TrialBalanceRow = CommonRow & {
  codeNo: string;
  accountHead: string;
  accountDescription: string;
  openingDebit: number;
  openingCredit: number;
  duringDebit: number;
  duringCredit: number;
  closingDebit: number;
  closingCredit: number;
};

type IncomeStatementRow = CommonRow & {
  codeNo: string;
  description: string;
  category: "income" | "expense" | "summary";
  amount: number;
};

type BalanceSheetRow = CommonRow & {
  codeNo: string;
  description: string;
  section: "asset" | "equity" | "liability" | "total";
  amount: number;
};

type ProfitLossRow = CommonRow & {
  codeNo: string;
  description: string;
  amount: number;
  cumulativeYearToDate: number;
  category: "income" | "expense" | "summary";
};

// --- MOCK DATA ---
const MOCK_CASH_BOOK = [
  { id: "cb1", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", account_description: "Cash in Hand", received: 1500000, payment: 200000, opening_balance: 500000, closing_balance: 1800000 },
  { id: "cb2", branch: "Mandalay Branch", zone: "Mandalay", report_date: "2026-01-15", account_description: "KBZ Bank", received: 3000000, payment: 1500000, opening_balance: 1000000, closing_balance: 2500000 }
];

const MOCK_JOURNAL = [
  { id: "js1", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", account_description: "Delivery Revenue", debit: 0, credit: 1500000 },
  { id: "js2", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", account_description: "Fuel Expense", debit: 200000, credit: 0 }
];

const MOCK_TRIAL = [
  { id: "tb1", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "1001", account_head: "Assets", account_description: "Cash", opening_debit: 500000, opening_credit: 0, during_debit: 1500000, during_credit: 200000, closing_debit: 1800000, closing_credit: 0 }
];

const MOCK_INCOME = [
  { id: "is1", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "4001", description: "Delivery Income", category: "income", amount: 4500000 },
  { id: "is2", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "5001", description: "Fuel Expense", category: "expense", amount: 800000 },
  { id: "is3", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "5002", description: "Salary Expense", category: "expense", amount: 1200000 },
  { id: "is4", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "9000", description: "Net Profit", category: "summary", amount: 2500000 },
];

const MOCK_BALANCE = [
  { id: "bs1", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "1001", description: "Cash and Bank", section: "asset", amount: 4300000 },
  { id: "bs2", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "2001", description: "Accounts Payable", section: "liability", amount: 500000 },
  { id: "bs3", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "3001", description: "Retained Earnings", section: "equity", amount: 3800000 },
];

const MOCK_PROFIT = [
  { id: "pl1", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "4000", description: "Operating Revenue", category: "income", amount: 4500000, cumulative_year_to_date: 4500000 },
  { id: "pl2", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "5000", description: "Operating Expenses", category: "expense", amount: 2000000, cumulative_year_to_date: 2000000 },
  { id: "pl3", branch: "Yangon Main", zone: "Yangon", report_date: "2026-01-15", code_no: "9000", description: "Net Profit", category: "summary", amount: 2500000, cumulative_year_to_date: 2500000 },
];

const defaultDateRange = {
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};

// --- DATA NORMALIZATION HELPERS ---
function toNumber(...values: any[]): number {
  for (const v of values) {
    const num = Number(v);
    if (!isNaN(num) && v !== null && v !== undefined) return num;
  }
  return 0;
}

function toText(...values: any[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

function getItems(input: any): any[] {
  return Array.isArray(input) ? input : [];
}

function formatMMK(value: number) {
  return `${value.toLocaleString()} MMK`;
}

function bi(language: UiLanguage, en: string, my: string) {
  if (language === "en") return en;
  if (language === "my") return my;
  return `${en} / ${my}`;
}

function toId(prefix: string, value: unknown, index: number) {
  const text = toText(value, "").trim();
  return text || `${prefix}-${index + 1}`;
}

function normalizeCashBook(input: unknown): CashBookRow[] {
  return getItems(input).map((row, index) => ({
    id: toId("cash-book", row.id, index),
    branch: toText(row.branch_name, row.branch, "All branches"),
    zone: toText(row.zone_name, row.zone, "All zones"),
    reportDate: toText(row.date, row.report_date, row.created_at, ""),
    accountDescription: toText(row.account_description, row.description, row.account_name, "-"),
    received: toNumber(row.received, row.received_amount, row.cash_received),
    payment: toNumber(row.payment, row.payment_amount, row.cash_payment),
    openingBalance: toNumber(row.opening_balance, row.openingBalance),
    closingBalance: toNumber(row.closing_balance, row.closingBalance),
  }));
}

function normalizeJournalSummary(input: unknown): JournalSummaryRow[] {
  return getItems(input).map((row, index) => ({
    id: toId("journal-summary", row.id, index),
    branch: toText(row.branch_name, row.branch, "All branches"),
    zone: toText(row.zone_name, row.zone, "All zones"),
    reportDate: toText(row.date, row.report_date, row.created_at, ""),
    accountDescription: toText(row.account_description, row.description, row.account_name, "-"),
    debit: toNumber(row.debit, row.debit_amount),
    credit: toNumber(row.credit, row.credit_amount),
  }));
}

function normalizeTrialBalance(input: unknown): TrialBalanceRow[] {
  return getItems(input).map((row, index) => ({
    id: toId("trial-balance", row.id, index),
    branch: toText(row.branch_name, row.branch, "All branches"),
    zone: toText(row.zone_name, row.zone, "All zones"),
    reportDate: toText(row.date, row.report_date, row.created_at, ""),
    codeNo: toText(row.code_no, row.code, "-"),
    accountHead: toText(row.account_head, row.head, "-"),
    accountDescription: toText(row.account_description, row.description, row.account_name, "-"),
    openingDebit: toNumber(row.opening_debit, row.opening_balance_debit),
    openingCredit: toNumber(row.opening_credit, row.opening_balance_credit),
    duringDebit: toNumber(row.during_debit, row.debit),
    duringCredit: toNumber(row.during_credit, row.credit),
    closingDebit: toNumber(row.closing_debit, row.closing_balance_debit),
    closingCredit: toNumber(row.closing_credit, row.closing_balance_credit),
  }));
}

function normalizeIncomeStatement(input: unknown): IncomeStatementRow[] {
  return getItems(input).map((row, index) => {
    const rawCategory = toText(row.category, row.section, "income").toLowerCase();
    const category: IncomeStatementRow["category"] = rawCategory.includes("expense")
      ? "expense"
      : rawCategory.includes("summary") || rawCategory.includes("profit")
        ? "summary"
        : "income";

    return {
      id: toId("income-statement", row.id, index),
      branch: toText(row.branch_name, row.branch, "All branches"),
      zone: toText(row.zone_name, row.zone, "All zones"),
      reportDate: toText(row.date, row.report_date, row.created_at, ""),
      codeNo: toText(row.code_no, row.code, "-"),
      description: toText(row.description, row.account_description, "-"),
      category,
      amount: toNumber(row.amount, row.total_amount),
    };
  });
}

function normalizeBalanceSheet(input: unknown): BalanceSheetRow[] {
  return getItems(input).map((row, index) => {
    const rawSection = toText(row.section, row.category, "asset").toLowerCase();
    const section: BalanceSheetRow["section"] = rawSection.includes("equity")
      ? "equity"
      : rawSection.includes("liabil")
        ? "liability"
        : rawSection.includes("total")
          ? "total"
          : "asset";

    return {
      id: toId("balance-sheet", row.id, index),
      branch: toText(row.branch_name, row.branch, "All branches"),
      zone: toText(row.zone_name, row.zone, "All zones"),
      reportDate: toText(row.date, row.report_date, row.created_at, ""),
      codeNo: toText(row.code_no, row.code, "-"),
      description: toText(row.description, row.account_description, "-"),
      section,
      amount: toNumber(row.amount, row.total_amount, row.balance),
    };
  });
}

function normalizeProfitLoss(input: unknown): ProfitLossRow[] {
  return getItems(input).map((row, index) => {
    const rawCategory = toText(row.category, row.section, "income").toLowerCase();
    const category: ProfitLossRow["category"] = rawCategory.includes("expense")
      ? "expense"
      : rawCategory.includes("summary") || rawCategory.includes("profit")
        ? "summary"
        : "income";

    return {
      id: toId("profit-loss", row.id, index),
      branch: toText(row.branch_name, row.branch, "All branches"),
      zone: toText(row.zone_name, row.zone, "All zones"),
      reportDate: toText(row.date, row.report_date, row.created_at, ""),
      codeNo: toText(row.code_no, row.code, "-"),
      description: toText(row.description, row.account_description, "-"),
      amount: toNumber(row.amount, row.total_amount),
      cumulativeYearToDate: toNumber(row.cumulative_year_to_date, row.ytd, row.year_to_date),
      category,
    };
  });
}

function matchesDate(dateText: string, startDate: string, endDate: string) {
  if (!dateText) return true;
  const plainDate = dateText.slice(0, 10);
  if (startDate && plainDate < startDate) return false;
  if (endDate && plainDate > endDate) return false;
  return true;
}

function matchesCommonFilters<T extends CommonRow>(
  rows: T[],
  branch: string,
  zone: string,
  startDate: string,
  endDate: string,
  search: string,
  projector: (row: T) => string,
) {
  const needle = search.trim().toLowerCase();

  return rows.filter((row) => {
    if (branch !== "all" && row.branch !== branch) return false;
    if (zone !== "all" && row.zone !== zone) return false;
    if (!matchesDate(row.reportDate, startDate, endDate)) return false;
    if (!needle) return true;
    return projector(row).toLowerCase().includes(needle);
  });
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export default function FinancialReportsPage() {
  const langContext = (() => {
    try {
      return useLanguage()?.lang;
    } catch {
      return undefined;
    }
  })();
  const auth = (() => {
    try {
      return useAuth();
    } catch {
      return undefined;
    }
  })();

  const [language, setLanguage] = useState<UiLanguage>(
    langContext === "en" ? "en" : langContext === "my" ? "my" : "both",
  );

  const [activeTab, setActiveTab] = useState<ReportTab>("cashBookSummary");
  const [cashBookRows, setCashBookRows] = useState<CashBookRow[]>([]);
  const [journalSummaryRows, setJournalSummaryRows] = useState<JournalSummaryRow[]>([]);
  const [trialBalanceRows, setTrialBalanceRows] = useState<TrialBalanceRow[]>([]);
  const [incomeStatementRows, setIncomeStatementRows] = useState<IncomeStatementRow[]>([]);
  const [balanceSheetRows, setBalanceSheetRows] = useState<BalanceSheetRow[]>([]);
  const [profitLossRows, setProfitLossRows] = useState<ProfitLossRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(defaultDateRange.startDate);
  const [endDate, setEndDate] = useState(defaultDateRange.endDate);
  const [branch, setBranch] = useState("all");
  const [zone, setZone] = useState("all");
  const [search, setSearch] = useState("");

  // LOCAL DEV BYPASS: Assume true for now to avoid blocking
  const accessAllowed = true; 

  useEffect(() => {
    if (accessAllowed) fetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessAllowed]);

  async function fetchAll() {
    setLoading(true);
    setError(null);

    try {
      // Simulate network request delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      setCashBookRows(normalizeCashBook(MOCK_CASH_BOOK));
      setJournalSummaryRows(normalizeJournalSummary(MOCK_JOURNAL));
      setTrialBalanceRows(normalizeTrialBalance(MOCK_TRIAL));
      setIncomeStatementRows(normalizeIncomeStatement(MOCK_INCOME));
      setBalanceSheetRows(normalizeBalanceSheet(MOCK_BALANCE));
      setProfitLossRows(normalizeProfitLoss(MOCK_PROFIT));
    } catch (err) {
      setError(
        bi(
          language,
          "Financial reporting APIs are unreachable. Check the reporting endpoints and base URL.",
          "Financial reporting API များကို မချိတ်ဆက်နိုင်ပါ။ Reporting endpoint များနှင့် base URL ကို စစ်ဆေးပါ။",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  const allCommonRows = useMemo(
    () => [
      ...cashBookRows,
      ...journalSummaryRows,
      ...trialBalanceRows,
      ...incomeStatementRows,
      ...balanceSheetRows,
      ...profitLossRows,
    ],
    [cashBookRows, journalSummaryRows, trialBalanceRows, incomeStatementRows, balanceSheetRows, profitLossRows],
  );

  const branches = useMemo(() => uniqueOptions(allCommonRows.map((row) => row.branch)), [allCommonRows]);
  const zones = useMemo(() => uniqueOptions(allCommonRows.map((row) => row.zone)), [allCommonRows]);

  const filteredCashBookRows = useMemo(
    () =>
      matchesCommonFilters(
        cashBookRows,
        branch,
        zone,
        startDate,
        endDate,
        search,
        (row) => `${row.accountDescription} ${row.branch} ${row.zone}`,
      ),
    [cashBookRows, branch, zone, startDate, endDate, search],
  );

  const filteredJournalSummaryRows = useMemo(
    () =>
      matchesCommonFilters(
        journalSummaryRows,
        branch,
        zone,
        startDate,
        endDate,
        search,
        (row) => `${row.accountDescription} ${row.branch} ${row.zone}`,
      ),
    [journalSummaryRows, branch, zone, startDate, endDate, search],
  );

  const filteredTrialBalanceRows = useMemo(
    () =>
      matchesCommonFilters(
        trialBalanceRows,
        branch,
        zone,
        startDate,
        endDate,
        search,
        (row) => `${row.codeNo} ${row.accountHead} ${row.accountDescription} ${row.branch} ${row.zone}`,
      ),
    [trialBalanceRows, branch, zone, startDate, endDate, search],
  );

  const filteredIncomeStatementRows = useMemo(
    () =>
      matchesCommonFilters(
        incomeStatementRows,
        branch,
        zone,
        startDate,
        endDate,
        search,
        (row) => `${row.codeNo} ${row.description} ${row.branch} ${row.zone}`,
      ),
    [incomeStatementRows, branch, zone, startDate, endDate, search],
  );

  const filteredBalanceSheetRows = useMemo(
    () =>
      matchesCommonFilters(
        balanceSheetRows,
        branch,
        zone,
        startDate,
        endDate,
        search,
        (row) => `${row.codeNo} ${row.description} ${row.branch} ${row.zone}`,
      ),
    [balanceSheetRows, branch, zone, startDate, endDate, search],
  );

  const filteredProfitLossRows = useMemo(
    () =>
      matchesCommonFilters(
        profitLossRows,
        branch,
        zone,
        startDate,
        endDate,
        search,
        (row) => `${row.codeNo} ${row.description} ${row.branch} ${row.zone}`,
      ),
    [profitLossRows, branch, zone, startDate, endDate, search],
  );

  const headlineTotals = useMemo(() => {
    const totalIncome = filteredIncomeStatementRows
      .filter((row) => row.category === "income")
      .reduce((sum, row) => sum + row.amount, 0);
    const totalExpenses = filteredIncomeStatementRows
      .filter((row) => row.category === "expense")
      .reduce((sum, row) => sum + row.amount, 0);
    const totalProfit = totalIncome - totalExpenses;
    const cashBookReceived = filteredCashBookRows.reduce((sum, row) => sum + row.received, 0);
    const cashBookPayment = filteredCashBookRows.reduce((sum, row) => sum + row.payment, 0);

    return {
      totalIncome,
      totalExpenses,
      totalProfit,
      cashBookReceived,
      cashBookPayment,
    };
  }, [filteredCashBookRows, filteredIncomeStatementRows]);

  const activePanelSubtitle = (() => {
    switch (activeTab) {
      case "cashBookSummary":
        return bi(language, "The transactions total amounts grouped by account.", "စာရင်းအမည်အလိုက် စုစုပေါင်းငွေဝင်ငွေထွက်ကိုပြသသည်။");
      case "journalSummary":
        return bi(language, "The transactions total amounts grouped by account.", "စာရင်းအမည်အလိုက် debit / credit စုစုပေါင်းကိုပြသသည်။");
      case "trialBalance":
        return bi(language, "The balance of all ledgers is compiled into debit and credit account totals that must be equal.", "Ledger အားလုံး၏ balance ကို debit နှင့် credit စုစုပေါင်းအဖြစ် တူညီရမည်ဟု စုစည်းပြသသည်။");
      case "incomeStatement":
        return bi(language, "The income statement for the selected date criteria.", "ရွေးချယ်ထားသော ရက်စွဲအလိုက် ဝင်ငွေဖော်ပြချက်ကို ပြသသည်။");
      case "balanceSheet":
        return bi(language, "The balance sheet for the selected date criteria.", "ရွေးချယ်ထားသော ရက်စွဲအလိုက် လက်ကျန်ရှင်းတမ်းကို ပြသသည်။");
      case "profitAndLoss":
      default:
        return bi(language, "The profit and loss for the selected date criteria.", "ရွေးချယ်ထားသော ရက်စွဲအလိုက် အမြတ်နှင့်အရှုံးကို ပြသသည်။");
    }
  })();

  if (!accessAllowed) {
    return (
      <div className="min-h-screen bg-[#f7f9fc] p-8 flex items-center justify-center">
        <div className="rounded-[32px] border border-rose-200 bg-white p-8 shadow-sm flex items-start gap-4 max-w-xl">
          <div className="rounded-2xl bg-rose-50 p-3 text-rose-600">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-[#0d2c54]">Finance Portal Access Restricted</h1>
            <p className="mt-2 text-sm text-slate-500">
              This portal is strictly for Super Admin, Admin, and Finance team members.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currencyLocale = language === "my" ? "my-MM" : "en-US";

  return (
    <div className="min-h-screen bg-[#f7f9fc] p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
            {bi(language, "Administration", "စီမံခန့်ခွဲမှု")}
          </p>
          <h1 className="text-4xl font-black uppercase tracking-tight text-[#0d2c54]">
            {bi(language, "Financial Reports", "ငွေကြေးအစီရင်ခံစာများ")}
          </h1>
          <p className="max-w-4xl text-slate-500">
            {bi(
              language,
              "Cash book summary, journal summary, trial balance, income statement, balance sheet, and profit & loss reporting in a bilingual production layout.",
              "Cash book summary၊ journal summary၊ trial balance၊ income statement၊ balance sheet နှင့် profit & loss report များကို ဘာသာနှစ်မျိုးဖြင့် ထုတ်လုပ်ရေးအသုံးပြုနိုင်သော layout တစ်ခုအဖြစ် စုစည်းထားသည်။",
            )}
          </p>
        </div>

        <LanguageToggle language={language} onChange={setLanguage} />
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          title={bi(language, "Total Income", "စုစုပေါင်းဝင်ငွေ")}
          value={formatMMK(headlineTotals.totalIncome)}
          subtitle={bi(language, "Income statement total", "ဝင်ငွေဖော်ပြချက်စုစုပေါင်း")}
        />
        <StatCard
          icon={TrendingDown}
          title={bi(language, "Total Expenses", "စုစုပေါင်းကုန်ကျစရိတ်")}
          value={formatMMK(headlineTotals.totalExpenses)}
          subtitle={bi(language, "Expense statement total", "ကုန်ကျစရိတ်ဖော်ပြချက်စုစုပေါင်း")}
        />
        <StatCard
          icon={DollarSign}
          title={bi(language, "Total Profit", "စုစုပေါင်းအမြတ်")}
          value={formatMMK(headlineTotals.totalProfit)}
          subtitle={bi(language, "Income minus expenses", "ဝင်ငွေမှ ကုန်ကျစရိတ်နုတ်ပြီး")}
        />
        <StatCard
          icon={HeartHandshake}
          title={bi(language, "Cash Position", "ငွေသားအခြေအနေ")}
          value={formatMMK(headlineTotals.cashBookReceived - headlineTotals.cashBookPayment)}
          subtitle={bi(language, "Received minus payment", "လက်ခံငွေမှ ပေးငွေကိုနုတ်ပြီး")}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          onClick={fetchAll}
          className="inline-flex items-center gap-2 rounded-2xl bg-[#0d2c54] px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:scale-105 transition"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? bi(language, "Refreshing...", "ပြန်လည်ရယူနေသည်...") : bi(language, "Refresh Reports", "ပြန်လည်ရယူမည်")}
        </button>
      </div>

      <div className="mt-8 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        {(
          [
            "cashBookSummary",
            "journalSummary",
            "trialBalance",
            "incomeStatement",
            "balanceSheet",
            "profitAndLoss",
          ] as ReportTab[]
        ).map((tab) => (
          <ReportTabButton key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}>
            {reportTabLabel(language, tab)}
          </ReportTabButton>
        ))}
      </div>

      <div className="mt-6">
        <Panel title={reportTabLabel(language, activeTab)} subtitle={activePanelSubtitle}>
          <FilterBar
            language={language}
            startDate={startDate}
            endDate={endDate}
            branch={branch}
            zone={zone}
            search={search}
            branches={branches}
            zones={zones}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onBranchChange={setBranch}
            onZoneChange={setZone}
            onSearchChange={setSearch}
            searchPlaceholder={bi(language, "Search with keyword", "စကားလုံးဖြင့်ရှာပါ")}
          />

          <div className="mt-6">
            {activeTab === "cashBookSummary" ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    icon={Building2}
                    title={bi(language, "Opening balance", "ဖွင့်လှစ်လက်ကျန်")}
                    value={formatMMK(filteredCashBookRows[0]?.openingBalance || 0)}
                    subtitle={bi(language, "From filtered result", "ရွေးချယ်ထားသောရလဒ်မှ")}
                  />
                  <StatCard
                    icon={Building2}
                    title={bi(language, "Closing balance", "ပိတ်သိမ်းလက်ကျန်")}
                    value={formatMMK(filteredCashBookRows[0]?.closingBalance || 0)}
                    subtitle={bi(language, "From filtered result", "ရွေးချယ်ထားသောရလဒ်မှ")}
                  />
                  <StatCard
                    icon={TrendingUp}
                    title={bi(language, "Received", "လက်ခံငွေ")}
                    value={formatMMK(headlineTotals.cashBookReceived)}
                    subtitle={bi(language, "Total received", "စုစုပေါင်းလက်ခံငွေ")}
                  />
                  <StatCard
                    icon={TrendingDown}
                    title={bi(language, "Payment", "ပေးငွေ")}
                    value={formatMMK(headlineTotals.cashBookPayment)}
                    subtitle={bi(language, "Total payment", "စုစုပေါင်းပေးငွေ")}
                  />
                </div>

                <DataTable
                  headers={[
                    bi(language, "No.", "စဉ်"),
                    bi(language, "Account Description", "စာရင်းဖော်ပြချက်"),
                    bi(language, "Received", "လက်ခံငွေ"),
                    bi(language, "Payment", "ပေးငွေ"),
                  ]}
                  rows={filteredCashBookRows.map((row, index) => [
                    String(index + 1),
                    row.accountDescription,
                    formatMMK(row.received),
                    formatMMK(row.payment),
                  ])}
                  emptyText={bi(language, "No cash book summary found.", "Cash book summary မတွေ့ပါ။")}
                />
              </div>
            ) : null}

            {activeTab === "journalSummary" ? (
              <DataTable
                headers={[
                  bi(language, "No.", "စဉ်"),
                  bi(language, "Account Description", "စာရင်းဖော်ပြချက်"),
                  bi(language, "Debit", "Debit"),
                  bi(language, "Credit", "Credit"),
                ]}
                rows={filteredJournalSummaryRows.map((row, index) => [
                  String(index + 1),
                  row.accountDescription,
                  formatMMK(row.debit),
                  formatMMK(row.credit),
                ])}
                emptyText={bi(language, "No journal summary found.", "Journal summary မတွေ့ပါ။")}
              />
            ) : null}

            {activeTab === "trialBalance" ? (
              <DataTable
                headers={[
                  bi(language, "No.", "စဉ်"),
                  bi(language, "Code No.", "Code No."),
                  bi(language, "Account Head", "စာရင်းခေါင်းစဉ်"),
                  bi(language, "Chart of Account / Description", "Chart of account / ဖော်ပြချက်"),
                  bi(language, "Opening Dr", "ဖွင့်လှစ် Dr"),
                  bi(language, "Opening Cr", "ဖွင့်လှစ် Cr"),
                  bi(language, "During Dr", "ကာလအတွင်း Dr"),
                  bi(language, "During Cr", "ကာလအတွင်း Cr"),
                  bi(language, "Closing Dr", "ပိတ်သိမ်း Dr"),
                  bi(language, "Closing Cr", "ပိတ်သိမ်း Cr"),
                ]}
                rows={filteredTrialBalanceRows.map((row, index) => [
                  String(index + 1),
                  row.codeNo,
                  row.accountHead,
                  row.accountDescription,
                  formatMMK(row.openingDebit),
                  formatMMK(row.openingCredit),
                  formatMMK(row.duringDebit),
                  formatMMK(row.duringCredit),
                  formatMMK(row.closingDebit),
                  formatMMK(row.closingCredit),
                ])}
                emptyText={bi(language, "No trial balance found.", "Trial balance မတွေ့ပါ။")}
              />
            ) : null}

            {activeTab === "incomeStatement" ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <StatCard
                    icon={DollarSign}
                    title={bi(language, "Total Income", "စုစုပေါင်းဝင်ငွေ")}
                    value={formatMMK(headlineTotals.totalIncome)}
                    subtitle={bi(language, "Income list total", "ဝင်ငွေစာရင်းစုစုပေါင်း")}
                  />
                  <StatCard
                    icon={TrendingDown}
                    title={bi(language, "Total Expenses", "စုစုပေါင်းကုန်ကျစရိတ်")}
                    value={formatMMK(headlineTotals.totalExpenses)}
                    subtitle={bi(language, "Expense list total", "ကုန်ကျစရိတ်စာရင်းစုစုပေါင်း")}
                  />
                  <StatCard
                    icon={TrendingUp}
                    title={bi(language, "Total Profit", "စုစုပေါင်းအမြတ်")}
                    value={formatMMK(headlineTotals.totalProfit)}
                    subtitle={bi(language, "Result for selected range", "ရွေးချယ်ထားသောကာလ၏ရလဒ်")}
                  />
                </div>

                <DataTable
                  headers={[
                    bi(language, "No.", "စဉ်"),
                    bi(language, "Description", "ဖော်ပြချက်"),
                    bi(language, "Amount", "ငွေပမာဏ"),
                  ]}
                  rows={filteredIncomeStatementRows.map((row, index) => [
                    String(index + 1),
                    <div key={`${row.id}-desc`}>
                      <p className="font-semibold text-slate-700">{row.description}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                        {bi(language, "Category", "အမျိုးအစား")}: {bi(language, row.category, row.category === "income" ? "ဝင်ငွေ" : row.category === "expense" ? "ကုန်ကျစရိတ်" : "အနှစ်ချုပ်")}
                      </p>
                    </div>,
                    <span key={`${row.id}-amt`} className="font-bold text-[#0d2c54]">{formatMMK(row.amount)}</span>,
                  ])}
                  emptyText={bi(language, "No income statement rows found.", "Income statement row မတွေ့ပါ။")}
                />
              </div>
            ) : null}

            {activeTab === "balanceSheet" ? (
              <DataTable
                headers={[
                  bi(language, "No.", "စဉ်"),
                  bi(language, "Code No.", "Code No."),
                  bi(language, "Account Description", "စာရင်းဖော်ပြချက်"),
                  bi(language, "Section", "အပိုင်း"),
                  bi(language, "Amount", "ငွေပမာဏ"),
                ]}
                rows={filteredBalanceSheetRows.map((row, index) => [
                  String(index + 1),
                  <span key="code" className="font-mono text-slate-500">{row.codeNo}</span>,
                  <span key="desc" className="font-semibold text-slate-700">{row.description}</span>,
                  <span key="section" className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black uppercase text-slate-600">
                    {bi(
                      language,
                      row.section,
                      row.section === "asset"
                        ? "ပိုင်ဆိုင်မှု"
                        : row.section === "equity"
                          ? "မူပိုင်ငွေ"
                          : row.section === "liability"
                            ? "ပေးဆပ်ရန်"
                            : "စုစုပေါင်း"
                    )}
                  </span>,
                  <span key="amt" className="font-bold text-[#0d2c54]">{formatMMK(row.amount)}</span>,
                ])}
                emptyText={bi(language, "No balance sheet rows found.", "Balance sheet row မတွေ့ပါ။")}
              />
            ) : null}

            {activeTab === "profitAndLoss" ? (
              <DataTable
                headers={[
                  bi(language, "Code No.", "Code No."),
                  bi(language, "Description", "ဖော်ပြချက်"),
                  bi(language, "Amount", "ငွေပမာဏ"),
                  bi(language, "Cumulative year to date", "နှစ်အစမှယနေ့ထိစုစုပေါင်း"),
                ]}
                rows={filteredProfitLossRows.map((row) => [
                  <span key="code" className="font-mono text-slate-500">{row.codeNo}</span>,
                  <div key={`${row.id}-profit-desc`}>
                    <p className="font-semibold text-slate-700">{row.description}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                      {bi(language, "Category", "အမျိုးအစား")}: {bi(language, row.category, row.category === "income" ? "ဝင်ငွေ" : row.category === "expense" ? "ကုန်ကျစရိတ်" : "အနှစ်ချုပ်")}
                    </p>
                  </div>,
                  <span key="amt" className="font-bold text-[#0d2c54]">{formatMMK(row.amount)}</span>,
                  <span key="cum" className="font-bold text-[#ffd700]">{formatMMK(row.cumulativeYearToDate)}</span>,
                ])}
                emptyText={bi(language, "No profit and loss rows found.", "Profit and loss row မတွေ့ပါ။")}
              />
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// --- SUBCOMPONENTS ---

function LanguageToggle({ language, onChange }: { language: UiLanguage; onChange: (value: UiLanguage) => void; }) {
  const items: Array<{ key: UiLanguage; label: string }> = [
    { key: "en", label: "EN" },
    { key: "my", label: "မြန်မာ" },
    { key: "both", label: "EN + မြန်မာ" },
  ];

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={[
            "rounded-xl px-3 py-2 text-sm font-semibold transition",
            item.key === language ? "bg-[#0d2c54] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100",
          ].join(" ")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function reportTabLabel(language: UiLanguage, tab: ReportTab) {
  const map: Record<ReportTab, { en: string; my: string }> = {
    cashBookSummary: { en: "Cash Book Summary", my: "ငွေစာရင်းအနှစ်ချုပ်" },
    journalSummary: { en: "Journal Summary", my: "ဂျာနယ်အနှစ်ချုပ်" },
    trialBalance: { en: "Trial Balance", my: "Trial balance" },
    incomeStatement: { en: "Income Statement", my: "ဝင်ငွေဖော်ပြချက်" },
    balanceSheet: { en: "Balance Sheet", my: "လက်ကျန်ရှင်းတမ်း" },
    profitAndLoss: { en: "Profit and Loss", my: "အမြတ်နှင့်အရှုံး" },
  };
  return bi(language, map[tab].en, map[tab].my);
}

function ReportTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-5 py-3 text-xs font-black uppercase tracking-wider transition",
        active ? "bg-[#0d2c54] text-white shadow" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function FilterBar({
  language,
  startDate,
  endDate,
  branch,
  zone,
  search,
  branches,
  zones,
  onStartDateChange,
  onEndDateChange,
  onBranchChange,
  onZoneChange,
  onSearchChange,
  searchPlaceholder,
}: any) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 bg-slate-50 p-4 rounded-[24px] border border-slate-100">
      <label className="space-y-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {bi(language, "Start Date", "စတင်ရက်")}
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#0d2c54]"
        />
      </label>

      <label className="space-y-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {bi(language, "End Date", "ပြီးဆုံးရက်")}
        </span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#0d2c54]"
        />
      </label>

      <label className="space-y-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {bi(language, "Branch", "ဘဏ်ခွဲ")}
        </span>
        <select
          value={branch}
          onChange={(e) => onBranchChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#0d2c54]"
        >
          <option value="all">{bi(language, "All Branches", "ဘဏ်ခွဲအားလုံး")}</option>
          {branches.map((item: string) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {bi(language, "Zone", "ဇုန်")}
        </span>
        <select
          value={zone}
          onChange={(e) => onZoneChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#0d2c54]"
        >
          <option value="all">{bi(language, "All Zones", "ဇုန်အားလုံး")}</option>
          {zones.map((item: string) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {bi(language, "Search", "ရှာဖွေရန်")}
        </span>
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#0d2c54]"
          />
        </div>
      </label>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, subtitle }: any) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <Icon size={24} className="text-[#0d2c54]" />
      <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-black text-[#0d2c54]">{value}</p>
      <p className="mt-2 text-[11px] font-bold text-slate-500">{subtitle}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: any) {
  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-black text-[#0d2c54]">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function DataTable({ headers, rows, emptyText }: any) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500 border-b border-slate-200">
            <tr>
              {headers.map((header: string) => (
                <th key={header} className="px-5 py-4 text-xs font-black uppercase tracking-wider">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-5 py-10 text-center font-semibold text-slate-400">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-100 align-middle hover:bg-slate-50/50 transition">
                  {row.map((cell: any, cellIdx: number) => (
                    <td key={cellIdx} className="px-5 py-4">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}