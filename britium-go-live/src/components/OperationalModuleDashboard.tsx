import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import { BritiumLang, getBritiumLang, translate } from "./LanguageToggle";
import { BRANCHES, DATA_SOURCES } from "../lib/templateDefinitions";

type Props = {
  titleEn: string;
  titleMm?: string;
  moduleCode: string;
  processType?: string;
};

export default function OperationalModuleDashboard({ titleEn, titleMm, moduleCode, processType }: Props) {
  const [lang, setLang] = useState<BritiumLang>(getBritiumLang());
  const [source, setSource] = useState("manual_excel");
  const [branch, setBranch] = useState("HQ");
  const [status, setStatus] = useState("");
  const [pickupId, setPickupId] = useState("");
  const [rules, setRules] = useState<any>({});
  const [events, setEvents] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (event: any) => setLang(event.detail?.lang === "mm" ? "mm" : "en");
    window.addEventListener("be-language-change", handler as EventListener);
    return () => window.removeEventListener("be-language-change", handler as EventListener);
  }, []);

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const ruleResult = await (supabase as any).rpc("be_logistics_get_field_rules");
        if (ruleResult.error) throw ruleResult.error;
        setRules(ruleResult.data || {});
        const eventResult = await (supabase as any).from("be_logistics_workflow_events").select("*").order("created_at", { ascending: false }).limit(50);
        if (eventResult.error) throw eventResult.error;
        setEvents(eventResult.data || []);
      } catch (err: any) {
        setError(err?.message || "Failed to load module data");
      }
    }
    load();
  }, [moduleCode]);

  const statuses = useMemo(() => {
    const list = rules.processStatusMaster || [];
    return processType ? list.filter((s: any) => String(s.process_type).toUpperCase() === processType.toUpperCase()) : list;
  }, [rules, processType]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    if (processType && String(event.process_type || "").toUpperCase() !== processType.toUpperCase()) return false;
    if (status && String(event.status_code || "").toUpperCase() !== status.toUpperCase()) return false;
    if (branch !== "HQ" && String(event.branch_code || "").toUpperCase() !== branch.toUpperCase()) return false;
    if (pickupId && String(event.pickup_id || "").toUpperCase().indexOf(pickupId.toUpperCase()) < 0) return false;
    return true;
  }), [events, processType, status, branch, pickupId]);

  return (
    <div className="be-page">
      <div className="be-page-header">
        <p className="be-eyebrow">{translate(lang, "Operational Module", "Operational Module")}</p>
        <h1>{translate(lang, titleEn, titleMm)}</h1>
        <p className="be-muted">{translate(lang, "Backend workflow, exception, branch, source, and pickup filters are connected.", "Backend workflow, exception, branch, source, and pickup filters are connected.")}</p>
      </div>
      <section className="be-panel" style={{ marginBottom: 18 }}>
        <h2>{translate(lang, "Module Filters", "Module Filters")}</h2>
        <div className="be-card-grid">
          <label><b>{translate(lang, "Inbound Source", "Inbound Source")}</b><select value={source} onChange={(e) => setSource(e.target.value)}>{DATA_SOURCES.map((s) => <option key={s.id} value={s.id}>{translate(lang, s.en, s.mm)}</option>)}</select></label>
          <label><b>{translate(lang, "Branch", "Branch")}</b><select value={branch} onChange={(e) => setBranch(e.target.value)}>{BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
          <label><b>{translate(lang, "Pickup ID", "Pickup ID")}</b><input value={pickupId} onChange={(e) => setPickupId(e.target.value)} placeholder="Pickup ID" /></label>
          <label><b>{translate(lang, "Status", "Status")}</b><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map((s: any) => <option key={s.status_code} value={s.status_code}>{lang === "mm" ? s.status_name_mm || s.status_code : s.status_name_en || s.status_code}</option>)}</select></label>
        </div>
      </section>
      {error && <div className="be-alert" style={{ margin: "0 0 18px" }}>{error}</div>}
      <div className="be-card-grid">
        <section className="be-card"><h3>{translate(lang, "Statuses", "Statuses")}</h3><p>{rules.processStatusMaster?.length || 0}</p></section>
        <section className="be-card"><h3>{translate(lang, "Exceptions", "Exceptions")}</h3><p>{rules.exceptionMaster?.length || 0}</p></section>
        <section className="be-card"><h3>{translate(lang, "Dropdowns", "Dropdowns")}</h3><p>{rules.dropdownValues?.length || 0}</p></section>
        <section className="be-card"><h3>{translate(lang, "Transitions", "Transitions")}</h3><p>{rules.workflowTransitions?.length || 0}</p></section>
      </div>
      <section className="be-panel">
        <h2>{translate(lang, "Recent Workflow Events", "Recent Workflow Events")}</h2>
        <div className="be-table-wrap">
          <table className="be-table">
            <thead><tr><th>Time</th><th>Process</th><th>Status</th><th>Exception</th><th>Pickup</th><th>Actor</th></tr></thead>
            <tbody>{filteredEvents.length ? filteredEvents.map((event) => <tr key={event.id}><td>{event.created_at ? new Date(event.created_at).toLocaleString() : "-"}</td><td>{event.process_type || "-"}</td><td>{event.status_code || "-"}</td><td>{event.exception_code || "-"}</td><td>{event.pickup_id || "-"}</td><td>{event.actor_email || event.actor_role || "-"}</td></tr>) : <tr><td colSpan={6}>No rows for current filters.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
