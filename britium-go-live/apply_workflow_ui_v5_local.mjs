import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const APP = path.join(ROOT, "src/App.tsx");
const DATA = path.join(ROOT, "src/pages/DataEntryFinancialV2Page.tsx");
const WAYPLAN = path.join(ROOT, "src/pages/WayplanCreatePage.tsx");
const GUIDE = path.join(ROOT, "src/components/GlobalNextProcessGuide.tsx");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const BACKUP = path.join(ROOT, `.workflow-ui-v5-backup-${stamp}`);

function fail(message) {
  console.error("\nERROR:", message);
  process.exit(2);
}

if (!fs.existsSync(APP) || !fs.existsSync(DATA)) {
  fail("Run this from the Enterprise project root.");
}

fs.mkdirSync(BACKUP, { recursive: true });

for (const file of [APP, DATA, WAYPLAN, GUIDE]) {
  if (!fs.existsSync(file)) continue;
  const dst = path.join(BACKUP, path.relative(ROOT, file));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(file, dst);
}

function restore() {
  console.error("\n=== RESTORING PREVIOUS SOURCE ===");

  for (const file of [APP, DATA, WAYPLAN, GUIDE]) {
    const src = path.join(BACKUP, path.relative(ROOT, file));

    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.copyFileSync(src, file);
    }
  }
}

