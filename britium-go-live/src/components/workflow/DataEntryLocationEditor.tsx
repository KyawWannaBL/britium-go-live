// BRITIUM_DRAGGABLE_LOCATION_MAP_EDITOR_V12_7
// BRITIUM_BILINGUAL_LOCATION_REVIEW_UI_V12_6
// BRITIUM_AUTOMATIC_POSTAL_MAP_WORKFLOW_V11
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Crosshair, Loader2, MapPin, Minus, MousePointer2, Plus, Search, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { convertMyanmarAddressToEnglish } from "@/lib/myanmarAddressConverter";
import {
  coordinateMatchesTownship,
  googleMapsAddressUrl,
  googleMapsLocationUrl,
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

export type DataEntryLocationResolution = "PENDING" | "SEARCHING" | "REVIEW_REQUIRED" | "SYNCED" | "NOT_REQUIRED";

type DataEntryLocationEditorProps = {
  pickupId: string;
  parcelSequence: number;
  deliveryWayId: string;
  address: string;
  township: string;
  ward?: string;
  postalCode?: string;
  externalCandidate?: DeliveryLocation | null;
  autoResolveDelayMs?: number;
  deferInteractiveMap?: boolean;
  deferAutomaticResolution?: boolean;
  externalResolutionStatus?: DataEntryLocationResolution;
  enabled?: boolean;
  disabledReason?: string;
  reloadToken?: number;
  onResolutionChange?: (status: DataEntryLocationResolution) => void;
  onCandidateChange?: (candidate: DeliveryLocation | null) => void;
  onMapFocusChange?: (focused: boolean) => void;
};

function addressKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[၊။,./\\\-_()\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function clampMapLatitude(value: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, value));
}

function latLngToWorld(latitude: number, longitude: number, zoom: number) {
  const size = 256 * Math.pow(2, zoom);
  const x = ((longitude + 180) / 360) * size;
  const sin = Math.sin((clampMapLatitude(latitude) * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size;
  return { x, y, size };
}

function worldToLatLng(x: number, y: number, zoom: number) {
  const size = 256 * Math.pow(2, zoom);
  const longitude = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { latitude, longitude };
}

function offsetMapCoordinate(
  center: { latitude: number; longitude: number },
  pixelX: number,
  pixelY: number,
  zoom: number,
) {
  const world = latLngToWorld(center.latitude, center.longitude, zoom);
  return worldToLatLng(world.x + pixelX, world.y + pixelY, zoom);
}

let leafletRuntimePromise: Promise<any> | null = null;

function loadLeafletRuntime() {
  if (typeof window === "undefined") return Promise.reject(new Error("Leaflet requires a browser."));
  const existing = (window as any).L;
  if (existing) return Promise.resolve(existing);
  if (leafletRuntimePromise) return leafletRuntimePromise;

  leafletRuntimePromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-britium-leaflet="true"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/map-lib/leaflet.css";
      link.dataset.britiumLeaflet = "true";
      document.head.appendChild(link);
    }

    const existingScript = document.querySelector('script[data-britium-leaflet="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve((window as any).L), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Leaflet runtime failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "/map-lib/leaflet.js";
    script.async = true;
    script.dataset.britiumLeaflet = "true";
    script.onload = () => (window as any).L ? resolve((window as any).L) : reject(new Error("Leaflet runtime was not available after loading."));
    script.onerror = () => reject(new Error("Leaflet runtime failed to load."));
    document.head.appendChild(script);
  });

  return leafletRuntimePromise;
}

