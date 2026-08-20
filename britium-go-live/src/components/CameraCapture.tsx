// @ts-nocheck
import React, { useRef, useState } from "react";
import { Camera, CheckCircle2, UploadCloud, X } from "lucide-react";

const C = { border:"#1f4966", panel:"#071827", text:"#eef8ff", sub:"#a8c4da", blue:"#38bdf8", green:"#22c55e", red:"#ff4f86" };

function btn(tone = C.blue, extra:any = {}) {
  return { border:`1px solid ${tone}88`, background:tone, color:tone === C.red ? C.text : "#061524", borderRadius:12, minHeight:40, padding:"8px 12px", fontWeight:950, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7, ...extra };
}

async function fileToDataUrl(file:File) {
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function CameraCapture({ label, value, onCapture, required = false }:any) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<any>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(value || "");
  const [error, setError] = useState("");

  async function openCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:"environment" } }, audio:false });
      streamRef.current = stream;
      setOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch (e:any) {
      setError(e?.message || "Camera permission denied. Use upload fallback.");
    }
  }

  function closeCamera() {
    try { streamRef.current?.getTracks?.().forEach((t:any) => t.stop()); } catch {}
    streamRef.current = null;
    setOpen(false);
  }

  function capture() {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    setPreview(dataUrl);
    onCapture?.(dataUrl);
    closeCamera();
  }

  async function upload(e:any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPreview(dataUrl);
    onCapture?.(dataUrl);
  }

  function clear() {
    setPreview("");
    onCapture?.("");
  }

  return (
    <div style={{ border:`1px solid ${C.border}`, background:C.panel, borderRadius:16, padding:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <b style={{ color:C.text }}>{label} {required ? <span style={{ color:C.red }}>*</span> : null}</b>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button type="button" onClick={openCamera} style={btn(C.blue)}><Camera size={15}/> Camera</button>
          {preview ? <button type="button" onClick={clear} style={btn(C.red)}><X size={15}/> Clear</button> : null}
        </div>
      </div>

      {error ? <div style={{ marginTop:10, color:C.red, fontWeight:850 }}>{error}</div> : null}

      {open ? (
        <div style={{ marginTop:12 }}>
          <video ref={videoRef} playsInline muted style={{ width:"100%", maxHeight:320, objectFit:"cover", borderRadius:14, border:`1px solid ${C.border}`, background:"#000" }} />
          <div style={{ display:"flex", gap:8, marginTop:10 }}>
            <button type="button" onClick={capture} style={btn(C.green)}><CheckCircle2 size={15}/> Capture</button>
            <button type="button" onClick={closeCamera} style={btn(C.red)}><X size={15}/> Cancel</button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <img src={preview} alt="Captured proof" style={{ marginTop:12, width:"100%", maxHeight:260, objectFit:"cover", borderRadius:14, border:`1px solid ${C.border}` }} />
      ) : (
        <label style={{ display:"grid", placeItems:"center", minHeight:110, marginTop:12, border:`1px dashed ${C.border}`, borderRadius:14, color:C.sub, cursor:"pointer", textAlign:"center", padding:12 }}>
          <UploadCloud size={22}/>
          <span style={{ marginTop:8, fontWeight:850 }}>Camera unavailable? Upload photo</span>
          <input type="file" accept="image/*" capture="environment" onChange={upload} style={{ display:"none" }} />
        </label>
      )}
    </div>
  );
}
