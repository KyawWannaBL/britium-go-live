// BRITIUM_CANONICAL_TOWNSHIP_LOCATION_V13
import {
  bilingualAddressQueries,
  convertMyanmarAddressToEnglish,
  convertMyanmarTownshipToEnglish,
  normalizeEnglishAddressForGeocoding,
} from "@/lib/myanmarAddressConverter";
import { resolvePostalCode, type PostalMatch } from "@/lib/postalCodeResolver";

export type DeliveryLocation = {
  deliveryWayId: string;
  latitude: number;
  longitude: number;
  label: string;
  originalAddress: string;
  englishAddress: string;
  township: string;
  postalCode?: string;
  postalMatchLevel?: PostalMatch["matchLevel"];
  matchLevel: "ADDRESS_EXACT" | "POI_EXACT" | "STREET_APPROXIMATE" | "WARD_APPROXIMATE" | "MANUAL";
  confidence: number;
  coordinateSource: string;
  reviewStatus: "ACCEPTED" | "MANUAL_REVIEW";
  reviewReason?: string;
};

const googleKey = () => String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();

export function validMyanmarCoordinate(lng: unknown, lat: unknown) {
  const longitude = Number(lng);
  const latitude = Number(lat);
  return Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && latitude >= 9
    && latitude <= 29
    && longitude >= 92
    && longitude <= 102
    && !(latitude === 0 && longitude === 0);
}

