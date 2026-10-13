import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const portal=path.resolve('..'),rider=path.resolve('../../Rider-App');
const protectedNames=new Set(['be_user_account_registry','be_mobile_workforce_accounts','be_merchants','be_merchant_profiles','be_delivery_tariff_rules','be_township_master','be_branch_nodes','be_location_aliases','be_chart_of_accounts','be_accounting_periods','be_mapbox_budget_month_v1','be_mapbox_geocode_cache_v1']);
const roots={be_data_entry_parcel_details:'delivery_way_id',be_wayplan_dispatches:'wayplan_id',be_pickup_requests:'pickup_id'};
const inventory=JSON.parse(fs.readFileSync(path.join(portal,'docs/golive/schema-inventory.json'),'utf8'));
const calls=[],unknown=[],sources=[];
function files(dir){if(!fs.existsSync(dir))throw Error('Inventory source unavailable: '+dir);return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):/\.[cm]?[jt]sx?$/.test(e.name)?[path.join(dir,e.name)]:[]);}
for(const [app,base,dirs] of [['Portal',path.resolve('.'),['src','api','server']],['Rider',rider,['src']]]){
 for(const dir of dirs){
  if(!fs.existsSync(path.join(base,dir))){unknown.push({app,source:dir,reason:'Missing source directory'});continue;}
  for(const file of files(path.join(base,dir))){
   const content=fs.readFileSync(file,'utf8'),source=path.relative(base,file);
   sources.push({app,source,sha256:crypto.createHash('sha256').update(content).digest('hex')});
   const ast=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true);
   function walk(node){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['rpc','from','channel'].includes(node.expression.name.text)){
     const method=node.expression.name.text,arg=node.arguments[0],line=ast.getLineAndCharacterOfPosition(node.getStart()).line+1;
     if(arg&&(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg))){
      let chain=node;while(chain.parent&&(ts.isCallExpression(chain.parent)||ts.isPropertyAccessExpression(chain.parent)))chain=chain.parent;
      const chainText=chain.getText(ast);
      const kind=method==='rpc'?'RPC':method==='channel'?'REALTIME_CHANNEL':node.expression.getText(ast).includes('storage')?'STORAGE_BUCKET':'TABLE_CANDIDATE';
      calls.push({app,source,line,kind,name:arg.text,access:kind==='RPC'?'REQUIRES_SERVER_REVIEW':/\.(insert|upsert|update|delete)\(/.test(chainText)?'WRITE_CANDIDATE':'READ_CANDIDATE'});
     }else unknown.push({app,source,line,reason:'Dynamic '+method+' target requires manual resolution'});
    }
    ts.forEachChild(node,walk);
   }walk(ast);
   for(const diagnostic of ast.parseDiagnostics||[])unknown.push({app,source,reason:'Source parse diagnostic: '+ts.flattenDiagnosticMessageText(diagnostic.messageText,' ')});
  }
 }
}
const tables=inventory.tables.map(t=>({schema:t.schema,table:t.table,primary_key:t.pk,category:t.schema==='public'&&protectedNames.has(t.table)?'PROTECTED_MASTER':t.schema==='public'&&roots[t.table]?'TRANSACTION_ROOT_LOOKUP_ONLY':'UNCLASSIFIED',root_key:t.schema==='public'?roots[t.table]||null:null,archive_strategy:'NOT_APPROVED',consumer_candidates:calls.filter(x=>x.kind==='TABLE_CANDIDATE'&&x.name===t.table),dependencies:inventory.fk.filter(f=>[t.table,t.schema+'.'+t.table].includes(f.source)||[t.table,t.schema+'.'+t.table].includes(f.target))}));
const result={version:2,complete:false,execution_enabled:false,scope:'Static candidates across source files; includes legacy/unreachable code and is not a proven active-path allowlist',portal_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:portal,encoding:'utf8'}).trim(),rider_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:rider,encoding:'utf8'}).trim(),schema_inventory_sha256:crypto.createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),missing_coverage:['Production RPC/view definitions and call graph','Logical/JSON financial source links','Triggers, scheduled/rebuild jobs and storage policies','Reachability validation for legacy source candidates','Immutable archive, restore and stale-client consumers'],sources,tables,calls,unresolved:unknown};
fs.writeFileSync(path.join(portal,'docs/golive/scope-registry.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({tables:tables.length,sources:sources.length,calls:calls.length,unresolved:unknown.length,unclassified:tables.filter(x=>x.category==='UNCLASSIFIED').length,execution_enabled:false}));
