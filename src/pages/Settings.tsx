import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Globe2,
  Map,
  MapPin,
  Network,
  PlusCircle,
  Save,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { TariffSettingsPanel } from "@/components/settings/TariffSettingsPanel";

type Language = "en" | "my" | "both";
type SettingsTab =
  | "system"
  | "routePoints"
  | "towns"
  | "terms"
  | "tariff"
  | "network"
  | "geo"
  | "auth";

type SystemField = {
  key: string;
  labelEn: string;
  labelMy: string;
  value: string;
  hintEn: string;
  hintMy: string;
};

type SystemToggle = {
  key: string;
  labelEn: string;
  labelMy: string;
  enabled: boolean;
  hintEn: string;
  hintMy: string;
};

type RoutePointRow = {
  name: string;
  address: string;
  updated: string;
  type: "highway" | "postOffice" | "poi";
};

type NetworkRow = {
  code: string;
  location: string;
  entity: string;
  revenue: string;
  status: "active" | "inactive";
};

type TownRow = {
  town: string;
  state: string;
};

type LocalAccount = {
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "PENDING" | "SUSPENDED";
};

function bi(language: Language, en: string, my: string) {
  if (language === "en") return en;
  if (language === "my") return my;
  return `${en} / ${my}`;
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] border border-black/10 bg-white/55 p-6 shadow-sm backdrop-blur-md">
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-slate-700">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center gap-2 rounded-2xl bg-[#0d2c54] px-5 py-4 text-xs font-black uppercase tracking-widest text-white"
          : "inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white/70 px-5 py-4 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-white/90"
      }
    >
      {icon}
      {children}
    </button>
  );
}

