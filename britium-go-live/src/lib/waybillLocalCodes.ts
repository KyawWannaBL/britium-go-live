import JsBarcode from "jsbarcode";
import { BarcodeFormat, QRCodeWriter } from "@zxing/library";

// Embedded SVGs have no network dependency and remain sharp in PDF and on paper.
const cache = new Map<string, string>();
function memo(key: string, create: () => string) {
  const found=cache.get(key);
  if(found) return found;
  const result=create();
  if(cache.size>=1200) cache.delete(cache.keys().next().value!);
  cache.set(key,result);
  return result;
}
function data(svg: string) { return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg); }
export function localBarcodeUrl(value: string) {
  return memo("bar:"+value,()=>{
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    JsBarcode(svg,value,{format:"CODE128",displayValue:false,width:2,height:70,margin:20,background:"#ffffff",lineColor:"#000000"});
    svg.removeAttribute("xmlns");
    return data(new XMLSerializer().serializeToString(svg));
  });
}
export function localQrUrl(value: string) {
  return memo("qr:"+value,()=>{
    const matrix=new QRCodeWriter().encode(value,BarcodeFormat.QR_CODE,132,132,new Map());
    const width=matrix.getWidth(),height=matrix.getHeight();
    let path="";
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) if(matrix.get(x,y)) path+="M"+x+" "+y+"h1v1h-1z";
    return data('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><rect width="100%" height="100%" fill="white"/><path d="'+path+'" fill="black"/></svg>');
  });
}
export async function prepareWaybillCodes(ids: string[]) {
  for(let i=0;i<ids.length;i++){
    localBarcodeUrl(ids[i]); localQrUrl(ids[i]);
    if(i%10===9) await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
}
