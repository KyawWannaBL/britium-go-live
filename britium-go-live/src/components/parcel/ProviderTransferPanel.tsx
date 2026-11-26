import { useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  canonical_delivery_way_id?: string;
  delivery_way_id: string;
  service_provider_code: string;
  provider_type?: string;
  provider_planning_gate: string;
  handover_origin_branch?: string;
  handover_location_code?: string;
  handover_location_name?: string;
  handoff_station_name?: string;
};

type Option = { code: string; label: string; type?: string };
type TransferOptions = { providers: Option[]; locations: Option[] };
type Capabilities = { draft_enabled: boolean; custody_enabled: boolean; mixed_trip_enabled: boolean };
type Group = { provider: string; branch: string; site: string; siteName: string; ids: string[] };

const readyGates = new Set([
  "PROVIDER_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN",
  "BRANCH_TRANSFER_SITE_VERIFIED_AWAITING_WAYPLAN",
]);

const field = "mt-1 block min-h-10 w-full rounded bg-white px-2 text-slate-950";
const button = "rounded bg-cyan-700 px-3 py-2 font-semibold text-white disabled:opacity-50";
const providerLabel = (code: string) => code === "H.TERMINAL DROP-OFF" ? "ဂိတ်ချ" : code;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  // The provider-transfer RPCs are installed independently of the generated client types.
  const { data, error } = await supabase.rpc(name as never, args as never);
  const response = data as { ok?: boolean; error?: string } | null;
  if (error || response?.ok === false || data == null) {
    throw new Error(error?.message || response?.error || "Provider transfer request failed.");
  }
  return data as T;
}

