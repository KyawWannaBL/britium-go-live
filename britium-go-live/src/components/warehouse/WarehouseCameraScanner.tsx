import React, { useEffect, useRef, useState } from "react";
import { normalizeWarehouseScan } from "@/lib/warehouseScan";

type Props={onDetected:(code:string)=>void;disabled?:boolean};
export default function WarehouseCameraScanner({onDetected,disabled=false}:Props) {
  const [open,setOpen]=useState(false);
  const [message,setMessage]=useState("");
  const video=useRef<HTMLVideoElement>(null);
  const cancelCamera=useRef(()=>{});
  const receive=useRef(onDetected);
  receive.current=onDetected;
  useEffect(()=>{
    if(!open || disabled) return;
    let cancelled=false;
    let accepted=false;
    let stream:MediaStream|undefined;
    let controls:{stop:()=>void}|undefined;
    const stop=()=>{
      controls?.stop();
      stream?.getTracks().forEach(track=>track.stop());
    };
    const cancel=()=>{cancelled=true;stop();};
    cancelCamera.current=cancel;
    const hide=()=>{if(document.hidden){cancel();setOpen(false);}};
    document.addEventListener("visibilitychange",hide);
    void (async()=>{
      try {
        if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
          throw new Error("Camera access requires HTTPS and a supported browser. You can still use a scanner or type the ID.");
        const {BrowserMultiFormatReader}=await import("@zxing/browser");
        if(cancelled) return;
        stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{
          facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:10,max:15}
        }});
        if(cancelled){stop();return;}
        const target=video.current;
        if(!target){stop();return;}
        setMessage("Point at the entire barcode or QR code. Hold steady.");
        const reader=new BrowserMultiFormatReader(undefined,{delayBetweenScanAttempts:250,delayBetweenScanSuccess:1000});
        controls=await reader.decodeFromStream(stream,target,(result,_error,currentControls)=>{
          if(cancelled || accepted || !result) return;
          let code:string;
          try {code=normalizeWarehouseScan(result.getText());}
          catch(error){setMessage((error as Error).message);return;}
          accepted=true;
          currentControls.stop();
          stop();
          setOpen(false);
          setMessage("Read "+code+". Choose the warehouse action to save it.");
          receive.current(code);
        });
        if(cancelled || accepted) stop();
      } catch(error:any) {
        stop();
        if(cancelled) return;
        setOpen(false);
        setMessage(error?.name==="NotAllowedError" ? "Camera permission denied. Allow Camera in the browser site settings, or use scanner/manual entry."
          : error?.name==="NotFoundError" ? "No camera found. Use a connected scanner or type the ID."
          : error?.name==="NotReadableError" ? "Camera is busy. Close other camera apps and try again."
          : error?.message || "Camera unavailable. Use scanner/manual entry.");
      }
    })();
    return ()=>{cancel();document.removeEventListener("visibilitychange",hide);};
  },[open,disabled]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  return <div className="my-3 w-full rounded-xl border border-sky-800 p-3">
    <button type="button" disabled={disabled} onClick={()=>{if(open)cancelCamera.current();setMessage("");setOpen(value=>!value);}}
      className="min-h-11 rounded-lg bg-sky-600 px-4 py-2 font-bold text-white disabled:opacity-50">
      {open?"Stop camera / ပိတ်ရန်":"Scan with phone camera / ဖုန်းဖြင့် စကင်ဖတ်ရန်"}
    </button>
    {open && <video ref={video} autoPlay muted playsInline aria-label="Waybill camera scanner"
      className="mt-3 aspect-video w-full max-w-xl rounded-lg bg-black object-contain"/>}
    <p role="status" aria-live="polite" className="mt-2 text-sm text-sky-200">{message||"QR code or barcode • rear camera preferred • images stay on your device"}</p>
  </div>;
}
