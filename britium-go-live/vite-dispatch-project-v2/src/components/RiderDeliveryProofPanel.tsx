import React, { useMemo, useRef, useState } from "react";
import { CheckCircle2, Eraser, Loader2, PenLine, WalletCards } from "lucide-react";
import { riderSignatureFinanceApi } from "@/lib/riderSignatureFinanceApi";

type Props = {
  deliveryWayId: string;
  riderId: string;
  expectedCod?: number | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  onCompleted?: (result: any) => void;
};

const C = { panel:"#0b2236", panel2:"#102b45", panel3:"#071827", border:"#1f4966", text:"#eef8ff", sub:"#a8c4da", orange:"#ff8a4c", green:"#22c55e", red:"#ff4f86", gold:"#f6b84b" };

export default function RiderDeliveryProofPanel({ deliveryWayId, riderId, expectedCod = 0, receiverName = "", receiverPhone = "", onCompleted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [receiver, setReceiver] = useState(receiverName || "");
  const [phone, setPhone] = useState(receiverPhone || "");
  const [cod, setCod] = useState(String(expectedCod || 0));
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [photoUrl, setPhotoUrl] = useState("");
  const [remarks, setRemarks] = useState("");
  const [gps, setGps] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const codVariance = useMemo(() => Number(cod || 0) - Number(expectedCod || 0), [cod, expectedCod]);

  function point(evt: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function start(evt: React.PointerEvent<HTMLCanvasElement>) {
    const p = point(evt);
    const ctx = canvasRef.current?.getContext("2d");
    if (!p || !ctx) return;
    setDrawing(true);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(evt: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const p = point(evt);
    const ctx = canvasRef.current?.getContext("2d");
    if (!p || !ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#eef8ff";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function signaturePayload() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return { format: "canvas_png_data_url", data_url: canvas.toDataURL("image/png"), captured_at: new Date().toISOString() };
  }

  async function captureGps() {
    setMessage(null);
    if (!navigator.geolocation) return setMessage("GPS မရနိုင်ပါ။ Location permission စစ်ဆေးပါ။");
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => setMessage(err.message || "GPS မဖမ်းယူနိုင်ပါ။"),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    try {
      if (codVariance !== 0) throw new Error("COD amount မကိုက်ညီပါ။ Finance/Supervisor adjustment လိုအပ်ပါသည်။");
      const result = await riderSignatureFinanceApi.markDeliveredWithSignatureAndCod({
        deliveryWayId,
        riderId,
        receiverName: receiver,
        receiverPhone: phone || null,
        codCollected: Number(cod || 0),
        paymentMethod: paymentMethod as any,
        signaturePayload: signaturePayload(),
        photoUrl: photoUrl || null,
        gpsLat: Number(gps.lat),
        gpsLng: Number(gps.lng),
        remarks: remarks || null,
      });
      setMessage("Delivered + signature + COD validation အောင်မြင်ပါသည်။");
      onCompleted?.(result);
    } catch (e: any) {
      setMessage(e?.message || "Delivery proof submit မအောင်မြင်ပါ။");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ border:`1px solid ${C.border}`, background:`linear-gradient(180deg, ${C.panel}, #081b2b)`, borderRadius:24, padding:20, color:C.text, display:"grid", gap:16 }}>
      <header>
        <div style={{ color:C.orange, fontWeight:950, fontFamily:"monospace" }}>{deliveryWayId}</div>
        <h2 style={{ margin:"4px 0 0", fontSize:22, fontWeight:950 }}>Drop-off Signature + Finance Validation</h2>
        <p style={{ color:C.sub, margin:"4px 0 0" }}>လက်မှတ်၊ GPS၊ COD amount နှင့် settlement ကို validate လုပ်ပါ။</p>
      </header>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <label style={label}>Receiver Name *<input value={receiver} onChange={(e)=>setReceiver(e.target.value)} style={input}/></label>
        <label style={label}>Receiver Phone<input value={phone} onChange={(e)=>setPhone(e.target.value)} style={input}/></label>
      </div>

      <div style={box}>
        <div style={{ display:"flex", alignItems:"center", gap:8, color:C.gold, fontWeight:950 }}><WalletCards size={18}/> COD / Finance Validation</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginTop:12 }}>
          <div><div style={small}>Expected COD</div><div style={{ fontSize:22, fontWeight:950 }}>{Number(expectedCod || 0).toLocaleString()}</div></div>
          <label style={label}>Collected COD *<input type="number" value={cod} onChange={(e)=>setCod(e.target.value)} style={input}/></label>
          <label style={label}>Payment Method<select value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)} style={input}><option>CASH</option><option>KBZPAY</option><option>WAVEPAY</option><option>BANK_TRANSFER</option><option>NO_COD</option><option>OTHER</option></select></label>
        </div>
        <div style={{ marginTop:10, color:codVariance === 0 ? C.green : C.red, fontWeight:950 }}>Variance: {codVariance.toLocaleString()}</div>
      </div>

      <div style={box}>
        <div style={{ display:"flex", alignItems:"center", gap:8, color:C.orange, fontWeight:950 }}><PenLine size={18}/> Receiver Electronic Signature *</div>
        <canvas ref={canvasRef} width={800} height={220} onPointerDown={start} onPointerMove={move} onPointerUp={()=>setDrawing(false)} onPointerLeave={()=>setDrawing(false)} style={{ width:"100%", height:220, marginTop:12, background:"#020b13", border:`1px dashed ${C.border}`, borderRadius:14, touchAction:"none" }} />
        <button onClick={clearSignature} style={ghost}><Eraser size={16}/> Clear signature</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <label style={label}>Photo URL<input value={photoUrl} onChange={(e)=>setPhotoUrl(e.target.value)} placeholder="https://..." style={input}/></label>
        <label style={label}>Remarks<input value={remarks} onChange={(e)=>setRemarks(e.target.value.slice(0,500))} style={input}/></label>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
        <button onClick={captureGps} style={ghost}>Capture GPS</button>
        <div style={{ color:gps.lat && gps.lng ? C.green : C.sub, fontWeight:900 }}>GPS: {gps.lat && gps.lng ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : "Required"}</div>
      </div>

      {message ? <div style={{ color:message.includes("အောင်မြင်") ? C.green : C.red, fontWeight:900 }}>{message}</div> : null}

      <button onClick={submit} disabled={submitting} style={{ minHeight:50, border:"none", borderRadius:16, background:C.orange, color:"#1b0b05", fontWeight:950, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8, cursor:"pointer" }}>
        {submitting ? <Loader2 size={18} className="animate-spin"/> : <CheckCircle2 size={18}/>} Confirm Delivered + Settlement Pending
      </button>
    </section>
  );
}

const box: React.CSSProperties = { border:`1px solid ${C.border}`, borderRadius:18, background:C.panel3, padding:14 };
const label: React.CSSProperties = { display:"grid", gap:6, color:C.sub, fontWeight:900, fontSize:13 };
const small: React.CSSProperties = { color:C.sub, fontWeight:900, fontSize:12 };
const input: React.CSSProperties = { width:"100%", minHeight:44, border:`1px solid ${C.border}`, borderRadius:12, background:C.panel2, color:C.text, padding:"0 12px", outline:"none", fontWeight:850 };
const ghost: React.CSSProperties = { marginTop:10, minHeight:40, border:`1px solid ${C.border}`, borderRadius:12, background:"transparent", color:C.text, padding:"0 12px", fontWeight:900, display:"inline-flex", alignItems:"center", gap:8, cursor:"pointer" };
