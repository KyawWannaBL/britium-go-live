// BRITIUM_AUTOMATIC_POSTAL_MAP_WORKFLOW_V11
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { convertMyanmarAddressToEnglish } from "@/lib/myanmarAddressConverter";
import { mapboxStaticLocationUrl, resolveDeliveryLocation, saveDeliveryLocation, validMyanmarCoordinate, type DeliveryLocation } from "@/lib/deliveryLocationService";
import { resolvePostalCode } from "@/lib/postalCodeResolver";

export default function DataEntryLocationEditor({ deliveryWayId, address, township }: { deliveryWayId: string; address: string; township: string }) {
  const [query, setQuery] = useState(address || "");
  const [candidate, setCandidate] = useState<DeliveryLocation | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const lastAutoKey = useRef("");
  const english = useMemo(() => convertMyanmarAddressToEnglish(query || address, township), [query, address, township]);
  const postal = useMemo(() => resolvePostalCode(query || address, township), [query, address, township]);
  const mapUrl = candidate ? mapboxStaticLocationUrl(candidate) : "";

  async function load() {
    if (!deliveryWayId) return;
    const { data } = await supabase.rpc("be_delivery_location_get_v10", { p_delivery_way_id: deliveryWayId });
    const row = data?.location;
    if (!row) return;
    setCandidate({ deliveryWayId, latitude: Number(row.latitude), longitude: Number(row.longitude), label: row.provider_label || row.address_english || row.address_original, originalAddress: row.address_original || address, englishAddress: row.address_english || "", township: row.township || township, postalCode: row.postal_code || "", postalMatchLevel: row.postal_match_level || "UNRESOLVED", matchLevel: row.match_level, confidence: Number(row.confidence || 0), coordinateSource: row.coordinate_source, reviewStatus: row.review_status });
    setLat(String(row.latitude));
    setLng(String(row.longitude));
  }

  useEffect(() => {
    setQuery(address || "");
    setCandidate(null);
    setLat("");
    setLng("");
    setMessage("");
    lastAutoKey.current = "";
    void load();
  }, [deliveryWayId]);

  useEffect(() => {
    const key = `${deliveryWayId}|${address}|${township}`;
    if (!deliveryWayId || address.trim().length < 5 || lastAutoKey.current === key || candidate) return;
    const timer = window.setTimeout(() => { lastAutoKey.current = key; void find(address, true); }, 900);
    return () => window.clearTimeout(timer);
  }, [deliveryWayId, address, township, candidate]);

  async function find(value = query, automatic = false) {
    setBusy(true);
    setMessage(automatic ? "Automatically locating this drop-off…" : "Searching address…");
    try {
      const found = await resolveDeliveryLocation({ deliveryWayId, address: value || address, township });
      if (!found) {
        setCandidate(null);
        setManualOpen(true);
        setMessage("No reliable address, POI, street, ward or neighborhood match. Manual review is required.");
        return;
      }
      await saveDeliveryLocation(supabase, found);
      setCandidate(found);
      setLat(String(found.latitude));
      setLng(String(found.longitude));
      setManualOpen(false);
      setMessage(`${found.matchLevel.replaceAll("_", " ")} saved automatically and shared with Wayplan.`);
    } catch (error: any) {
      setManualOpen(true);
      setMessage(error?.message || "Location search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!validMyanmarCoordinate(lng, lat)) {
      setMessage("Latitude/longitude is outside Myanmar or invalid.");
      return;
    }
    setBusy(true);
    try {
      const next: DeliveryLocation = {
        ...(candidate || { deliveryWayId, label: query || address, originalAddress: address, englishAddress: english, township, postalCode: postal.postalCode, postalMatchLevel: postal.matchLevel, matchLevel: "MANUAL", confidence: 1, coordinateSource: "DATA_ENTRY_MANUAL_COORDINATE", reviewStatus: "ACCEPTED" }),
        latitude: Number(lat), longitude: Number(lng), matchLevel: "MANUAL", confidence: 1, coordinateSource: "DATA_ENTRY_MANUAL_COORDINATE", reviewStatus: "ACCEPTED",
      };
      await saveDeliveryLocation(supabase, next);
      setCandidate(next);
      setManualOpen(false);
      setMessage("Manual coordinates applied, map updated, and location shared with Wayplan.");
    } catch (error: any) {
      setMessage(error?.message || "Coordinates could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-3 rounded-xl border border-cyan-500/30 bg-[#061524] p-3 md:col-span-2 xl:col-span-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-black text-cyan-300"><MapPin size={15}/> Drop-off location</div>
      {candidate && <span className="rounded-full bg-emerald-950 px-3 py-1 text-[11px] font-black text-emerald-300">{candidate.matchLevel.replaceAll("_", " ")}</span>}
    </div>
    <div className="grid gap-3 xl:grid-cols-[.9fr_1.1fr]">
      <div>
        <div className="grid gap-2 lg:grid-cols-[1fr_auto]"><input value={query} onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void find();}}} placeholder="Myanmar/English address, landmark, street, or coordinates" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><button type="button" onClick={()=>void find()} disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black text-[#061524] disabled:opacity-50">{busy?<Loader2 className="mr-1 inline animate-spin" size={14}/>:<Search className="mr-1 inline" size={14}/>} Check location</button></div>
        <div className="mt-2 rounded-lg border border-fuchsia-700/40 bg-fuchsia-950/20 p-2 text-xs text-fuchsia-100"><b>English:</b> {english || "—"}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Postal code:</b> {postal.postalCode || "Not published for this ward"}</div><div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Postal match:</b> {postal.matchLevel.replaceAll("_", " ")}</div></div>
        {message && <div className={`mt-2 text-xs ${candidate ? "text-emerald-300" : "text-amber-200"}`}>{candidate?<CheckCircle2 size={14} className="mr-1 inline"/>:<AlertTriangle size={14} className="mr-1 inline"/>}{message}</div>}
        <button type="button" onClick={()=>setManualOpen((open)=>!open)} className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200"><span>{candidate ? "Review or correct coordinates" : "Manual location review"}</span><ChevronDown size={14} className={manualOpen?"rotate-180":""}/></button>
        {manualOpen && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input aria-label="Latitude" type="number" step="0.000001" value={lat} onChange={(event)=>setLat(event.target.value)} placeholder="Latitude" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><input aria-label="Longitude" type="number" step="0.000001" value={lng} onChange={(event)=>setLng(event.target.value)} placeholder="Longitude" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><button type="button" onClick={()=>void apply()} disabled={busy || !validMyanmarCoordinate(lng,lat)} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-black text-[#061524] disabled:opacity-40">Apply coordinates</button></div>}
      </div>
      <div>{mapUrl ? <img src={mapUrl} alt={`Mapbox drop-off location for ${deliveryWayId}`} className="aspect-[16/7] min-h-[230px] w-full rounded-lg border border-cyan-600/60 object-cover"/> : <div className="grid min-h-[230px] place-items-center rounded-lg border border-dashed border-slate-600 px-6 text-center text-sm text-slate-400">{busy ? "Locating drop-off automatically…" : "The map appears automatically after a reliable address, street, ward, landmark, or coordinate is found."}</div>}</div>
    </div>
  </div>;
}
