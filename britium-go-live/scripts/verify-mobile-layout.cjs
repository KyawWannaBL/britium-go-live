const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{chromium}=require('playwright-core');
// Render the real shell/sidebar with read-only auth/navigation adapters. No login
// or backend writes are made. The browser uses the actual production CSS bundle.
function load(code,mocks,win){const box={exports:{}};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:box,exports:box.exports,require:n=>mocks[n]??require(n),window:win,console});return box.exports;}
function markup(width,expanded=false){
 const win={innerWidth:expanded?1280:width,matchMedia:()=>({matches:width<1024}),localStorage:{getItem:()=>expanded?'0':width<1024?null:'1'}};
 const icon=()=>React.createElement('svg',{width:18,height:18});
 const icons=new Proxy({},{get:()=>icon});
 const sidebar=load(fs.readFileSync('src/components/Sidebar.tsx','utf8'),{'lucide-react':icons,'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{...props,href:to},children),useLocation:()=>({pathname:'/dashboard'}),useNavigate:()=>()=>{}},'@/integrations/supabase/client':{supabase:{}},'@/contexts/AuthContext':{useAuth:()=>({profile:{role:'SUPERADMIN'}})},'@/lib/accessControl':{filterAuthorizedPaths:(_,links)=>links}},win).default;
 const source=ts.createSourceFile('App.tsx',fs.readFileSync('src/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const shell=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AppShell').getText(source).replace('function AppShell','export function AppShell');
 const compiled=load(`import Sidebar from 'sidebar';import {useLanguage} from 'language';import {Globe} from 'lucide-react';import WarehousePendingGlobalAlert from 'alert';const GLOBAL_FONT='';${shell}`,{sidebar:{default:sidebar},language:{useLanguage:()=>({lang:'my',toggleLang:()=>{}})},'lucide-react':icons,alert:{default:()=>null}},win).AppShell;
 const child=React.createElement('section',null,React.createElement('h1',null,'Merchant settlement / ငွေစာရင်း'),React.createElement('div',{style:{maxWidth:'100%',overflowX:'auto'}},React.createElement('table',{style:{width:1900}},React.createElement('tbody',null,React.createElement('tr',null,React.createElement('td',null,'Wide finance worksheet'))))));
 return renderToStaticMarkup(React.createElement(compiled,null,child));
}
async function pageTestInsets(browser,css) {
 const page=await browser.newPage({viewport:{width:320,height:568}});
 try {
 // Simulate nonzero CSS environment values; this is geometry evidence, not device sign-off.
 const insets={'safe-area-inset-top':'20px','safe-area-inset-bottom':'16px','safe-area-inset-left':'12px','safe-area-inset-right':'0px'};
 const insetCss=css.replace(/env\((safe-area-inset-[a-z]+)(?:,[^)]*)?\)/g,(_,name)=>insets[name]||'0px');
 await page.setContent(`<style>${insetCss}</style><div id="root">${markup(320)}</div>`);
 const b=await page.evaluate(()=>{const r=document.querySelector('[data-be-sidebar]').getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};});assert.equal(b.x,12);assert.equal(b.y,20);assert.ok(b.y+b.height<=552,'rail must clear bottom system inset');
 }finally{await page.close();}
}
async function pageTestExpanded(browser,css) {
 const page=await browser.newPage({viewport:{width:320,height:568}});
 try {await page.setContent(`<style>${css}</style><div id="root">${markup(320,true)}</div>`);
 const m=await page.evaluate(()=>({menu:document.querySelector('[data-be-sidebar]').getBoundingClientRect().width,right:document.querySelector('[data-be-main]').getBoundingClientRect().right}));
 assert.ok(m.menu<=276&&m.menu>=200,'expanded menu must fit phone');assert.ok(m.right<=321,'expanded menu must overlay without pushing content out');
 }finally{await page.close();}
}
(async()=>{const css=fs.readdirSync('dist/assets').filter(x=>x.endsWith('.css')).map(x=>fs.readFileSync(`dist/assets/${x}`,'utf8')).join('\n');const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,headless:true,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage','--use-gl=disabled']});const failures=[];try{for(const [width,height]of [[320,568],[360,640],[390,844],[360,300],[640,360],[768,1024],[1024,768],[1280,800],[1920,1080]]){const page=await browser.newPage({viewport:{width,height}});await page.setContent(`<style>${css}</style><div id="root">${markup(width)}</div>`);const m=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();const sidebar=box('[data-be-sidebar]'),main=box('[data-be-main]'),content=box('[data-be-content]');return {sidebar:sidebar.width,main:main.width,right:main.right,content:content.width,shellHeight:box('[data-be-app-shell]').height,documentWidth:document.documentElement.scrollWidth};});try{assert.ok(Math.abs(m.sidebar-64)<1,`collapsed rail must be64px, got${m.sidebar}`);assert.ok(m.right<=width+1,`main exceeds viewport: ${JSON.stringify(m)}`);assert.ok(m.content<=m.main+1,'content must fit main');assert.ok(m.documentWidth<=width+1,'page must not overflow horizontally');assert.ok(Math.abs(m.shellHeight-height)<1,'shell must fit height');}catch(e){failures.push(`${width}x${height}: ${e.message}`);}console.log(`${width}x${height} ${JSON.stringify(m)}`);await page.close();}await pageTestExpanded(browser,css);await pageTestInsets(browser,css);assert.deepEqual(failures,[]);console.log('PASS: real Enterprise shell fits9phone/tablet/desktop portrait and landscape viewports with contained worksheet scroll');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
