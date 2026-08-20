import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Box,
  CheckCircle,
  Download,
  FileText,
  Globe,
  Headset,
  Languages,
  LayoutDashboard,
  Megaphone,
  Percent,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Business Development Manager Portal
 * Go-live version:
 * - No mock data
 * - No sample rows
 * - No timeout-based fake sync
 * - All operational data is loaded from backend API
 * - CS and Marketing directives are posted to backend API
 *
 * Required backend endpoints:
 * GET  /api/v1/business-development/overview?region=ALL|YGN|MDY|NPT|...
 * GET  /api/v1/business-development/branches?region=ALL|YGN|MDY|NPT|...
 * GET  /api/v1/business-development/inventory?region=...&search=...
 * GET  /api/v1/business-development/complaints?region=...
 * GET  /api/v1/business-development/campaigns?region=...
 * GET  /api/v1/business-development/finance?region=...
 * POST /api/v1/business-development/directives
 * GET  /api/v1/business-development/export/finance?region=...
 * GET  /api/v1/business-development/export/guidelines
 */

type Language = "en" | "my";
type RegionCode = "ALL" | string;
type LoadingKey =
  | "overview"
  | "branches"
  | "inventory"
  | "complaints"
  | "campaigns"
  | "finance"
  | "directive"
  | "sync";

type ApiEnvelope<T> = {
  data?: T;
  error?: string;
  message?: string;
};

type OverviewKpis = {
  grossRevenue: number;
  royaltyAmount: number;
  royaltyRate: number;
  successRate: number;
  openComplaints: number;
  totalFleet: number;
  totalBranches: number;
  totalMerchants: number;
  lastSyncedAt?: string | null;
};

type RegionOption = {
  code: string;
  name: string;
};

type BranchSummaryRow = {
  id: string;
  branchCode: string;
  branchName: string;
  regionName: string;
  revenue: number;
  slaRate: number;
  status: string;
  updatedAt?: string | null;
};

type InventoryRow = {
  id: string;
  wayId: string;
  originNode: string;
  currentHolder: string;
  transitPath: string;
  latestLog: string;
  status: string;
  updatedAt?: string | null;
};

type ComplaintRow = {
  id: string;
  branchCode: string;
  customerName: string;
  issue: string;
  status: string;
  priority: string;
  createdAt?: string | null;
};

type CampaignRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  owner?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

type FinanceSummary = {
  nationalGross: number;
  royaltyAmount: number;
  royaltyRate: number;
  netRevenue?: number | null;
  growthRate?: number | null;
  updatedAt?: string | null;
};

type DirectiveType = "CS" | "MARKETING";

