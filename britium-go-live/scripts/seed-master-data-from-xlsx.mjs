#!/usr/bin/env node
/**
 * Britium Master Data Workbook Seeder
 *
 * Usage:
 *   npm install @supabase/supabase-js xlsx
 *   SUPABASE_URL="https://xxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." \
 *     node scripts/seed-master-data-from-xlsx.mjs public/templates/britium_master_data_templates.xlsx
 *
 * This script imports rows from the Excel workbook into the generic
 * be_master_data_rows table through be_master_data_bulk_upsert().
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY.");
  process.exit(1);
}

const workbookPath = process.argv[2] || "public/templates/britium_master_data_templates.xlsx";
if (!fs.existsSync(workbookPath)) {
  console.error(`Workbook not found: ${workbookPath}`);
  process.exit(1);
}

const DATASETS = [
  { datasetKey: "merchant_master", sheet: "Merchant_Master (EN)", primaryKey: "merchant_code" },
  { datasetKey: "rider_master", sheet: "Rider_Master (EN)", primaryKey: "rider_id" },
  { datasetKey: "driver_master", sheet: "Driver_Master (EN)", primaryKey: "driver_id" },
  { datasetKey: "helper_master", sheet: "Helper_Master (EN)", primaryKey: "helper_id" },
  { datasetKey: "employee_master", sheet: "Employee_Master (EN)", primaryKey: "employee_id" },
  { datasetKey: "fleet_master", sheet: "Fleet_Master (EN)", primaryKey: "fleet_id" },
  { datasetKey: "service_types", sheet: "Service_Types (EN)", primaryKey: "service_type" },
  { datasetKey: "weight_brackets", sheet: "Weight_Brackets (EN)", primaryKey: "weight_bracket_code" },
  { datasetKey: "vehicle_capacity", sheet: "Vehicle_Capacity (EN)", primaryKey: "vehicle_code" },
  { datasetKey: "zone_master", sheet: "Zone_Master (EN)", primaryKey: "state_region_code" },
  { datasetKey: "township_master", sheet: "Township_Master", primaryKey: "township_code" },
  { datasetKey: "cod_fee_rules", sheet: "COD_Fee_Rules (EN)", primaryKey: "rule_code" },
  { datasetKey: "surcharge_rules", sheet: "Surcharge_Rules (EN)", primaryKey: "surcharge_code" },
  { datasetKey: "cargo_dropoff_rate", sheet: "Cargo_Dropoff_Rate (EN)", primaryKey: "dropoff_code" },
];

function cleanHeader(value) {
  return String(value || "").trim();
}

function cleanCell(value) {
  if (value === undefined) return null;
  if (value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function rowsFromSheet(workbook, cfg) {
  const ws = workbook.Sheets[cfg.sheet];
  if (!ws) {
    console.warn(`Skipping ${cfg.datasetKey}: sheet not found: ${cfg.sheet}`);
    return [];
  }

  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const headerIndex = matrix.findIndex((row) => row.map(cleanHeader).includes(cfg.primaryKey));
  if (headerIndex < 0) {
    console.warn(`Skipping ${cfg.datasetKey}: primary key header not found: ${cfg.primaryKey}`);
    return [];
  }

  const headers = matrix[headerIndex].map(cleanHeader);
  const rows = [];

  for (const row of matrix.slice(headerIndex + 1)) {
    const payload = {};
    headers.forEach((header, index) => {
      if (!header) return;
      payload[header] = cleanCell(row[index]);
    });

    const recordKey = String(payload[cfg.primaryKey] || "").trim();
    const hasData = Object.values(payload).some((v) => v !== null && v !== "");
    if (!recordKey || !hasData) continue;

    rows.push({
      record_key: recordKey,
      status: payload.status || payload.record_status || payload.contract_status || "ACTIVE",
      payload,
    });
  }

  return rows;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Reading workbook: ${path.resolve(workbookPath)}`);
const workbook = XLSX.readFile(workbookPath, { cellDates: true });

let total = 0;
for (const cfg of DATASETS) {
  const rows = rowsFromSheet(workbook, cfg);
  if (!rows.length) {
    console.log(`${cfg.datasetKey}: 0 rows`);
    continue;
  }

  const { data, error } = await supabase.rpc("be_master_data_bulk_upsert", {
    p_dataset_key: cfg.datasetKey,
    p_rows: rows,
    p_actor_email: "seed-master-data-from-xlsx",
  });

  if (error) {
    console.error(`${cfg.datasetKey}: ${error.message}`);
    process.exit(1);
  }

  const upserted = data?.upserted ?? rows.length;
  total += upserted;
  console.log(`${cfg.datasetKey}: ${upserted} rows`);
}

const { data: sync, error: syncError } = await supabase.rpc("be_master_data_sync_to_live_tables", {
  p_dataset_key: null,
  p_actor_email: "seed-master-data-from-xlsx",
});

if (syncError) {
  console.warn(`Sync warning: ${syncError.message}`);
} else {
  console.log("Go-live sync:", JSON.stringify(sync));
}

console.log(`Done. Imported ${total} master data rows.`);
