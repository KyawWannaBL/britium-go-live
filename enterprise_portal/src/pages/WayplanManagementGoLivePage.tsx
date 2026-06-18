// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Map,
  MapPinned,
  Move,
  RefreshCw,
  Route,
  Search,
  Send,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── AUTO-ZONING & VAN ALLOCATION ENGINE ───
function assignFleetZone(township: string, city: string) {
  const t = String(township || "").toLowerCase();
  const c = String(city || "").toLowerCase();

  // 1. Out of Scope Townships
  if (/thanlyin|kyauktan|khayan|thonegwa|mhawbi|သန်လျင်|ကျောက်တန်း|ခရမ်း|သုံးခွ|မှော်ဘီ/.test(t)) {
    return { id: "OUT_OF_SCOPE", label: "Out of Scope (Excluded)", type: "hold" };
  }

  // 2. Mandalay & Naypyitaw Branches
  if (c.includes("mandalay") || t.includes("mandalay") || c.includes("မန္တလေး") || t.includes("မန္တလေး")) {
    return { id: "MDY_VANS", label: "Mandalay Branch Vans", type: "van" };
  }
  if (c.includes("naypyitaw") || t.includes("naypyitaw") || c.includes("နေပြည်တော်") || t.includes("နေပြည်တော်")) {
    return { id: "NPT_VANS", label: "Naypyitaw Branch Vans", type: "van" };
  }

  // 3. Bicycle Riders (Specific Yangon Townships)
  if (/north dagon|east dagon|south dagon|south okkalapa|thingangyun|yankin|မြောက်ဒဂုံ|အရှေ့ဒဂုံ|တောင်ဒဂုံ|တောင်ဥက္ကလာပ|သင်္ဃန်းကျွန်း|ရန်ကင်း/.test(t)) {
    return { id: "YGN_BICYCLE", label: "Yangon Bicycle Riders", type: "bicycle" };
  }

  // 4. Dedicated Highway/Dropoff Vans
  if (/hlaing tharyar|hlaingtharya|လှိုင်သာယာ|dagon ayar|ဒဂုံဧရာ/.test(t)) {
    return { id: "YGN_VAN_5", label: "Van 5 (Hlaing Tharyar / Delta Dropoff)", type: "van" };
  }
  if (/north okkalapa|မြောက်ဥက္ကလာပ|aung mingalar|အောင်မင်္ဂလာ/.test(t)) {
    return { id: "YGN_VAN_6", label: "Van 6 (N.Okkalapa / Aung Mingalar)", type: "van" };
  }

  // 5. General Yangon Delivery Vans (1 to 4)
  if (/insein|mingaladon|shwepyitha|အင်းစိန်|မင်္ဂလာဒုံ|ရွှေပြည်သာ/.test(t)) {
    return { id: "YGN_VAN_1", label: "Van 1 (North/Industrial)", type: "van" };
  }
  if (/kamayut|hlaing|mayangone|sanchaung|ကမာရွတ်|လှိုင်|မရမ်းကုန်း|စမ်းချောင်း/.test(t)) {
    return { id: "YGN_VAN_2", label: "Van 2 (West/Central)", type: "van" };
  }
  if (/pabedan|kyauktada|lanmadaw|latha|pazundaung|botahtaung|dagon|ahlone|kyimyindaing|ပန်းဘဲတန်း|ကျောက်တံတား|လမ်းမတော်|လသာ|ပုဇွန်တောင်|ဗိုလ်တထောင်|ဒဂုံ|အလုံ|ကြည့်မြင်တိုင်/.test(t)) {
    return { id: "YGN_VAN_3", label: "Van 3 (Downtown/South)", type: "van" };
  }
  if (/tamwe|mingala taungnyunt|dawbon|thaketa|dagon seikkan|တာမွေ|မင်္ဂလာတောင်ညွန့်|ဒေါပုံ|သာကေတ|ဒဂုံဆိပ်ကမ်း/.test(t)) {
    return { id: "YGN_VAN_4", label: "Van 4 (East/River)", type: "van" };
  }

  return { id: "YGN_VAN_UNASSIGNED", label: "Unassigned Yangon Routes", type: "van" };
}

// Depot Coordinates for Mapbox
const DEPOTS = [
  { name: "Yangon HQ", lng: 96.19709997560312, lat: 16.889558816954718 },
  { name: "Naypyitaw Branch", lng: 96.15294627556949, lat: 19.739482258186456 },
  { name: "Mandalay Branch", lng: 96.0950, lat: 21.9700 }, // Approx 65th St
];

