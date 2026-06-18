// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#081b2e",
  border: "#1f4966",
  text: "#eef8ff",
  sub: "#a8c4da",
  muted: "#7ea0b8",
  orange: "#ff8a4c",
  gold: "#f6b84b",
  green: "#22c55e",
  blue: "#38bdf8",
};

function card(label:any, value:any, tone = C.gold) {
  return (
    <div style={{border:`1px solid ${C.border}`, background:C.panel, borderRadius:18, padding:16}}>
      <div style={{color:C.muted, fontSize:11, fontWeight:950, textTransform:"uppercase", letterSpacing:".12em"}}>{label}</div>
      <div style={{color:tone, fontSize:26, fontWeight:950, marginTop:8}}>{value}</div>
    </div>
  );
}

export default function RolePortalPage({ portalName = "Portal", portalCode = "staff" }: any) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pickups, setPickups] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  const profile = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("be_user_access_profile") || "{}");
    } catch {
      return {};
    }
  }, []);

  async function load() {
    setBusy(true);
    setNotice("");

    try {
      const branch = localStorage.getItem("be_branch_code") || profile.branch_code || "HQ";
      const role = localStorage.getItem("be_user_role") || profile.role || portalCode;

      let pickupQuery = supabase
        .from("be_portal_pickup_requests")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(80);

      if (role.includes("branch")) {
        pickupQuery = pickupQuery.or(`branch_code.eq.${branch},pickup_city.ilike.%${branch}%`);
      }

      const pr = await pickupQuery;
      if (!pr.error) setPickups(pr.data || []);

      const ev = await supabase
        .from("be_portal_cargo_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);

      if (!ev.error) setEvents(ev.data || []);

      const nt = await supabase
        .from("be_app_notifications")
        .select("*")
        .or(`target_role.eq.${role},target_role.eq.${portalCode},target_role.eq.all`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!nt.error) setNotifications(nt.data || []);
    } catch (e:any) {
      setNotice(e?.message || "Backend load failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main style={{minHeight:"100vh", background:C.bg, color:C.text, padding:24, fontFamily:"Poppins, Inter, system-ui, sans-serif"}}>
      <div style={{maxWidth:1380, margin:"0 auto", display:"grid", gap:18}}>
        <section style={{border:`1px solid ${C.border}`, background:`linear-gradient(135deg, ${C.panel}, ${C.panel2})`, borderRadius:26, padding:22}}>
          <div style={{display:"flex", justifyContent:"space-between", gap:14, flexWrap:"wrap"}}>
            <div>
              <div style={{color:C.orange, fontWeight:950, letterSpacing:".22em", fontSize:12}}>BRITIUM EXPRESS LIVE PORTAL</div>
              <h1 style={{margin:"8px 0 0", display:"flex", gap:10, alignItems:"center"}}>
                <ShieldCheck color={C.gold} /> {portalName}
              </h1>
              <p style={{color:C.sub}}>Backend-first role portal. No mock runtime records are displayed.</p>
              <p style={{color:C.gold, fontWeight:900}}>
                Email: {profile.email || localStorage.getItem("be_user_email") || "—"} · Role: {profile.role || "—"} · Branch: {profile.branch_code || "HQ"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              style={{border:`1px solid ${C.blue}`, background:C.blue, color:"#061524", borderRadius:14, padding:"10px 14px", fontWeight:950, cursor:"pointer", display:"inline-flex", gap:8, alignItems:"center"}}
            >
              <RefreshCw size={16} /> {busy ? "Loading..." : "Refresh"}
            </button>
          </div>
        </section>

        {notice ? <section style={{border:"1px solid #ff4f86", color:"#ff4f86", borderRadius:16, padding:12}}>{notice}</section> : null}

        <section style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:12}}>
          {card("Pickup Records", pickups.length, C.gold)}
          {card("Cargo Events", events.length, C.blue)}
          {card("Notifications", notifications.length, C.green)}
          {card("Portal Code", portalCode, C.orange)}
        </section>

        <section style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(360px,1fr))", gap:16}}>
          <div style={{border:`1px solid ${C.border}`, background:C.panel, borderRadius:20, padding:16}}>
            <h2 style={{marginTop:0}}>Recent Pickups</h2>
            {pickups.slice(0, 12).map((p:any) => (
              <div key={p.id || p.pickup_id} style={{border:`1px solid ${C.border}`, borderRadius:14, padding:12, marginTop:10, background:"#071827"}}>
                <b style={{color:C.gold}}>{p.pickup_id || p.canonical_pickup_id}</b>
                <div style={{color:C.sub}}>{p.merchant_name || "—"} · {p.status || "—"} · {p.branch_code || "HQ"}</div>
              </div>
            ))}
            {!pickups.length ? <div style={{color:C.muted}}>No backend pickup records.</div> : null}
          </div>

          <div style={{border:`1px solid ${C.border}`, background:C.panel, borderRadius:20, padding:16}}>
            <h2 style={{marginTop:0}}>Recent Events</h2>
            {events.slice(0, 12).map((e:any) => (
              <div key={e.id || e.created_at} style={{border:`1px solid ${C.border}`, borderRadius:14, padding:12, marginTop:10, background:"#071827"}}>
                <b style={{color:C.blue}}>{e.event_type || e.process_status || e.status_code}</b>
                <div style={{color:C.sub}}>{e.pickup_id || "—"} · {e.actor_role || "—"}</div>
              </div>
            ))}
            {!events.length ? <div style={{color:C.muted}}>No backend cargo events.</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
