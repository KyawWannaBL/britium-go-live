// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Download, Loader2, PackageCheck, QrCode, RefreshCw, ScanLine, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CameraCapture from "@/components/CameraCapture";
import { uploadProofDataUrl } from "@/lib/proofMediaApi";

type Lang = "EN" | "MM";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#081b2e",
  border: "#1a3a5c",
  gold: "#f6b84b",
  orange: "#ff8a4c",
  text: "#eef8ff",
  text2: "#c8dff0",
  muted: "#4d7a9b",
  success: "#22c55e",
  error: "#ff4f86",
  warning: "#f59e0b",
  info: "#38bdf8",
};

const T = {
  EN: {
    eyebrow: "Warehouse Operations",
    title: "QR Receive / Verify / Sort / Bag / Ready for Wayplan",
    desc: "Scan parcel QR, Pickup ID, Waybill, or Delivery ID. Every warehouse action writes backend scan records and cargo events.",
    backendOnly: "Backend-only runtime. No mock warehouse records are shown.",
    lang: "မြန်မာ",
    refresh: "Refresh",
    export: "Export CSV",
    scanTitle: "QR / Barcode Scan",
    scanDesc: "Use device camera scanner or manual scan input.",
    openScanner: "Open QR Scanner",
    closeScanner: "Close Scanner",
    manualScan: "Pickup ID / Parcel QR / Waybill / Delivery ID",
    location: "Warehouse Location",
    action: "Warehouse Action",
    bagNo: "Bag No.",
    shelfNo: "Shelf / Rack",
    exceptionCode: "Exception Code",
    exceptionNote: "Exception Note",
    receive: "Receive",
    sort: "Sort",
    bag: "Bag",
    ready: "Ready for Wayplan",
    exception: "Warehouse Exception",
    proof: "Warehouse Proof Photo",
    submit: "Submit Warehouse Verification",
    queue: "Warehouse Work Queue",
    queueDesc: "Records are loaded from real pickup requests and warehouse scan records.",
    proofCount: "Proofs",
    scans: "Scans",
    scanRequired: "Enter or scan a valid Pickup ID, QR, Waybill, or Delivery ID.",
    success: "Warehouse scan saved.",
    failed: "Warehouse scan failed.",
    picked: "Picked Up",
    received: "Received",
    sorted: "Sorted",
    bagged: "Bagged",
    readyWayplan: "Ready Wayplan",
    search: "Search",
    all: "All",
    pickupId: "Pickup ID",
    merchant: "Merchant",
    status: "Status",
    warehouse: "Warehouse",
    updated: "Updated",
    quick: "Quick Action",
    noRecords: "No backend records found.",
    scannerUnsupported: "BarcodeDetector is not supported in this browser. Use manual scan input.",
  },
  MM: {
    eyebrow: "ကုန်လှောင်ရုံ လုပ်ငန်းစဉ်",
    title: "QR လက်ခံ / စစ်ဆေး / ခွဲခြား / အိတ်သွင်း / လမ်းကြောင်းဆွဲရန် အသင့်",
    desc: "Parcel QR၊ Pickup ID၊ Waybill သို့မဟုတ် Delivery ID ကို စကင်န်ဖတ်ပါ။ Warehouse လုပ်ဆောင်ချက်တိုင်းသည် backend scan record နှင့် cargo event ကို သိမ်းဆည်းပါသည်။",
    backendOnly: "Backend မှတ်တမ်းများသာ အသုံးပြုပါသည်။ Mock warehouse record မပြပါ။",
    lang: "EN",
    refresh: "ပြန်လည်တင်ရန်",
    export: "CSV ထုတ်ရန်",
    scanTitle: "QR / Barcode စကင်န်",
    scanDesc: "ကင်မရာစကင်န် သို့မဟုတ် လက်ဖြင့် ရိုက်ထည့်နိုင်ပါသည်။",
    openScanner: "QR Scanner ဖွင့်ရန်",
    closeScanner: "Scanner ပိတ်ရန်",
    manualScan: "Pickup ID / Parcel QR / Waybill / Delivery ID",
    location: "ကုန်လှောင်ရုံ တည်နေရာ",
    action: "Warehouse လုပ်ဆောင်ချက်",
    bagNo: "Bag No.",
    shelfNo: "Shelf / Rack",
    exceptionCode: "ချွင်းချက် Code",
    exceptionNote: "ချွင်းချက်မှတ်ချက်",
    receive: "လက်ခံရန်",
    sort: "အမျိုးအစားခွဲရန်",
    bag: "အိတ်သွင်းရန်",
    ready: "လမ်းကြောင်းဆွဲရန် အသင့်",
    exception: "Warehouse ချွင်းချက်",
    proof: "Warehouse ဓာတ်ပုံအထောက်အထား",
    submit: "Warehouse စစ်ဆေးမှု သိမ်းဆည်းမည်",
    queue: "Warehouse လုပ်ငန်းစဉ် စာရင်း",
    queueDesc: "Pickup request နှင့် warehouse scan backend မှတ်တမ်းများမှ ဖတ်ယူထားပါသည်။",
    proofCount: "အထောက်အထား",
    scans: "စကင်န်",
    scanRequired: "Pickup ID၊ QR၊ Waybill သို့မဟုတ် Delivery ID ကို စကင်န်ဖတ်ပါ သို့မဟုတ် ရိုက်ထည့်ပါ။",
    success: "Warehouse scan သိမ်းဆည်းပြီးပါပြီ။",
    failed: "Warehouse scan မအောင်မြင်ပါ။",
    picked: "လာယူပြီး",
    received: "လက်ခံပြီး",
    sorted: "ခွဲခြားပြီး",
    bagged: "အိတ်သွင်းပြီး",
    readyWayplan: "လမ်းကြောင်းဆွဲရန် အသင့်",
    search: "ရှာဖွေရန်",
    all: "အားလုံး",
    pickupId: "Pickup ID",
    merchant: "ကုန်သည်",
    status: "အခြေအနေ",
    warehouse: "ကုန်လှောင်ရုံ",
    updated: "နောက်ဆုံးပြင်ဆင်ချိန်",
    quick: "အမြန်လုပ်ဆောင်ရန်",
    noRecords: "Backend မှတ်တမ်းမတွေ့ပါ။",
    scannerUnsupported: "ဤ Browser တွင် BarcodeDetector မရှိပါ။ လက်ဖြင့်ရိုက်ထည့်ပါ။",
  },
};

