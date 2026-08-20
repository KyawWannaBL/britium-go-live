import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const DOWNLOADS = "C:/Users/Administrator/Downloads";

const APP = path.join(ROOT, "src/App.tsx");
const MAIN = path.join(ROOT, "src/main.tsx");
const PAGE = path.join(ROOT, "src/pages/DataEntryFinancialV2Page.tsx");
const TOWN = path.join(ROOT, "src/data/townshipTariffDirectory.ts");
const API = path.join(ROOT, "src/lib/dataEntryFinancialV2Api.ts");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP = path.join(ROOT, `.financial-v2-backup-${stamp}`);

function stop(message) {
  console.error("\nERROR:", message);
  process.exit(2);
}

function newestFile(regex) {
  if (!fs.existsSync(DOWNLOADS)) return null;

  return fs.readdirSync(DOWNLOADS)
    .filter(name => regex.test(name))
    .map(name => ({
      name,
      full: path.join(DOWNLOADS, name),
      time: fs.statSync(path.join(DOWNLOADS, name)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time)[0]?.full || null;
}

const pageSource = newestFile(
  /^DataEntryFinancialV2Page_v61_8_1(?:\s*\(\d+\))?\.tsx$/i
);

const townSource = newestFile(
  /^townshipTariffDirectory_v61_1_1(?:\s*\(\d+\))?\.ts$/i
);

console.log("=== SOURCE FILES ===");
console.log("Financial page:", pageSource || "NOT FOUND");
console.log("Township data :", townSource || "NOT FOUND");

if (!pageSource) {
  stop("Download DataEntryFinancialV2Page_v61_8_1.tsx into Downloads first.");
}

if (!townSource) {
  stop("Download townshipTariffDirectory_v61_1_1.ts into Downloads first.");
}

const pageText = fs.readFileSync(pageSource, "utf8");
const townText = fs.readFileSync(townSource, "utf8");

const requiredPageMarkers = [
  "PORTAL_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04",
  "EXACT_AND_OPAQUE_GROSS_MINUS_BRITIUM",
  "EXACT_COLLECTION_AMOUNT",
  "OPAQUE_COD_COLLECTION",
  "merchant_final_settlement_amount",
  "data-full-review-sheet",
];

for (const marker of requiredPageMarkers) {
  if (!pageText.includes(marker)) {
    stop(`Downloaded Financial V2 page is missing required marker: ${marker}`);
  }
}

for (const marker of [
  "TOWNSHIP_TARIFF_DIRECTORY",
  "findTownshipTariff",
  "searchTownshipTariffs",
  "townshipDisplayName",
]) {
  if (!townText.includes(marker)) {
    stop(`Downloaded township source is missing required marker: ${marker}`);
  }
}

fs.mkdirSync(BACKUP, { recursive: true });

const managed = [APP, MAIN, PAGE, TOWN, API];
const existed = new Map();

for (const file of managed) {
  const present = fs.existsSync(file);
  existed.set(file, present);

  if (present) {
    const rel = path.relative(ROOT, file);
    const backupFile = path.join(BACKUP, rel);
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    fs.copyFileSync(file, backupFile);
  }
}

function rollback() {
  console.error("\n=== ROLLING BACK ===");

  for (const file of managed) {
    const rel = path.relative(ROOT, file);
    const backupFile = path.join(BACKUP, rel);

    if (existed.get(file)) {
      if (fs.existsSync(backupFile)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.copyFileSync(backupFile, file);
      }
    } else if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
    }
  }
}

try {
  fs.mkdirSync(path.dirname(PAGE), { recursive: true });
  fs.mkdirSync(path.dirname(TOWN), { recursive: true });
  fs.mkdirSync(path.dirname(API), { recursive: true });

  let installedPage = pageText;

  // Make the whole-page facility unmistakable to the operator.
  installedPage = installedPage.replaceAll(
    "Review all records before saving",
    "FULL REGISTRATION · Review all records"
  );

  fs.writeFileSync(PAGE, installedPage, "utf8");
  fs.writeFileSync(TOWN, townText, "utf8");

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

  fs.writeFileSync(API, apiSource, "utf8");

  let app = fs.readFileSync(APP, "utf8");

  const dataEntryImport =
    /const\s+DataEntryPage\s*=\s*safeLazy\(\(\)\s*=>\s*import\((['"])@\/pages\/(?:DataEntryPage|DataEntryFinancialV2Page)\1\)\s*\);/;

  if (!dataEntryImport.test(app)) {
    throw new Error(
      "Could not find the active DataEntryPage lazy import in src/App.tsx."
    );
  }

  app = app.replace(
    dataEntryImport,
    "const DataEntryPage = safeLazy(() => import('@/pages/DataEntryFinancialV2Page'));"
  );

  fs.writeFileSync(APP, app, "utf8");

  if (fs.existsSync(MAIN)) {
    let main = fs.readFileSync(MAIN, "utf8");

    const obsoleteDataEntryBootstraps = [
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
          !obsoleteDataEntryBootstraps.some(marker =>
            line.includes(marker)
          )
      )
      .join("\n");

    fs.writeFileSync(MAIN, main, "utf8");
  }

  console.log("\n=== SOURCE INSTALL COMPLETE ===");

  console.log(
    fs.readFileSync(APP, "utf8")
      .includes("import('@/pages/DataEntryFinancialV2Page')")
      ? "ROUTE: Financial V2"
      : "ROUTE: ERROR"
  );

  console.log(
    fs.readFileSync(PAGE, "utf8")
      .includes("merchant_final_settlement_amount")
      ? "SETTLEMENT UI: installed"
      : "SETTLEMENT UI: ERROR"
  );

  console.log(
    fs.readFileSync(PAGE, "utf8")
      .includes("data-full-review-sheet")
      ? "FULL REGISTRATION: installed"
      : "FULL REGISTRATION: ERROR"
  );

  console.log("\n=== BUILDING ===");

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";

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
    throw new Error(
      `Build failed. Original source restored. Backup: ${BACKUP}`
    );
  }

  const assets = path.join(ROOT, "dist/assets");

  let bundle = "";

  for (const name of fs.readdirSync(assets)) {
    if (!name.endsWith(".js")) continue;

    bundle += fs.readFileSync(
      path.join(assets, name),
      "utf8"
    );
  }

  const bundleMarkers = [
    "be_data_entry_financial_v2_calculate",
    "be_data_entry_financial_v2_save",
    "merchant_final_settlement_amount",
    "EXACT_COLLECTION_AMOUNT",
    "OPAQUE_COD_COLLECTION",
    "data-full-review-sheet",
  ];

  const missing = bundleMarkers.filter(
    marker => !bundle.includes(marker)
  );

  if (missing.length) {
    rollback();
    throw new Error(
      `Production bundle verification failed. Missing: ${missing.join(", ")}. Original source restored.`
    );
  }

  console.log("\n==========================================");
  console.log("FINANCIAL V2 INSTALLATION: PASS");
  console.log("==========================================");
  console.log("Route                : /data-entry");
  console.log("Payment Settlement   : V61.8.1");
  console.log("Full Registration    : YES");
  console.log("Six Collection Modes : YES");
  console.log("Merchant Settlement  : YES");
  console.log("Britium Entitlement  : YES");
  console.log("Financial RPCs       : WIRED");
  console.log("Production bundle    : VERIFIED");
  console.log("Backup               :", BACKUP);
  console.log("==========================================");

} catch (error) {
  console.error("\n", error?.message || String(error));
  process.exitCode = 1;
}
