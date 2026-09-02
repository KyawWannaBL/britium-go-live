// BRITIUM_DRAGGABLE_LOCATION_MAP_EDITOR_V12_7
// BRITIUM_BILINGUAL_LOCATION_REVIEW_UI_V12_6
// BRITIUM_AUTOMATIC_POSTAL_MAP_WORKFLOW_V11
import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { convertMyanmarAddressToEnglish } from "@/lib/myanmarAddressConverter";
import { coordinateMatchesTownship, mapboxStaticLocationUrl, resolveDeliveryLocation, saveDeliveryLocation, validMyanmarCoordinate, verifiedAddressLocation, type DeliveryLocation } from "@/lib/deliveryLocationService";
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
  const interactiveMapContainer = useRef<HTMLDivElement | null>(null);
  const interactiveMap = useRef<mapboxgl.Map | null>(null);
  const draggableMarker = useRef<mapboxgl.Marker | null>(null);
  const mapboxToken = useMemo(() => String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN || "").trim(), []);
  const english = useMemo(() => convertMyanmarAddressToEnglish(query || address, township), [query, address, township]);
  const postal = useMemo(() => resolvePostalCode(query || address, township), [query, address, township]);
  const mapUrl = candidate ? mapboxStaticLocationUrl(candidate) : "";

  async function load() {
    if (!deliveryWayId) return;
    const verified = verifiedAddressLocation(address, township);
    if (verified) {
      const corrected: DeliveryLocation = {
        deliveryWayId,
        ...verified,
        originalAddress: address,
        englishAddress: convertMyanmarAddressToEnglish(address, township),
        township: "South Okkalapa Township",
        postalCode: "1109001",
        postalMatchLevel: "EXACT_QUARTER",
        matchLevel: "ADDRESS_EXACT",
        confidence: 1,
        coordinateSource: "MANAGEMENT_POSTAL_VALIDATED_ADDRESS",
        reviewStatus: "ACCEPTED",
      };
      setCandidate(corrected);
      setLat(String(corrected.latitude));
      setLng(String(corrected.longitude));
      setMessage("Verified South Okkalapa Ward 3 location restored; stale provider coordinates were ignored.");
      try { await saveDeliveryLocation(supabase, corrected); } catch { /* Display the verified pin even if persistence is temporarily unavailable. */ }
      return;
    }
    const { data } = await supabase.rpc("be_delivery_location_get_v10", { p_delivery_way_id: deliveryWayId });
    const row = data?.location;
    if (!row) return;
    if (!coordinateMatchesTownship(township, row.latitude, row.longitude)) {
      setCandidate(null);
      setLat("");
      setLng("");
      setManualOpen(true);
      setMessage(`The previously saved pin is outside ${township || "the selected township"} and has been rejected. Searching again with township and postal boundaries…`);
      const key = `${deliveryWayId}|${address}|${township}`;
      lastAutoKey.current = key;
      void find(address, true);
      return;
    }
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
  }, [deliveryWayId, address, township]);

  useEffect(() => {
    const key = `${deliveryWayId}|${address}|${township}`;
    if (!deliveryWayId || address.trim().length < 5 || lastAutoKey.current === key || candidate) return;
    const timer = window.setTimeout(() => { lastAutoKey.current = key; void find(address, true); }, 900);
    return () => window.clearTimeout(timer);
  }, [deliveryWayId, address, township, candidate]);


  function setManualMapCoordinate(latitude: number, longitude: number, action: "dragged" | "clicked") {
    if (!validMyanmarCoordinate(longitude, latitude)) {
      setMessage("The selected map point is outside Myanmar or invalid.");
      return;
    }
    const nextLat = Number(latitude.toFixed(6));
    const nextLng = Number(longitude.toFixed(6));
    setLat(nextLat.toFixed(6));
    setLng(nextLng.toFixed(6));
    setManualOpen(true);
    setCandidate((current) => current ? {
      ...current,
      latitude: nextLat,
      longitude: nextLng,
      matchLevel: "MANUAL",
      confidence: 1,
      coordinateSource: "DATA_ENTRY_MANUAL_MAP_EDIT",
      reviewStatus: "MANUAL_REVIEW",
    } : current);
    setMessage(`Map pin ${action} manually. This is a draft only; click Apply coordinates to replace the saved location and share the corrected pin with Wayplan.`);
  }

  useEffect(() => {
    if (!mapboxToken || !candidate || !interactiveMapContainer.current) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: interactiveMapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [candidate.longitude, candidate.latitude],
      zoom: 17,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), "top-right");

    const marker = new mapboxgl.Marker({ color: "#f59e0b", draggable: true })
      .setLngLat([candidate.longitude, candidate.latitude])
      .addTo(map);

    marker.on("dragend", () => {
      const point = marker.getLngLat();
      setManualMapCoordinate(point.lat, point.lng, "dragged");
    });

    map.on("click", (event) => {
      marker.setLngLat(event.lngLat);
      setManualMapCoordinate(event.lngLat.lat, event.lngLat.lng, "clicked");
    });

    map.on("load", () => {
      map.resize();
      map.getCanvas().style.cursor = "crosshair";
    });

    interactiveMap.current = map;
    draggableMarker.current = marker;

    return () => {
      draggableMarker.current = null;
      interactiveMap.current = null;
      marker.remove();
      map.remove();
    };
  }, [deliveryWayId, Boolean(candidate), mapboxToken]);

  useEffect(() => {
    if (!validMyanmarCoordinate(lng, lat)) return;
    draggableMarker.current?.setLngLat([Number(lng), Number(lat)]);
  }, [lat, lng]);

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
      if (found.reviewStatus === "MANUAL_REVIEW" || found.matchLevel === "WARD_APPROXIMATE") {
        // v12.6: review-only results must remain unshared, but hiding the pin made every
        // ward/street fallback look broken. Show the candidate and prefill coordinates so
        // an operator can visually review it, then require explicit Apply coordinates.
        setCandidate(found);
        setLat(String(found.latitude));
        setLng(String(found.longitude));
        setManualOpen(true);
        const reason=String((found as any).reviewReason||"");
        if(reason==="TOWNSHIP_MISMATCH") {
          setMessage(`${found.matchLevel.replaceAll("_", " ")} candidate found, but its township does not match ${township || "the selected township"}. The pin is shown for review only and has NOT been shared with Wayplan.`);
        } else if(reason==="POSTAL_EVIDENCE_MISMATCH") {
          setMessage(`${found.matchLevel.replaceAll("_", " ")} candidate found, but postal/ward evidence is incomplete. Review the pin and click Apply coordinates only if it is correct. It has NOT been shared with Wayplan.`);
        } else {
          setMessage(`${found.matchLevel.replaceAll("_", " ")} candidate found. Review the map and coordinates, then click Apply coordinates only if the pin is correct. It has NOT been shared with Wayplan yet.`);
        }
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
      const verified = verifiedAddressLocation(query || address, township);
      if (verified) {
        const distance = Math.hypot((Number(lat) - verified.latitude) * 111_320, (Number(lng) - verified.longitude) * 106_000);
        if (distance > 750) {
          setMessage("These coordinates are outside the verified South Okkalapa Ward 3 area and were not saved.");
          return;
        }
      }
      if (!coordinateMatchesTownship(township, lat, lng)) {
        setMessage(`The selected point is outside ${township || "the selected township"} and was not saved. Choose an exact point inside the correct township.`);
        return;
      }
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
      {candidate && <span className={`rounded-full px-3 py-1 text-[11px] font-black ${candidate.reviewStatus === "ACCEPTED" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-200"}`}>{candidate.matchLevel.replaceAll("_", " ")}{candidate.reviewStatus === "MANUAL_REVIEW" ? " · REVIEW" : ""}</span>}
    </div>
    <div className="grid gap-3 xl:grid-cols-[.9fr_1.1fr]">
      <div>
        <div className="grid gap-2 lg:grid-cols-[1fr_auto]"><input value={query} onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void find();}}} placeholder="Myanmar/English address, landmark, street, or coordinates" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><button type="button" onClick={()=>void find()} disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black text-[#061524] disabled:opacity-50">{busy?<Loader2 className="mr-1 inline animate-spin" size={14}/>:<Search className="mr-1 inline" size={14}/>} Check location</button></div>
        <div className="mt-2 rounded-lg border border-fuchsia-700/40 bg-fuchsia-950/20 p-2 text-xs text-fuchsia-100"><b>English:</b> {english || "—"}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Postal code:</b> {postal.postalCode || "Not published for this ward"}{postal.postalCode&&<div className="mt-1 text-[11px] text-slate-400">{[postal.quarter,postal.township,postal.region].filter(Boolean).join(", ")}<br/>{[postal.quarterMm,postal.townshipMm,postal.regionMm].filter(Boolean).join("၊ ")}</div>}</div><div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Postal match:</b> {postal.matchLevel.replaceAll("_", " ")}</div></div>
        {message && <div className={`mt-2 text-xs ${candidate?.reviewStatus === "ACCEPTED" ? "text-emerald-300" : "text-amber-200"}`}>{candidate?.reviewStatus === "ACCEPTED"?<CheckCircle2 size={14} className="mr-1 inline"/>:<AlertTriangle size={14} className="mr-1 inline"/>}{message}</div>}
        <button type="button" onClick={()=>setManualOpen((open)=>!open)} className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200"><span>{candidate ? "Review or correct coordinates" : "Manual location review"}</span><ChevronDown size={14} className={manualOpen?"rotate-180":""}/></button>
        {manualOpen && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input aria-label="Latitude" type="number" step="0.000001" value={lat} onChange={(event)=>setLat(event.target.value)} placeholder="Latitude" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><input aria-label="Longitude" type="number" step="0.000001" value={lng} onChange={(event)=>setLng(event.target.value)} placeholder="Longitude" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><button type="button" onClick={()=>void apply()} disabled={busy || !validMyanmarCoordinate(lng,lat)} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-black text-[#061524] disabled:opacity-40">Apply coordinates</button></div>}
      </div>
      <div>
        {candidate && mapboxToken ? <div>
          <div className="relative">
            <div ref={interactiveMapContainer} className="h-[320px] min-h-[230px] w-full overflow-hidden rounded-lg border border-cyan-600/60"/>
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-amber-400/60 bg-[#061524]/90 px-3 py-2 text-[11px] font-black text-amber-200 shadow-xl">DRAG THE ORANGE PIN OR CLICK THE EXACT DROP-OFF POINT</div>
            {validMyanmarCoordinate(lng, lat) && <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-cyan-400/40 bg-[#061524]/90 px-3 py-2 text-[11px] font-bold text-cyan-100">{Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}</div>}
          </div>
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[11px] font-semibold text-amber-100">Manual map edits are draft-only. Drag the pin or click the exact gate/building, verify the coordinates, then click <b>Apply coordinates</b>. Wayplan is updated only after Apply.</div>
        </div> : mapUrl ? <img src={mapUrl} alt={`Mapbox drop-off location for ${deliveryWayId}`} className="aspect-[16/7] min-h-[230px] w-full rounded-lg border border-cyan-600/60 object-cover"/> : <div className="grid min-h-[230px] place-items-center rounded-lg border border-dashed border-slate-600 px-6 text-center text-sm text-slate-400">{busy ? "Locating drop-off automatically..." : "Accepted and review-only candidates appear here. Review-only pins are never shared with Wayplan until Apply coordinates is clicked."}</div>}
      </div>
    </div>
  </div>;
}