export default function DataEntryLocationEditor({
  pickupId,
  parcelSequence,
  deliveryWayId,
  address,
  township,
  ward = "",
  postalCode = "",
  externalCandidate = null,
  autoResolveDelayMs = 900,
  deferInteractiveMap = false,
  deferAutomaticResolution = false,
  externalResolutionStatus = "PENDING",
  enabled = true,
  disabledReason = "Google Map is not required for this delivery route.",
  reloadToken = 0,
  onResolutionChange,
  onCandidateChange,
  onMapFocusChange,
}: DataEntryLocationEditorProps) {
  const [query, setQuery] = useState(address || "");
  const [candidate, setCandidate] = useState<DeliveryLocation | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mapError, setMapError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapVisualMode, setMapVisualMode] = useState<"NORMAL"|"EARTH"|"STREET">("NORMAL");
  const lastAutoKey = useRef("");
  const requestSequence = useRef(0);
  const operatorEditedRef = useRef(false);
  const resolutionCallback = useRef(onResolutionChange);
  const candidateCallback = useRef(onCandidateChange);
  const fallbackMapContainer = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletTileLayerRef = useRef<any>(null);
  const leafletMarkerRef = useRef<any>(null);
  const fallbackCenterRef = useRef<{latitude:number;longitude:number}|null>(null);
  const mapPointers = useRef(new Map<number,{x:number;y:number;startX:number;startY:number;moved:boolean}>());
  const pinchDistanceRef = useRef<number | null>(null);
  const [fallbackMapCenter, setFallbackMapCenter] = useState<{latitude:number;longitude:number}|null>(null);
  const [fallbackMapZoom, setFallbackMapZoom] = useState(18);
  const [tileLoadState, setTileLoadState] = useState<"IDLE"|"LOADING"|"READY"|"ERROR">("IDLE");
  const english = useMemo(() => convertMyanmarAddressToEnglish(query || address, township), [query, address, township]);
  const postal = useMemo(() => resolvePostalCode(query || address, township), [query, address, township]);
  const mapUrl = candidate ? googleMapsLocationUrl(candidate) : "";
  const addressMapUrl = useMemo(() => googleMapsAddressUrl(query || address, township), [query, address, township]);
  const visualMapQuery = useMemo(() => {
    if (candidate && validMyanmarCoordinate(candidate.longitude, candidate.latitude)) {
      return `${Number(candidate.latitude).toFixed(6)},${Number(candidate.longitude).toFixed(6)}`;
    }
    if (validMyanmarCoordinate(lng, lat)) {
      return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
    }
    return [query || address, township, "Myanmar"].filter(Boolean).join(", ");
  }, [candidate?.latitude, candidate?.longitude, lat, lng, query, address, township]);
  const normalMapViewUrl = useMemo(
    () => visualMapQuery ? `https://maps.google.com/maps?q=${encodeURIComponent(visualMapQuery)}&z=18&output=embed` : "",
    [visualMapQuery],
  );
  const earthMapViewUrl = useMemo(
    () => visualMapQuery ? `https://maps.google.com/maps?q=${encodeURIComponent(visualMapQuery)}&t=k&z=19&output=embed` : "",
    [visualMapQuery],
  );
  useEffect(() => {
    fallbackCenterRef.current = fallbackMapCenter;
  }, [fallbackMapCenter?.latitude, fallbackMapCenter?.longitude]);

  useEffect(() => {
    resolutionCallback.current = onResolutionChange;
  }, [onResolutionChange]);

  useEffect(() => {
    candidateCallback.current = onCandidateChange;
  }, [onCandidateChange]);

  useEffect(() => {
    candidateCallback.current?.(candidate);
  }, [candidate]);

  // V97: the Google pin is the coordinate source of truth.
  // Any valid pin produced by search, map click, marker drag, restored location,
  // or another location workflow is immediately mirrored into the Latitude /
  // Longitude text boxes so operators never have to copy coordinates manually.
  useEffect(() => {
    if (!candidate || !validMyanmarCoordinate(candidate.longitude, candidate.latitude)) return;
    const nextLat = Number(candidate.latitude).toFixed(6);
    const nextLng = Number(candidate.longitude).toFixed(6);
    setLat((current) => current === nextLat ? current : nextLat);
    setLng((current) => current === nextLng ? current : nextLng);
  }, [candidate?.latitude, candidate?.longitude]);

  function reportResolution(status: DataEntryLocationResolution) {
    resolutionCallback.current?.(status);
  }

  async function load() {
    const requestId = ++requestSequence.current;
    if (!enabled) {
      setMessage(disabledReason);
      reportResolution("NOT_REQUIRED");
      return;
    }
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
      setLat(Number(corrected.latitude).toFixed(6));
      setLng(Number(corrected.longitude).toFixed(6));
      candidateCallback.current?.(corrected);
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
      setManualOpen(true);
      setMessage("No saved location exists yet. Creating the first Location Details candidate from the current address…");
      reportResolution("SEARCHING");
      const key = `${deliveryWayId}|${address}|${township}`;
      lastAutoKey.current = key;
      void find(address, true);
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
    const savedMapboxExact = row.review_status === "ACCEPTED"
      && ["ADDRESS_EXACT", "POI_EXACT"].includes(savedMatchLevel)
      && /^MAPBOX_(?:POSTAL_VALIDATED|TOWNSHIP_EXACT_VALIDATED)_(?:ADDRESS_EXACT|POI_EXACT)$/.test(savedSource);
    const savedDefaultCoordinate = row.review_status === "ACCEPTED"
      && (
        (savedMatchLevel === "POSTAL_DEFAULT" && savedSource === "POSTAL_WARD_DEFAULT_V136")
        || (savedMatchLevel === "TOWNSHIP_DEFAULT" && savedSource === "TOWNSHIP_DEFAULT_V136")
      );
    const savedIsApproximate = ["WARD_APPROXIMATE", "STREET_APPROXIMATE"].includes(savedMatchLevel)
      || /WARD_APPROXIMATE|STREET_APPROXIMATE/.test(savedSource);
    const savedCoordinateMatches = savedMapboxExact || savedDefaultCoordinate
      ? validMyanmarCoordinate(row.longitude, row.latitude)
      : await withAutomaticLocationSlot(() => coordinateMatchesTownship(township, row.latitude, row.longitude));
    if (requestId !== requestSequence.current) return;
    if (!savedCoordinateMatches || savedIsApproximate) {
      setCandidate(null);
      setLat("");
      setLng("");
      setManualOpen(true);
      setMessage(savedIsApproximate
        ? "The previously saved approximate pin has been rejected. Searching again with Google/Mapbox location providers…"
        : `The previously saved pin is outside ${township || "the selected township"} and has been rejected. Searching again with Google Places…`);
      reportResolution("SEARCHING");
      const key = `${deliveryWayId}|${address}|${township}`;
      lastAutoKey.current = key;
      void find(address, true);
      return;
    }
    const restoredCandidate: DeliveryLocation = { deliveryWayId, latitude: Number(row.latitude), longitude: Number(row.longitude), label: row.provider_label || row.address_english || row.address_original, originalAddress: row.address_original || address, englishAddress: row.address_english || "", township: row.township || township, postalCode: row.postal_code || "", postalMatchLevel: row.postal_match_level || "UNRESOLVED", matchLevel: row.match_level, confidence: Number(row.confidence || 0), coordinateSource: row.coordinate_source, reviewStatus: row.review_status };
    setCandidate(restoredCandidate);
    setLat(Number(row.latitude).toFixed(6));
    setLng(Number(row.longitude).toFixed(6));
    candidateCallback.current?.(restoredCandidate);
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
    operatorEditedRef.current = false;
    setBusy(false);
    setCandidate(null);
    setLat("");
    setLng("");
    setMessage("");
    setMapError("");
    setMapExpanded(false);
    onMapFocusChange?.(false);
    setFallbackMapCenter(null);
    setFallbackMapZoom(18);
    lastAutoKey.current = "";
    if (deferAutomaticResolution && enabled) {
      setMessage("Location validation is running in the controlled background queue.");
      return;
    }
    reportResolution(enabled ? "PENDING" : "NOT_REQUIRED");
    void load();
  }, [deliveryWayId, address, township, ward, postalCode, enabled, disabledReason, reloadToken, deferAutomaticResolution]);

  useEffect(() => {
    if (!deferAutomaticResolution || operatorEditedRef.current) return;
    if (externalCandidate && validMyanmarCoordinate(externalCandidate.longitude, externalCandidate.latitude)) {
      setCandidate(externalCandidate);
      setLat(Number(externalCandidate.latitude).toFixed(6));
      setLng(Number(externalCandidate.longitude).toFixed(6));
      setMessage(externalResolutionStatus==="SYNCED"
        ?"Coordinates were validated automatically or applied through the consolidated location-review workbook."
        :"A suggested pin is ready. You can review it, apply it, or use SKIP REVIEW to accept it immediately.");
      return;
    }
    if (!candidate) {
      setMessage(externalResolutionStatus==="SYNCED"
        ?"Coordinates were validated automatically or applied through the consolidated location-review workbook."
        :externalResolutionStatus==="REVIEW_REQUIRED"
          ?"This result genuinely needs review. Open this parcel's map only when an on-screen correction is needed."
          :"Location validation is running in the controlled background queue.");
    }
  }, [deferAutomaticResolution, externalResolutionStatus, externalCandidate]);

  useEffect(() => {
    setQuery(address || "");
  }, [deliveryWayId, address]);

  useEffect(() => {
    const key = `${deliveryWayId}|${address}|${township}`;
    if (deferAutomaticResolution || !enabled || !deliveryWayId || address.trim().length < 5 || lastAutoKey.current === key || candidate) return;
    const timer = window.setTimeout(() => { lastAutoKey.current = key; void find(address, true); }, Math.max(0, autoResolveDelayMs));
    return () => window.clearTimeout(timer);
  }, [deliveryWayId, address, township, candidate, autoResolveDelayMs, enabled, deferAutomaticResolution]);


  function syncPinCoordinates(
    latitude: number,
    longitude: number,
    action: "dragged" | "clicked" | "search" | "restored"
  ) {
    if (!validMyanmarCoordinate(longitude, latitude)) {
      setMessage("The selected Google Map point is outside Myanmar or invalid.");
      return null;
    }

    const nextLat = Number(latitude.toFixed(6));
    const nextLng = Number(longitude.toFixed(6));
    const next: DeliveryLocation = {
      ...(candidate || {
        deliveryWayId,
        label: query || address || "Selected drop-off",
        originalAddress: address,
        englishAddress: english,
        township,
        postalCode: postal.postalCode,
        postalMatchLevel: postal.matchLevel,
      }),
      deliveryWayId,
      latitude: nextLat,
      longitude: nextLng,
      matchLevel: action === "search" || action === "restored"
        ? (candidate?.matchLevel || "MANUAL")
        : "MANUAL",
      confidence: candidate?.confidence || 1,
      coordinateSource: action === "search"
        ? (candidate?.coordinateSource || "GOOGLE_SEARCH")
        : action === "restored"
          ? (candidate?.coordinateSource || "SAVED_LOCATION")
          : "DATA_ENTRY_MANUAL_MAP_EDIT",
      reviewStatus: action === "search" || action === "restored"
        ? (candidate?.reviewStatus || "MANUAL_REVIEW")
        : "MANUAL_REVIEW",
    };

    // V99: write all three consumers synchronously from the same Google pin event.
    // This prevents the marker, visible textboxes and parent Data Entry row from drifting.
    setLat(nextLat.toFixed(6));
    setLng(nextLng.toFixed(6));
    setCandidate(next);
    candidateCallback.current?.(next);

    return { nextLat, nextLng, next };
  }

  async function autoPersistManualPin(next: DeliveryLocation, action: "dragged" | "clicked") {
    if (!deliveryWayId) {
      reportResolution("REVIEW_REQUIRED");
      setMessage("Coordinates were copied from the Google pin, but a Delivery Way ID is required before they can be synchronized.");
      return;
    }

    try {
      const verified = verifiedAddressLocation(query || address, township);
      if (verified) {
        const distance = Math.hypot(
          (Number(next.latitude) - verified.latitude) * 111_320,
          (Number(next.longitude) - verified.longitude) * 106_000
        );
        if (distance > 750) {
          reportResolution("REVIEW_REQUIRED");
          setMessage("The selected Google pin is outside the verified address area. Coordinates remain visible for correction but were not synchronized.");
          return;
        }
      }

      const insideTownship = await coordinateMatchesTownship(township, next.latitude, next.longitude);
      if (!insideTownship) {
        reportResolution("REVIEW_REQUIRED");
        setMessage(`The selected Google pin is outside ${township || "the selected township"}. Coordinates remain visible, but were not synchronized.`);
        return;
      }

      const accepted: DeliveryLocation = {
        ...next,
        latitude: Number(next.latitude),
        longitude: Number(next.longitude),
        matchLevel: "MANUAL",
        confidence: 1,
        coordinateSource: "DATA_ENTRY_GOOGLE_PIN_CONFIRMED",
        reviewStatus: "ACCEPTED",
      };

      await saveDeliveryLocation(supabase, accepted);
      setCandidate(accepted);
      candidateCallback.current?.(accepted);
      reportResolution("SYNCED");
      setMessage(`Google pin ${action} and synchronized automatically: ${Number(accepted.latitude).toFixed(6)}, ${Number(accepted.longitude).toFixed(6)}. This parcel location is now ready for Save/Waybill.`);
    } catch (error:any) {
      console.error("Automatic Google pin synchronization failed", error);
      reportResolution("REVIEW_REQUIRED");
      setMessage(error?.message || "Coordinates were copied from the Google pin but could not be synchronized. Use Apply coordinates to retry.");
    }
  }

  function setManualMapCoordinate(latitude: number, longitude: number, action: "dragged" | "clicked") {
    operatorEditedRef.current = true;
    const synced = syncPinCoordinates(latitude, longitude, action);
    if (!synced) return;
    setManualOpen(true);
    reportResolution("REVIEW_REQUIRED");
    setMessage(`Coordinates copied automatically from the ${action} Google Map pin: ${synced.nextLat.toFixed(6)}, ${synced.nextLng.toFixed(6)}. Validating and synchronizing this pin now…`);
    void autoPersistManualPin(synced.next, action);
  }

  function setMapFocus(focused: boolean) {
    setMapExpanded(focused);
    onMapFocusChange?.(focused);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.dataEntryMapFocus = focused ? "true" : "false";
      window.dispatchEvent(new CustomEvent("britium:data-entry-map-focus", { detail: { focused } }));
    }
  }

  async function openRelocationMap() {
    setManualOpen(true);
    setMapFocus(true);
    setMapError("");
    window.setTimeout(() => fallbackMapContainer.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 80);

    if (candidate && validMyanmarCoordinate(candidate.longitude, candidate.latitude)) {
      setFallbackMapCenter({
        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),
      });
      setMessage("Street Map View is ready. Move the map to the exact gate/building, press SET PIN HERE, then Apply coordinates.");
      return;
    }

    if (validMyanmarCoordinate(lng, lat)) {
      setFallbackMapCenter({ latitude: Number(lat), longitude: Number(lng) });
      setMessage("Street Map View is ready from the current coordinates. Move to the exact drop-off point, press SET PIN HERE, then Apply coordinates.");
      return;
    }

    const fallback = township.toLowerCase().includes("mandalay")
      ? { latitude: 21.9588, longitude: 96.0891 }
      : township.toLowerCase().includes("naypy") || township.includes("နေပြည်")
        ? { latitude: 19.7633, longitude: 96.0785 }
        : { latitude: 16.8409, longitude: 96.1735 };

    setFallbackMapCenter(fallback);
    setMessage("No reliable auto pin was available. The interactive map is centered on the delivery area. Drag to pan, zoom if needed, then click the exact drop-off point.");
  }

  useEffect(() => {
    if (!candidate || !validMyanmarCoordinate(candidate.longitude, candidate.latitude)) return;
    setFallbackMapCenter({
      latitude: Number(candidate.latitude),
      longitude: Number(candidate.longitude),
    });
  }, [candidate?.latitude, candidate?.longitude]);

  function leafletTileTemplate() {
    if (mapVisualMode === "EARTH") return "/map-tiles/earth/{z}/{x}/{y}.jpg";
    if (mapVisualMode === "STREET") return "/map-tiles/street/{z}/{x}/{y}.png";
    return "/map-tiles/normal/{z}/{x}/{y}.png";
  }

  function mapModeAttribution() {
    if (mapVisualMode === "EARTH") return "Satellite imagery © Esri and contributors";
    if (mapVisualMode === "EARTH") return "Satellite imagery © Esri and contributors";
    return "© OpenStreetMap contributors";
  }

  function setPinAtMapCenter() {
    const markerPoint = leafletMarkerRef.current?.getLatLng?.();
    const leafletCenter = leafletMapRef.current?.getCenter?.();
    const center = markerPoint
      ? { latitude: Number(markerPoint.lat), longitude: Number(markerPoint.lng) }
      : leafletCenter
        ? { latitude: Number(leafletCenter.lat), longitude: Number(leafletCenter.lng) }
        : (fallbackCenterRef.current || fallbackMapCenter);
    if (!center) return;
    setManualMapCoordinate(center.latitude, center.longitude, "clicked");
    setMapError("");
    setMessage(`Drop-off pin set: ${center.latitude.toFixed(6)}, ${center.longitude.toFixed(6)}. Verify the point, then click Apply coordinates.`);
  }

  function moveMapByPixels(horizontalPixels: number, verticalPixels: number) {
    const center = fallbackCenterRef.current || fallbackMapCenter;
    if (!center) return;
    const next = offsetMapCoordinate(center, horizontalPixels, verticalPixels, fallbackMapZoom);
    if (!validMyanmarCoordinate(next.longitude, next.latitude)) return;
    fallbackCenterRef.current = next;
    setFallbackMapCenter(next);
  }

  function nudgeFallbackMap(horizontalPixels: number, verticalPixels: number) {
    const map = leafletMapRef.current;
    if (map?.panBy) {
      map.panBy([horizontalPixels, verticalPixels], { animate: true, duration: 0.18 });
      return;
    }
    moveMapByPixels(horizontalPixels, verticalPixels);
  }

  useEffect(() => {
    if (!mapExpanded || !fallbackMapContainer.current) return;

    let cancelled = false;
    const initial = fallbackMapCenter
      || (candidate && validMyanmarCoordinate(candidate.longitude, candidate.latitude)
        ? { latitude: Number(candidate.latitude), longitude: Number(candidate.longitude) }
        : validMyanmarCoordinate(lng, lat)
          ? { latitude: Number(lat), longitude: Number(lng) }
          : { latitude: 16.8409, longitude: 96.1735 });

    setTileLoadState("LOADING");
    setMapError("");

    void loadLeafletRuntime()
      .then((L) => {
        if (cancelled || !fallbackMapContainer.current) return;

        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
          leafletMapRef.current = null;
          leafletTileLayerRef.current = null;
          leafletMarkerRef.current = null;
        }

        const map = L.map(fallbackMapContainer.current, {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: false,
          inertia: true,
          dragging: true,
          touchZoom: true,
          scrollWheelZoom: true,
          doubleClickZoom: true,
          boxZoom: false,
          keyboard: true,
        }).setView([initial.latitude, initial.longitude], Math.max(11, Math.min(20, fallbackMapZoom)));

        const tileLayer = L.tileLayer(leafletTileTemplate(), {
          minZoom: 11,
          maxZoom: 20,
          tileSize: 256,
          updateWhenIdle: false,
          updateWhenZooming: false,
          keepBuffer: 3,
          attribution: mapModeAttribution(),
        });

        tileLayer.on("load", () => {
          setTileLoadState("READY");
          setMapError("");
        });
        tileLayer.on("tileerror", () => {
          setTileLoadState("ERROR");
          setMapError("Map imagery failed to load. Retry or switch map view.");
        });

        tileLayer.addTo(map);
        leafletMapRef.current = map;
        leafletTileLayerRef.current = tileLayer;

        const marker = L.marker([initial.latitude, initial.longitude], {
          draggable: true,
          autoPan: true,
          title: "Drag to exact drop-off point",
        }).addTo(map);
        leafletMarkerRef.current = marker;

        const syncMarker = (latlng:any, messageText:string) => {
          const next = { latitude: Number(latlng.lat), longitude: Number(latlng.lng) };
          fallbackCenterRef.current = next;
          setFallbackMapCenter(next);
          setManualMapCoordinate(next.latitude, next.longitude, "clicked");
          setMessage(messageText);
        };

        marker.on("dragend", () => {
          syncMarker(marker.getLatLng(), "Pin moved. Review the exact gate/building, then click Apply coordinates.");
        });

        map.on("zoomend", () => setFallbackMapZoom(Math.round(map.getZoom())));
        map.on("click", (event: any) => {
          marker.setLatLng(event.latlng);
          syncMarker(event.latlng, "Pin moved to the tapped location. Review it, then click Apply coordinates.");
        });

        window.setTimeout(() => map.invalidateSize(true), 60);
      })
      .catch((error) => {
        setTileLoadState("ERROR");
        setMapError(error?.message || "Interactive map engine failed to load.");
      });

    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletTileLayerRef.current = null;
        leafletMarkerRef.current = null;
      }
    };
  }, [mapExpanded, mapVisualMode]);

  async function find(value = query, automatic = false) {
    if (!enabled && !manualOpen) {
      setMessage(disabledReason);
      reportResolution("NOT_REQUIRED");
      return;
    }
    const requestId = ++requestSequence.current;
    setBusy(true);
    setMapError("");
    reportResolution("SEARCHING");
    setMessage(automatic ? "Automatically locating this drop-off…" : "Searching address…");
    try {
      const resolve = () => resolveDeliveryLocation({
        deliveryWayId,
        address: value || address,
        township,
        ward,
        postalCode,
        client: supabase,
      });
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
        setLat(Number(found.latitude).toFixed(6));
        setLng(Number(found.longitude).toFixed(6));
        candidateCallback.current?.(found);
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
      setLat(Number(found.latitude).toFixed(6));
      setLng(Number(found.longitude).toFixed(6));
      candidateCallback.current?.(found);
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
    if (!enabled && !manualOpen) {
      setMessage(disabledReason);
      reportResolution("NOT_REQUIRED");
      return;
    }
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

  async function skipReview() {
    if (!deliveryWayId) {
      setMessage("The Delivery Way ID must be allocated before location review can be skipped.");
      reportResolution("REVIEW_REQUIRED");
      return;
    }

    setBusy(true);
    setMessage("Preparing the current location pin for the authorized review skip…");
    try {
      let pin = candidate;
      if ((!pin || !validMyanmarCoordinate(pin.longitude, pin.latitude))
          && externalCandidate
          && validMyanmarCoordinate(externalCandidate.longitude, externalCandidate.latitude)) {
        pin = externalCandidate;
        setCandidate(externalCandidate);
        setLat(Number(externalCandidate.latitude).toFixed(6));
        setLng(Number(externalCandidate.longitude).toFixed(6));
        candidateCallback.current?.(externalCandidate);
      }
      if (!pin || !validMyanmarCoordinate(pin.longitude, pin.latitude)) {
        const resolved = await resolveDeliveryLocation({
          deliveryWayId,
          address: query || address,
          township,
          ward,
          postalCode,
          client: supabase,
        });
        if (!resolved || !validMyanmarCoordinate(resolved.longitude, resolved.latitude)) {
          throw new Error("No valid suggested Google pin is available yet. Retry location sync or select a pin on the map first.");
        }
        pin = { ...resolved, originalAddress: address };
        setCandidate(pin);
        setLat(Number(pin.latitude).toFixed(6));
        setLng(Number(pin.longitude).toFixed(6));
        candidateCallback.current?.(pin);
      }

      if (!window.confirm("Accept the currently displayed pin without further visual review? This decision will be recorded in the audit trail.")) {
        setMessage("Review skip cancelled. The suggested pin remains available for normal review.");
        reportResolution("REVIEW_REQUIRED");
        return;
      }

      setMessage("Recording the authorized location-review skip…");
      const response=await (supabase as any).rpc("be_delivery_location_review_batch_v29",{p_payload:{
        request_id:`LOCATION_REVIEW_SKIP:${deliveryWayId}:${Date.now()}`,
        rows:[{
          delivery_way_id:deliveryWayId,
          pickup_id:pickupId,
          parcel_sequence:parcelSequence,
          action:"SKIP_REVIEW",
          latitude:pin.latitude,
          longitude:pin.longitude,
          township,
          delivery_address:query||address,
          reason:"Operator explicitly accepted the suggested pin without further visual map review.",
        }],
      }});
      if(response.error) throw response.error;
      if(!response.data?.ok) throw new Error(response.data?.errors?.[0]?.message||"Location review could not be skipped.");
      const accepted={...pin,reviewStatus:"ACCEPTED" as const,matchLevel:"MANUAL" as const,coordinateSource:"DATA_ENTRY_MANUAL_REVIEW_SKIPPED"};
      setCandidate(accepted);
      setManualOpen(false);
      setMessage("Suggested pin accepted without further review. The skip decision was audited and the coordinates are ready for Wayplan.");
      reportResolution("SYNCED");
    } catch(error:any) {
      setMessage(error?.message||"Location review could not be skipped.");
      reportResolution("REVIEW_REQUIRED");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled && !manualOpen) {
    return <div data-location-details="true" data-location-not-required-v19="true" className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={18}/>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200">Location Details · Map not required for routing</div>
            <div className="mt-1 text-xs leading-5 text-emerald-100">{disabledReason}</div>
            <div className="mt-1 text-[11px] text-slate-300">Township: {township||"—"} · Automatic routing does not require a pin, but an operator may still set or correct the exact location manually.</div>
          </div>
        </div>
        <button type="button" onClick={()=>void openRelocationMap()} disabled={busy} className="rounded-lg border border-cyan-300/60 bg-[#12314a] px-4 py-2.5 text-[10px] font-black text-cyan-100 disabled:opacity-50">
          EDIT DROP-OFF PIN
        </button>
      </div>
    </div>;
  }

  if (deferAutomaticResolution && !manualOpen) {
    const externallySynced=externalResolutionStatus==="SYNCED";
    const externallyReviewRequired=externalResolutionStatus==="REVIEW_REQUIRED";
    return <div data-location-details="true" data-bulk-location-deferred-v24="true" className={`mt-4 rounded-xl border p-4 ${externallySynced?"border-emerald-400/40 bg-emerald-500/10":"border-amber-300/40 bg-amber-400/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={`text-xs font-black uppercase tracking-[0.14em] ${externallySynced?"text-emerald-200":"text-amber-200"}`}><MapPin size={15} className="mr-2 inline"/>{externallySynced?"Location synchronized":externallyReviewRequired?"Location needs review":"Validating location"}</div>
          <div className="mt-1 text-[11px] leading-5 text-slate-200">{externallySynced?"Validated coordinates are ready for Wayplan. You can still move the pin manually when the exact drop-off point needs correction.":externallyReviewRequired?"This row failed automatic validation and is included in the consolidated review Excel. You can set the pin manually now.":"The controlled background queue is checking this row without loading an interactive map. Manual pin placement remains available."}</div>
        </div>
        <button type="button" onClick={()=>void openRelocationMap()} disabled={busy} className="rounded-lg border border-cyan-300/50 bg-[#12314a] px-4 py-2 text-[10px] font-black text-cyan-100 disabled:opacity-50">
          EDIT DROP-OFF PIN
        </button>
      </div>
    </div>;
  }

  return <div data-location-details="true" className="mt-4 rounded-xl border border-cyan-400/50 bg-[#061524] p-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-300"><MapPin size={15}/> Location Details / တည်နေရာအသေးစိတ်</div>
      {candidate && <span className={`rounded-full px-3 py-1 text-[11px] font-black ${candidate.reviewStatus === "ACCEPTED" ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-200"}`}>{candidate.matchLevel.replaceAll("_", " ")}{candidate.reviewStatus === "MANUAL_REVIEW" ? " · REVIEW" : ""}</span>}
    </div>
    <div className="grid min-w-0 gap-3">
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

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={()=>{ setMapVisualMode("NORMAL"); void openRelocationMap(); }}
            className={`rounded-xl border px-4 py-3 text-xs font-black transition ${mapVisualMode==="NORMAL" && mapExpanded ? "border-cyan-300 bg-cyan-400 text-[#061524]" : "border-cyan-300/40 bg-[#12314a] text-cyan-100"}`}
          >
            NORMAL MAP VIEW
          </button>
          <button
            type="button"
            onClick={()=>{ setMapVisualMode("EARTH"); void openRelocationMap(); }}
            className={`rounded-xl border px-4 py-3 text-xs font-black transition ${mapVisualMode==="EARTH" && mapExpanded ? "border-amber-300 bg-amber-300 text-[#061524]" : "border-amber-300/40 bg-[#12314a] text-amber-100"}`}
          >
            GOOGLE EARTH VIEW
          </button>
          <button
            type="button"
            onClick={()=>{ setMapVisualMode("STREET"); void openRelocationMap(); }}
            className={`rounded-xl border px-4 py-3 text-xs font-black transition ${mapVisualMode==="STREET" && mapExpanded ? "border-emerald-300 bg-emerald-400 text-[#061524]" : "border-emerald-300/40 bg-[#12314a] text-emerald-100"}`}
          >
            STREET MAP VIEW
          </button>
        </div>
        <div className="mt-2 rounded-xl border border-slate-700 bg-slate-950/35 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-300">
          All three views use the same coordinate editor. Drag/pan/zoom the selected map, place the fixed center pin on the exact gate or building, press <b>SET PIN HERE</b>, then press <b>Apply coordinates</b>.
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-bold text-slate-400">
            Active editor: {mapVisualMode === "EARTH" ? "Google Earth View" : mapVisualMode === "STREET" ? "Street Map View" : "Normal Map View"}
          </div>
          <button type="button" onClick={()=>void skipReview()} disabled={busy||!deliveryWayId||candidate?.reviewStatus==="ACCEPTED"} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300/50 bg-amber-400/10 px-4 py-2 text-xs font-black text-amber-100 disabled:opacity-40"><SkipForward size={14}/>SKIP REVIEW</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={()=>mapExpanded ? setMapFocus(false) : void openRelocationMap()} className="rounded-lg border border-cyan-300/50 bg-[#12314a] px-4 py-2 text-[10px] font-black text-cyan-100">
            {mapExpanded ? "CLOSE PIN EDITOR" : "EDIT DROP-OFF PIN"}
          </button>
          {mapExpanded ? <>
            <span className="self-center text-[10px] font-semibold text-emerald-300">{mapVisualMode === "EARTH" ? "GOOGLE EARTH VIEW" : mapVisualMode === "STREET" ? "STREET MAP VIEW" : "NORMAL MAP VIEW"} · Registration Grid is hidden automatically while correcting coordinates.</span>
            <button type="button" onClick={()=>setMapFocus(false)} className="rounded-lg border border-emerald-300/50 bg-emerald-400/10 px-4 py-2 text-[10px] font-black text-emerald-100">RETURN TO TABLE</button>
          </> : null}
        </div>
        {(enabled || manualOpen) && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">Latitude / လတ္တီကျု</span>
            <input aria-label="Latitude" type="number" step="0.000001" value={lat} onChange={(event)=>{operatorEditedRef.current=true;setLat(event.target.value);setManualOpen(true);reportResolution("REVIEW_REQUIRED");}} placeholder="Latitude" className="w-full rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm font-bold text-black"/>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200">Longitude / လောင်ဂျီကျု</span>
            <input aria-label="Longitude" type="number" step="0.000001" value={lng} onChange={(event)=>{operatorEditedRef.current=true;setLng(event.target.value);setManualOpen(true);reportResolution("REVIEW_REQUIRED");}} placeholder="Longitude" className="w-full rounded-lg border border-[#1a3a5c] bg-white px-3 py-2 text-sm font-bold text-black"/>
          </label>
          <button type="button" onClick={()=>void apply()} disabled={busy || !validMyanmarCoordinate(lng,lat)} className="self-end rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-black text-[#061524] disabled:opacity-40">Apply coordinates</button>
        </div>}
      </div>
      <div data-location-map-panel-v131="true" className="min-w-0 overflow-hidden">
        {!mapExpanded ? (
          <div className="rounded-2xl border border-cyan-500/40 bg-[#0b2236] p-5 text-center">
            <MapPin className="mx-auto h-9 w-9 text-cyan-300" />
            <p className="mt-3 text-sm font-black text-white">Choose a map view above to inspect or correct the drop-off coordinates.</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">Normal Map View, Google Earth View and Street Map View all support the same SET PIN HERE → Apply coordinates workflow.</p>
          </div>
        ) : fallbackMapCenter || candidate ? (
          <div>
            <div className="relative">
              <div
                ref={fallbackMapContainer}
                className="relative h-[min(68vh,720px)] min-h-[480px] w-full overflow-hidden rounded-2xl border border-cyan-500/70 bg-slate-100 shadow-2xl"
              />
              {tileLoadState === "LOADING" && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-100/65 backdrop-blur-[1px]">
                  <div className="rounded-2xl bg-slate-950/90 px-4 py-3 text-xs font-black text-white shadow-xl">
                    Loading {mapVisualMode === "EARTH" ? "Google Earth imagery" : mapVisualMode === "STREET" ? "Street Map" : "Normal Map"}…
                  </div>
                </div>
              )}
              {tileLoadState === "ERROR" && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-slate-100/92 p-6">
                  <div className="max-w-sm text-center">
                    <AlertTriangle className="mx-auto h-9 w-9 text-amber-600"/>
                    <p className="mt-3 text-sm font-black text-slate-900">Map imagery did not load.</p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">Retry this view or switch to another map mode.</p>
                    <button
                      type="button"
                      onClick={()=>{ setTileLoadState("LOADING"); setMapError(""); const current = fallbackCenterRef.current || fallbackMapCenter; setMapFocus(false); window.setTimeout(()=>{ if(current){ fallbackCenterRef.current=current; setFallbackMapCenter(current); } setMapFocus(true); },80); }}
                      className="mt-3 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white"
                    >
                      RETRY MAP
                    </button>
                  </div>
                </div>
              )}
              <div className="pointer-events-none absolute left-3 top-3 max-w-[78%] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-[11px] font-black text-slate-800 shadow-xl">
                DRAG THE RED PIN TO THE EXACT POINT · OR TAP MAP TO MOVE PIN
              </div>
              <button
                type="button"
                onClick={setPinAtMapCenter}
                className="absolute bottom-4 left-1/2 z-10 min-h-12 -translate-x-1/2 rounded-2xl bg-emerald-500 px-6 py-3 text-xs font-black text-white shadow-2xl ring-2 ring-white"
              >
                USE THIS PIN
              </button>
              <div className="absolute bottom-4 right-4 grid grid-cols-3 gap-1 rounded-2xl border border-white/60 bg-slate-950/85 p-1.5 shadow-xl backdrop-blur">
                <span/>
                <button type="button" onClick={()=>nudgeFallbackMap(0,-12)} className="h-10 rounded-xl bg-white px-3 text-sm font-black text-slate-800">↑</button>
                <span/>
                <button type="button" onClick={()=>nudgeFallbackMap(-12,0)} className="h-10 rounded-xl bg-white px-3 text-sm font-black text-slate-800">←</button>
                <button type="button" onClick={()=>{
                  if(candidate) {
                    const next={latitude:Number(candidate.latitude),longitude:Number(candidate.longitude)};
                    fallbackCenterRef.current=next;
                    setFallbackMapCenter(next);
                    setFallbackMapZoom(18);
                  }
                }} className="h-10 rounded-xl bg-amber-300 px-2 text-[10px] font-black text-slate-900">PIN</button>
                <button type="button" onClick={()=>nudgeFallbackMap(12,0)} className="h-10 rounded-xl bg-white px-3 text-sm font-black text-slate-800">→</button>
                <span/>
                <button type="button" onClick={()=>nudgeFallbackMap(0,12)} className="h-10 rounded-xl bg-white px-3 text-sm font-black text-slate-800">↓</button>
                <span/>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/35 bg-emerald-950/20 px-3 py-2 text-[11px] font-semibold leading-5 text-emerald-100">
              <span>{mapVisualMode === "EARTH" ? "Earth / satellite imagery" : mapVisualMode === "STREET" ? "Street Map View" : "Normal Map View"}: drag the red pin directly, or tap the map to move it, then press <b>USE THIS PIN</b> and <b>Apply coordinates</b>.</span>
              {fallbackMapCenter ? <a href={`https://www.google.com/maps/search/?api=1&query=${fallbackMapCenter.latitude},${fallbackMapCenter.longitude}`} target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-300/50 bg-cyan-400/10 px-3 py-2 font-black text-cyan-100">VERIFY IN GOOGLE MAPS ↗</a> : null}
            </div>
            {mapError && <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-xs font-semibold text-rose-100">{mapError}</div>}
          </div>
        ) : addressMapUrl || mapUrl ? (
          <div>
            <iframe
              src={mapUrl || addressMapUrl}
              title={`Google Maps location preview for ${deliveryWayId || "new parcel"}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="pointer-events-none aspect-[16/7] min-h-[230px] w-full rounded-lg border border-cyan-600/60 opacity-90"
            />
            <button type="button" onClick={()=>void openRelocationMap()} className="mt-2 w-full rounded-xl border border-cyan-300/60 bg-[#061524] px-4 py-3 text-xs font-black text-cyan-100 shadow-xl">
              EDIT DROP-OFF PIN
            </button>
          </div>
        ) : (
          <div className="grid min-h-[230px] place-items-center rounded-lg border border-dashed border-slate-600 px-6 text-center text-sm text-slate-400">
            {busy ? "Locating drop-off automatically..." : mapError || "Enter an address or open the editable map to set the drop-off location."}
          </div>
        )}
      </div>
    </div>
  </div>;
}
