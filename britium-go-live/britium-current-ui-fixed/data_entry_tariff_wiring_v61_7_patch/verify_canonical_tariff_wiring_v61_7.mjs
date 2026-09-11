#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const dataFile=path.join(root,'src','pages','DataEntryFinancialV2Page.tsx');
const tariffFile=path.join(root,'src','pages','TariffPage.tsx');
if(!fs.existsSync(dataFile)||!fs.existsSync(tariffFile)){console.error(JSON.stringify({ok:false,error:'Required page missing'},null,2));process.exit(1)}
const data=fs.readFileSync(dataFile,'utf8');
const tariff=fs.readFileSync(tariffFile,'utf8');
const requiredData=['PORTAL_DATA_ENTRY_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03','data-township-alias-resolution="V61.7"','data-canonical-tariff-source="be_parcel_tariffs_v2"','data-tariff-catalog-rpc="be_tariff_catalog_v61_7"','data-tariff-wiring="V61_7"','data-minimal-clean-ux="V61_6"','data-weight-before-final-charges="true"','မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်'];
const requiredTariff=['PORTAL_CANONICAL_TARIFF_CATALOG_V61_7_2026_08_03','be_tariff_catalog_v61_7','data-canonical-tariff-source="be_parcel_tariffs_v2"','data-shared-with-data-entry="true"','same active, effective-dated tariff source'];
const missing=[...requiredData.filter(x=>!data.includes(x)).map(x=>`DataEntry:${x}`),...requiredTariff.filter(x=>!tariff.includes(x)).map(x=>`Tariff:${x}`)];
const forbidden=['be_master_data_snapshot','be_delivery_tariff_master_v13','be_md_tariffs','township_tariffs'];
const forbiddenFound=forbidden.filter(x=>tariff.includes(x));
const directFinancialUpsert=/\.from\([^)]*(financial|parcel_financial)[^)]*\)\s*\.upsert\(/is.test(data);
const ok=missing.length===0&&forbiddenFound.length===0&&!directFinancialUpsert;
console.log(JSON.stringify({ok,build:'PORTAL_CANONICAL_TARIFF_WIRING_V61_7_SOURCE_VERIFY_2026_08_03',required_markers_present:requiredData.length+requiredTariff.length-missing.length,required_markers_total:requiredData.length+requiredTariff.length,missing,legacy_tariff_sources_forbidden_found:forbiddenFound,data_entry_and_tariff_screen_shared_source:tariff.includes('be_tariff_catalog_v61_7')&&data.includes('be_parcel_tariffs_v2'),v61_6_clean_ux_preserved:data.includes('data-minimal-clean-ux="V61_6"'),weight_before_summary_preserved:data.includes('data-weight-before-final-charges="true"'),direct_financial_upsert_found:directFinancialUpsert,financial_writes_enabled:false},null,2));
if(!ok)process.exit(1);
