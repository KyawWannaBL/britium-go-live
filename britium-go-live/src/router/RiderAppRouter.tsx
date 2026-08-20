// @ts-nocheck
// RiderAppRouter.tsx — Complete Rider App Router
// Path: src/router/RiderAppRouter.tsx
// Integrates into the main enterprise BrowserRouter tree.
// Add <Route path="/rider/*" element={<RiderAppRouter />} /> in your main App.tsx Routes.

import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { riderAppApi, riderStorage } from "@/lib/riderAppApi";
import { Loader2 } from "lucide-react";

// Lazy imports for all 14 pages
import RiderLoginPage             from "@/pages/rider/RiderLoginPage";
import RiderDashboardPage         from "@/pages/rider/RiderDashboardPage";
import AssignedPickupsPage        from "@/pages/rider/AssignedPickupsPage";
import PickupDetailPage           from "@/pages/rider/PickupDetailPage";
import AssignedDeliveryRoutePage  from "@/pages/rider/AssignedDeliveryRoutePage";
import DeliveryProofPage          from "@/pages/rider/DeliveryProofPage";
import RiderSettlementPage        from "@/pages/rider/RiderSettlementPage";
import RiderProfilePage           from "@/pages/rider/RiderProfilePage";
import OfflineSyncPage            from "@/pages/rider/OfflineSyncPage";
import SupportPage                from "@/pages/rider/SupportPage";

// Inline stubs for pages not yet extracted to separate files
// (PickupVerificationPage and PickupExceptionPage re-use the existing portal ones)
import PickupVerificationPage from "@/pages/PickupVerificationPage";

const C = { page: "#061524", text: "#eef8ff", orange: "#ff8a4c" };

// ---- Auth Guard — blocks non-authenticated routes ----

function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authed,   setAuthed]   = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/rider/login", { replace: true }); setChecking(false); return; }

      // Ensure rider is linked
      const ctx = await riderAppApi.loginContext().catch(() => null);
      if (ctx?.ok && ctx?.rider?.id) {
        riderStorage.setRiderId(ctx.rider.id);
        riderStorage.setRiderCode(ctx.rider.rider_code || "");
        setAuthed(true);
      } else {
        // Authenticated but no rider linked → back to login (link mode)
        navigate("/rider/login", { replace: true });
      }
      setChecking(false);
    })();
  }, [navigate]);

  if (checking) return (
    <div style={{ minHeight: "100vh", background: C.page, display: "grid", placeItems: "center" }}>
      <div style={{ display: "grid", placeItems: "center", gap: 16, color: C.orange }}>
        <Loader2 size={40} className="animate-spin" />
        <div style={{ fontWeight: 950, fontSize: 14 }}>Session checking…</div>
      </div>
    </div>
  );

  return authed ? <>{children}</> : null;
}

// ---- Placeholder pages for routes not yet fully extracted ----

function DeliveryStopDetailPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight:"100vh",background:C.page,color:C.text,padding:24,fontFamily:"Pyidaungsu, Inter, sans-serif" }}>
      <button onClick={() => navigate(-1)} style={{ border:"1px solid #1f4966",borderRadius:12,background:"#071827",color:C.text,padding:"8px 16px",cursor:"pointer" }}>← Back</button>
      <h2 style={{ color:C.orange,fontWeight:950,marginTop:16 }}>Delivery Stop Detail</h2>
      <p style={{ color:"#a8c4da" }}>Stop detail view — use Route page and navigate to individual stops.</p>
    </div>
  );
}

function CODCollectionPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight:"100vh",background:C.page,color:C.text,padding:24,fontFamily:"Pyidaungsu, Inter, sans-serif" }}>
      <button onClick={() => navigate(-1)} style={{ border:"1px solid #1f4966",borderRadius:12,background:"#071827",color:C.text,padding:"8px 16px",cursor:"pointer" }}>← Back</button>
      <h2 style={{ color:C.orange,fontWeight:950,marginTop:16 }}>COD Collection</h2>
      <p style={{ color:"#a8c4da" }}>COD collection is handled within the Delivery Proof page. Navigate to a delivery stop and tap Delivered.</p>
      <button onClick={() => navigate("/rider/delivery-routes")} style={{ marginTop:16,border:"none",borderRadius:12,background:"#ff8a4c",color:"#1b0b05",padding:"10px 20px",fontWeight:950,cursor:"pointer" }}>Go to Routes →</button>
    </div>
  );
}

function PickupExceptionPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight:"100vh",background:C.page,color:C.text,padding:24,fontFamily:"Pyidaungsu, Inter, sans-serif" }}>
      <button onClick={() => navigate(-1)} style={{ border:"1px solid #1f4966",borderRadius:12,background:"#071827",color:C.text,padding:"8px 16px",cursor:"pointer" }}>← Back</button>
      <h2 style={{ color:"#ff4f86",fontWeight:950,marginTop:16 }}>Pickup Exception</h2>
      <p style={{ color:"#a8c4da" }}>Pickup exceptions are reported from the Pickup Detail page. Navigate to a pickup and use the Exception button.</p>
      <button onClick={() => navigate("/rider/pickups")} style={{ marginTop:16,border:"none",borderRadius:12,background:"#ff8a4c",color:"#1b0b05",padding:"10px 20px",fontWeight:950,cursor:"pointer" }}>Go to Pickups →</button>
    </div>
  );
}

// ---- Main Router ----

export default function RiderAppRouter() {
  return (
    <Routes>
      {/* Public */}
      <Route path="login"  element={<RiderLoginPage />} />

      {/* Auth-guarded rider routes */}
      <Route path="dashboard" element={<AuthGuard><RiderDashboardPage /></AuthGuard>} />
      <Route path="pickups"   element={<AuthGuard><AssignedPickupsPage /></AuthGuard>} />
      <Route path="pickups/:pickupId" element={<AuthGuard><PickupDetailPage /></AuthGuard>} />
      <Route path="pickup-verification" element={<AuthGuard><PickupVerificationPage /></AuthGuard>} />
      <Route path="pickup-exception"    element={<AuthGuard><PickupExceptionPage /></AuthGuard>} />
      <Route path="delivery-routes"     element={<AuthGuard><AssignedDeliveryRoutePage /></AuthGuard>} />
      <Route path="delivery-routes/:wayplanId" element={<AuthGuard><AssignedDeliveryRoutePage /></AuthGuard>} />
      <Route path="delivery-stops/:stopId"     element={<AuthGuard><DeliveryStopDetailPage /></AuthGuard>} />
      <Route path="delivery-proof" element={<AuthGuard><DeliveryProofPage /></AuthGuard>} />
      <Route path="cod-collection" element={<AuthGuard><CODCollectionPage /></AuthGuard>} />
      <Route path="settlement"     element={<AuthGuard><RiderSettlementPage /></AuthGuard>} />
      <Route path="profile"        element={<AuthGuard><RiderProfilePage /></AuthGuard>} />
      <Route path="offline-sync"   element={<AuthGuard><OfflineSyncPage /></AuthGuard>} />
      <Route path="support"        element={<AuthGuard><SupportPage /></AuthGuard>} />

      {/* Default: redirect to dashboard */}
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
