const H={"Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Type":"text/html; charset=utf-8"};
const page=(t,m,b="")=>`<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t}</title><style>body{font-family:system-ui,sans-serif;background:#061524;color:#eef8ff;margin:0;display:grid;place-items:center;min-height:100vh}main{width:min(520px,calc(100% - 32px));background:#0b2236;border:1px solid #1a3a5c;border-radius:24px;padding:28px;box-sizing:border-box}a{color:#f6b84b}p{color:#9bb7cc;line-height:1.5}</style></head><body><main><h1>${t}</h1><p>${m}</p>${b}</main></body></html>`;
const clear="britium_recovery_access=; Path=/api/recovery-update-password; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

export default {
 async fetch(req){
  if(req.method!=="POST")return new Response(page("Method not allowed","Please use the password recovery form."),{status:405,headers:H});
  
  try{
   // NOTE: The legacy Origin check block has been completely removed.
   
   const f=await req.formData(),password=String(f.get("password")||""),confirm=String(f.get("confirm_password")||"");
   if(password.length<8||password!==confirm)return new Response(page("Password not accepted","Use a password of at least 8 characters and make sure both entries match."),{status:400,headers:H});
   
   const cookie=String(req.headers.get("cookie")||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("britium_recovery_access="));
   let access="";
   if(cookie){try{access=decodeURIComponent(cookie.slice("britium_recovery_access=".length));}catch{}}
   if(!access)return new Response(page("Recovery session expired","Please request a new password reset email."),{status:401,headers:H});
   
   const u=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||"").trim().replace(/\/+$/,"");
   const k=String(process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY||"").trim();
   if(!u||!k)return new Response(page("Recovery unavailable","The recovery service is temporarily unavailable. Please try again later."),{status:500,headers:H});
   
   const r=await fetch(u+"/auth/v1/user",{method:"PUT",headers:{apikey:k,Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({password})});
   
   if(!r.ok){
    const headers=new Headers(H);
    if(r.status===401||r.status===403)headers.set("Set-Cookie",clear);
    console.error("[Britium recovery update]",r.status);
    return new Response(page("Password update failed",r.status===401||r.status===403?"Your recovery session expired. Please request a new reset email.":"The password could not be updated. Please try again."),{status:r.status===401||r.status===403?401:502,headers});
   }
   
   // NOTE: This now securely clears the cookie and performs a clean 303 Redirect back to your portal
   const headers=new Headers(H);
   headers.set("Set-Cookie",clear);
   headers.set("Location", "https://www.britiumexpress.com/#/login");
   return new Response(null, {status: 303, headers});
   
  }catch(e){
   console.error("[Britium recovery update]",e);
   return new Response(page("Recovery unavailable","The recovery service is temporarily unavailable. Please try again later."),{status:500,headers:H});
  }
 }
};