const C = {
  page: "#061524",
  panel: "#0b2236",
  panel2: "#102b45",
  panel3: "#071827",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#4d7a9b",
  gold: "#f6b84b",
  cyan: "#38bdf8",
  green: "#22c55e"
};

export default function WayplanManagementGoLivePage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [pickups, setPickups] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  
  // Workforce
  const [riders, setRiders] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [assignDraft, setAssignDraft] = useState<Record<string, any>>({});

  const mapboxToken = String((import.meta as any).env?.VITE_MAPBOX_ACCESS_TOKEN || "");
  const mapRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      // 1. Fetch Items ready for Wayplanning
      const { data: items } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .in('item_status', ['READY_FOR_WAYPLAN', 'WAREHOUSE_RECEIVED'])
        .order('created_at', { ascending: false });
      
      if (items) setPickups(items);

      // 2. Fetch Workforce & Vehicles
      const [{ data: wData }, { data: vData }] = await Promise.all([
        supabase.from('be_mobile_workforce_accounts').select('*'),
        supabase.from('fleet_master').select('*').limit(100) // Assuming a fleet table exists
      ]);

      if (wData) setRiders(wData);
      if (vData) setVehicles(vData);

    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Mapbox Initialization
  useEffect(() => {
    if (!mapboxToken || !mapRef.current) return;
    
    const loadMapbox = async () => {
      const mapboxgl = await import("mapbox-gl");
      mapboxgl.default.accessToken = mapboxToken;
      
      const map = new mapboxgl.default.Map({
        container: mapRef.current!,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [96.1971, 16.8895], // Default Yangon HQ
        zoom: 5,
        pitch: 45,
      });

      // Add Depot Markers
      DEPOTS.forEach(depot => {
        const el = document.createElement("div");
        el.className = "w-4 h-4 bg-[#f6b84b] rounded-full border-2 border-white shadow-[0_0_15px_rgba(246,184,75,0.8)]";
        new mapboxgl.default.Marker({ element: el })
          .setLngLat([depot.lng, depot.lat])
          .setPopup(new mapboxgl.default.Popup({ offset: 15 }).setHTML(`<strong style="color:black">${depot.name}</strong>`))
          .addTo(map);
      });
    };
    
    loadMapbox().catch(console.error);
  }, [mapboxToken]);

  const generateWayplan = () => {
    if (pickups.length === 0) {
      setMessage(t('No pickups available to route.', 'လမ်းကြောင်းရေးဆွဲရန် ကုန်ပစ္စည်းမရှိပါ။'));
      return;
    }

    setLoading(true);
    
    // Group Pickups by Auto-Zoning Engine
    const groupedRoutes: Record<string, any> = {};
    
    pickups.forEach(item => {
      const zoneDef = assignFleetZone(item.delivery_township, item.pickup_city);
      if (!groupedRoutes[zoneDef.id]) {
        groupedRoutes[zoneDef.id] = {
          id: `RT-${Date.now()}-${zoneDef.id}`,
          route_code: zoneDef.id,
          route_name: zoneDef.label,
          type: zoneDef.type,
          stops: []
        };
      }
      groupedRoutes[zoneDef.id].stops.push(item);
    });

    setRoutes(Object.values(groupedRoutes));
    setMessage(t(`Successfully allocated items into ${Object.keys(groupedRoutes).length} route zones.`, `ကုန်ပစ္စည်းများကို လမ်းကြောင်းဇုန် (${Object.keys(groupedRoutes).length}) ခုသို့ အောင်မြင်စွာ ခွဲဝေပြီးပါပြီ။`));
    setLoading(false);
  };

  const dispatchRoute = async (route: any) => {
    const draft = assignDraft[route.id] || {};
    if (!draft.rider && route.type !== 'hold') {
      setMessage(t('Please assign a Rider/Driver first.', 'ကျေးဇူးပြု၍ ပို့ဆောင်မည့်သူကို ရွေးချယ်ပါ။'));
      return;
    }

    setLoading(true);
    try {
      const waybillNos = route.stops.map((s: any) => s.waybill_no);
      const { error } = await supabase
        .from('be_portal_pickup_request_items')
        .update({ 
          item_status: 'OUT_FOR_DELIVERY',
          remarks: `Dispatched via ${route.route_name}`
        })
        .in('waybill_no', waybillNos);
      
      if (error) throw error;
      
      setMessage(t(`Route ${route.route_code} dispatched successfully!`, `လမ်းကြောင်း ${route.route_code} ကို အောင်မြင်စွာ စေလွှတ်ပြီးပါပြီ။`));
      
      // Remove dispatched route from view
      setRoutes(prev => prev.filter(r => r.id !== route.id));
      loadData(); // Refresh remaining items
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Inter','Pyidaungsu'] notranslate" translate="no">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        {/* HEADER */}
        <section className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#38bdf8] mb-3">
              <MapPinned className="h-3.5 w-3.5" />
              <span>{t('Logistics Routing Engine', 'လမ်းကြောင်းစီမံခန့်ခွဲရေး စနစ်')}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white m-0"><span>{t('Wayplan Generator & Dispatch', 'ခရီးစဉ်စီမံချက် ဖန်တီးခြင်းနှင့် စေလွှတ်ခြင်း')}</span></h1>
            <p className="mt-2 max-w-3xl text-[14px] font-semibold text-[#4d7a9b] leading-relaxed">
              <span>{t('Automatically allocates parcels to Bicycle Zones, Dedicated Vans (1-6), Mandalay, Naypyitaw, and filters Out-of-Scope items based on delivery townships.', 'ပါဆယ်များကို စက်ဘီးဇုန်များ၊ သတ်မှတ်ထားသော ကားများ (၁-၆)၊ မန္တလေး၊ နေပြည်တော် နှင့် ပို့ဆောင်ရန်မလိုသော ဧရိယာများသို့ အလိုအလျောက် ခွဲဝေပေးပါသည်။')}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={loadData} disabled={loading} className="flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] px-5 text-[13px] font-black uppercase tracking-wider text-[#c8dff0] transition-colors cursor-pointer">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> <span>{t('Refresh Data', 'အချက်အလက် ပြန်လည်ရယူမည်')}</span>
            </button>
            <button onClick={generateWayplan} disabled={loading || pickups.length === 0} className="flex h-12 items-center gap-2 rounded-xl bg-[#f6b84b] hover:bg-[#e5a93a] px-6 text-[13px] font-black uppercase tracking-wider text-[#061524] transition-colors shadow-lg shadow-[#f6b84b]/10 cursor-pointer">
              <Route className="h-4 w-4" /> <span>{t('Run Auto-Zoning Engine', 'စနစ်ဖြင့် လမ်းကြောင်းခွဲဝေမည်')}</span>
            </button>
          </div>
        </section>

        {message && (
          <div className="flex items-center gap-2 rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-5 py-4 text-[13px] font-bold text-[#22c55e]">
            <CheckCircle2 className="shrink-0" size={18} /> <span>{message}</span>
          </div>
        )}

        {/* MAPBOX VISUALIZATION */}
        <section className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-xl font-black text-white m-0"><span>{t('Regional Depot Map', 'ဒေသတွင်း ကုန်လှောင်ရုံ မြေပုံ')}</span></h2>
             <span className="text-[11px] text-[#4d7a9b] font-bold bg-[#061524] px-3 py-1 rounded-md border border-[#1a3a5c]">GPS Tracking Ready</span>
          </div>
          <div className="relative h-[300px] w-full rounded-2xl overflow-hidden border border-[#1a3a5c] bg-[#061524]">
             {mapboxToken ? (
               <div ref={mapRef} className="absolute inset-0" />
             ) : (
               <div className="flex flex-col items-center justify-center h-full text-[#4d7a9b] gap-2 font-medium">
                 <AlertTriangle size={24} className="opacity-50" />
                 <span>Mapbox Token Required for 3D View</span>
               </div>
             )}
          </div>
        </section>

        {/* GENERATED ROUTES */}
        <section className="space-y-6">
          <h2 className="text-2xl font-black text-white m-0 flex items-center gap-3">
             <span>{t('Allocated Route Zones', 'ခွဲဝေထားသော လမ်းကြောင်းဇုန်များ')}</span>
             <span className="text-[13px] bg-[#f6b84b] text-[#061524] px-3 py-1 rounded-full font-black">{routes.length}</span>
          </h2>

          {routes.length === 0 && (
             <div className="rounded-[2rem] border border-dashed border-[#1a3a5c] bg-[#081b2e]/50 p-12 text-center flex flex-col items-center justify-center gap-4">
               <Truck className="h-12 w-12 text-[#4d7a9b] opacity-40" />
               <p className="text-[14px] font-bold text-[#4d7a9b]">
                 <span>{t('Click "Run Auto-Zoning Engine" to intelligently group pending items into delivery routes.', 'စနစ်ဖြင့် လမ်းကြောင်းခွဲဝေရန် ခလုတ်ကို နှိပ်ပါ။')}</span>
               </p>
             </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            {routes.map((route) => {
              const draft = assignDraft[route.id] || {};
              const isOut = route.route_code === "OUT_OF_SCOPE";
              const isBike = route.type === "bicycle";

              return (
                <article key={route.id} className={`rounded-[2rem] border overflow-hidden shadow-xl ${isOut ? 'bg-[#ff4f86]/5 border-[#ff4f86]/30' : 'bg-[#0b2236] border-[#1a3a5c]'}`}>
                  <header className={`p-6 border-b ${isOut ? 'border-[#ff4f86]/20 bg-[#ff4f86]/10' : 'border-[#1a3a5c] bg-[#081b2e]'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="font-mono text-[11px] font-black uppercase tracking-widest text-[#38bdf8] mb-1">{route.route_code}</div>
                        <h3 className="text-xl font-black text-white m-0"><span>{route.route_name}</span></h3>
                        <p className="text-[13px] font-semibold text-[#4d7a9b] mt-1 m-0">
                          {route.stops.length} <span>{t('stops', 'ခု')}</span> · {route.stops.reduce((s:number, i:any)=> s + Number(i.cod_amount||0), 0).toLocaleString()} Ks COD
                        </p>
                      </div>
                      <div className="p-3 bg-[#061524] rounded-xl border border-[#1a3a5c]">
                        {isBike ? <Bike className="text-[#38bdf8]" size={24} /> : isOut ? <AlertTriangle className="text-[#ff4f86]" size={24} /> : <Truck className="text-[#f6b84b]" size={24} />}
                      </div>
                    </div>

                    {!isOut && (
                      <div className="grid gap-3 grid-cols-2 mt-4">
                        <select 
                          value={draft.rider || ""} 
                          onChange={e => setAssignDraft(p => ({...p, [route.id]: {...p[route.id], rider: e.target.value}}))}
                          className="h-11 rounded-xl bg-[#061524] border border-[#1a3a5c] px-3 text-[12px] font-bold text-white outline-none focus:border-[#f6b84b] cursor-pointer"
                        >
                          <option value="">{t('Assign Rider/Driver...', 'ပို့ဆောင်သူ ရွေးချယ်ပါ...')}</option>
                          {riders.map(r => <option key={r.auth_user_id} value={r.workforce_code}>{r.workforce_code} - {r.role}</option>)}
                        </select>

                        <button 
                          onClick={() => dispatchRoute(route)}
                          disabled={loading || !draft.rider}
                          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#22c55e] hover:bg-[#1ea34d] text-[12px] font-black uppercase tracking-wider text-[#061524] transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Send size={16} /> <span>{t('Dispatch Route', 'လမ်းကြောင်း စေလွှတ်မည်')}</span>
                        </button>
                      </div>
                    )}
                  </header>

                  <div className="max-h-[300px] overflow-auto bg-[#061524]">
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead className="bg-[#081b2e] sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-[#4d7a9b] font-bold border-b border-[#1a3a5c]"><span>{t('Waybill', 'လမ်းညွှန်စာရွက်')}</span></th>
                          <th className="px-4 py-3 text-[#4d7a9b] font-bold border-b border-[#1a3a5c]"><span>{t('Township', 'မြို့နယ်')}</span></th>
                          <th className="px-4 py-3 text-[#4d7a9b] font-bold border-b border-[#1a3a5c] text-right"><span>{t('COD', 'ကောက်ခံငွေ')}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {route.stops.map((stop: any) => (
                          <tr key={stop.waybill_no} className="border-b border-[#1a3a5c]/50 hover:bg-[#1a3a5c]/20">
                            <td className="px-4 py-3 font-mono font-bold text-[#f6b84b]"><span>{stop.waybill_no}</span></td>
                            <td className="px-4 py-3 text-[#c8dff0] font-medium"><span>{stop.delivery_township}</span></td>
                            <td className="px-4 py-3 text-[#22c55e] font-bold text-right"><span>{Number(stop.cod_amount).toLocaleString()}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}