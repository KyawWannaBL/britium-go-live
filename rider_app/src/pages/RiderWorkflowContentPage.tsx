import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import "../styles/riderWorkflowContent.css";

type Job = {
  pickup_id?: string;
  merchant_code?: string;
  merchant_name?: string;
  township?: string;
  city?: string;
  pickup_address?: string;
  assigned_rider_email?: string;
  pickup_status?: string;
  workflow_stage?: string;
  supervisor_status?: string;
  rider_status?: string;
  assigned_at?: string;
  vehicle_type?: string;
  expected_parcels?: number;
  payment_terms?: string;
  payment_type?: string;
};

// --- HELPER FUNCTIONS ---
function routeName() {
  const hash = (window.location.hash || "#/rider/dashboard").replace(/^#/, "");
  if (hash.includes("pickup")) return "pickup";
  if (hash.includes("delivery")) return "delivery";
  if (hash.includes("route")) return "routes";
  if (hash.includes("map")) return "map";
  if (hash.includes("settlement") || hash.includes("wallet")) return "settlement";
  if (hash.includes("offline")) return "offline";
  if (hash.includes("support")) return "support";
  return "dashboard";
}

function riderEmailFromStorage() {
  const keys = ["britium_rider_email", "rider_email", "user_email", "be_user_email", "email"];
  for (const key of keys) {
    const value = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    if (value && value.includes("@")) return value;
  }
  return "testrider@britiumexpress.com";
}

function pretty(value?: string) { return String(value || "WAITING_ACCEPTANCE").replaceAll("_", " "); }
function upper(value?: string) { return String(value || "").toUpperCase(); }
function isCollected(job: Job) { return upper(job.pickup_status).includes("COMPLETED") || upper(job.rider_status).includes("COMPLETED"); }
function isDelivered(job: Job) { return upper(job.pickup_status).includes("DELIVERED") || upper(job.rider_status).includes("DELIVERED"); }
function isDeliveryReady(job: Job) { return isCollected(job) || upper(job.pickup_status).includes("OUT_FOR_DELIVERY") || upper(job.rider_status).includes("OUT_FOR_DELIVERY"); }
function go(path: string) { window.location.hash = path; }

export default function RiderWorkflowContentPage() {
  const [screen, setScreen] = useState(routeName());
  const [riderEmail, setRiderEmail] = useState(riderEmailFromStorage());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onHash = () => setScreen(routeName());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  async function loadJobs(emailOverride?: string) {
    setLoading(true); setError(""); setMessage("");
    const email = String(emailOverride || riderEmail || riderEmailFromStorage()).trim();
    setRiderEmail(email);
    if (email) window.localStorage.setItem("britium_rider_email", email);

    try {
      let query = supabase
        .from("be_v_supervisor_pickup_queue")
        .select("*")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(150);

      if (email) query = query.eq("assigned_rider_email", email);

      const { data, error } = await query;
      if (error) throw error;
      setJobs((data || []) as Job[]);
    } catch (err: any) {
      setError(err?.message || "Could not load rider jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
    const t = window.setInterval(() => loadJobs(), 30000);
    return () => window.clearInterval(t);
  }, []);

  // --- THE UNIVERSAL WORKFLOW ENGINE CONNECTION ---
  async function triggerWorkflow(job: Job, processType: string, newStatus: string) {
    if (!job.pickup_id) return;
    setError(""); setMessage("");

    try {
      const { error: rpcError } = await supabase.rpc("be_logistics_apply_workflow_event_strict", {
        p_pickup_id: job.pickup_id,
        p_process_type: processType,
        p_new_status: newStatus,
        p_actor_role: "rider",
        p_actor_id: riderEmail,
        p_notes: `Rider action: ${newStatus}`
      });

      if (rpcError) throw rpcError;
      
      setMessage(`${job.pickup_id} successfully updated to ${pretty(newStatus)}.`);
      await loadJobs();
    } catch (err: any) {
      setError(err?.message || `Failed to update job to ${newStatus}.`);
    }
  }

  const activeJobs = useMemo(() => jobs.filter((j) => !isCollected(j) && !isDelivered(j)), [jobs]);
  const pickupJobs = useMemo(() => activeJobs, [activeJobs]);
  const deliveryJobs = useMemo(() => jobs.filter((j) => isDeliveryReady(j) && !isDelivered(j)), [jobs]);
  const completedJobs = useMemo(() => jobs.filter((j) => isCollected(j) || isDelivered(j)), [jobs]);
  const codJobs = useMemo(() => jobs.filter((j) => upper(j.payment_terms || j.payment_type).includes("COD")), [jobs]);

  function JobCard({ job, mode }: { job: Job; mode: "pickup" | "delivery" | "route" | "simple" }) {
    return (
      <article className="rwc-job">
        <div className="rwc-job-main">
          <strong className="rwc-id">{job.pickup_id}</strong>
          <h3>{job.merchant_name || job.merchant_code || "Merchant"}</h3>
          <p>{job.pickup_address || "No pickup address"}</p>
          <b>{job.township || "-"}, {job.city || "Yangon"}</b>
        </div>
        <div className="rwc-job-meta">
          <span>{pretty(job.status || job.pickup_status)}</span>
          <small>{job.expected_parcels || 1} parcel / {job.vehicle_type || "Bike"}</small>
          <small>{job.payment_terms || job.payment_type || "COD"}</small>
        </div>
        <div className="rwc-actions">
          {mode === "pickup" && (
            <>
              <button className="green" onClick={() => triggerWorkflow(job, 'PICKUP', 'PICKUP_ASSIGNED')}>Accept Job</button>
              <button onClick={() => triggerWorkflow(job, 'PICKUP', 'ARRIVED_AT_PICKUP')}>Arrived Merchant</button>
              <button className="orange" onClick={() => triggerWorkflow(job, 'PICKUP', 'PICKUP_COMPLETED')}>Mark Collected</button>
            </>
          )}
          {mode === "delivery" && (
            <>
              <button onClick={() => triggerWorkflow(job, 'DELIVERY', 'OUT_FOR_DELIVERY')}>Start Delivery</button>
              <button className="green" onClick={() => triggerWorkflow(job, 'DELIVERY', 'DELIVERED')}>Verify Delivered</button>
              <button className="orange" onClick={() => triggerWorkflow(job, 'DELIVERY', 'DELIVERY_FAILED')}>Exception / Failed</button>
            </>
          )}
          {mode === "route" && (
            <>
              <button onClick={() => go("/rider/live-map")}>Open Live Map</button>
            </>
          )}
        </div>
      </article>
    );
  }

  function JobList({ list, mode }: { list: Job[]; mode: "pickup" | "delivery" | "route" | "simple" }) {
    if (loading) return <div className="rwc-empty">Loading jobs...</div>;
    if (!list.length) return <div className="rwc-empty">No jobs found for this process.</div>;
    return <div className="rwc-list">{list.map((job) => <JobCard key={job.pickup_id} job={job} mode={mode} />)}</div>;
  }

  function Header({ title, subtitle }: { title: string; subtitle: string }) {
    return (
      <header className="rwc-header">
        <div><span>BRITIUM RIDER UAT</span><h1>{title}</h1><p>{subtitle}</p></div>
        <button onClick={() => loadJobs()}>Sync</button>
      </header>
    );
  }

  let content: React.ReactNode = (
    <><Header title="Rider Dashboard" subtitle="Today assignment summary and rider action queue." />
      <section className="rwc-panel"><div className="rwc-title">Today Assigned Jobs</div><JobList list={jobs} mode="pickup" /></section></>
  );
  if (screen === "pickup") content = <><Header title="Pickup Verification" subtitle="Accept job, arrive at merchant, verify pickup." /><section className="rwc-panel"><div className="rwc-title">Pickup Jobs</div><JobList list={pickupJobs} mode="pickup" /></section></>;
  if (screen === "delivery") content = <><Header title="Delivery Verification" subtitle="Start delivery, verify delivered, or submit exception." /><section className="rwc-panel"><div className="rwc-title">Delivery Jobs</div><JobList list={deliveryJobs.length ? deliveryJobs : jobs} mode="delivery" /></section></>;

  return (
    <main className="rwc-page">
      {message ? <div className="rwc-ok">{message}</div> : null}
      {error ? <div className="rwc-error">{error}</div> : null}
      {content}
    </main>
  );
}