export default function ProviderTransferPanel({ onDraftCreated }: { onDraftCreated: () => void }) {
  const { role } = useAuth();
  const roleCode = role.toLowerCase().replaceAll("-", "_");
  const isSuperadmin = ["superadmin", "super_admin"].includes(roleCode);
  const isManager = isSuperadmin || ["operation_manager", "operations_manager"].includes(roleCode);
  const [rows, setRows] = useState<Row[]>([]);
  const [options, setOptions] = useState<TransferOptions>();
  const [flags, setFlags] = useState<Capabilities>();
  const [previewError, setPreviewError] = useState("");
  const [setupError, setSetupError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [groupKey, setGroupKey] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const [site, setSite] = useState({ provider: "", branch: "YGN", location: "", evidence: "" });
  const [newSite, setNewSite] = useState({ name: "", address: "", latitude: "", longitude: "" });
  const [release, setRelease] = useState({ draft: false, custody: false, evidence: "" });

  const groups = useMemo(() => {
    const result = new Map<string, Group>();
    for (const row of rows) {
      const { service_provider_code: provider, handover_origin_branch: branch, handover_location_code: site } = row;
      const id = row.canonical_delivery_way_id || row.delivery_way_id;
      if (!id || !readyGates.has(row.provider_planning_gate) || !provider || !branch || !site) continue;
      const key = JSON.stringify([provider, branch, site]);
      let group = result.get(key);
      if (!group) {
        group = { provider, branch, site, siteName: row.handover_location_name || site, ids: [] };
        result.set(key, group);
      }
      if (!group.ids.includes(id)) group.ids.push(id);
    }
    return result;
  }, [rows]);
  const group = groups.get(groupKey);
  const ids = selected.filter(id => group?.ids.includes(id));
  const needsSite = rows.filter(row => ["NEEDS_PROVIDER_TRANSFER_WAYPLAN", "NEEDS_BRANCH_TRANSFER_WAYPLAN"].includes(row.provider_planning_gate));
  const unmatchedGates = needsSite.filter(row => row.provider_type === "TERMINAL" && row.handoff_station_name);

  async function refresh() {
    const [preview, configuration] = await Promise.allSettled([
      rpc<{ provider_transfer_preview?: boolean; rows?: Row[] }>("be_warehouse_provider_transfer_preview_v1"),
      Promise.all([
        rpc<Capabilities>("be_provider_transfer_capabilities_v1"),
        rpc<TransferOptions>("be_provider_transfer_site_options_v1"),
      ]),
    ]);
    if (preview.status === "fulfilled" && preview.value.provider_transfer_preview === true) {
      setRows(preview.value.rows || []);
      setPreviewError("");
    } else {
      setRows([]);
      setPreviewError(preview.status === "rejected" ? preview.reason.message : "Verified transfer preview unavailable.");
    }
    if (configuration.status === "fulfilled") {
      const [current, approvedOptions] = configuration.value;
      setFlags(current);
      setOptions(approvedOptions);
      setRelease(old => ({ ...old, draft: current.draft_enabled, custody: current.custody_enabled }));
      setSetupError("");
    } else {
      setFlags(undefined);
      setOptions(undefined);
      setSetupError(configuration.reason.message);
    }
  }

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Provider transfer request failed."); }
    finally { setBusy(false); }
  }

  function approveSite(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm("Approve this physical site for the selected provider and origin branch?")) return;
    void act(async () => {
      if (site.location === "NEW") {
        await rpc("be_provider_transfer_register_site_v1", {
          p_provider_code: site.provider, p_origin_branch_code: site.branch,
          p_name: newSite.name.trim(), p_address: newSite.address.trim(),
          p_latitude: Number(newSite.latitude), p_longitude: Number(newSite.longitude),
          p_verification_note: site.evidence.trim(),
        });
        setNewSite({ name: "", address: "", latitude: "", longitude: "" });
      } else {
        await rpc("be_provider_handover_site_approve_v1", {
          p_provider_code: site.provider, p_origin_branch_code: site.branch,
          p_location_code: site.location, p_verification_note: site.evidence.trim(),
        });
      }
      setSite(old => ({ ...old, location: "", evidence: "" }));
      setMessage("Handover site approved.");
      await refresh();
    });
  }

  function applyRelease(event: FormEvent) {
    event.preventDefault();
    if (!window.confirm("Apply the provider-transfer release settings using the reviewed UAT evidence?")) return;
    void act(async () => {
      await rpc("be_provider_transfer_approve_release_v1", {
        p_draft: release.draft, p_custody: release.custody,
        p_mixed: flags?.mixed_trip_enabled && release.draft, p_evidence_ref: release.evidence.trim(),
      });
      setRelease(old => ({ ...old, evidence: "" }));
      setMessage("Release settings saved.");
      await refresh();
    });
  }

  function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!group || !ids.length || !flags?.draft_enabled) return;
    if (!window.confirm(`Create a draft for ${ids.length} parcel(s) to ${providerLabel(group.provider)} at ${group.siteName}?`)) return;
    void act(async () => {
      const result = await rpc<{ wayplan_id: string }>("be_provider_transfer_wayplan_draft_v1", {
        p_request_id: crypto.randomUUID(), p_provider_code: group.provider, p_origin_branch_code: group.branch,
        p_handover_location_code: group.site, p_delivery_way_ids: ids, p_vehicle_code: vehicle.trim(),
        p_driver_code: driver.trim(),
      });
      setSelected([]);
      setMessage(`Draft ${result.wayplan_id} created. Send it for Supervisor review.`);
      onDraftCreated();
      await refresh();
    });
  }

  if (!isManager) return null;
  return <details className="mb-4 rounded-xl border border-slate-700 bg-[#0B2133] p-4"
    onToggle={event => { if (event.currentTarget.open && !flags && !busy) void act(refresh); }}>
    <summary className="cursor-pointer font-bold text-slate-100">Provider and branch handovers</summary>
    <div className="my-3 flex flex-wrap items-center gap-3">
      <button type="button" className={button} disabled={busy} onClick={() => void act(refresh)}>
        {busy ? "Working…" : "Refresh transfer queue"}
      </button>
      {flags && <span className="text-sm text-slate-300">
        Drafts {flags.draft_enabled ? "enabled" : "disabled"} · Custody {flags.custody_enabled ? "enabled" : "disabled"}
      </span>}
    </div>
    {setupError && <p role="alert" className="mb-2 text-sm text-amber-300">{setupError}</p>}
    {previewError && <p role="alert" className="mb-2 text-sm text-amber-300">{previewError}</p>}
    {message && <p role="status" className="mb-2 text-sm text-cyan-200">{message}</p>}

    {options && <form onSubmit={approveSite} className="mb-4 grid gap-3 rounded border border-slate-700 p-3 sm:grid-cols-2">
      <h3 className="font-semibold sm:col-span-2">Approve a verified receiving site</h3>
      <label>Provider<select required className={field} value={site.provider} onChange={e => setSite({ ...site, provider: e.target.value })}>
        <option value="">Choose provider</option>
        {options.providers.map(p => <option key={p.code} value={p.code}>{p.type === "TERMINAL" ? providerLabel(p.code) : p.label}</option>)}
      </select></label>
      <label>Origin branch<select className={field} value={site.branch} onChange={e => setSite({ ...site, branch: e.target.value })}>
        <option value="YGN">Yangon</option><option value="MDY">Mandalay</option><option value="NPT">Naypyitaw</option>
      </select></label>
      <label>Physical receiving site<select required className={field} value={site.location} onChange={e => setSite({ ...site, location: e.target.value })}>
        <option value="">Choose a geocoded service location</option>
        <option value="NEW">Register a new receiving site</option>
        {options.locations.map(p => <option key={p.code} value={p.code}>{p.label} ({p.code})</option>)}
      </select></label>
      {site.location === "NEW" && <>
        <p className="text-sm text-slate-300 sm:col-span-2">
          Use the verified receiving address and map coordinates. For ဂိတ်ချ, enter the recorded gate name.
        </p>
        <label>Site name<input required className={field} value={newSite.name}
          onChange={e => setNewSite({ ...newSite, name: e.target.value })} /></label>
        <label>Physical address<input required className={field} value={newSite.address}
          onChange={e => setNewSite({ ...newSite, address: e.target.value })} /></label>
        <label>Latitude<input required type="number" min="9" max="29" step="any" className={field}
          value={newSite.latitude} onChange={e => setNewSite({ ...newSite, latitude: e.target.value })} /></label>
        <label>Longitude<input required type="number" min="92" max="102" step="any" className={field}
          value={newSite.longitude} onChange={e => setNewSite({ ...newSite, longitude: e.target.value })} /></label>
      </>}
      <label>Site verification reference<input required minLength={8} className={field} value={site.evidence}
        onChange={e => setSite({ ...site, evidence: e.target.value })} /></label>
      <button className={button} disabled={busy}>Approve site</button>
    </form>}

    {isSuperadmin && flags && <form onSubmit={applyRelease} className="mb-4 flex flex-wrap gap-3 rounded border border-slate-700 p-3">
      <h3 className="w-full font-semibold">Provider-transfer release</h3>
      <label><input type="checkbox" checked={release.draft} onChange={e => setRelease({ ...release, draft: e.target.checked })} /> Draft creation</label>
      <label><input type="checkbox" checked={release.custody} onChange={e => setRelease({ ...release, custody: e.target.checked })} /> Custody confirmation</label>
      <label className="w-full">Reviewed UAT and rollback reference<input className={field}
        required={release.draft || release.custody} minLength={release.draft || release.custody ? 20 : undefined}
        value={release.evidence} onChange={e => setRelease({ ...release, evidence: e.target.value })} /></label>
      <button className={button} disabled={busy}>Save release settings</button>
    </form>}

    {needsSite.length > 0 && <p className="my-2 text-sm text-amber-200">{needsSite.length} received parcel(s) need a matching approved site.</p>}
    {unmatchedGates.length > 0 && <p className="my-2 text-sm text-amber-200">
      ဂိတ်ချ sites to check · {[...new Set(unmatchedGates.map(row => row.handoff_station_name))].join(", ")}
    </p>}

    {flags?.draft_enabled && !previewError && <form onSubmit={createDraft} className="grid gap-3 rounded border border-slate-700 p-3 sm:grid-cols-2">
      <h3 className="font-semibold sm:col-span-2">Create a transfer Wayplan draft</h3>
      <label className="sm:col-span-2">Verified transfer group<select className={field} value={groupKey} required
        onChange={e => { setGroupKey(e.target.value); setSelected([]); }}>
        <option value="">Choose provider and site</option>
        {[...groups].map(([key, item]) => <option key={key} value={key}>
          {providerLabel(item.provider)} / {item.branch} / {item.siteName} ({item.ids.length})
        </option>)}
      </select></label>
      <label>Vehicle code<input required className={field} value={vehicle} onChange={e => setVehicle(e.target.value)} /></label>
      <label>Driver code<input required className={field} value={driver} onChange={e => setDriver(e.target.value)} /></label>
      {group && <fieldset className="max-h-44 overflow-auto rounded border border-slate-600 p-2 sm:col-span-2">
        <legend>Available parcels · {ids.length}/75 selected</legend>
        {group.ids.map(id => <label className="mr-4 inline-flex items-center gap-1 text-sm" key={id}>
          <input type="checkbox" checked={ids.includes(id)} disabled={busy || (ids.length >= 75 && !ids.includes(id))}
            onChange={e => setSelected(e.target.checked ? [...ids, id] : ids.filter(value => value !== id))} />{id}
        </label>)}
      </fieldset>}
      <button className={button} disabled={busy || !ids.length}>Create draft</button>
    </form>}
  </details>;
}