const EVENTS = [
  { key: "WAREHOUSE_RECEIVED", status: "RECEIVED_WAREHOUSE", label: "receive" },
  { key: "WAREHOUSE_SORTED", status: "SORTED", label: "sort" },
  { key: "WAREHOUSE_BAGGED", status: "BAGGED", label: "bag" },
  { key: "READY_FOR_WAYPLAN", status: "READY_FOR_WAYPLAN", label: "ready" },
  { key: "WAREHOUSE_EXCEPTION", status: "EXCEPTION", label: "exception" },
];

function text(v:any, fallback = "—") {
  return v === null || v === undefined || v === "" ? fallback : String(v);
}

function formatDate(v:any) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? text(v) : d.toLocaleString("en-GB", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function root():React.CSSProperties {
  return { minHeight:"100%", background:C.bg, color:C.text, padding:24, fontFamily:"Poppins, Inter, system-ui, sans-serif" };
}

function panel(extra:React.CSSProperties = {}):React.CSSProperties {
  return { background:`linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border:`1px solid ${C.border}`, borderRadius:20, boxShadow:"0 18px 40px rgba(0,0,0,.20)", ...extra };
}

function input(extra:React.CSSProperties = {}):React.CSSProperties {
  return { width:"100%", height:44, borderRadius:12, border:`1px solid ${C.border}`, background:C.panel2, color:C.text, padding:"0 12px", outline:"none", fontFamily:"Poppins, Inter, system-ui", fontWeight:800, ...extra };
}

function textarea(extra:React.CSSProperties = {}):React.CSSProperties {
  return { width:"100%", minHeight:84, borderRadius:12, border:`1px solid ${C.border}`, background:C.panel2, color:C.text, padding:12, outline:"none", fontFamily:"Poppins, Inter, system-ui", resize:"vertical", ...extra };
}

function button(tone = C.gold, extra:React.CSSProperties = {}):React.CSSProperties {
  return { height:44, borderRadius:12, border:`1px solid ${tone}99`, background:tone === C.gold ? "rgba(246,184,75,.16)" : tone, color:tone === C.error ? C.text : tone === C.gold ? C.gold : "#061524", padding:"0 14px", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, cursor:"pointer", fontWeight:900, fontFamily:"Poppins, Inter, system-ui", ...extra };
}

function th():React.CSSProperties {
  return { padding:"10px 12px", color:C.muted, fontSize:11, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.08em", textAlign:"left", borderBottom:`1px solid ${C.border}` };
}

function td():React.CSSProperties {
  return { padding:"12px", color:C.text2, fontSize:13, borderBottom:`1px solid ${C.border}66`, verticalAlign:"top" };
}

function badge(status:any):React.CSSProperties {
  const s = text(status, "").toUpperCase();
  const map:any = {
    PICKED_UP: [C.info, "#082f49"],
    RECEIVED_WAREHOUSE: [C.info, "#082f49"],
    SORTED: [C.gold, "#3b2503"],
    BAGGED: [C.orange, "#431407"],
    READY_FOR_WAYPLAN: [C.success, "#052e16"],
    EXCEPTION: [C.error, "#4a0521"],
  };
  const v = map[s] || [C.text2, C.panel2];
  return { display:"inline-flex", alignItems:"center", padding:"4px 10px", borderRadius:999, fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.06em", background:v[1], color:v[0], border:`1px solid ${C.border}`, whiteSpace:"nowrap" };
}

function Kpi({ label, value, note, accent = C.gold }:any) {
  return (
    <div style={panel({ padding:16, borderTop:`2px solid ${accent}` })}>
      <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", fontWeight:900 }}>{label}</div>
      <div style={{ marginTop:8, fontSize:28, color:accent, fontWeight:950 }}>{value}</div>
      {note ? <div style={{ marginTop:4, fontSize:12, color:C.text2 }}>{note}</div> : null}
    </div>
  );
}

function SectionTitle({ title, subtitle, right }:any) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", gap:16, alignItems:"start", marginBottom:16, flexWrap:"wrap" }}>
      <div>
        <h2 style={{ margin:0, color:C.text, fontSize:19, fontWeight:950 }}>{title}</h2>
        {subtitle ? <p style={{ margin:"6px 0 0", color:C.text2, fontSize:13, lineHeight:1.5 }}>{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

function downloadCsv(rows:any[]) {
  const headers = ["pickup_id", "merchant_code", "merchant_name", "status", "warehouse_status", "warehouse_location", "updated_at"];
  const body = rows.map((row) => headers.map((key) => JSON.stringify(String(row[key] ?? ""))).join(",")).join("\n");
  const blob = new Blob([headers.join(",") + "\n" + body], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `warehouse-backend-queue-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WarehouseOperations() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("be_lang") as Lang) || "EN");
  const t = T[lang];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanStreamRef = useRef<any>(null);
  const scanTimerRef = useRef<any>(null);

  const [rows, setRows] = useState<any[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [scanCode, setScanCode] = useState("");
  const [warehouseLocation, setWarehouseLocation] = useState("YGN-WH-INBOUND");
  const [eventType, setEventType] = useState("WAREHOUSE_RECEIVED");
  const [bagNo, setBagNo] = useState("");
  const [shelfNo, setShelfNo] = useState("");
  const [exceptionCode, setExceptionCode] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [proofPhoto, setProofPhoto] = useState("");
  const [proofPhotoPath, setProofPhotoPath] = useState("");
  const [operatorCode, setOperatorCode] = useState(() => localStorage.getItem("be_operator_code") || "WH001");

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  function toggleLang() {
    const next = lang === "EN" ? "MM" : "EN";
    setLang(next);
    localStorage.setItem("be_lang", next);
  }

  async function load() {
    setLoading(true);
    setMessage(null);

    try {
      const req = await supabase
        .from("be_portal_pickup_requests")
        .select("*")
        .in("status", ["PICKED_UP", "RECEIVED_WAREHOUSE", "SORTED", "BAGGED", "READY_FOR_WAYPLAN", "EXCEPTION"])
        .order("updated_at", { ascending:false })
        .limit(300);

      if (req.error) throw req.error;
      setRows(req.data || []);

      const sc = await supabase
        .from("be_warehouse_parcel_scans")
        .select("*")
        .order("created_at", { ascending:false })
        .limit(500);

      setScans(sc.data || []);
    } catch (e:any) {
      setRows([]);
      setScans([]);
      setMessage({ type:"error", text:e?.message || t.failed });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const ch1 = supabase.channel("be-warehouse-pickups")
      .on("postgres_changes", { event:"*", schema:"public", table:"be_portal_pickup_requests" }, () => void load())
      .subscribe();

    const ch2 = supabase.channel("be-warehouse-scans")
      .on("postgres_changes", { event:"*", schema:"public", table:"be_warehouse_parcel_scans" }, () => void load())
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      stopScanner();
    };
  }, []);

  async function uploadWarehouseProof(dataUrl:string) {
    if (!dataUrl) {
      setProofPhoto("");
      setProofPhotoPath("");
      return;
    }

    setProofPhoto(dataUrl);

    const uploaded = await uploadProofDataUrl({
      dataUrl,
      proofScope: "WAREHOUSE",
      proofType: "PHOTO",
      pickupId: scanCode,
      parcelReference: scanCode,
      operatorCode,
      metadata: {
        page: "WarehouseOperations",
        warehouse_action: eventType,
        warehouse_location: warehouseLocation,
        warehouse_status: EVENTS.find((e) => e.key === eventType)?.status,
      },
    });

    setProofPhoto(uploaded.signedUrl || dataUrl);
    setProofPhotoPath(uploaded.path);
  }

  async function runScan(code = scanCode, action = eventType) {
    const clean = String(code || "").trim();

    if (!clean) {
      setMessage({ type:"error", text:t.scanRequired });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc("be_warehouse_scan_event", {
        p_payload: {
          scan_code: clean,
          warehouse_action: action,
          warehouse_location: warehouseLocation,
          bag_no: bagNo || null,
          shelf_no: shelfNo || null,
          exception_code: action === "WAREHOUSE_EXCEPTION" ? exceptionCode || "WAREHOUSE_EXCEPTION" : null,
          exception_note: exceptionNote || null,
          proof_photo_path: proofPhotoPath || null,
          operator_code: operatorCode || null,
          operator_role: "warehouse",
          source_app: "ENTERPRISE_PORTAL",
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(t.failed);

      setMessage({ type:"success", text:`${t.success} ${data.pickup_id || clean}` });
      setScanCode("");
      setProofPhoto("");
      setProofPhotoPath("");
      await load();
    } catch (e:any) {
      setMessage({ type:"error", text:e?.message || t.failed });
    } finally {
      setLoading(false);
    }
  }

  async function openScanner() {
    setMessage(null);

    if (!("BarcodeDetector" in window)) {
      setMessage({ type:"error", text:t.scannerUnsupported });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal:"environment" } },
        audio: false,
      });

      scanStreamRef.current = stream;
      setScannerOpen(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          scanLoop();
        }
      }, 80);
    } catch (e:any) {
      setMessage({ type:"error", text:e?.message || "Camera permission denied." });
    }
  }

  function stopScanner() {
    try { scanStreamRef.current?.getTracks?.().forEach((t:any) => t.stop()); } catch {}
    scanStreamRef.current = null;
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    scanTimerRef.current = null;
    setScannerOpen(false);
  }

  async function scanLoop() {
    if (!videoRef.current || !scannerOpen) return;

    try {
      const Detector = window.BarcodeDetector;
      const detector = new Detector({ formats:["qr_code", "code_128", "code_39", "ean_13"] });
      const results = await detector.detect(videoRef.current);

      if (results?.length) {
        const value = results[0].rawValue || "";
        setScanCode(value);
        stopScanner();
        return;
      }
    } catch {}

    scanTimerRef.current = setTimeout(scanLoop, 450);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      const statusValue = text(r.warehouse_status || r.status, "").toUpperCase();
      const statusOk = statusFilter === "ALL" || statusValue === statusFilter;
      const searchOk = !q || [r.pickup_id, r.canonical_pickup_id, r.merchant_code, r.merchant_name, r.pickup_township, r.status, r.warehouse_status].some((v) => text(v, "").toLowerCase().includes(q));
      return statusOk && searchOk;
    });
  }, [rows, search, statusFilter]);

  const kpis = useMemo(() => ({
    picked: rows.filter((r) => text(r.status, "").toUpperCase() === "PICKED_UP").length,
    received: rows.filter((r) => text(r.warehouse_status || r.status, "").toUpperCase() === "RECEIVED_WAREHOUSE").length,
    sorted: rows.filter((r) => text(r.warehouse_status || r.status, "").toUpperCase() === "SORTED").length,
    bagged: rows.filter((r) => text(r.warehouse_status || r.status, "").toUpperCase() === "BAGGED").length,
    ready: rows.filter((r) => text(r.warehouse_status || r.status, "").toUpperCase() === "READY_FOR_WAYPLAN").length,
  }), [rows]);

  return (
    <div style={root()}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rise { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform:none; } }
        .be-card { animation: rise .28s ease both; }
        input:focus, select:focus, textarea:focus { border-color:#f6b84b!important; box-shadow:0 0 0 3px rgba(246,184,75,.12)!important; }
        tr:hover td { background:#0f2a42!important; }
      `}</style>

      <div style={{ maxWidth:1600, margin:"0 auto", display:"grid", gap:18 }}>
        <section className="be-card" style={panel({ padding:22 })}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:18, alignItems:"start", flexWrap:"wrap" }}>
            <div>
              <div style={{ color:C.gold, textTransform:"uppercase", letterSpacing:"0.16em", fontWeight:900, fontSize:12 }}>{t.eyebrow}</div>
              <h1 style={{ margin:"8px 0", fontSize:30 }}>{t.title}</h1>
              <p style={{ margin:0, color:C.text2, lineHeight:1.6 }}>{t.desc}</p>
              <p style={{ margin:"8px 0 0", color:C.orange, fontWeight:850 }}>{t.backendOnly}</p>
            </div>

            <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
              <button type="button" style={button(C.info)} onClick={toggleLang}>{t.lang}</button>
              <button type="button" style={button(C.gold)} onClick={() => downloadCsv(filtered)}><Download size={16}/>{t.export}</button>
              <button type="button" style={button(C.info)} onClick={() => void load()} disabled={loading}>{loading ? <Loader2 size={16} style={{ animation:"spin 1s linear infinite" }}/> : <RefreshCw size={16}/>} {t.refresh}</button>
            </div>
          </div>
        </section>

        {message ? (
          <section style={panel({ padding:14, borderColor:message.type === "error" ? C.error : C.success })}>
            <div style={{ color:message.type === "error" ? C.error : C.success, display:"flex", gap:10, fontWeight:900 }}>
              {message.type === "error" ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>} {message.text}
            </div>
          </section>
        ) : null}

        <section style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:14 }}>
          <Kpi label={t.picked} value={kpis.picked} note="Inbound" accent={C.info}/>
          <Kpi label={t.received} value={kpis.received} note="Accepted" accent={C.success}/>
          <Kpi label={t.sorted} value={kpis.sorted} note="Sorting complete" accent={C.gold}/>
          <Kpi label={t.bagged} value={kpis.bagged} note="Bag closed" accent={C.orange}/>
          <Kpi label={t.readyWayplan} value={kpis.ready} note="Dispatch staging" accent={C.success}/>
          <Kpi label={t.scans} value={scans.length} note="Today/latest backend" accent={C.info}/>
        </section>

        <section className="be-card" style={panel({ padding:18 })}>
          <SectionTitle title={t.scanTitle} subtitle={t.scanDesc} />

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12 }}>
            <div style={{ display:"grid", gap:10 }}>
              <button type="button" onClick={scannerOpen ? stopScanner : openScanner} style={button(scannerOpen ? C.error : C.info)}>
                {scannerOpen ? <X size={16}/> : <QrCode size={16}/>}
                {scannerOpen ? t.closeScanner : t.openScanner}
              </button>

              {scannerOpen ? (
                <video ref={videoRef} playsInline muted style={{ width:"100%", maxHeight:280, objectFit:"cover", borderRadius:14, border:`1px solid ${C.border}`, background:"#000" }} />
              ) : null}

              <input value={scanCode} onChange={(e) => setScanCode(e.target.value)} placeholder={t.manualScan} style={input()} />
            </div>

            <div style={{ display:"grid", gap:10 }}>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={input()}>
                {EVENTS.map((e) => <option key={e.key} value={e.key}>{t[e.label]}</option>)}
              </select>
              <input value={warehouseLocation} onChange={(e) => setWarehouseLocation(e.target.value)} placeholder={t.location} style={input()} />
              <input value={operatorCode} onChange={(e) => { setOperatorCode(e.target.value); localStorage.setItem("be_operator_code", e.target.value); }} placeholder="Operator Code" style={input()} />
            </div>

            <div style={{ display:"grid", gap:10 }}>
              <input value={bagNo} onChange={(e) => setBagNo(e.target.value)} placeholder={t.bagNo} style={input()} />
              <input value={shelfNo} onChange={(e) => setShelfNo(e.target.value)} placeholder={t.shelfNo} style={input()} />
              <input value={exceptionCode} onChange={(e) => setExceptionCode(e.target.value.toUpperCase())} placeholder={t.exceptionCode} style={input()} />
            </div>

            <div style={{ display:"grid", gap:10 }}>
              <textarea value={exceptionNote} onChange={(e) => setExceptionNote(e.target.value)} placeholder={t.exceptionNote} style={textarea()} />
              <button type="button" disabled={loading} onClick={() => void runScan()} style={button(C.gold, { minHeight:48 })}>
                {loading ? <Loader2 size={16} style={{ animation:"spin 1s linear infinite" }}/> : <ScanLine size={16}/>}
                {t.submit}
              </button>
            </div>
          </div>

          <div style={{ marginTop:14 }}>
            <CameraCapture label={t.proof} value={proofPhoto} onCapture={(dataUrl:string) => void uploadWarehouseProof(dataUrl)} />
          </div>
        </section>

        <section className="be-card" style={panel({ padding:18 })}>
          <SectionTitle
            title={t.queue}
            subtitle={t.queueDesc}
            right={
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <input style={{ ...input(), width:260 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} />
                <select style={{ ...input(), width:220 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="ALL">{t.all}</option>
                  {["PICKED_UP", "RECEIVED_WAREHOUSE", "SORTED", "BAGGED", "READY_FOR_WAYPLAN", "EXCEPTION"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            }
          />

          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  {[t.pickupId, t.merchant, t.status, t.warehouse, t.proofCount, t.updated, t.quick].map((h) => <th key={h} style={th()}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const pickupId = text(r.pickup_id || r.canonical_pickup_id, "");
                  const proofCount = scans.filter((s) => s.pickup_id === pickupId).length;
                  return (
                    <tr key={r.id || pickupId}>
                      <td style={td()}><strong style={{ color:C.text }}>{pickupId}</strong></td>
                      <td style={td()}>{text(r.merchant_name)}<br/><span style={{ color:C.muted }}>{text(r.merchant_code)}</span></td>
                      <td style={td()}><span style={badge(r.warehouse_status || r.status)}>{text(r.warehouse_status || r.status)}</span></td>
                      <td style={td()}>{text(r.warehouse_location || r.warehouse_status || "-")}</td>
                      <td style={td()}>{proofCount}</td>
                      <td style={td()}>{formatDate(r.updated_at)}</td>
                      <td style={td()}>
                        <button type="button" style={button(C.info)} onClick={() => { setScanCode(pickupId); void runScan(pickupId); }}>
                          <PackageCheck size={15}/>{t.receive}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && !loading ? (
                  <tr><td colSpan={7} style={{ ...td(), textAlign:"center", padding:32 }}>{t.noRecords}</td></tr>
                ) : null}

                {loading ? (
                  <tr><td colSpan={7} style={{ ...td(), textAlign:"center", padding:32 }}><Loader2 size={16} style={{ animation:"spin 1s linear infinite" }}/> Loading...</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
