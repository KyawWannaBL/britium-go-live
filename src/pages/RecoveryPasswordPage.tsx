import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function RecoveryPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking your secure recovery session...");
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error || !data.session) {
        setMessage("Recovery session is missing or expired. Request a fresh recovery email, then open its link once.");
        return;
      }
      setReady(true);
      setMessage("Recovery verified. Choose a new password.");
    };
    void check();
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
        setMessage("Recovery verified. Choose a new password.");
      }
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) { setMessage("Password must contain at least 8 characters."); return; }
    if (password !== repeat) { setMessage("Passwords do not match."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setFinished(true);
      setReady(false);
      setPassword(""); setRepeat("");
      setMessage("Password updated successfully. You can now sign in using the new password.");
      await supabase.auth.signOut();
    } catch (e: any) {
      setMessage(e?.message || "Password update failed. Please request a new recovery email.");
    } finally { setBusy(false); }
  }

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#061524",color:"#eef8ff",fontFamily:"system-ui,sans-serif",padding:20}}>
    <section style={{width:"min(440px,100%)",padding:28,background:"#0b2236",borderRadius:20,border:"1px solid #1a3a5c"}}>
      <h1>Britium Express Password Recovery</h1>
      <p role="status" style={{lineHeight:1.5,color:"#d5e9f8"}}>{message}</p>
      {ready && !finished && <form onSubmit={submit}>
        <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} style={{display:"block",width:"100%",padding:12,margin:"8px 0 16px",boxSizing:"border-box"}} /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={repeat} onChange={e=>setRepeat(e.target.value)} style={{display:"block",width:"100%",padding:12,margin:"8px 0 16px",boxSizing:"border-box"}} /></label>
        <button type="submit" disabled={busy} style={{width:"100%",padding:14,background:"#f6b84b",border:0,borderRadius:8,fontWeight:700}}>{busy?"Updating...":"Set new password"}</button>
      </form>}
      <p><a href="/login" style={{color:"#f6b84b"}}>Return to login</a></p>
    </section>
  </main>;
}
