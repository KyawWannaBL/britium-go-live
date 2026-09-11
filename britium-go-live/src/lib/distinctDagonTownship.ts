/** Distinct Dagon destinations. Never match downtown Dagon inside a directional name. */
export function distinctDagonTownship(township: unknown, address: unknown = ""): string | null {
 const compact=(v:unknown)=>String(v??"").normalize("NFC").toLowerCase().replace(/[\s()၊,.-]/g,"").replace(/မြို့နယ်|township/g,"");
 const classify=(v:unknown, addressMode = false):string|null=>{
  const s=compact(v);
  const variants=[
   ["မြောက်ဒဂုံ",["မြောက်ဒဂုံ","ဒဂုံမြို့သစ်မြောက်ပိုင်း","northdagon","dagonmyothitnorth"]],
   ["တောင်ဒဂုံ",["တောင်ဒဂုံ","ဒဂုံမြို့သစ်တောင်ပိုင်း","southdagon","dagonmyothitsouth"]],
   ["အရှေ့ဒဂုံ",["အရှေ့ဒဂုံ","ဒဂုံမြို့သစ်အရှေ့ပိုင်း","eastdagon","dagonmyothiteast"]],
   ["ဒဂုံဆိပ်ကမ်း",["ဒဂုံဆိပ်ကမ်း","ဒဂုံမြို့သစ်ဆိပ်ကမ်း","dagonseikkan","dagonmyothitseikkan"]],
  ] as const;
  const parts = String(v ?? "").split(/[,၊;\n။]/).map(compact);
  const hits=variants.filter(([,names])=>names.some(n=>addressMode
    ? parts.some(p => p.endsWith(n)) || String(v ?? "").normalize("NFC").toLowerCase().replace(/[\s()]/g,"").includes(n + "မြို့နယ်")
    : s === n));
  return hits.length===1?hits[0][0]:null;
 };
 const raw=compact(township);
 if(raw==="unknown" || raw==="စုံစမ်းရန်")return null;
 const direct=classify(township);
 if(direct)return direct;
 if(raw && !["ဒဂုံ","dagon"].includes(raw))return null;
 const recipient=String(address??"").replace(/\[\s*sender\s*:[^\]]*\]/gi,"");
 const found=classify(recipient, true);
 if(found)return found;
 return ["ဒဂုံ","dagon"].includes(raw)?"ဒဂုံ":null;
}
