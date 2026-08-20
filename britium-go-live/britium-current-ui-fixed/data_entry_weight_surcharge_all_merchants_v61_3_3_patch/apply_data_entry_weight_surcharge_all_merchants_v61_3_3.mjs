import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BUILD='PORTAL_DATA_ENTRY_ALL_MERCHANTS_V61_3_3_INSTALL_2026_08_02';
const packageRoot=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.argv[2]||'.');
const manifest=JSON.parse(fs.readFileSync(path.join(packageRoot,'patch_manifest.json'),'utf8'));
const patchRoot=path.join(packageRoot,'patch');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fileHash=f=>sha(fs.readFileSync(f));
const canonical=f=>sha(Buffer.from(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n'),'utf8'));
function fail(message,detail={}){console.error(JSON.stringify({ok:false,build:BUILD,root,message,...detail,backend_sql_performed:false,financial_writes_enabled_by_patch:false,build_performed:false,deploy_performed:false},null,2));process.exit(1)}
function copy(a,b){fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b)}
try{
 for(const rel of manifest.required_existing_files)if(!fs.existsSync(path.join(root,rel)))fail('Run from the reviewed Britium portal root.',{missing:rel});
 for(const [rel,expected] of Object.entries(manifest.patch_hashes)){const f=path.join(patchRoot,rel);if(!fs.existsSync(f)||fileHash(f)!==expected)fail('Patch package hash mismatch.',{file:rel});}
 for(const [rel,accepted] of Object.entries(manifest.accepted_current_canonical_hashes)){const actual=canonical(path.join(root,rel));if(!accepted.includes(actual))fail('Current Data Entry page is not reviewed V61.2.1 or V61.3 source.',{file:rel,actual_canonical_hash:actual,accepted});}
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');const backup=path.join(root,'production_backups',`data_entry_all_merchants_v61_3_3_${stamp}`);fs.mkdirSync(backup,{recursive:true});
 for(const rel of Object.keys(manifest.patch_hashes)){copy(path.join(root,rel),path.join(backup,rel));copy(path.join(patchRoot,rel),path.join(root,rel));}
 console.log(JSON.stringify({ok:true,build:BUILD,root,backup_root:backup,files_installed:Object.keys(manifest.patch_hashes),registered_merchants_supported:true,unregistered_merchants_supported:true,allowed_tiers:['STANDARD','ROYAL','COMMITMENT'],inactive_or_blocked_profiles_preserved:true,backend_sql_required:true,backend_sql_performed:false,financial_writes_enabled_by_patch:false,build_performed:false,deploy_performed:false},null,2));
}catch(e){fail(e?.message||String(e))}
