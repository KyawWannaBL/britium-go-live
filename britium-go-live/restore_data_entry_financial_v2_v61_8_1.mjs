import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const BUILD =
  "PORTAL_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04";

const APP = path.join(ROOT, "src/App.tsx");
const MAIN = path.join(ROOT, "src/main.tsx");
const PAGE = path.join(ROOT, "src/pages/DataEntryFinancialV2Page.tsx");
const API = path.join(ROOT, "src/lib/dataEntryFinancialV2Api.ts");
const TOWNSHIP = path.join(ROOT, "src/data/townshipTariffDirectory.ts");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(ROOT, `.be-financial-v2-backup-${stamp}`);

function fail(message) {
  console.error("\nERROR:", message);
  process.exit(1);
}

if (!fs.existsSync(APP) || !fs.existsSync(path.join(ROOT, "package.json"))) {
  fail("Run this from the Enterprise project root.");
}

const skip = new Set([
  "node_modules",
  "dist",
  ".git",
  ".vercel",
  ".vite",
]);

function findFile(start, acceptedNames) {
  if (!start || !fs.existsSync(start)) return null;

  const stack = [start];

  while (stack.length) {
    const dir = stack.pop();

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(full);
        continue;
      }

      if (acceptedNames.includes(entry.name)) return full;
    }
  }

  return null;
}

const searchRoots = [
  path.resolve(ROOT, ".."),
  path.resolve(ROOT, "../.."),
  "F:/D27072026/britium-go-live",
  "C:/Users/Administrator/Downloads",
  "C:/Users/Administrator/Desktop",
].filter((value, index, array) =>
  fs.existsSync(value) && array.indexOf(value) === index
);

console.log("Searching for Financial V2 V61.8.1 source...");

let pageSource = null;

for (const root of searchRoots) {
  pageSource = findFile(root, [
    "DataEntryFinancialV2Page_v61_8_1.tsx",
  ]);
  if (pageSource) break;
}

if (!pageSource) {
  console.error(`
The exact V61.8.1 source was not found locally.

Required file:
  DataEntryFinancialV2Page_v61_8_1.tsx

No project files were changed.
`);
  process.exit(2);
}

const pageText = fs.readFileSync(pageSource, "utf8");

if (
  !pageText.includes(BUILD) ||
  !pageText.includes("EXACT_AND_OPAQUE_GROSS_MINUS_BRITIUM") ||
  !pageText.includes("ReviewSheetModal") ||
  !pageText.includes("merchant_final_settlement_amount")
) {
  fail(
    "Located Data Entry source is not the verified V61.8.1 Payment Settlement build."
  );
}

let townshipSource = null;

if (fs.existsSync(TOWNSHIP)) {
  const current = fs.readFileSync(TOWNSHIP, "utf8");
  if (
    current.includes("TOWNSHIP_TARIFF_DIRECTORY") &&
    current.includes("findTownshipTariff") &&
    current.includes("searchTownshipTariffs") &&
    current.includes("townshipDisplayName")
  ) {
    townshipSource = TOWNSHIP;
  }
}

if (!townshipSource) {
  for (const root of searchRoots) {
    townshipSource = findFile(root, [
      "townshipTariffDirectory_v61_1_1.ts",
      "townshipTariffDirectory.ts",
    ]);
    if (townshipSource) {
      const candidate = fs.readFileSync(townshipSource, "utf8");
      if (
        candidate.includes("TOWNSHIP_TARIFF_DIRECTORY") &&
        candidate.includes("findTownshipTariff") &&
        candidate.includes("searchTownshipTariffs") &&
        candidate.includes("townshipDisplayName")
      ) break;

      townshipSource = null;
    }
  }
}

if (!townshipSource) {
  fail(
    "Compatible townshipTariffDirectory source was not found. No files changed."
  );
}

fs.mkdirSync(backupDir, { recursive: true });

const touched = [APP, MAIN, PAGE, API, TOWNSHIP];
const existed = new Map();