const translations: Record<Language, Record<string, string>> = {
  en: {
    portal_title: "Business Development Manager Command",
    portal_subtitle: "Territory Oversight • Strategic Intelligence • Enterprise Growth",
    lang_toggle: "မြန်မာဘာသာ",
    branch_global: "Britium Express Network",
    hq_rule:
      "BDM ACCESS: Region and enterprise monitoring with command modules for customer service and marketing coordination.",
    tab_overview: "Territory Overview",
    tab_ops: "Regional Operations",
    tab_inventory: "Enterprise Inventory",
    tab_cs: "CS & Complaints",
    tab_marketing: "Marketing Strategy",
    tab_finance: "KPIs & Finance",
    btn_sync: "Sync Live Data",
    btn_instruct: "Broadcast Directive",
    stat_revenue: "Consolidated Revenue",
    stat_royalty: "Royalty / Management Fee",
    stat_success: "Success Rate",
    stat_complaints: "Open Issues",
    empty_state: "No live records returned from backend.",
    error_title: "Unable to load live data",
  },
  my: {
    portal_title: "စီးပွားရေးဖွံ့ဖြိုးမှု မန်နေဂျာ ကွပ်ကဲမှုဌာန",
    portal_subtitle: "ဒေသတွင်းကြီးကြပ်မှု • မဟာဗျူဟာအချက်အလက် • လုပ်ငန်းဖွံ့ဖြိုးတိုးတက်မှု",
    lang_toggle: "English Language",
    branch_global: "Britium Express Network",
    hq_rule:
      "BDM အဆင့် - ဒေသတွင်းလုပ်ငန်းများကို စောင့်ကြည့်နိုင်ပြီး CS နှင့် Marketing အတွက် ညွှန်ကြားချက်များ ထုတ်ပြန်နိုင်သည်။",
    tab_overview: "ခြုံငုံသုံးသပ်ချက်",
    tab_ops: "ဒေသတွင်းလုပ်ငန်းများ",
    tab_inventory: "ကုန်ပစ္စည်းစာရင်း",
    tab_cs: "ဝန်ဆောင်မှုနှင့် တိုင်ကြားမှု",
    tab_marketing: "စျေးကွက်မဟာဗျူဟာ",
    tab_finance: "KPI နှင့် ဘဏ္ဍာရေး",
    btn_sync: "Live Data ရယူမည်",
    btn_instruct: "ညွှန်ကြားချက် ထုတ်ပြန်မည်",
    stat_revenue: "စုစုပေါင်းဝင်ငွေ",
    stat_royalty: "စီမံခန့်ခွဲမှုစရိတ်",
    stat_success: "အောင်မြင်မှုနှုန်း",
    stat_complaints: "ဖွင့်ထားသောပြဿနာများ",
    empty_state: "Backend မှ live record မရှိသေးပါ။",
    error_title: "Live data ရယူ၍မရပါ",
  },
};

const DEFAULT_KPIS: OverviewKpis = {
  grossRevenue: 0,
  royaltyAmount: 0,
  royaltyRate: 0,
  successRate: 0,
  openComplaints: 0,
  totalFleet: 0,
  totalBranches: 0,
  totalMerchants: 0,
  lastSyncedAt: null,
};

function mmk(value?: number | null) {
  return `${Number(value ?? 0).toLocaleString()} MMK`;
}

function pct(value?: number | null) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(status?: string | null) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (["ACTIVE", "STABLE", "RESOLVED", "COMPLETED", "OK", "HEALTHY"].includes(normalized)) {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }
  if (["PENDING", "IN_PROGRESS", "REVIEW", "OPEN"].includes(normalized)) {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  if (["URGENT", "CRITICAL", "FAILED", "ESCALATED", "BLOCKED"].includes(normalized)) {
    return "bg-rose-50 text-rose-700 border-rose-100";
  }
  return "bg-slate-50 text-slate-600 border-slate-100";
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const raw = await response.text();
  const parsed = raw ? (JSON.parse(raw) as ApiEnvelope<T> | T) : ({} as T);

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed && "message" in parsed
        ? String((parsed as ApiEnvelope<T>).message)
        : typeof parsed === "object" && parsed && "error" in parsed
          ? String((parsed as ApiEnvelope<T>).error)
          : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (typeof parsed === "object" && parsed && "data" in parsed) {
    return (parsed as ApiEnvelope<T>).data as T;
  }

  return parsed as T;
}

function buildQuery(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim()) qs.set(key, value.trim());
  });
  const text = qs.toString();
  return text ? `?${text}` : "";
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
      <FileText className="mx-auto h-10 w-10 text-slate-300" />
      <p className="mt-4 text-sm font-bold text-slate-500">{message}</p>
    </div>
  );
}

function ErrorBanner({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-rose-800">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black uppercase tracking-wide">{title}</p>
            <p className="mt-1 text-sm font-semibold opacity-80">{message}</p>
          </div>
        </div>
        <Button onClick={onRetry} variant="outline" className="rounded-2xl border-rose-200 bg-white font-black text-rose-700">
          Retry
        </Button>
      </div>
    </div>
  );
}

