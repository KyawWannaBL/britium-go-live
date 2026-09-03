// BRITIUM_DRAGGABLE_LOCATION_MAP_EDITOR_V12_7
// BRITIUM_BILINGUAL_LOCATION_REVIEW_UI_V12_6
// BRITIUM_AUTOMATIC_POSTAL_MAP_WORKFLOW_V11
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, MapPin, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { convertMyanmarAddressToEnglish } from "@/lib/myanmarAddressConverter";
import {
  coordinateMatchesTownship,
  googleMapsAddressOpenUrl,
  googleMapsAddressUrl,
  googleMapsLocationUrl,
  loadGoogleMaps,
  resolveDeliveryLocation,
  saveDeliveryLocation,
  validMyanmarCoordinate,
  verifiedAddressLocation,
  type DeliveryLocation,
} from "@/lib/deliveryLocationService";
import { resolvePostalCode } from "@/lib/postalCodeResolver";

const AUTO_LOCATION_CONCURRENCY = 3;
let activeAutomaticLocations = 0;
const automaticLocationWaiters: Array<() => void> = [];

async function withAutomaticLocationSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeAutomaticLocations >= AUTO_LOCATION_CONCURRENCY) {
    await new Promise<void>((resolve) => automaticLocationWaiters.push(resolve));
  }
  activeAutomaticLocations += 1;
  try {
    return await task();
  } finally {
    activeAutomaticLocations -= 1;
    automaticLocationWaiters.shift()?.();
  }
}

export type DataEntryLocationResolution = "PENDING" | "SEARCHING" | "REVIEW_REQUIRED" | "SYNCED";

type DataEntryLocationEditorProps = {
  deliveryWayId: string;
  address: string;
  township: string;
  autoResolveDelayMs?: number;
  deferInteractiveMap?: boolean;
  reloadToken?: number;
  onResolutionChange?: (status: DataEntryLocationResolution) => void;
};

function addressKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[၊။,./\\\-_()\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function DataEntryLocationEditor({
  deliveryWayId,
  address,
  township,
  autoResolveDelayMs = 900,
  deferInteractiveMap = false,
  reloadToken = 0,
  onResolutionChange,
}: DataEntryLocationEditorProps) {
  const [query, setQuery] = useState(address || "");
  const [candidate, setCandidate] = useState<DeliveryLocation | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mapError, setMapError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const lastAutoKey = useRef("");
  const requestSequence = useRef(0);
  const resolutionCallback = useRef(onResolutionChange);
  const interactiveMapContainer = useRef<HTMLDivElement | null>(null);
  const interactiveMap = useRef<any>(null);
  const draggableMarker = useRef<any>(null);
  const googleMapsConfigured = useMemo(() => Boolean(String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim()), []);
  const english = useMemo(() => convertMyanmarAddressToEnglish(query || address, township), [query, address, township]);
  const postal = useMemo(() => resolvePostalCode(query || address, township), [query, address, township]);
  const mapUrl = candidate ? googleMapsLocationUrl(candidate) : "";
  const addressMapUrl = useMemo(() => googleMapsAddressUrl(query || address, township), [query, address, township]);
  const openAddressMapUrl = useMemo(() => googleMapsAddressOpenUrl(query || address, township), [query, address, township]);

  useEffect(() => {
    resolutionCallback.current = onResolutionChange;
  }, [onResolutionChange]);

  function reportResolution(status: DataEntryLocationResolution) {
    resolutionCallback.current?.(status);
  }

  async function load() {
    const requestId = ++requestSequence.current;
    if (!deliveryWayId) {
      setMessage("Location details are ready for review. The location can be saved after the Delivery Way ID is allocated.");
      reportResolution("PENDING");
      return;
    }
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
      if (requestId !== requestSequence.current) return;
      setCandidate(corrected);
      setLat(String(corrected.latitude));
      setLng(String(corrected.longitude));
      setMessage("Verified South Okkalapa Ward 3 location restored; stale provider coordinates were ignored.");
      try {
        await saveDeliveryLocation(supabase, corrected);
        reportResolution("SYNCED");
      } catch {
        reportResolution("REVIEW_REQUIRED");
        setManualOpen(true);
        setMessage("The verified pin is shown, but it could not be synchronized. Click Apply coordinates before saving this parcel.");
      }
      return;
    }
    const { data, error } = await supabase.rpc("be_delivery_location_get_v10", { p_delivery_way_id: deliveryWayId });
    if (requestId !== requestSequence.current) return;
    if (error) {
      setManualOpen(true);
      setMessage(`Saved location could not be loaded: ${error.message}`);
      reportResolution("REVIEW_REQUIRED");
      return;
    }
    if (data?.ok === false) {
      setManualOpen(true);
      setMessage(data?.message || "Saved location could not be loaded.");
      reportResolution("REVIEW_REQUIRED");
      return;
    }
    const row = data?.location;
    if (!row) {
      setMessage("No saved location exists yet. Check the address to create Location Details.");
      reportResolution("PENDING");
      return;
    }
    if (row.address_original && addressKey(row.address_original) !== addressKey(address)) {
      setCandidate(null);
      setLat("");
      setLng("");
      setManualOpen(true);
      setMessage("The saved pin belongs to an older address for this parcel. Searching again for the newly imported address…");
      reportResolution("SEARCHING");
      const key = `${deliveryWayId}|${address}|${township}`;
      lastAutoKey.current = key;
      void find(address, true);
      return;
    }
    const savedMatchLevel = String(row.match_level || "").toUpperCase();
    const savedSource = String(row.coordinate_source || "").toUpperCase();
    const savedIsApproximate = ["WARD_APPROXIMATE", "STREET_APPROXIMATE"].includes(savedMatchLevel)
      || /MAPBOX|WARD_APPROXIMATE|STREET_APPROXIMATE/.test(savedSource);
    const savedCoordinateMatches = await withAutomaticLocationSlot(() => coordinateMatchesTownship(township, row.latitude, row.longitude));
    if (requestId !== requestSequence.current) return;
    if (!savedCoordinateMatches || savedIsApproximate) {
      setCandidate(null);
      setLat("");
      setLng("");
      setManualOpen(true);
      setMessage(savedIsApproximate
        ? "The previously saved Mapbox/approximate pin has been rejected. Searching again with Google Places…"
        : `The previously saved pin is outside ${township || "the selected township"} and has been rejected. Searching again with Google Places…`);
      reportResolution("SEARCHING");
      const key = `${deliveryWayId}|${address}|${township}`;
      lastAutoKey.current = key;
      void find(address, true);
      return;
    }
    setCandidate({ deliveryWayId, latitude: Number(row.latitude), longitude: Number(row.longitude), label: row.provider_label || row.address_english || row.address_original, originalAddress: row.address_original || address, englishAddress: row.address_english || "", township: row.township || township, postalCode: row.postal_code || "", postalMatchLevel: row.postal_match_level || "UNRESOLVED", matchLevel: row.match_level, confidence: Number(row.confidence || 0), coordinateSource: row.coordinate_source, reviewStatus: row.review_status });
    setLat(String(row.latitude));
    setLng(String(row.longitude));
    if (row.review_status === "ACCEPTED") {
      reportResolution("SYNCED");
    } else {
      setManualOpen(true);
      setMessage("The saved pin is still review-only. Verify it and click Apply coordinates before saving this parcel.");
      reportResolution("REVIEW_REQUIRED");
    }
  }

  useEffect(() => {
    requestSequence.current += 1;
    setBusy(false);
    setCandidate(null);
    setLat("");
    setLng("");
    setMessage("");
    setMapError("");
    lastAutoKey.current = "";
    reportResolution("PENDING");
    void load();
  }, [deliveryWayId, address, township, reloadToken]);

  useEffect(() => {
    setQuery(address || "");
  }, [deliveryWayId, address]);

  useEffect(() => {
    const key = `${deliveryWayId}|${address}|${township}`;
    if (!deliveryWayId || address.trim().length < 5 || lastAutoKey.current === key || candidate) return;
    const timer = window.setTimeout(() => { lastAutoKey.current = key; void find(address, true); }, Math.max(0, autoResolveDelayMs));
    return () => window.clearTimeout(timer);
  }, [deliveryWayId, address, township, candidate, autoResolveDelayMs]);


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
    reportResolution("REVIEW_REQUIRED");
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
    if (!googleMapsConfigured || !candidate || (deferInteractiveMap && !manualOpen) || !interactiveMapContainer.current) return;

    let disposed = false;
    let map: any = null;
    let marker: any = null;
    const listeners: any[] = [];
    const fallbackMessage = "Interactive map is unavailable on this device. Use the static preview or enter coordinates manually.";

    setMapError("");

    void loadGoogleMaps().then((maps) => {
      if (disposed) return;
      if (!maps || !interactiveMapContainer.current) {
        setMapError(fallbackMessage);
        return;
      }
      const position = { lat: candidate.latitude, lng: candidate.longitude };
      map = new maps.Map(interactiveMapContainer.current, {
        center: position,
        zoom: 18,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        gestureHandling: "greedy",
      });
      marker = new maps.Marker({ map, position, draggable: true, title: "Exact drop-off point" });
      listeners.push(marker.addListener("dragend", (event: any) => {
        const point = event?.latLng;
        if (point) setManualMapCoordinate(point.lat(), point.lng(), "dragged");
      }));
      listeners.push(map.addListener("click", (event: any) => {
        const point = event?.latLng;
        if (!point) return;
        marker.setPosition(point);
        setManualMapCoordinate(point.lat(), point.lng(), "clicked");
      }));
      interactiveMap.current = map;
      draggableMarker.current = marker;
    }).catch((error) => {
      if (disposed) return;
      console.warn("Interactive Google location map unavailable:", error);
      setMapError(fallbackMessage);
    });

    return () => {
      disposed = true;
      listeners.forEach((listener) => listener?.remove?.());
      draggableMarker.current = null;
      interactiveMap.current = null;
      marker?.setMap?.(null);
    };
  }, [deliveryWayId, Boolean(candidate), deferInteractiveMap, manualOpen, googleMapsConfigured]);

  useEffect(() => {
    if (!validMyanmarCoordinate(lng, lat)) return;
    draggableMarker.current?.setPosition?.({ lat: Number(lat), lng: Number(lng) });
    interactiveMap.current?.panTo?.({ lat: Number(lat), lng: Number(lng) });
  }, [lat, lng]);

  async function find(value = query, automatic = false) {
    const requestId = ++requestSequence.current;
    setBusy(true);
    setMapError("");
    reportResolution("SEARCHING");
    setMessage(automatic ? "Automatically locating this drop-off…" : "Searching address…");
    try {
      const resolve = () => resolveDeliveryLocation({ deliveryWayId, address: value || address, township });
      const resolved = automatic ? await withAutomaticLocationSlot(resolve) : await resolve();
      const found = resolved ? { ...resolved, originalAddress: address } : null;
      if (requestId !== requestSequence.current) return;
      if (!found) {
        setCandidate(null);
        setManualOpen(true);
        setMessage("No reliable address, POI, street, ward or neighborhood match. Manual review is required.");
        reportResolution("REVIEW_REQUIRED");
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
        reportResolution("REVIEW_REQUIRED");
        const reason=String(found.reviewReason||"");
        if(reason==="TOWNSHIP_MISMATCH") {
          setMessage(`${found.matchLevel.replaceAll("_", " ")} candidate found, but its township does not match ${township || "the selected township"}. The pin is shown for review only and has NOT been shared with Wayplan.`);
        } else if(reason==="POSTAL_EVIDENCE_MISMATCH") {
          setMessage(`${found.matchLevel.replaceAll("_", " ")} candidate found, but postal/ward evidence is incomplete. Review the pin and click Apply coordinates only if it is correct. It has NOT been shared with Wayplan.`);
        } else {
          setMessage(`${found.matchLevel.replaceAll("_", " ")} candidate found. Review the map and coordinates, then click Apply coordinates only if the pin is correct. It has NOT been shared with Wayplan yet.`);
        }
        return;
      }
      if (deliveryWayId) await saveDeliveryLocation(supabase, found);
      setCandidate(found);
      setLat(String(found.latitude));
      setLng(String(found.longitude));
      setManualOpen(false);
      setMessage(deliveryWayId
        ? `${found.matchLevel.replaceAll("_", " ")} saved automatically and shared with Wayplan.`
        : `${found.matchLevel.replaceAll("_", " ")} found. Preview only until the Delivery Way ID is allocated.`);
      reportResolution(deliveryWayId ? "SYNCED" : "REVIEW_REQUIRED");
    } catch (error: any) {
      if (requestId !== requestSequence.current) return;
      setManualOpen(true);
      const failureMessage = error?.message || "Location search failed.";
      setMessage(failureMessage);
      setMapError(failureMessage);
      reportResolution("REVIEW_REQUIRED");
    } finally {
      if (requestId === requestSequence.current) setBusy(false);
    }
  }

  async function apply() {
    if (!deliveryWayId) {
      setMessage("The Delivery Way ID must be allocated before coordinates can be saved.");
      reportResolution("REVIEW_REQUIRED");
      return;
    }
    if (!validMyanmarCoordinate(lng, lat)) {
      setMessage("Latitude/longitude is outside Myanmar or invalid.");
      reportResolution("REVIEW_REQUIRED");
      return;
    }
    setBusy(true);
    reportResolution("SEARCHING");
    try {
      const verified = verifiedAddressLocation(query || address, township);
      if (verified) {
        const distance = Math.hypot((Number(lat) - verified.latitude) * 111_320, (Number(lng) - verified.longitude) * 106_000);
        if (distance > 750) {
          setMessage("These coordinates are outside the verified South Okkalapa Ward 3 area and were not saved.");
          reportResolution("REVIEW_REQUIRED");
          return;
        }
      }
      if (!(await coordinateMatchesTownship(township, lat, lng))) {
        setMessage(`The selected point is outside ${township || "the selected township"} and was not saved. Choose an exact point inside the correct township.`);
        reportResolution("REVIEW_REQUIRED");
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
      reportResolution("SYNCED");
    } catch (error: any) {
      setMessage(error?.message || "Coordinates could not be applied.");
      reportResolution("REVIEW_REQUIRED");
    } finally {
      setBusy(false);
    }
  }

  return <div data-location-details="true" className="mt-4 rounded-xl border border-cyan-400/50 bg-[#061524] p-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-300"><MapPin size={15}/> Location Details / တည်နေရာအသေးစိတ်</div>
      {candidate && <span className={`rounded-full px-3 py-1 text-[11px] font-black ${candidate.reviewStatus === "ACCEPTED" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-200"}`}>{candidate.matchLevel.replaceAll("_", " ")}{candidate.reviewStatus === "MANUAL_REVIEW" ? " · REVIEW" : ""}</span>}
    </div>
    <div className="grid gap-3 xl:grid-cols-[.9fr_1.1fr]">
      <div>
        <div className="grid gap-2 lg:grid-cols-[1fr_auto]"><input value={query} onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();void find();}}} placeholder="Myanmar/English address, landmark, street, or coordinates" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><button type="button" onClick={()=>void find()} disabled={busy} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-black text-[#061524] disabled:opacity-50">{busy?<Loader2 className="mr-1 inline animate-spin" size={14}/>:<Search className="mr-1 inline" size={14}/>} Check location</button></div>
        <div className="mt-2 rounded-lg border border-fuchsia-700/40 bg-fuchsia-950/20 p-2 text-xs text-fuchsia-100"><b>English:</b> {english || "—"}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Original address:</b> {query || address || "—"}</div>
          <div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Township:</b> {township || candidate?.township || "—"}{postal.matchLevel !== "UNRESOLVED" && postal.township && <div className="mt-1 text-[11px] text-slate-400">Postal directory: {postal.township}<br/>{postal.townshipMm}</div>}</div>
          <div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Postal code:</b> {postal.postalCode || (postal.matchLevel === "TOWNSHIP_ONLY" ? "Enter a recognized ward / quarter" : "Township or ward not recognized")}{postal.postalCode&&<div className="mt-1 text-[11px] text-slate-400">{[postal.quarter,postal.township,postal.region].filter(Boolean).join(", ")}<br/>{[postal.quarterMm,postal.townshipMm,postal.regionMm].filter(Boolean).join("၊ ")}</div>}</div>
          <div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Postal match:</b> {postal.matchLevel.replaceAll("_", " ")}</div>
          <div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Coordinates:</b> {validMyanmarCoordinate(lng,lat) ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : "Not resolved"}</div>
          <div className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200"><b className="text-cyan-300">Source:</b> {candidate?.coordinateSource || "Not resolved"}</div>
        </div>
        {message && <div className={`mt-2 text-xs ${candidate?.reviewStatus === "ACCEPTED" ? "text-emerald-300" : "text-amber-200"}`}>{candidate?.reviewStatus === "ACCEPTED"?<CheckCircle2 size={14} className="mr-1 inline"/>:<AlertTriangle size={14} className="mr-1 inline"/>}{message}</div>}
        <button type="button" onClick={()=>setManualOpen((open)=>!open)} className="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-700 px-3 py-2 text-xs font-black text-slate-200"><span>{candidate ? "Review or correct coordinates" : "Manual location review"}</span><ChevronDown size={14} className={manualOpen?"rotate-180":""}/></button>
        {manualOpen && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input aria-label="Latitude" type="number" step="0.000001" value={lat} onChange={(event)=>{setLat(event.target.value);reportResolution("REVIEW_REQUIRED");}} placeholder="Latitude" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><input aria-label="Longitude" type="number" step="0.000001" value={lng} onChange={(event)=>{setLng(event.target.value);reportResolution("REVIEW_REQUIRED");}} placeholder="Longitude" className="rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm text-black"/><button type="button" onClick={()=>void apply()} disabled={busy || !validMyanmarCoordinate(lng,lat)} className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-black text-[#061524] disabled:opacity-40">Apply coordinates</button></div>}
      </div>
      <div>
        {candidate && googleMapsConfigured && !mapError && (!deferInteractiveMap || manualOpen) ? <div>
          <div className="relative">
            <div ref={interactiveMapContainer} className="h-[320px] min-h-[230px] w-full overflow-hidden rounded-lg border border-cyan-600/60"/>
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-amber-400/60 bg-[#061524]/90 px-3 py-2 text-[11px] font-black text-amber-200 shadow-xl">DRAG THE ORANGE PIN OR CLICK THE EXACT DROP-OFF POINT</div>
            {validMyanmarCoordinate(lng, lat) && <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-cyan-400/40 bg-[#061524]/90 px-3 py-2 text-[11px] font-bold text-cyan-100">{Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}</div>}
          </div>
          <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-[11px] font-semibold text-amber-100">Manual map edits are draft-only. Drag the pin or click the exact gate/building, verify the coordinates, then click <b>Apply coordinates</b>. Wayplan is updated only after Apply.</div>
        </div> : mapUrl ? <div><iframe src={mapUrl} title={`Google Maps drop-off location for ${deliveryWayId}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="aspect-[16/7] min-h-[230px] w-full rounded-lg border border-cyan-600/60"/>{mapError && <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-100"><AlertTriangle size={14} className="mr-1 inline"/>{mapError}</div>}</div> : addressMapUrl ? <div>
          <iframe src={addressMapUrl} title={`Google Maps address search for ${deliveryWayId || "new parcel"}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="aspect-[16/7] min-h-[230px] w-full rounded-lg border border-cyan-600/60"/>
          <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-100"><AlertTriangle size={14} className="mr-1 inline"/>Address-search preview only: no coordinates are saved from this preview. Verify that Google shows the exact gate/building inside {township || "the selected township"}. If needed, open Google Maps, copy its latitude/longitude here, then click <b>Apply coordinates</b>. {openAddressMapUrl && <a href={openAddressMapUrl} target="_blank" rel="noreferrer" className="ml-1 font-black text-cyan-300 underline">Open in Google Maps</a>}</div>
          {mapError && <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-100">{mapError}</div>}
        </div> : <div className="grid min-h-[230px] place-items-center rounded-lg border border-dashed border-slate-600 px-6 text-center text-sm text-slate-400">{busy ? "Locating drop-off automatically..." : mapError || "Enter an address to preview it in Google Maps. No pin is shared with Wayplan until it is validated."}</div>}
      </div>
    </div>
  </div>;
}