try {
  let data = fs.readFileSync(DATA, "utf8");

  // -------------------------------------------------
  // 1. Data Entry controls: white background / black text
  // -------------------------------------------------

  data = data.replace(
    /const inputClass = "[^"]*";/,
    `const inputClass =
  "w-full rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-[12px] font-semibold text-black placeholder:text-slate-500 outline-none focus:border-[#f6b84b]";`
  );

  // -------------------------------------------------
  // 2. Waybill state
  // -------------------------------------------------

  if (!data.includes("waybillBusy")) {
    const stateAnchor =
      'const [fullRegistration,setFullRegistration]=useState(false);';

    if (!data.includes(stateAnchor)) {
      throw new Error("Data Entry state anchor was not found.");
    }

    data = data.replace(
      stateAnchor,
      `${stateAnchor}
  const [waybillBusy,setWaybillBusy]=useState(false);
  const [waybillMessage,setWaybillMessage]=useState("");`
    );
  }

  // -------------------------------------------------
  // 3. Waybill RPC action
  // -------------------------------------------------

  if (!data.includes("async function createAndGenerateWaybill")) {
    const fnAnchor =
      '  async function calculateAll(){ for(let i=0;i<rows.length;i+=1) await calculateRow(i); }';

    if (!data.includes(fnAnchor)) {
      throw new Error("calculateAll() anchor was not found.");
    }

    data = data.replace(
      fnAnchor,
      `${fnAnchor}

  async function createAndGenerateWaybill(){
    if(!selectedPickupId) return;

    setWaybillBusy(true);
    setWaybillMessage("");

    try{
      const requestId =
        "WAYBILL:" +
        selectedPickupId +
        ":" +
        (
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : Date.now()
        );

      const { data, error } = await (supabase as any).rpc(
        "be_data_entry_financial_v2_create_waybill",
        {
          p_payload: {
            request_id: requestId,
            pickup_id: selectedPickupId,
            dry_run: false,
          },
        }
      );

      if(error) throw error;

      if(!data?.ok){
        const rpcMessage =
          data?.errors
            ?.map((item:any)=>item?.message)
            .filter(Boolean)
            .join(" ") ||
          data?.message ||
          data?.code ||
          "Waybill creation failed.";

        throw new Error(rpcMessage);
      }

      setWaybillMessage(
        "Waybill created successfully: " +
        (data?.waybill_no || selectedPickupId)
      );
    }catch(error:any){
      setWaybillMessage(
        error?.message || "Waybill creation failed."
      );
    }finally{
      setWaybillBusy(false);
    }
  }`
    );
  }

  // -------------------------------------------------
  // 4. Waybill button
  // -------------------------------------------------

  if (!data.includes("CREATE & GENERATE WAYBILL")) {
    const buttonAnchor =
      '<button type="button" onClick={()=>setFullRegistration(true)}';

    const position = data.indexOf(buttonAnchor);

    if (position < 0) {
      throw new Error("FULL REGISTRATION button was not found.");
    }

    const button = `<button
              type="button"
              onClick={()=>void createAndGenerateWaybill()}
              disabled={!rows.length || waybillBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[11px] font-black text-white disabled:opacity-50"
            >
              {waybillBusy
                ? <Loader2 size={14} className="animate-spin"/>
                : <Save size={14}/>
              }
              CREATE & GENERATE WAYBILL
            </button>
            `;

    data =
      data.slice(0, position) +
      button +
      data.slice(position);
  }

  // -------------------------------------------------
  // 5. Waybill result
  // -------------------------------------------------

  if (!data.includes("{waybillMessage?")) {
    const messageAnchor =
      '{message?<div className="rounded-xl border border-[#ff6b6b]/35 bg-[#3a1e28] p-3 text-[12px] text-[#ff9aa2]"><AlertTriangle size={15} className="mr-2 inline"/>{message}</div>:null}';

    if (data.includes(messageAnchor)) {
      data = data.replace(
        messageAnchor,
        `${messageAnchor}

        {waybillMessage?
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[12px] font-semibold text-black">
            {waybillMessage}
          </div>
        :null}`
      );
    }
  }

  fs.writeFileSync(DATA, data, "utf8");

  // -------------------------------------------------
  // 6. Dedicated Wayplan screen
  // -------------------------------------------------

  const wayplanSource = `import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-black outline-none focus:border-amber-500";

type Option = Record<string, any>;

export default function WayplanCreatePage(){
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [options,setOptions]=useState<any>({});

  const [branchCode,setBranchCode]=useState("YGN");
  const [zoneCode,setZoneCode]=useState("");
  const [mode,setMode]=useState<"RIDER"|"VEHICLE_CREW">("RIDER");

  const [riderId,setRiderId]=useState("");
  const [driverId,setDriverId]=useState("");
  const [helperId,setHelperId]=useState("");
  const [fleetId,setFleetId]=useState("");

  const [stopsText,setStopsText]=useState("");
  const [result,setResult]=useState<any>(null);

  const riders=useMemo(
    ()=>Array.isArray(options?.riders)?options.riders:[],
    [options]
  );

  const drivers=useMemo(
    ()=>Array.isArray(options?.drivers)?options.drivers:[],
    [options]
  );

  const helpers=useMemo(
    ()=>Array.isArray(options?.helpers)?options.helpers:[],
    [options]
  );

  const vehicles=useMemo(
    ()=>Array.isArray(options?.vehicles)?options.vehicles:[],
    [options]
  );

  function valueOf(x:Option){
    return String(
      x.id ||
      x.employee_id ||
      x.record_key ||
      x.code ||
      ""
    );
  }

  function labelOf(x:Option){
    return String(
      x.label ||
      x.name ||
      x.full_name ||
      x.display_name ||
      valueOf(x)
    );
  }

  async function loadOptions(){
    setLoading(true);
    setMessage("");

    try{
      const {data,error}=await (supabase as any).rpc(
        "be_wayplan_assignment_options_v44"
      );

      if(error) throw error;

      setOptions(data || {});
    }catch(error:any){
      setMessage(
        error?.message ||
        "Wayplan assignment options could not be loaded."
      );
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    void loadOptions();
  },[]);

  async function createWayplan(){
    setBusy(true);
    setMessage("");
    setResult(null);

    try{
      const stops=stopsText
        .split(/[\\\\n,]+/)
        .map(value=>value.trim())
        .filter(Boolean)
        .map((delivery_way_id,index)=>({
          stop_no:index+1,
          delivery_way_id,
        }));

      if(!stops.length){
        throw new Error(
          "Add at least one Delivery Way ID."
        );
      }

      if(mode==="RIDER" && !riderId){
        throw new Error(
          "Rider is required for Rider Delivery."
        );
      }

      if(
        mode==="VEHICLE_CREW" &&
        (!driverId || !fleetId)
      ){
        throw new Error(
          "Driver and Fleet are required for Vehicle Crew."
        );
      }

      const payload:any={
        branch_code:branchCode || "YGN",
        zone_code:zoneCode || null,

        assignment_mode:mode,

        rider_id:
          mode==="RIDER"
            ? riderId
            : (riderId || null),

        driver_id:
          mode==="VEHICLE_CREW"
            ? driverId
            : null,

        helper_id:
          mode==="VEHICLE_CREW"
            ? (helperId || null)
            : null,

        fleet_id:
          mode==="VEHICLE_CREW"
            ? fleetId
            : null,

        stops,

        source:"WAYPLAN_CREATE_DEDICATED_V5",
      };

      const {data,error}=await (supabase as any).rpc(
        "be_wayplan_generate",
        {p_payload:payload}
      );

      if(error) throw error;

      if(!data?.ok){
        throw new Error(
          data?.message ||
          "Wayplan generation failed."
        );
      }

      setResult(data);

      setMessage(
        "Wayplan created: " +
        (
          data?.route?.wayplan_id ||
          "success"
        )
      );

    }catch(error:any){
      setMessage(
        error?.message ||
        "Wayplan creation failed."
      );
    }finally{
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-5 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-4">

        <header className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">
            Dedicated Wayplan Template
          </div>

          <h1 className="mt-2 text-2xl font-black">
            Create Wayplan
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Create Wayplan only after Waybill creation and
            Warehouse readiness.
          </p>
        </header>

        {message?
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
            {message}
          </div>
        :null}

        <section className="rounded-2xl border bg-white p-5 shadow-sm">

          {loading?
            <div>Loading assignment options...</div>
          :
            <>
              <div className="grid gap-4 md:grid-cols-2">

                <label>
                  Branch Code
                  <input
                    className={input}
                    value={branchCode}
                    onChange={e=>
                      setBranchCode(
                        e.target.value.toUpperCase()
                      )
                    }
                  />
                </label>

                <label>
                  Zone Code
                  <input
                    className={input}
                    value={zoneCode}
                    onChange={e=>
                      setZoneCode(
                        e.target.value.toUpperCase()
                      )
                    }
                  />
                </label>

                <label>
                  Assignment Mode
                  <select
                    className={input}
                    value={mode}
                    onChange={e=>
                      setMode(e.target.value as any)
                    }
                  >
                    <option value="RIDER">
                      Rider Delivery
                    </option>

                    <option value="VEHICLE_CREW">
                      Vehicle Crew
                    </option>
                  </select>
                </label>

                {mode==="RIDER"?
                  <label>
                    Rider
                    <select
                      className={input}
                      value={riderId}
                      onChange={e=>
                        setRiderId(e.target.value)
                      }
                    >
                      <option value="">
                        Select Rider
                      </option>

                      {riders.map((x:Option)=>
                        <option
                          key={valueOf(x)}
                          value={valueOf(x)}
                        >
                          {labelOf(x)}
                        </option>
                      )}
                    </select>
                  </label>
                :null}

                {mode==="VEHICLE_CREW"?
                  <>
                    <label>
                      Driver
                      <select
                        className={input}
                        value={driverId}
                        onChange={e=>
                          setDriverId(e.target.value)
                        }
                      >
                        <option value="">
                          Select Driver
                        </option>

                        {drivers.map((x:Option)=>
                          <option
                            key={valueOf(x)}
                            value={valueOf(x)}
                          >
                            {labelOf(x)}
                          </option>
                        )}
                      </select>
                    </label>

                    <label>
                      Fleet / Vehicle
                      <select
                        className={input}
                        value={fleetId}
                        onChange={e=>
                          setFleetId(e.target.value)
                        }
                      >
                        <option value="">
                          Select Vehicle
                        </option>

                        {vehicles.map((x:Option)=>
                          <option
                            key={valueOf(x)}
                            value={valueOf(x)}
                            disabled={
                              x.dispatch_eligible===false
                            }
                          >
                            {labelOf(x)}
                          </option>
                        )}
                      </select>
                    </label>

                    <label>
                      Helper (optional)
                      <select
                        className={input}
                        value={helperId}
                        onChange={e=>
                          setHelperId(e.target.value)
                        }
                      >
                        <option value="">
                          No Helper
                        </option>

                        {helpers.map((x:Option)=>
                          <option
                            key={valueOf(x)}
                            value={valueOf(x)}
                          >
                            {labelOf(x)}
                          </option>
                        )}
                      </select>
                    </label>

                    <label>
                      Rider (optional)
                      <select
                        className={input}
                        value={riderId}
                        onChange={e=>
                          setRiderId(e.target.value)
                        }
                      >
                        <option value="">
                          No Rider
                        </option>

                        {riders.map((x:Option)=>
                          <option
                            key={valueOf(x)}
                            value={valueOf(x)}
                          >
                            {labelOf(x)}
                          </option>
                        )}
                      </select>
                    </label>
                  </>
                :null}

              </div>

              <label className="mt-4 block">
                Delivery Way IDs / Stops

                <textarea
                  className={input + " mt-1 min-h-40"}
                  placeholder={
                    "D0815-APA-001\\n" +
                    "D0815-APA-002\\n" +
                    "D0815-APA-003"
                  }
                  value={stopsText}
                  onChange={e=>
                    setStopsText(e.target.value)
                  }
                />
              </label>

              <button
                disabled={busy}
                onClick={()=>void createWayplan()}
                className="mt-4 rounded-lg bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {busy
                  ? "Creating..."
                  : "Create Wayplan"
                }
              </button>
            </>
          }
        </section>

        {result?
          <pre className="overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-emerald-300">
            {JSON.stringify(result,null,2)}
          </pre>
        :null}

      </div>
    </div>
  );
}
`;

  fs.mkdirSync(path.dirname(WAYPLAN), {
    recursive: true,
  });

  fs.writeFileSync(
    WAYPLAN,
    wayplanSource,
    "utf8"
  );

  // -------------------------------------------------
  // 7. Global Next Process guide
  // -------------------------------------------------

  const guideSource = `import {
  useLocation,
  useNavigate,
} from "react-router-dom";

const FLOW = [
  {
    test:(p:string)=>p==="/data-entry",
    text:
      "Complete parcel information, review proof photo, calculate and validate financial values, then Create & Generate Waybill.",
    next:"/waybill-studio",
    label:"Go to Waybill / Print",
  },
  {
    test:(p:string)=>p.includes("waybill"),
    text:
      "After Waybill creation and printing, hand registered parcels to Warehouse for inbound verification and readiness.",
    next:"/warehouse",
    label:"Go to Warehouse",
  },
  {
    test:(p:string)=>p.includes("warehouse"),
    text:
      "After Warehouse readiness, create a Wayplan and assign Rider or Vehicle Crew.",
    next:"/wayplan/create",
    label:"Create Wayplan",
  },
  {
    test:(p:string)=>p.includes("wayplan"),
    text:
      "Review the Wayplan, publish to Dispatch, then monitor field execution and delivery status.",
    next:"/dispatch",
    label:"Go to Dispatch",
  },
  {
    test:(p:string)=>p.includes("dispatch"),
    text:
      "After Dispatch, monitor delivery completion, COD handover and Finance settlement.",
    next:"/finance",
    label:"Go to Finance",
  },
  {
    test:(p:string)=>p.includes("finance"),
    text:
      "Finance reviews Data Entry financial classification, confirms Merchant/Customer settlement, then completes approval and payment.",
    next:"/finance/data-entry-review",
    label:"Finance Review",
  },
  {
    test:(p:string)=>p.includes("pickup"),
    text:
      "After pickup approval and field collection, verify parcel proof and continue to Data Entry.",
    next:"/data-entry",
    label:"Go to Data Entry",
  },
];

export default function GlobalNextProcessGuide(){
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const item =
    FLOW.find(row=>row.test(pathname)) || {
      text:
        "Complete the current screen before handing work to the next responsible department.",
      next:"",
      label:"",
    };

  return (
    <div
      data-global-next-process="true"
      className="mx-4 mb-5 mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900 shadow-sm"
    >
      <div className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">
        Next Process
      </div>

      <div className="mt-2 text-sm leading-6">
        {item.text}
      </div>

      {item.next?
        <button
          onClick={()=>navigate(item.next)}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-black text-white"
        >
          {item.label}
        </button>
      :null}
    </div>
  );
}
`;

  fs.mkdirSync(path.dirname(GUIDE), {
    recursive: true,
  });

  fs.writeFileSync(
    GUIDE,
    guideSource,
    "utf8"
  );

  // -------------------------------------------------
  // 8. App routing
  // -------------------------------------------------

  let app = fs.readFileSync(APP, "utf8");

  if (!app.includes("WayplanCreatePage")) {
    const importAnchor =
      "const DataEntryPage = safeLazy(() => import('@/pages/DataEntryFinancialV2Page'));";

    if (!app.includes(importAnchor)) {
      throw new Error(
        "DataEntryPage lazy import not found."
      );
    }

    app = app.replace(
      importAnchor,
      `${importAnchor}
const WayplanCreatePage = safeLazy(() => import('@/pages/WayplanCreatePage'));`
    );
  }

  if (!app.includes("GlobalNextProcessGuide")) {
    const firstImport =
      app.match(/^import[^\n]+\n/);

    if (!firstImport) {
      throw new Error("App import block not found.");
    }

    const pos = firstImport[0].length;

    app =
      app.slice(0, pos) +
      `import GlobalNextProcessGuide from '@/components/GlobalNextProcessGuide';\n` +
      app.slice(pos);
  }

  if (!app.includes('path="/wayplan/create"')) {
    const routeAnchor =
      '<Route path="/data-entry" element={<DataEntryPage />} />';

    if (!app.includes(routeAnchor)) {
      throw new Error(
        "/data-entry route not found."
      );
    }

    app = app.replace(
      routeAnchor,
      `${routeAnchor}
              <Route path="/wayplan/create" element={<WayplanCreatePage />} />`
    );
  }

  if (!app.includes("<GlobalNextProcessGuide />")) {
    const closeRoutes =
      app.lastIndexOf("</Routes>");

    if (closeRoutes < 0) {
      throw new Error("</Routes> not found.");
    }

    const insertion =
      closeRoutes + "</Routes>".length;

    app =
      app.slice(0, insertion) +
      `
          <GlobalNextProcessGuide />` +
      app.slice(insertion);
  }

  fs.writeFileSync(APP, app, "utf8");

  console.log("");
  console.log("=== SOURCE PATCHED ===");
  console.log("Data Entry form text : BLACK");
  console.log("Waybill action       : ADDED");
  console.log("Wayplan route        : /wayplan/create");
  console.log("Next Process guide   : GLOBAL");
  console.log("Backup               :", BACKUP);

  // -------------------------------------------------
  // 9. Build
  // -------------------------------------------------

  console.log("");
  console.log("=== BUILD ===");

  const build = spawnSync(
    "cmd.exe",
    ["/d", "/s", "/c", "npm run build"],
    {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
    }
  );

  if (build.error) {
    console.error(
      "BUILD LAUNCH ERROR:",
      build.error
    );
  }

  if (build.status !== 0) {
    restore();
    throw new Error(
      "Build failed. Original source restored."
    );
  }

  // -------------------------------------------------
  // 10. Bundle checks
  // -------------------------------------------------

  let bundle = "";

  const assets =
    path.join(ROOT, "dist/assets");

  for (const name of fs.readdirSync(assets)) {
    if (!name.endsWith(".js")) continue;

    bundle += fs.readFileSync(
      path.join(assets, name),
      "utf8"
    );
  }

  const markers = [
    "CREATE & GENERATE WAYBILL",
    "be_data_entry_financial_v2_create_waybill",
    "Dedicated Wayplan Template",
    "be_wayplan_generate",
    "data-global-next-process",
  ];

  console.log("");
  console.log("=== BUNDLE VERIFICATION ===");

  let failed = false;

  for (const marker of markers) {
    if (bundle.includes(marker)) {
      console.log("PASS:", marker);
    } else {
      console.log("FAIL:", marker);
      failed = true;
    }
  }

  if (failed) {
    restore();
    throw new Error(
      "Bundle verification failed. Source restored."
    );
  }

  console.log("");
  console.log("==========================================");
  console.log("WORKFLOW UI V5: PASS");
  console.log("==========================================");
  console.log("Data Entry form font   : BLACK");
  console.log("Waybill button         : INSTALLED");
  console.log("Wayplan template route : /wayplan/create");
  console.log("Next Process guide     : ALL ROUTED SCREENS");
  console.log("==========================================");

} catch (error) {
  restore();
  fail(error?.message || String(error));
}