export default function BusinessDevelopmentManagerPortal() {
  const [lang, setLang] = useState<Language>("en");
  const [activeTab, setActiveTab] = useState("overview");
  const [region, setRegion] = useState<RegionCode>("ALL");
  const [inventorySearch, setInventorySearch] = useState("");

  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [kpis, setKpis] = useState<OverviewKpis>(DEFAULT_KPIS);
  const [branches, setBranches] = useState<BranchSummaryRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);

  const [csInstruction, setCsInstruction] = useState("");
  const [marketingInstruction, setMarketingInstruction] = useState("");
  const [loading, setLoading] = useState<Partial<Record<LoadingKey, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const t = useCallback((key: string) => translations[lang][key] || key, [lang]);

  const regionQuery = useMemo(() => buildQuery({ region }), [region]);
  const inventoryQuery = useMemo(
    () => buildQuery({ region, search: inventorySearch || undefined }),
    [region, inventorySearch],
  );

  const setLoadingKey = useCallback((key: LoadingKey, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadOverview = useCallback(async () => {
    setLoadingKey("overview", true);
    try {
      const data = await apiFetch<OverviewKpis>(`/api/v1/business-development/overview${regionQuery}`);
      setKpis({ ...DEFAULT_KPIS, ...data });
    } finally {
      setLoadingKey("overview", false);
    }
  }, [regionQuery, setLoadingKey]);

  const loadBranches = useCallback(async () => {
    setLoadingKey("branches", true);
    try {
      const data = await apiFetch<BranchSummaryRow[]>(`/api/v1/business-development/branches${regionQuery}`);
      setBranches(data ?? []);
    } finally {
      setLoadingKey("branches", false);
    }
  }, [regionQuery, setLoadingKey]);

  const loadInventory = useCallback(async () => {
    setLoadingKey("inventory", true);
    try {
      const data = await apiFetch<InventoryRow[]>(`/api/v1/business-development/inventory${inventoryQuery}`);
      setInventory(data ?? []);
    } finally {
      setLoadingKey("inventory", false);
    }
  }, [inventoryQuery, setLoadingKey]);

  const loadComplaints = useCallback(async () => {
    setLoadingKey("complaints", true);
    try {
      const data = await apiFetch<ComplaintRow[]>(`/api/v1/business-development/complaints${regionQuery}`);
      setComplaints(data ?? []);
    } finally {
      setLoadingKey("complaints", false);
    }
  }, [regionQuery, setLoadingKey]);

  const loadCampaigns = useCallback(async () => {
    setLoadingKey("campaigns", true);
    try {
      const data = await apiFetch<CampaignRow[]>(`/api/v1/business-development/campaigns${regionQuery}`);
      setCampaigns(data ?? []);
    } finally {
      setLoadingKey("campaigns", false);
    }
  }, [regionQuery, setLoadingKey]);

  const loadFinance = useCallback(async () => {
    setLoadingKey("finance", true);
    try {
      const data = await apiFetch<FinanceSummary>(`/api/v1/business-development/finance${regionQuery}`);
      setFinance(data ?? null);
    } finally {
      setLoadingKey("finance", false);
    }
  }, [regionQuery, setLoadingKey]);

  const loadRegions = useCallback(async () => {
    try {
      const data = await apiFetch<RegionOption[]>("/api/v1/business-development/regions");
      setRegions(data ?? []);
    } catch {
      setRegions([]);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    setNotice(null);
    setLoadingKey("sync", true);
    try {
      await Promise.all([loadOverview(), loadBranches(), loadInventory(), loadComplaints(), loadCampaigns(), loadFinance()]);
      setNotice("Live business development data synced successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sync business development data.");
    } finally {
      setLoadingKey("sync", false);
    }
  }, [loadBranches, loadCampaigns, loadComplaints, loadFinance, loadInventory, loadOverview, setLoadingKey]);

  useEffect(() => {
    void loadRegions();
  }, [loadRegions]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (activeTab === "inventory") void loadInventory().catch((e) => setError(e.message));
  }, [activeTab, loadInventory]);

  const submitDirective = useCallback(
    async (type: DirectiveType) => {
      const body = type === "CS" ? csInstruction.trim() : marketingInstruction.trim();
      if (!body) {
        setError(type === "CS" ? "CS directive is required." : "Marketing directive is required.");
        return;
      }

      setError(null);
      setNotice(null);
      setLoadingKey("directive", true);
      try {
        await apiFetch("/api/v1/business-development/directives", {
          method: "POST",
          body: JSON.stringify({ type, region, instruction: body }),
        });
        if (type === "CS") setCsInstruction("");
        if (type === "MARKETING") setMarketingInstruction("");
        setNotice(`${type === "CS" ? "Customer service" : "Marketing"} directive sent successfully.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to send directive.");
      } finally {
        setLoadingKey("directive", false);
      }
    },
    [csInstruction, marketingInstruction, region, setLoadingKey],
  );

  const openExport = useCallback((path: string) => {
    const url = `${path}${path.includes("?") ? "&" : "?"}region=${encodeURIComponent(region)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [region]);

  return (
    <div className={`min-h-screen space-y-8 bg-slate-50 p-6 font-sans text-slate-900 lg:p-10 ${lang === "my" ? "font-pyidaungsu" : ""}`}>
      <header className="flex flex-col items-start justify-between gap-6 border-b-2 border-slate-200 pb-8 md:flex-row md:items-center">
        <div className="flex items-center gap-6">
          <div className="rounded-[2.5rem] bg-slate-900 p-6 shadow-2xl ring-4 ring-slate-100">
            <Globe className="h-10 w-10 animate-pulse text-indigo-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-950">{t("portal_title")}</h1>
              <Badge className="rounded-full bg-indigo-600 px-4 py-1 text-[10px] font-black text-white">BDM_LIVE</Badge>
            </div>
            <p className="mt-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> {t("portal_subtitle")}
            </p>
            <p className="mt-3 max-w-4xl rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-bold text-indigo-800">
              {t("hq_rule")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black uppercase outline-none focus:ring-4 focus:ring-indigo-500/10"
            aria-label="Region filter"
          >
            <option value="ALL">All Territory</option>
            {regions.map((item) => (
              <option key={item.code} value={item.code}>{item.name}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={() => setLang((current) => (current === "en" ? "my" : "en"))}
            className="gap-2 rounded-2xl bg-indigo-50 text-[10px] font-black uppercase tracking-widest text-indigo-600"
          >
            <Languages className="h-4 w-4" /> {t("lang_toggle")}
          </Button>
          <Button
            onClick={() => void refreshAll()}
            className="rounded-2xl bg-slate-900 px-8 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800"
            disabled={Boolean(loading.sync)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading.sync ? "animate-spin" : ""}`} /> {t("btn_sync")}
          </Button>
        </div>
      </header>

      {error && <ErrorBanner title={t("error_title")} message={error} onRetry={() => void refreshAll()} />}
      {notice && (
        <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-4 text-sm font-black text-emerald-700">
          {notice}
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("stat_revenue"), val: mmk(kpis.grossRevenue), icon: TrendingUp, color: "text-slate-900", bg: "bg-white" },
          { label: t("stat_royalty"), val: mmk(kpis.royaltyAmount), icon: Percent, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: t("stat_success"), val: pct(kpis.successRate), icon: CheckCircle, color: "text-emerald-600", bg: "bg-white" },
          { label: t("stat_complaints"), val: String(kpis.openComplaints), icon: AlertTriangle, color: "text-rose-600", bg: "bg-white" },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} group relative overflow-hidden rounded-[3rem] border border-slate-200 p-8 shadow-sm transition-all hover:shadow-lg`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
            <div className="mt-2 flex items-center justify-between">
              <p className={`text-3xl font-black ${stat.color}`}>{loading.overview ? "..." : stat.val}</p>
              <stat.icon className={`h-10 w-10 ${stat.color} opacity-10 transition-transform group-hover:scale-110`} />
            </div>
          </div>
        ))}
      </section>

      <Tabs defaultValue="overview" className="space-y-8" onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-2 lg:flex-nowrap">
          {[
            { id: "overview", icon: LayoutDashboard, label: t("tab_overview") },
            { id: "ops", icon: Globe, label: t("tab_ops") },
            { id: "inventory", icon: Box, label: t("tab_inventory") },
            { id: "cs", icon: Headset, label: t("tab_cs") },
            { id: "marketing", icon: Megaphone, label: t("tab_marketing") },
            { id: "finance", icon: BarChart3, label: t("tab_finance") },
          ].map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-transparent px-2 py-5 shadow-xl transition-all data-[state=active]:bg-slate-900 data-[state=active]:text-white"
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-black uppercase tracking-tighter">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-8 animate-in fade-in duration-500">
          <div className="grid gap-8 lg:grid-cols-12">
            <Card className="overflow-hidden rounded-[3.5rem] border-slate-200 shadow-xl lg:col-span-8">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-8">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight">
                    <Activity className="text-indigo-600" /> Branch Node Performance
                  </CardTitle>
                  <Badge variant="outline" className="text-[9px] font-black">Live API</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {branches.length === 0 && !loading.branches ? (
                  <div className="p-8"><EmptyState message={t("empty_state")} /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <tr>
                          <th className="p-8">Regional Hub</th>
                          <th className="p-8">Contribution</th>
                          <th className="p-8">SLA Achievement</th>
                          <th className="p-8">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {branches.map((branch) => (
                          <tr key={branch.id} className="transition-colors hover:bg-slate-50/50">
                            <td className="p-8">
                              <p className="font-black text-slate-900">{branch.branchName}</p>
                              <p className="mt-1 text-[10px] font-bold text-slate-400">{branch.branchCode} · {branch.regionName}</p>
                            </td>
                            <td className="p-8 font-black text-slate-700">{mmk(branch.revenue)}</td>
                            <td className="p-8">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-24 flex-1 overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, branch.slaRate))}%` }} />
                                </div>
                                <span className="text-xs font-bold">{pct(branch.slaRate)}</span>
                              </div>
                            </td>
                            <td className="p-8"><Badge className={`border uppercase text-[9px] font-black ${statusTone(branch.status)}`}>{branch.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6 lg:col-span-4">
              <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[3.5rem] bg-slate-900 p-10 text-white shadow-2xl">
                <div className="absolute right-0 top-0 p-8 opacity-5"><ShieldCheck className="h-48 w-48" /></div>
                <div className="relative z-10">
                  <h3 className="text-2xl font-black uppercase tracking-tight">BDM Control Summary</h3>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">Live Territory Policy</p>
                  <div className="mt-10 space-y-6">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                      <p className="text-[10px] font-black uppercase text-slate-400">Total Branches</p>
                      <p className="mt-2 text-3xl font-black">{kpis.totalBranches}</p>
                    </div>
                    <div className="rounded-3xl border border-indigo-400/20 bg-indigo-600/20 p-6">
                      <p className="text-[10px] font-black uppercase text-indigo-400">Total Merchants</p>
                      <p className="mt-1 text-3xl font-black">{kpis.totalMerchants.toLocaleString()}</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                      <p className="text-[10px] font-black uppercase text-slate-400">Last Synced</p>
                      <p className="mt-2 text-sm font-black">{formatDateTime(kpis.lastSyncedAt)}</p>
                    </div>
                  </div>
                </div>
                <Button onClick={() => openExport("/api/v1/business-development/export/guidelines")} className="mt-10 h-14 w-full rounded-2xl bg-white text-[10px] font-black uppercase tracking-widest text-slate-900">
                  <Download className="mr-2 h-4 w-4" /> Download Guidelines
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ops" className="space-y-8 animate-in fade-in duration-500">
          <Card className="rounded-[3.5rem] border-slate-200 shadow-xl">
            <CardHeader className="p-8">
              <CardTitle className="text-xl font-black uppercase tracking-tight">Regional Operations</CardTitle>
            </CardHeader>
            <CardContent>
              {branches.length === 0 ? <EmptyState message={t("empty_state")} /> : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {branches.map((branch) => (
                    <div key={branch.id} className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-black text-slate-900">{branch.branchName}</p>
                          <p className="mt-1 text-xs font-bold uppercase text-slate-400">{branch.branchCode} · {branch.regionName}</p>
                        </div>
                        <Badge className={`border text-[9px] font-black uppercase ${statusTone(branch.status)}`}>{branch.status}</Badge>
                      </div>
                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-[9px] font-black uppercase text-slate-400">Revenue</p>
                          <p className="mt-1 text-sm font-black">{mmk(branch.revenue)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <p className="text-[9px] font-black uppercase text-slate-400">SLA</p>
                          <p className="mt-1 text-sm font-black">{pct(branch.slaRate)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-8 animate-in fade-in duration-500">
          <Card className="min-h-[500px] overflow-hidden rounded-[3.5rem] border-slate-200 shadow-xl">
            <CardHeader className="border-b border-slate-100 bg-slate-50 p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <CardTitle className="flex items-center gap-3 text-lg font-black uppercase tracking-tight"><Box className="text-indigo-600" /> Enterprise Inventory Registry</CardTitle>
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="rounded-xl pl-10 text-xs font-bold"
                    placeholder="Search waybills across nodes..."
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void loadInventory().catch((err) => setError(err.message));
                    }}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {inventory.length === 0 && !loading.inventory ? (
                <div className="p-8"><EmptyState message={t("empty_state")} /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="p-8">Waybill ID</th>
                        <th className="p-8">Origin Node</th>
                        <th className="p-8">Current Holder</th>
                        <th className="p-8">Transit Path</th>
                        <th className="p-8">Log History</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventory.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50">
                          <td className="p-8 font-mono font-black text-indigo-600">{row.wayId}</td>
                          <td className="p-8 font-bold">{row.originNode}</td>
                          <td className="p-8 text-xs font-bold text-slate-500">{row.currentHolder}</td>
                          <td className="p-8"><Badge variant="outline" className="text-[10px] font-black uppercase">{row.transitPath}</Badge></td>
                          <td className="p-8 text-xs italic text-slate-400">{row.latestLog}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cs" className="space-y-8 animate-in fade-in duration-500">
          <div className="grid gap-8 lg:grid-cols-12">
            <Card className="overflow-hidden rounded-[3.5rem] border-slate-200 shadow-xl lg:col-span-8">
              <CardHeader className="border-b border-slate-100 bg-slate-50 p-8">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-black uppercase tracking-tight">Complaints Log</CardTitle>
                  <Badge className="bg-rose-600 font-black text-white">{complaints.length} Live Issues</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-8">
                {complaints.length === 0 ? <EmptyState message={t("empty_state")} /> : complaints.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-[2.5rem] border border-slate-100 p-6 hover:bg-slate-50">
                    <div className="flex items-center gap-6">
                      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-xs font-black text-indigo-600">{item.branchCode}</div>
                      <div>
                        <h4 className="font-black text-slate-900">{item.customerName}</h4>
                        <p className="text-sm font-medium text-slate-500">{item.issue}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{formatDateTime(item.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className={`border text-[9px] font-black uppercase ${statusTone(item.priority)}`}>{item.priority}</Badge>
                      <Badge variant="outline" className="text-[9px] font-black uppercase">{item.status}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex flex-col justify-between rounded-[3.5rem] bg-indigo-950 p-10 text-white shadow-2xl lg:col-span-4">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Service Directive</h3>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">CS Instructions</p>
                <textarea
                  value={csInstruction}
                  onChange={(e) => setCsInstruction(e.target.value)}
                  placeholder="Broadcast instructions to regional CS leads..."
                  className="mt-10 h-48 w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <Button disabled={loading.directive} onClick={() => void submitDirective("CS")} className="mt-8 h-16 w-full gap-2 rounded-2xl bg-indigo-600 text-[10px] font-black uppercase tracking-widest">
                <Send className="h-4 w-4" /> Broadcast Directive
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="marketing" className="space-y-8 animate-in fade-in duration-500">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              {campaigns.length === 0 ? <EmptyState message={t("empty_state")} /> : campaigns.map((campaign) => (
                <div key={campaign.id} className="group flex items-center justify-between rounded-[3rem] border border-slate-200 bg-white p-8 shadow-sm">
                  <div className="flex items-center gap-6">
                    <div className="rounded-3xl bg-slate-50 p-5 transition-colors group-hover:bg-emerald-50"><Megaphone className="h-8 w-8 text-emerald-600" /></div>
                    <div>
                      <h4 className="text-xl font-black text-slate-900">{campaign.title}</h4>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{campaign.description}</p>
                      <p className="mt-2 text-[10px] font-bold uppercase text-slate-400">{campaign.owner || "-"} · {formatDateTime(campaign.startDate)} - {formatDateTime(campaign.endDate)}</p>
                    </div>
                  </div>
                  <Badge className={`border text-[8px] font-black uppercase ${statusTone(campaign.status)}`}>{campaign.status}</Badge>
                </div>
              ))}
            </div>

            <div className="flex flex-col justify-between rounded-[3.5rem] bg-slate-900 p-10 text-white shadow-2xl lg:col-span-4">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">Marketing Direction</h3>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400">Strategy Instructions</p>
                <textarea
                  value={marketingInstruction}
                  onChange={(e) => setMarketingInstruction(e.target.value)}
                  placeholder="Submit strategy adjustments for regional marketing teams..."
                  className="mt-10 h-48 w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <Button disabled={loading.directive} onClick={() => void submitDirective("MARKETING")} className="mt-8 h-16 w-full gap-2 rounded-2xl bg-emerald-600 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500">
                <Send className="h-4 w-4" /> Apply Strategy
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="finance" className="space-y-8 animate-in fade-in duration-500">
          <div className="rounded-[4rem] border border-slate-200 bg-white p-12 shadow-xl">
            <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tighter">Financial Audit</h2>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">Live Regional Revenue Streams</p>
              </div>
              <Button onClick={() => openExport("/api/v1/business-development/export/finance")} className="h-14 rounded-2xl border-2 border-slate-900 px-10 text-[10px] font-black uppercase">
                <Download className="mr-2 h-4 w-4" /> Export P&L
              </Button>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="flex flex-col justify-between rounded-[3rem] bg-slate-950 p-10 text-white">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Gross Revenue</p>
                  <p className="mt-4 text-4xl font-black">{mmk(finance?.nationalGross ?? kpis.grossRevenue)}</p>
                  <p className="mt-2 text-[9px] font-bold uppercase text-slate-500">Live consolidated revenue</p>
                </div>
              </div>
              <div className="flex flex-col justify-between rounded-[3rem] bg-indigo-600 p-10 text-white">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Management Fee</p>
                  <p className="mt-4 text-4xl font-black">{mmk(finance?.royaltyAmount ?? kpis.royaltyAmount)}</p>
                  <p className="mt-2 text-[9px] font-bold uppercase text-indigo-300">Rate: {pct(finance?.royaltyRate ?? kpis.royaltyRate)}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center rounded-[3rem] border-2 border-dashed border-slate-200 p-10 text-center">
                <TrendingUp className="mb-4 h-12 w-12 text-slate-200" />
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Growth Rate</p>
                <p className="mt-3 text-3xl font-black text-slate-900">{finance?.growthRate == null ? "-" : pct(finance.growthRate)}</p>
                <p className="mt-2 text-[10px] font-bold uppercase text-slate-400">Updated: {formatDateTime(finance?.updatedAt)}</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <footer className="flex flex-col items-center justify-between gap-10 rounded-[4rem] border border-slate-200 bg-white p-10 shadow-sm md:flex-row">
        <div className="flex items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50">
            <ShieldCheck className="h-8 w-8 animate-pulse text-indigo-500" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Business Development Registry</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-tighter text-slate-800 opacity-80">Britium Express Corporate Portal • Live Data Mode</p>
          </div>
        </div>
        <Badge variant="outline" className="border-none bg-slate-900 px-8 py-4 font-mono text-xs font-black text-indigo-400 shadow-2xl">
          GO_LIVE_READY: API_WIRED
        </Badge>
      </footer>
    </div>
  );
}
