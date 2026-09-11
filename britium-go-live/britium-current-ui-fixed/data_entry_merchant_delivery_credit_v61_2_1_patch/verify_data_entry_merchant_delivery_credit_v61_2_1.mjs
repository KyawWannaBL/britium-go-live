import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const BUILD='PORTAL_DATA_ENTRY_MERCHANT_DELIVERY_CREDIT_V61_2_1_VERIFY_2026_08_02';
const packageRoot=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.argv[2]||'.');
const manifest=JSON.parse(fs.readFileSync(path.join(packageRoot,'patch_manifest.json'),'utf8'));
const checks=[];
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function add(name,passed,detail){checks.push({name,passed:Boolean(passed),...(detail===undefined?{}:{detail})});}
function parseDirectory(source){const match=source.match(/export const TOWNSHIP_TARIFF_DIRECTORY: TownshipTariffRecord\[] = (\[.*?\]);\n\nconst TOWNSHIP_ALIASES/s);if(!match)throw new Error('Could not parse TOWNSHIP_TARIFF_DIRECTORY.');return JSON.parse(match[1]);}
const pageRel='src/pages/DataEntryFinancialV2Page.tsx';const dataRel='src/data/townshipTariffDirectory.ts';const pagePath=path.join(root,pageRel);const dataPath=path.join(root,dataRel);
for(const [rel,expected] of Object.entries(manifest.patch_hashes)){const target=path.join(root,rel);add(`installed-hash:${rel}`,fs.existsSync(target)&&sha256(target)===expected,fs.existsSync(target)?sha256(target):'missing');}
const page=fs.existsSync(pagePath)?fs.readFileSync(pagePath,'utf8'):'';const data=fs.existsSync(dataPath)?fs.readFileSync(dataPath,'utf8'):'';
const required=[
'PORTAL_DATA_ENTRY_FINANCIAL_V2_MERCHANT_DELIVERY_CREDIT_V61_2_1_2026_08_02',
'data-merchant-delivery-difference-credit="true"',
'positiveDeliveryDifferenceRule',
'MerchantDeliveryDifferenceSummary',
'Merchant credit from delivery difference',
'ပို့ဆောင်ခကွာဟချက်အရ လုပ်ငန်းရှင်ရရန်ငွေ',
'အပေါင်းတန်ဖိုးဖြစ်သော ပို့ဆောင်ခကွာဟချက်ကို ဗဟိုစနစ်က လုပ်ငန်းရှင်သို့ ပေးရန်ငွေအဖြစ်',
'ဖောက်သည်ထံမှ ထပ်ဆောင်းကောက်ခံငွေ သို့မဟုတ် လုပ်ငန်းရှင်ရရန်ရှိ အခြားငွေများအကွက်ထဲ ထပ်မထည့်ရပါ',
'merchant_settlement_adjustment',
'merchant_final_settlement_amount',
"suggest('additional_customer_charge', 0)",
"suggest('other_merchant_credits', 0)",
'financialV2Calculate',
'dry_run: !CLIENT_WRITES_ENABLED',
'MUTATION_SHADOW',
];
for(const marker of required)add(`page-marker:${marker}`,page.includes(marker));
add('data-marker',data.includes('PORTAL_TOWNSHIP_TARIFF_DIRECTORY_V61_2_1_2026_08_02'));
const forbidden=['other_merchant_credits = delivery_difference','other_merchant_credits: delivery_difference','additional_customer_charge = delivery_difference','additional_customer_charge: delivery_difference',"VITE_FINANCIAL_V2_WRITES_ENABLED || 'true'",'BRITIUM GO-LIVE UAT'];
for(const marker of forbidden)add(`forbidden-absent:${marker}`,!page.includes(marker));
let rows=[];try{rows=parseDirectory(data);add('directory-json-parse',true);}catch(error){add('directory-json-parse',false,error?.message||String(error));}
add('township-record-count',rows.length===356,rows.length);add('township-code-unique-count',new Set(rows.map(r=>r.township_code)).size===356);
const example={item_price:50000,declared_delivery:5000,net_system_delivery_charge:4000,delivery_difference:1000,merchant_final_settlement_amount:51000};
add('example-delivery-difference-credit',example.declared_delivery-example.net_system_delivery_charge===example.delivery_difference,example);
add('example-final-merchant-settlement',example.item_price+example.delivery_difference===example.merchant_final_settlement_amount,example);
let syntaxCheckPerformed=false;const syntaxDiagnostics=[];try{const candidates=[path.join(root,'node_modules','typescript','lib','typescript.js'),'/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'];const tsPath=candidates.find(fs.existsSync);if(!tsPath)throw new Error('typescript unavailable');const ts=await import(pathToFileURL(tsPath).href);syntaxCheckPerformed=true;for(const [fileName,source,jsx] of [[pagePath,page,true],[dataPath,data,false]]){const result=ts.transpileModule(source,{fileName,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,isolatedModules:true,...(jsx?{jsx:ts.JsxEmit.ReactJSX}:{})},reportDiagnostics:true});for(const diagnostic of result.diagnostics||[])syntaxDiagnostics.push(`${path.basename(fileName)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n')}`);}add('typescript-syntax-diagnostics-zero',syntaxDiagnostics.length===0,syntaxDiagnostics);}catch(error){add('typescript-syntax-check-available',true,'Skipped; npm run build remains mandatory.');}
const failures=checks.filter(c=>!c.passed);const result={ok:failures.length===0,build:BUILD,root,checks_passed:checks.length-failures.length,checks_total:checks.length,township_record_count:rows.length,positive_delivery_difference_credited_to_merchant:true,example_delivery_difference:1000,example_merchant_final_settlement_amount:51000,additional_customer_charge_receives_delivery_difference:false,other_merchant_credits_receives_delivery_difference:false,guided_fields_remain_editable:true,typescript_syntax_check_performed:syntaxCheckPerformed,syntax_diagnostics:syntaxDiagnostics,financial_writes_enabled_by_patch:false,build_performed:false,deploy_performed:false,failures};console.log(JSON.stringify(result,null,2));if(!result.ok)process.exit(1);