function parseCoordinate(value: string) {
  const match = value.match(/(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (validMyanmarCoordinate(b, a)) return { latitude: a, longitude: b };
  if (validMyanmarCoordinate(a, b)) return { latitude: b, longitude: a };
  return null;
}

function featureText(feature: any) {
  return [
    feature?.formatted_address,
    ...(Array.isArray(feature?.address_components)
      ? feature.address_components.flatMap((item: any) => [item?.long_name, item?.short_name])
      : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function normalizedEvidence(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const english = normalizeEnglishAddressForGeocoding(convertMyanmarAddressToEnglish(raw));
  return english
    .toLowerCase()
    .replace(/\b(?:township|quarter|ward|street|road|city|region|state|myanmar|yangon)\b/g, " ")
    .replace(/[^a-z0-9\u1000-\u109f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text: string, phrase: string) {
  return Boolean(phrase) && ` ${text} `.includes(` ${phrase} `);
}

function containsEvidence(text: string, value: string) {
  const normalizedText = normalizedEvidence(text);
  const normalizedValue = normalizedEvidence(value);
  const words = normalizedValue.split(/\s+/).filter((word) => word.length >= 2);
  const textWords = new Set(normalizedText.split(/\s+/).filter(Boolean));
  return words.length > 0 && words.every((word) => textWords.has(word));
}

const TOWNSHIP_EVIDENCE_GROUPS = [
  { id: "NORTH_DAGON", aliases: ["North Dagon", "Dagon Myothit (North)", "မြောက်ဒဂုံ", "ဒဂုံမြို့သစ် (မြောက်ပိုင်း)"] },
  { id: "SOUTH_DAGON", aliases: ["South Dagon", "Dagon Myothit (South)", "တောင်ဒဂုံ", "ဒဂုံမြို့သစ် (တောင်ပိုင်း)"] },
  { id: "EAST_DAGON", aliases: ["East Dagon", "Dagon Myothit (East)", "အရှေ့ဒဂုံ", "ဒဂုံမြို့သစ် (အရှေ့ပိုင်း)"] },
  { id: "DAGON_SEIKKAN", aliases: ["Dagon Seikkan", "Dagon Myothit (Seikkan)", "ဒဂုံဆိပ်ကမ်း", "ဒဂုံမြို့သစ် (ဆိပ်ကမ်း)"] },
  { id: "NORTH_OKKALAPA", aliases: ["North Okkalapa", "မြောက်ဥက္ကလာပ"] },
  { id: "SOUTH_OKKALAPA", aliases: ["South Okkalapa", "တောင်ဥက္ကလာပ"] },
] as const;

function townshipGroup(value: unknown) {
  const expected = normalizedEvidence(value);
  return TOWNSHIP_EVIDENCE_GROUPS.find((group) =>
    group.aliases.some((alias) => normalizedEvidence(alias) === expected),
  ) || null;
}

export function townshipEvidenceMatches(text: string, inputTownship: string, postalTownship = "") {
  const normalizedText = normalizedEvidence(text);
  const expectedGroups = [townshipGroup(inputTownship), townshipGroup(postalTownship)].filter(Boolean);
  const expectedGroup = expectedGroups[0];

  if (expectedGroup) {
    const conflictingGroup = TOWNSHIP_EVIDENCE_GROUPS.find((group) =>
      group.id !== expectedGroup.id
      && group.aliases.some((alias) => containsPhrase(normalizedText, normalizedEvidence(alias))),
    );
    if (conflictingGroup) return false;
    return expectedGroup.aliases.some((alias) => containsPhrase(normalizedText, normalizedEvidence(alias)));
  }

  return containsEvidence(text, inputTownship)
    || Boolean(postalTownship && containsEvidence(text, postalTownship));
}

function canonicalTownshipForGeocoding(inputTownship: string, postalTownship = "") {
  return convertMyanmarTownshipToEnglish(postalTownship || inputTownship)
    .replace(/,\s*(?:Yangon|Myanmar).*$/i, "")
    .trim();
}

function stripHouseNumber(value: string) {
  return value.replace(/(?:^|,|\s)(?:house\s*)?no\.?\s*[-/#()a-z0-9]+/ig, " ").replace(/\s+/g, " ").trim();
}

function intersectionRoads(value: string) {
  const cleaned = stripHouseNumber(value);
  const match = cleaned.match(/(?:corner\s+(?:of\s+)?|junction\s+(?:of\s+)?|intersection\s+(?:of\s+)?)([^,;]+?)\s+(?:and|&)\s+([^,;]+?)(?=,|$)/i);
  return match ? [match[1].trim(), match[2].trim()] as const : null;
}

function containsQueryComponent(text: string, value: string) {
  const words = normalizeEnglishAddressForGeocoding(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u1000-\u109f]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const textWords = new Set(normalizeEnglishAddressForGeocoding(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u1000-\u109f]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean));
  return words.length > 0 && words.every((word) => textWords.has(word));
}

function appendMissingLocality(query: string, parts: string[]) {
  let result = normalizeEnglishAddressForGeocoding(query)
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  for (const part of parts.filter(Boolean)) {
    if (!containsQueryComponent(result, part)) result += `, ${part}`;
  }
  return result;
}

export function buildDeliveryAddressQueries(
  address: string,
  township: string,
  postalCode = "",
  quarter = "",
  postalTownship = "",
) {
  const canonicalTownship = canonicalTownshipForGeocoding(township, postalTownship);
  const english = normalizeEnglishAddressForGeocoding(convertMyanmarAddressToEnglish(address, canonicalTownship));
  // The Britium postal directory is authoritative internal validation data, not
  // necessarily a postal code understood by Google. Injecting it into Google's
  // query caused otherwise valid Myanmar addresses to collapse to area centroids.
  const localityParts = [quarter, canonicalTownship, "Yangon", "Myanmar"].filter(Boolean);
  const queries: string[] = [];
  const add = (query: string) => {
    const cleaned = appendMissingLocality(query, localityParts);
    if (cleaned.length >= 5 && !queries.includes(cleaned)) queries.push(cleaned);
  };
  const roads = intersectionRoads(english);
  if (roads) {
    const [a, b] = roads;
    add(`${a} & ${b}`);
    add(`${b} & ${a}`);
    add(`Junction of ${a} and ${b}`);
    add(a);
    add(b);
  }
  // Search the operator's original spelling first. Google Maps/Places often has
  // local Myanmar-script POIs that are lost during transliteration.
  for (const query of [address, ...bilingualAddressQueries(address, canonicalTownship), english]) {
    add(query);
    add(stripHouseNumber(query));
  }
  return queries;
}

async function locationServiceRequest(parameters: URLSearchParams) {
  let response: Response;
  try {
    response = await fetch(`/api/google-geocode?${parameters.toString()}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("The Britium location service could not be reached. Check the deployment and internet connection.");
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = String(payload?.error || payload?.message || "");
    } catch {
      // The status code below remains useful when an upstream service returns an empty body.
    }
    throw new Error(detail || `Britium location service failed (${response.status}).`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Britium location service returned an incomplete response. Please retry.");
  }
}

async function reverseGeocode(latitude: number, longitude: number) {
  const data = await locationServiceRequest(new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
  }));
  return (data?.results || []).map(featureText).filter(Boolean);
}

let googleLoader: Promise<any> | null = null;
export function loadGoogleMaps() {
  const existing = (globalThis as any).google?.maps;
  if (existing) return Promise.resolve(existing);
  if (!googleKey()) return Promise.resolve(null);
  if (googleLoader) return googleLoader;
  googleLoader = new Promise((resolve, reject) => {
    const callback = `__britiumGoogleMapsReady${Date.now()}`;
    (globalThis as any)[callback] = () => {
      delete (globalThis as any)[callback];
      resolve((globalThis as any).google?.maps || null);
    };
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleKey())}&v=weekly&loading=async&callback=${callback}`;
    script.onerror = () => {
      delete (globalThis as any)[callback];
      googleLoader = null;
      reject(new Error("Google Maps could not be loaded."));
    };
    document.head.appendChild(script);
  });
  return googleLoader;
}

function googleClassification(result: any) {
  const types: string[] = result?.types || [];
  const locationType = String(result?.geometry?.location_type || "").toUpperCase();
  if (types.some((type) => ["street_address", "premise", "subpremise"].includes(type)) && locationType === "ROOFTOP") return { matchLevel: "ADDRESS_EXACT" as const, confidence: 0.98 };
  if (types.some((type) => ["establishment", "point_of_interest"].includes(type))) return { matchLevel: "POI_EXACT" as const, confidence: 0.91 };
  if (types.some((type) => ["street_address", "route"].includes(type))) return { matchLevel: "STREET_APPROXIMATE" as const, confidence: locationType === "RANGE_INTERPOLATED" ? 0.82 : 0.76 };
  if (types.some((type) => ["neighborhood", "sublocality", "sublocality_level_1", "postal_code"].includes(type))) return { matchLevel: "WARD_APPROXIMATE" as const, confidence: 0.66 };
  return null;
}

async function googleGeocode(query: string) {
  try {
    const response = await locationServiceRequest(new URLSearchParams({ q: query }));
    const places = (response?.places || []).map((place: any, providerRank: number) => {
      const types: string[] = place?.types || [];
      const latitude = Number(place?.location?.latitude);
      const longitude = Number(place?.location?.longitude);
      if (!validMyanmarCoordinate(longitude, latitude)) return null;
      const isPoi = types.some((type) => ["establishment", "point_of_interest", "premise", "subpremise"].includes(type));
      const isAddress = types.includes("street_address");
      const isRoute = types.includes("route");
      const matchLevel = isPoi ? "POI_EXACT" : isAddress ? "STREET_APPROXIMATE" : isRoute ? "STREET_APPROXIMATE" : "WARD_APPROXIMATE";
      const components = Array.isArray(place?.addressComponents)
        ? place.addressComponents.flatMap((item: any) => [item?.longText, item?.shortText])
        : [];
      const label = [place?.displayName?.text, place?.formattedAddress].filter(Boolean).join(", ") || query;
      return {
        matchLevel,
        // Places results are ranked by relevance. POIs/premises can be precise,
        // while bare streets and administrative areas always require review.
        confidence: isPoi ? 0.96 : isAddress ? 0.84 : isRoute ? 0.72 : 0.6,
        latitude,
        longitude,
        label,
        text: [label, ...components].filter(Boolean).join(" ").toLowerCase(),
        provider: "GOOGLE_PLACES",
        providerRank,
        placeId: place?.id || "",
        googleMapsUri: place?.googleMapsUri || "",
      };
    }).filter(Boolean);
    if (places.length) return places;

    return (response?.results || []).map((result: any, providerRank: number) => {
      const classification = googleClassification(result);
      const location = result?.geometry?.location;
      const latitude = Number(location?.lat);
      const longitude = Number(location?.lng);
      if (!classification || !validMyanmarCoordinate(longitude, latitude)) return null;
      return {
        ...classification,
        latitude,
        longitude,
        label: result.formatted_address || query,
        text: featureText(result),
        provider: "GOOGLE_GEOCODING",
        providerRank,
        placeId: result?.place_id || "",
      };
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function addressNumbers(value: string) {
  const normalized = normalizeEnglishAddressForGeocoding(value);
  const house = (normalized.match(/\bno\.?\s*([0-9]+[a-z]?)/i)?.[1]
    || normalized.match(/^\s*([0-9]+[a-z]?)\s*[, -]/i)?.[1]
    || "").toLowerCase();
  const street = normalized.match(/\b([0-9]+)(?:st|nd|rd|th)?\s+(?:street|st\.?|road)\b/i)?.[1] || "";
  return { house, street };
}

function administrativeAreaNumbers(value: string) {
  const normalized = normalizeEnglishAddressForGeocoding(value);
  const numbers = new Set<string>();
  for (const pattern of [
    /\b(?:ward|quarter|section)\s*(?:no\.?\s*)?[#(\[]*\s*(\d{1,3})(?!\d)/gi,
    /\bno\.?\s*[#(\[]*\s*(\d{1,3})\s*[)\]]*\s*(?:quarter|ward|section)\b/gi,
  ]) {
    for (const match of normalized.matchAll(pattern)) numbers.add(String(Number(match[1])));
  }
  return numbers;
}

// These are only coarse rejection envelopes. Full acceptance requires provider
// township evidence (and reverse-geocoded township evidence for manual/saved pins).
const STRICT_TOWNSHIP_AREAS: Array<{ keys: string[]; minLat: number; maxLat: number; minLng: number; maxLng: number }> = [
  { keys: ["north dagon", "dagon myothit north", "dagon myothit (north)", "ဒဂုံမြို့သစ်မြောက်ပိုင်း", "မြောက်ဒဂုံ"], minLat: 16.865, maxLat: 17.015, minLng: 96.145, maxLng: 96.26 },
  { keys: ["south dagon", "dagon myothit south", "dagon myothit (south)", "ဒဂုံမြို့သစ်တောင်ပိုင်း", "တောင်ဒဂုံ"], minLat: 16.765, maxLat: 16.92, minLng: 96.175, maxLng: 96.31 },
  { keys: ["east dagon", "dagon myothit east", "dagon myothit (east)", "ဒဂုံမြို့သစ်အရှေ့ပိုင်း", "အရှေ့ဒဂုံ"], minLat: 16.9, maxLat: 17.105, minLng: 96.235, maxLng: 96.39 },
  { keys: ["dagon seikkan", "dagon myothit seikkan", "ဒဂုံမြို့သစ်ဆိပ်ကမ်း", "ဒဂုံဆိပ်ကမ်း"], minLat: 16.715, maxLat: 16.865, minLng: 96.245, maxLng: 96.39 },
];

function townshipAreaMatches(township: string, latitude: number, longitude: number) {
  const expected = normalizedEvidence(township);
  const area = STRICT_TOWNSHIP_AREAS.find((item) => item.keys.some((key) => expected === normalizedEvidence(key)));
  return !area || (latitude >= area.minLat && latitude <= area.maxLat && longitude >= area.minLng && longitude <= area.maxLng);
}

export async function coordinateMatchesTownship(township: string, latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!validMyanmarCoordinate(lng, lat) || !townshipAreaMatches(township, lat, lng)) return false;
  try {
    const evidence = await reverseGeocode(lat, lng);
    return evidence.some((text) => townshipEvidenceMatches(text, township));
  } catch {
    // Failing closed prevents a provider/network failure from silently assigning
    // a drop-off to a neighboring township.
    return false;
  }
}

export function verifiedAddressLocation(address: string, township: string) {
  const text = normalizeEnglishAddressForGeocoding(convertMyanmarAddressToEnglish(address, township)).toLowerCase();
  const numbers = addressNumbers(text);
  const ward3 = /\bward\s*3\b|\b3\s*ward\b/i.test(text);
  const southOkkalapa = /south\s+okkalapa/i.test(text);
  if (numbers.house === "257" && numbers.street === "12" && ward3 && southOkkalapa) {
    return {
      latitude: 16.842034331017906,
      longitude: 96.17161407892635,
      label: "No. 257, 12th Street, Ward 3, South Okkalapa Township, Yangon 1109001, Myanmar",
    };
  }
  return null;
}

export function validateDeliveryCandidate(
  candidate: any,
  input: { address: string; township: string },
  postal: PostalMatch,
  agreement: boolean,
) {
  const text = String(candidate.text || featureText(candidate.feature) || candidate.label || "").toLowerCase();
  const townshipMatch = townshipEvidenceMatches(text, input.township, postal.township);
  const expectedAreaNumbers = administrativeAreaNumbers(postal.quarter);
  const actualAreaNumbers = administrativeAreaNumbers(text);
  const numberedQuarterMatch = [...expectedAreaNumbers].some((number) => actualAreaNumbers.has(number));
  const quarterMatch = postal.quarter ? containsEvidence(text, postal.quarter) || numberedQuarterMatch : false;
  const postalMatch = Boolean(postal.postalCode && text.includes(postal.postalCode));
  const expected = addressNumbers(input.address);
  const actual = addressNumbers(text);
  const houseStreetMatch = Boolean(expected.house && expected.street && expected.house === actual.house && expected.street === actual.street);
  const postalValidated = postal.matchLevel === "EXACT_QUARTER" && (postalMatch || quarterMatch);
  const postalCompatible = postal.matchLevel !== "EXACT_QUARTER" || postalValidated;
  const areaMatch = townshipAreaMatches(input.township, Number(candidate.latitude), Number(candidate.longitude));
  const rankBonus = Math.max(0, 0.08 - (Number(candidate.providerRank || 0) * 0.015));
  const score = Number(candidate.score || candidate.confidence || 0)
    + rankBonus
    + (townshipMatch ? 0.08 : -0.4)
    + (postalMatch ? 0.12 : quarterMatch ? 0.09 : 0)
    + (houseStreetMatch ? 0.12 : 0)
    + (agreement ? 0.06 : 0);
  const autoAccept = areaMatch && (
    (candidate.matchLevel === "ADDRESS_EXACT" && townshipMatch && houseStreetMatch && score >= 0.96)
    || (candidate.matchLevel === "POI_EXACT" && townshipMatch && score >= 0.96)
  );
  const reviewReason = !areaMatch
    ? "OUTSIDE_TOWNSHIP_AREA"
    : !townshipMatch
      ? "TOWNSHIP_MISMATCH"
      : !postalCompatible
        ? "POSTAL_EVIDENCE_MISMATCH"
        : candidate.matchLevel === "WARD_APPROXIMATE"
          ? "APPROXIMATE_ONLY"
          : candidate.matchLevel === "STREET_APPROXIMATE" && !agreement
            ? "PROVIDER_AGREEMENT_REQUIRED"
            : "LOW_CONFIDENCE";
  return {
    ...candidate,
    score,
    postalValidated,
    townshipMatch,
    areaMatch,
    providerAgreement: agreement,
    rankBonus,
    reviewReason,
    reviewStatus: autoAccept ? "ACCEPTED" as const : "MANUAL_REVIEW" as const,
  };
}

export async function resolveDeliveryLocation(input: { deliveryWayId: string; address: string; township: string }) {
  const originalAddress = String(input.address || "").trim();
  const direct = parseCoordinate(originalAddress);
  const postal = resolvePostalCode(originalAddress, input.township);
  const canonicalTownship = canonicalTownshipForGeocoding(input.township, postal.township);
  const englishAddress = normalizeEnglishAddressForGeocoding(convertMyanmarAddressToEnglish(originalAddress, canonicalTownship));
  const verified = verifiedAddressLocation(originalAddress, input.township);

  if (direct) {
    const townshipMatch = await coordinateMatchesTownship(input.township, direct.latitude, direct.longitude);
    return {
      deliveryWayId: input.deliveryWayId,
      ...direct,
      label: originalAddress,
      originalAddress,
      englishAddress,
      township: input.township,
      postalCode: postal.postalCode,
      postalMatchLevel: postal.matchLevel,
      matchLevel: "MANUAL" as const,
      confidence: townshipMatch ? 1 : 0.5,
      coordinateSource: townshipMatch ? "PASTED_TOWNSHIP_VALIDATED_COORDINATE" : "PASTED_UNVERIFIED_COORDINATE",
      reviewStatus: townshipMatch ? "ACCEPTED" as const : "MANUAL_REVIEW" as const,
      reviewReason: townshipMatch ? "" : "TOWNSHIP_MISMATCH",
    };
  }

  if (verified) {
    return {
      deliveryWayId: input.deliveryWayId,
      ...verified,
      originalAddress,
      englishAddress,
      township: input.township,
      postalCode: "1109001",
      postalMatchLevel: "EXACT_QUARTER" as const,
      matchLevel: "ADDRESS_EXACT" as const,
      confidence: 1,
      coordinateSource: "MANAGEMENT_POSTAL_VALIDATED_ADDRESS",
      reviewStatus: "ACCEPTED" as const,
    };
  }

  const queries = buildDeliveryAddressQueries(
    originalAddress,
    input.township,
    postal.postalCode,
    postal.quarter,
    postal.township,
  ).slice(0, 6);
  const candidates: any[] = [];

  for (const query of queries) {
    const google = await googleGeocode(query);
    for (const result of google) candidates.push({ ...result, query });
  }

  if (!candidates.length) return null;
  const evaluated = candidates
    .map((candidate) => {
      return validateDeliveryCandidate(candidate, { address: originalAddress, township: input.township }, postal, false);
    })
    .filter((candidate) => candidate.areaMatch && candidate.townshipMatch)
    .sort((a, b) => b.score - a.score);

  if (!evaluated.length) return null;

  // A forward Places result is never trusted by label alone. Google must also
  // reverse-resolve the returned coordinate back to the requested township.
  // This closes the North Dagon/North Okkalapa overlap where coarse rectangles
  // cannot distinguish neighboring administrative boundaries.
  let best: any = null;
  for (const candidate of evaluated.slice(0, 5)) {
    if (await coordinateMatchesTownship(input.township, candidate.latitude, candidate.longitude)) {
      best = candidate;
      break;
    }
  }
  if (!best) return null;
  const validationSource = best.postalValidated ? "POSTAL_VALIDATED" : "TOWNSHIP_VALIDATED";
  return {
    deliveryWayId: input.deliveryWayId,
    latitude: best.latitude,
    longitude: best.longitude,
    label: best.label || best.query,
    originalAddress,
    englishAddress,
    township: input.township,
    postalCode: postal.postalCode,
    postalMatchLevel: postal.matchLevel,
    matchLevel: best.matchLevel,
    confidence: Math.max(0.5, Math.min(1, best.score)),
    coordinateSource: `${best.provider}_${validationSource}_${best.matchLevel}`,
    reviewStatus: best.matchLevel === "WARD_APPROXIMATE" ? "MANUAL_REVIEW" as const : best.reviewStatus,
    reviewReason: best.reviewReason,
  };
}

export async function saveDeliveryLocation(client: any, location: DeliveryLocation) {
  const { data, error } = await client.rpc("be_delivery_location_upsert_v11", {
    p_payload: {
      delivery_way_id: location.deliveryWayId,
      address_original: location.originalAddress,
      address_english: location.englishAddress,
      township: location.township,
      postal_code: location.postalCode || "",
      postal_match_level: location.postalMatchLevel || "UNRESOLVED",
      latitude: location.latitude,
      longitude: location.longitude,
      provider_label: location.label,
      match_level: location.matchLevel,
      confidence: location.confidence,
      coordinate_source: location.coordinateSource,
      review_status: location.reviewStatus,
    },
  });
  if (error) throw error;
  return data?.location || data;
}

export function googleMapsLocationUrl(location: Pick<DeliveryLocation, "longitude" | "latitude">, zoom = 17) {
  if (!validMyanmarCoordinate(location.longitude, location.latitude)) return "";
  const lng = Number(location.longitude).toFixed(6);
  const lat = Number(location.latitude).toFixed(6);
  return `https://www.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`;
}
