import { useEffect, useMemo, useState } from "react";
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
        .split(/[\\n,]+/)
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
                    "D0815-APA-001\n" +
                    "D0815-APA-002\n" +
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
