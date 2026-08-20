#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const dir=path.join(root,'dist');
if(!fs.existsSync(dir)){console.error(JSON.stringify({ok:false,error:`Missing ${dir}`},null,2));process.exit(1)}
const files=[];function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(/\.(js|html|css)$/.test(e.name))files.push(f)}}walk(dir);
const text=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const required=['PORTAL_DATA_ENTRY_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03','PORTAL_CANONICAL_TARIFF_CATALOG_V61_7_2026_08_03','be_tariff_catalog_v61_7','be_parcel_tariffs_v2','V61_7'];
const missing=required.filter(x=>!text.includes(x));
const ok=missing.length===0;
console.log(JSON.stringify({ok,build:'PORTAL_CANONICAL_TARIFF_WIRING_V61_7_DIST_VERIFY_2026_08_03',scanned_files:files.length,required_markers_present:required.length-missing.length,required_markers_total:required.length,missing,canonical_tariff_rpc_present:text.includes('be_tariff_catalog_v61_7'),shared_tariff_source_present:text.includes('be_parcel_tariffs_v2'),data_entry_v61_6_clean_ux_preserved:text.includes('V61_6'),deploy_performed:false},null,2));if(!ok)process.exit(1);