for (const file of touched) {
  const present = fs.existsSync(file);
  existed.set(file, present);

  if (present) {
    const rel = path.relative(ROOT, file);
    const destination = path.join(backupDir, rel);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(file, destination);
  }
}

function rollback() {
  console.error("\nRolling source files back...");

  for (const file of touched) {
    const rel = path.relative(ROOT, file);
    const backup = path.join(backupDir, rel);

    if (existed.get(file)) {
      if (fs.existsSync(backup)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.copyFileSync(backup, file);
      }
    } else if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }
}

try {
  fs.mkdirSync(path.dirname(PAGE), { recursive: true });
  fs.mkdirSync(path.dirname(API), { recursive: true });
  fs.mkdirSync(path.dirname(TOWNSHIP), { recursive: true });

  let installedPage = pageText
    .replace(
      "Review all records before saving",
      "OPEN FULL REGISTRATION"
    )
    .replace(
      "မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်",
      "စာရင်းသွင်းမျက်နှာပြင် အပြည့်ဖွင့်ရန်"
    );

  fs.writeFileSync(PAGE, installedPage);

  if (path.resolve(townshipSource) !== path.resolve(TOWNSHIP)) {
    fs.copyFileSync(townshipSource, TOWNSHIP);
  }

  const apiSource = `import { supabase } from '@/integrations/supabase/client';

export type FinancialV2Field = {
  name: string;
  section: string;
  ownership: 'INPUT' | 'SERVER' | string;
  editable: boolean;
  data_type: string;
  required: boolean;
  source?: string;
};

export type FinancialV2Envelope<T = Record<string, unknown>> = {
  ok: boolean;
  build?: string;
  generated_at?: string;
  data?: T;
  warnings?: Array<{ code?: string; message?: string; field?: string }>;
  errors?: Array<{ code?: string; message?: string; field?: string }>;
  access?: Record<string, unknown>;
  mutation_mode?: string;
  dry_run?: boolean;
  persisted?: boolean;
  operation?: string;
  message?: string;
  [key: string]: unknown;
};

export type FinancialV2SchemaData = {
  schema_version: string;
  field_count: number;
  environment: string;
  mutation_rpcs_activated: boolean;
  fields: FinancialV2Field[];
};

export type FinancialV2SnapshotData = {
  schema_version: string;
  returned_rows: number;
  limit: number;
  filters: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
};

function throwRpcError(error: unknown): never {
  const value = error as {
    message?: string;
    details?: string;
    hint?: string;
  } | null;

  const message = [
    value?.message,
    value?.details,
    value?.hint,
  ].filter(Boolean).join(' | ');

  throw new Error(message || 'Financial V2 RPC failed.');
}

export async function financialV2Schema() {
  const { data, error } =
    await supabase.rpc('be_data_entry_financial_v2_schema');

  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<FinancialV2SchemaData>;
}

export async function financialV2Snapshot(
  filter: Record<string, unknown> = {},
  limit = 100,
) {
  const { data, error } =
    await supabase.rpc('be_data_entry_financial_v2_snapshot', {
      p_filter: filter,
      p_limit: limit,
    });

  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<FinancialV2SnapshotData>;
}

export async function financialV2Calculate(
  payload: Record<string, unknown>,
) {
  const { data, error } =
    await supabase.rpc('be_data_entry_financial_v2_calculate', {
      p_payload: payload,
    });

  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<Record<string, unknown>>;
}

export async function financialV2Save(
  payload: Record<string, unknown>,
) {
  const { data, error } =
    await supabase.rpc('be_data_entry_financial_v2_save', {
      p_payload: payload,
    });

  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<Record<string, unknown>>;
}

export async function financialV2Import(
  payload: Record<string, unknown>,
) {
  const { data, error } =
    await supabase.rpc('be_data_entry_financial_v2_import', {
      p_payload: payload,
    });

  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<Record<string, unknown>>;
}

export async function financialV2CreateWaybill(
  payload: Record<string, unknown>,
) {
  const { data, error } =
    await supabase.rpc('be_data_entry_financial_v2_create_waybill', {
      p_payload: payload,
    });

  if (error) throwRpcError(error);
  return data as FinancialV2Envelope<Record<string, unknown>>;
}
`;

  fs.writeFileSync(API, apiSource);

  let app = fs.readFileSync(APP, "utf8");

  const importPattern =
    /const\s+DataEntryPage\s*=\s*safeLazy\(\(\)\s*=>\s*import\((['"])@\/pages\/(?:DataEntryPage|DataEntryFinancialV2Page)\1\)\s*\);/;

  if (!importPattern.test(app)) {
    throw new Error(
      "Could not find the active DataEntryPage lazy import in src/App.tsx."
    );
  }

  app = app.replace(
    importPattern,
    "const DataEntryPage = safeLazy(() => import('@/pages/DataEntryFinancialV2Page'));"
  );

  fs.writeFileSync(APP, app);

  if (fs.existsSync(MAIN)) {
    let main = fs.readFileSync(MAIN, "utf8");

    const legacyDataEntryBootstraps = [
      "dataEntryTariffAutocomplete",
      "dataEntryGoLiveHardWire",
      "dataEntryHardFullscreenGuardV28",
      "dataEntryFullscreenGuardV32",
      "dataEntryFullscreenGuardV33",
      "dataEntryRuntimeGuardV34",
    ];

    main = main
      .split(/\r?\n/)
      .filter(
        line =>
          !legacyDataEntryBootstraps.some(marker =>
            line.includes(marker)
          )
      )
      .join("\n");

    fs.writeFileSync(MAIN, main);
  }

  console.log("\nInstalled:");
  console.log("  Page:", pageSource);
  console.log("  Township:", townshipSource);
  console.log("  API: canonical Financial V2 RPC adapter");
  console.log("  Route: /data-entry -> Financial V2 V61.8.1");
  console.log("  Legacy Data Entry fullscreen bootstraps: removed");
  console.log("  Financial write gate: unchanged/default FALSE");

  const npm =
    process.platform === "win32" ? "npm.cmd" : "npm";

  console.log("\nBuilding production bundle...\n");

  const build = spawnSync(
    npm,
    ["run", "build"],
    {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
    }
  );

  if (build.status !== 0) {
    rollback();
    fail(
      `Build failed. Source was restored. Backup: ${backupDir}`
    );
  }

  const assets = path.join(ROOT, "dist/assets");

  if (!fs.existsSync(assets)) {
    rollback();
    fail("Build completed without dist/assets. Source restored.");
  }

  let bundleText = "";

  for (const name of fs.readdirSync(assets)) {
    if (!/\.(js|mjs|css)$/.test(name)) continue;

    try {
      bundleText += fs.readFileSync(
        path.join(assets, name),
        "utf8"
      );
    } catch {}
  }

  const requiredMarkers = [
    BUILD,
    "EXACT_AND_OPAQUE_GROSS_MINUS_BRITIUM",
    "merchant_final_settlement_amount",
    "data-full-review-sheet",
    "be_data_entry_financial_v2_calculate",
    "be_data_entry_financial_v2_save",
  ];

  const missingMarkers =
    requiredMarkers.filter(marker => !bundleText.includes(marker));

  if (missingMarkers.length) {
    rollback();

    console.error(
      "Missing production bundle markers:",
      missingMarkers
    );

    fail(
      `Bundle verification failed. Source restored. Backup: ${backupDir}`
    );
  }

  console.log("\n==========================================");
  console.log("FINANCIAL V2 RESTORATION: PASS");
  console.log("==========================================");
  console.log("Build:", BUILD);
  console.log("Full registration sheet: INSTALLED");
  console.log("Six collection methods: INSTALLED");
  console.log("Merchant settlement UI: INSTALLED");
  console.log("Britium entitlement UI: INSTALLED");
  console.log("Backend calculation RPC: WIRED");
  console.log("Financial live writes: NOT ENABLED");
  console.log("Backup:", backupDir);
  console.log("==========================================\n");

} catch (error) {
  rollback();
  fail(error?.message || String(error));
}