function LanguageToggle({
  value,
  onChange,
}: {
  value: Language;
  onChange: (value: Language) => void;
}) {
  const items: Array<{ value: Language; label: string }> = [
    { value: "en", label: "EN" },
    { value: "my", label: "မြန်မာ" },
    { value: "both", label: "EN + မြန်မာ" },
  ];

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-white/70 p-2 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700">
        <Globe2 size={14} />
        <span>Language</span>
      </div>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={
              active
                ? "rounded-xl bg-[#0d2c54] px-3 py-2 text-sm font-semibold text-white shadow"
                : "rounded-xl bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
            }
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const ROUTE_POINTS: RoutePointRow[] = [
  {
    name: "Dagon Ayar Highway Terminal",
    address: "Yangon-Pathein Street, Yangon",
    updated: "2026-04-10",
    type: "highway",
  },
  {
    name: "Aung Mingalar Highway Terminal",
    address: "Mingaladon, Yangon",
    updated: "2026-04-10",
    type: "highway",
  },
  {
    name: "Yangon Post Office",
    address: "Botahtaung, Yangon",
    updated: "2026-04-09",
    type: "postOffice",
  },
  {
    name: "Britium Kamayut Counter",
    address: "Kamayut Township, Yangon",
    updated: "2026-04-08",
    type: "poi",
  },
];

const NETWORK_ROWS: NetworkRow[] = [
  {
    code: "BEX-YGN-HQ",
    location: "Kamayut, Yangon",
    entity: "Britium Branch",
    revenue: "100% Owned",
    status: "active",
  },
  {
    code: "BEX-AHL-01",
    location: "Ahlone Branch",
    entity: "Branch Office",
    revenue: "Branch Allocation",
    status: "active",
  },
  {
    code: "3PL-TGI-01",
    location: "Taunggyi, Shan State",
    entity: "Partner Node",
    revenue: "80 / 20 Split",
    status: "active",
  },
];

const TOWN_ROWS: TownRow[] = [
  { town: "Kamayut", state: "Yangon Region" },
  { town: "Ahlone", state: "Yangon Region" },
  { town: "Lanmadaw", state: "Yangon Region" },
  { town: "Sanchaung", state: "Yangon Region" },
  { town: "Chanmyathazi", state: "Mandalay Region" },
  { town: "Mahaaungmyay", state: "Mandalay Region" },
];

const DEFAULT_SYSTEM_FIELDS: SystemField[] = [
  {
    key: "wayIdTrailingLength",
    labelEn: "Way ID trailing length",
    labelMy: "Way ID နောက်ဆုံးစာလုံးအရှည်",
    value: "6",
    hintEn: "Minimum random digits appended to generated way IDs.",
    hintMy: "Way ID များနောက်တွင် ထည့်မည့် random digit အရေအတွက်။",
  },
  {
    key: "promotionCodeLength",
    labelEn: "Promotion code length",
    labelMy: "Promotion code အရှည်",
    value: "6",
    hintEn: "Random code length for promotions.",
    hintMy: "Promotion code အတွက် random code အရှည်။",
  },
  {
    key: "lastPickupHour",
    labelEn: "Last pickup hour",
    labelMy: "နောက်ဆုံး pickup အချိန်",
    value: "15",
    hintEn: "Orders before this hour are eligible for same-day pickup.",
    hintMy: "ဤအချိန်မတိုင်မီရသော order များကို same-day pickup လုပ်မည်။",
  },
  {
    key: "supportPhone",
    labelEn: "Support phone",
    labelMy: "Support ဖုန်းနံပါတ်",
    value: "09 400 500 542",
    hintEn: "Visible to merchants and customers.",
    hintMy: "Merchant နှင့် customer များသို့ ပြသမည့်နံပါတ်။",
  },
];

const DEFAULT_SYSTEM_TOGGLES: SystemToggle[] = [
  {
    key: "autoAssignPickupDeliver",
    labelEn: "Auto assign pickup / delivery",
    labelMy: "Pickup / delivery auto assign",
    enabled: false,
    hintEn: "Assign deliveryman automatically using rotation rules.",
    hintMy: "Rotation rule အလိုက် deliveryman ကို auto assign လုပ်မည်။",
  },
  {
    key: "autoCreateCustomerAccount",
    labelEn: "Auto create customer account",
    labelMy: "Customer account auto create",
    enabled: true,
    hintEn: "Create customer profile automatically when shipment is added.",
    hintMy: "Shipment ထည့်သွင်းချိန်တွင် customer profile ကို auto create လုပ်မည်။",
  },
  {
    key: "saveRecipientAddressBook",
    labelEn: "Save recipient to address book",
    labelMy: "Recipient ကို address book ထဲသိမ်းမည်",
    enabled: true,
    hintEn: "Store receiver data for future use.",
    hintMy: "နောက်တစ်ကြိမ်အသုံးပြုရန် receiver data သိမ်းမည်။",
  },
];

const DEFAULT_ACCOUNTS: LocalAccount[] = [
  { name: "Managing Director", email: "md@britiumexpress.com", role: "SYS", status: "ACTIVE" },
  { name: "Operations Admin", email: "ops@britiumexpress.com", role: "ADMIN", status: "ACTIVE" },
  { name: "Customer Service Lead", email: "cs@britiumexpress.com", role: "CUSTOMER_SERVICE", status: "ACTIVE" },
  { name: "Warehouse Reviewer", email: "warehouse@britiumexpress.com", role: "DATA_ENTRY", status: "PENDING" },
];

export default function Settings() {
  const [language, setLanguage] = useState<Language>("both");
  const [activeTab, setActiveTab] = useState<SettingsTab>("system");
  const [saved, setSaved] = useState(false);
  const [actorEmail, setActorEmail] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [routeQuery, setRouteQuery] = useState("");
  const [townQuery, setTownQuery] = useState("");
  const [termsBody, setTermsBody] = useState(
    "Terms and Conditions\n\n1. Parcels must comply with platform rules.\n2. Prohibited items are not accepted.\n3. Merchants are responsible for accurate customer details.",
  );

  const [systemFields, setSystemFields] = useState<SystemField[]>(DEFAULT_SYSTEM_FIELDS);
  const [systemToggles, setSystemToggles] = useState<SystemToggle[]>(DEFAULT_SYSTEM_TOGGLES);
  const [accounts, setAccounts] = useState<LocalAccount[]>(DEFAULT_ACCOUNTS);

  const t = (en: string, my: string) => bi(language, en, my);

  useEffect(() => {
    let mounted = true;

    async function loadActor() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const email = data.user?.email ?? "";
        setActorEmail(email);

        if (email) {
          setAccounts((prev) => {
            const exists = prev.some((item) => item.email.toLowerCase() === email.toLowerCase());
            if (exists) return prev;
            return [
              {
                name: email.split("@")[0] || "Signed In User",
                email,
                role: "ACTIVE_USER",
                status: "ACTIVE",
              },
              ...prev,
            ];
          });
        }
      } catch {
        if (!mounted) return;
        setActorEmail("");
      }
    }

    void loadActor();

    return () => {
      mounted = false;
    };
  }, []);

  function handleSave() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  function updateField(key: string, value: string) {
    setSystemFields((prev) =>
      prev.map((field) => (field.key === key ? { ...field, value } : field)),
    );
  }

  function toggleSwitch(key: string) {
    setSystemToggles((prev) =>
      prev.map((item) => (item.key === key ? { ...item, enabled: !item.enabled } : item)),
    );
  }

  const filteredRoutePoints = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    if (!q) return ROUTE_POINTS;
    return ROUTE_POINTS.filter((row) =>
      [row.name, row.address, row.type].join(" ").toLowerCase().includes(q),
    );
  }, [routeQuery]);

  const filteredTowns = useMemo(() => {
    const q = townQuery.trim().toLowerCase();
    if (!q) return TOWN_ROWS;
    return TOWN_ROWS.filter((row) =>
      [row.town, row.state].join(" ").toLowerCase().includes(q),
    );
  }, [townQuery]);

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((row) =>
      [row.name, row.email, row.role, row.status].join(" ").toLowerCase().includes(q),
    );
  }, [accounts, accountQuery]);

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="rounded-[36px] border border-black/10 bg-white/55 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-slate-500">
              <SettingsIcon className="h-4 w-4" />
              {t("System Configuration", "System Configuration")}
            </div>
            <h1 className="mt-2 text-4xl font-black text-slate-950">
              {t("Settings & Authorization", "Settings နှင့် Authorization")}
            </h1>
            <p className="mt-3 max-w-4xl text-sm text-slate-700">
              {t(
                "Master controls for operations, pricing, routing, geography, content rules, and lightweight authorization visibility.",
                "လုပ်ငန်းစဉ်များ၊ ဈေးနှုန်းများ၊ route points, geography, content rules နှင့် authorization visibility ကို စီမံရန် master settings page ဖြစ်သည်။",
              )}
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {t("Signed in as", "ဝင်ထားသောအကောင့်")}: {actorEmail || "guest"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <LanguageToggle value={language} onChange={setLanguage} />
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-2xl bg-[#ffd700] px-6 py-3 font-black uppercase tracking-widest text-[#0d2c54] shadow-lg"
            >
              {saved ? <CheckCircle2 size={18} /> : <Save size={18} />}
              {saved ? t("Saved", "သိမ်းပြီး") : t("Commit Changes", "ပြောင်းလဲမှုများ သိမ်းမည်")}
            </button>
          </div>
        </div>

        {saved ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {t("Configuration saved locally for this UI session.", "ဒီ UI session အတွက် settings များကို locally သိမ်းပြီးပါပြီ။")}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <TabButton active={activeTab === "system"} onClick={() => setActiveTab("system")} icon={<SettingsIcon size={16} />}>
            {t("System", "System")}
          </TabButton>
          <TabButton active={activeTab === "routePoints"} onClick={() => setActiveTab("routePoints")} icon={<MapPin size={16} />}>
            {t("Route Points", "Route Points")}
          </TabButton>
          <TabButton active={activeTab === "towns"} onClick={() => setActiveTab("towns")} icon={<Map size={16} />}>
            {t("Towns", "Towns")}
          </TabButton>
          <TabButton active={activeTab === "terms"} onClick={() => setActiveTab("terms")} icon={<Save size={16} />}>
            {t("Terms", "Terms")}
          </TabButton>
          <TabButton active={activeTab === "tariff"} onClick={() => setActiveTab("tariff")} icon={<Calculator size={16} />}>
            {t("Tariff", "ကုန်ကျစရိတ်နှုန်းထား")}
          </TabButton>
          <TabButton active={activeTab === "network"} onClick={() => setActiveTab("network")} icon={<Network size={16} />}>
            {t("Network", "Network")}
          </TabButton>
          <TabButton active={activeTab === "geo"} onClick={() => setActiveTab("geo")} icon={<Map size={16} />}>
            {t("Geography", "Geography")}
          </TabButton>
          <TabButton active={activeTab === "auth"} onClick={() => setActiveTab("auth")} icon={<ShieldCheck size={16} />}>
            {t("Authorization", "Authorization")}
          </TabButton>
        </div>
      </div>

      {activeTab === "system" && (
        <div className="mt-6">
          <Panel
            title={t("System Settings", "System Settings")}
            subtitle={t(
              "Core platform values and operational switches.",
              "Platform core values နှင့် operational switches များ။",
            )}
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                {systemFields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-[11px] font-black text-slate-600">
                      {bi(language, field.labelEn, field.labelMy)}
                    </label>
                    <input
                      value={field.value}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      className="h-11 w-full rounded-xl border border-black/10 bg-white/80 px-4 text-sm text-slate-900 outline-none"
                    />
                    <p className="text-[11px] text-slate-500">
                      {bi(language, field.hintEn, field.hintMy)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                {systemToggles.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-black/10 bg-white/70 p-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleSwitch(item.key)}
                        className={`mt-1 inline-flex h-6 w-11 items-center rounded-full transition ${
                          item.enabled ? "bg-[#0d2c54]" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`h-5 w-5 rounded-full bg-white shadow transition ${
                            item.enabled ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          {bi(language, item.labelEn, item.labelMy)}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {bi(language, item.hintEn, item.hintMy)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "routePoints" && (
        <div className="mt-6">
          <Panel
            title={t("Route Points", "Route Points")}
            subtitle={t("Maintain highways, post offices, and points of interest.", "Highway, post office နှင့် POI များကို စီမံနိုင်သည်။")}
          >
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <button className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#0d2c54] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white">
                <PlusCircle size={14} />
                {t("Add New", "အသစ်ထည့်မည်")}
              </button>
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={routeQuery}
                  onChange={(e) => setRouteQuery(e.target.value)}
                  className="h-11 w-full rounded-xl border border-black/10 bg-white/80 pl-10 pr-4 text-sm outline-none"
                  placeholder={t("Search route points", "Route points ရှာရန်")}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-black/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/80 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-black">Name</th>
                    <th className="px-4 py-3 font-black">Address</th>
                    <th className="px-4 py-3 font-black">Type</th>
                    <th className="px-4 py-3 font-black">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoutePoints.map((row) => (
                    <tr key={`${row.type}-${row.name}`} className="border-t border-black/5 bg-white/50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                      <td className="px-4 py-3 text-slate-700">{row.address}</td>
                      <td className="px-4 py-3 uppercase text-slate-600">{row.type}</td>
                      <td className="px-4 py-3 text-slate-600">{row.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "towns" && (
        <div className="mt-6">
          <Panel
            title={t("Town List", "Town List")}
            subtitle={t("Operational towns and states.", "Operational town နှင့် state များ။")}
          >
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <button className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#0d2c54] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white">
                <PlusCircle size={14} />
                {t("Add New", "အသစ်ထည့်မည်")}
              </button>
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={townQuery}
                  onChange={(e) => setTownQuery(e.target.value)}
                  className="h-11 w-full rounded-xl border border-black/10 bg-white/80 pl-10 pr-4 text-sm outline-none"
                  placeholder={t("Search towns", "Town ရှာရန်")}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-black/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/80 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-black">Town</th>
                    <th className="px-4 py-3 font-black">State / Region</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTowns.map((row) => (
                    <tr key={`${row.town}-${row.state}`} className="border-t border-black/5 bg-white/50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.town}</td>
                      <td className="px-4 py-3 text-slate-700">{row.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "terms" && (
        <div className="mt-6">
          <Panel
            title={t("Terms & Conditions", "Terms & Conditions")}
            subtitle={t("Editable content block for business rules.", "လုပ်ငန်းဆိုင်ရာ စည်းမျဉ်းစာသားကို ပြင်ဆင်နိုင်သည်။")}
          >
            <textarea
              value={termsBody}
              onChange={(e) => setTermsBody(e.target.value)}
              className="min-h-[360px] w-full rounded-2xl border border-black/10 bg-white/80 p-4 text-sm text-slate-800 outline-none"
            />
          </Panel>
        </div>
      )}

      {activeTab === "tariff" && (
        <TariffSettingsPanel language={language} />
      )}

      {activeTab === "network" && (
        <div className="mt-6">
          <Panel
            title={t("Network Expansion", "Network Expansion")}
            subtitle={t("Branch and partner node configuration.", "Branch နှင့် partner node configuration။")}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {NETWORK_ROWS.map((row) => (
                <div key={row.code} className="rounded-[28px] border border-black/10 bg-white/70 p-5 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">{row.code}</div>
                  <div className="mt-2 text-lg font-black text-slate-950">{row.location}</div>
                  <div className="mt-2 text-sm text-slate-700">{row.entity}</div>
                  <div className="mt-1 text-sm text-slate-600">{row.revenue}</div>
                  <div className="mt-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                        row.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "geo" && (
        <div className="mt-6">
          <Panel
            title={t("Geography Master", "Geography Master")}
            subtitle={t("Static operational geography summary.", "Operational geography summary။")}
          >
            <div className="rounded-[32px] border-2 border-dashed border-black/10 bg-white/50 p-12 text-center">
              <Map className="mx-auto mb-4 h-16 w-16 text-slate-300" />
              <h3 className="text-xl font-black text-slate-950">
                {t("Myanmar Geospatial Database", "Myanmar Geospatial Database")}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {t(
                  "Regions, towns, route points, and operational geography can be managed here.",
                  "Regions, towns, route points နှင့် operational geography များကို ဒီနေရာတွင် စီမံနိုင်သည်။",
                )}
              </p>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "auth" && (
        <div className="mt-6">
          <Panel
            title={t("User Authorization", "User Authorization")}
            subtitle={t(
              "Safe local visibility panel for accounts. This version avoids the crashing accountControlStore dependency chain.",
              "ဒီ version သည် page ကို crash ဖြစ်စေသော accountControlStore dependency ကို ရှောင်ထားသော safe local visibility panel ဖြစ်သည်။",
            )}
          >
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t(
                    "This is a stable fallback authorization view so /settings opens again immediately.",
                    "/settings ကို ချက်ချင်းပြန်ဖွင့်နိုင်ရန် stable fallback authorization view ဖြစ်သည်။",
                  )}
                </span>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <button className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#0d2c54] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white">
                <PlusCircle size={14} />
                {t("Create Account", "အကောင့်အသစ်ဖွင့်မည်")}
              </button>

              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={accountQuery}
                  onChange={(e) => setAccountQuery(e.target.value)}
                  className="h-11 w-full rounded-xl border border-black/10 bg-white/80 pl-10 pr-4 text-sm outline-none"
                  placeholder={t("Search accounts", "အကောင့်ရှာရန်")}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-black/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/80 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-black">Name</th>
                    <th className="px-4 py-3 font-black">Email</th>
                    <th className="px-4 py-3 font-black">Role</th>
                    <th className="px-4 py-3 font-black">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((row) => (
                    <tr key={row.email} className="border-t border-black/5 bg-white/50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                      <td className="px-4 py-3 text-slate-700">{row.email}</td>
                      <td className="px-4 py-3 text-slate-700">{row.role}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                            row.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-700"
                              : row.status === "PENDING"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
