export type MapboxLocationMatchLevel = "ADDRESS_EXACT" | "POI_EXACT" | "STREET_APPROXIMATE" | "WARD_APPROXIMATE";

export function classifyMapboxFeature(feature: any): { matchLevel: MapboxLocationMatchLevel; confidence: number } | null {
  const type = String(feature?.properties?.feature_type || feature?.place_type?.[0] || feature?.type || "").toLowerCase();
  if (type === "address") return { matchLevel: "ADDRESS_EXACT", confidence: 0.96 };
  if (type === "poi") return { matchLevel: "POI_EXACT", confidence: 0.90 };
  if (type === "street") return { matchLevel: "STREET_APPROXIMATE", confidence: 0.78 };
  if (type === "neighborhood" || type === "locality") return { matchLevel: "WARD_APPROXIMATE", confidence: 0.67 };
  return null;
}

export function acceptedMapboxRoutingSource(source: unknown, matchLevel: unknown, reviewStatus: unknown): boolean {
  const normalizedSource = String(source || "").toUpperCase();
  const normalizedLevel = String(matchLevel || "").toUpperCase();
  const normalizedReview = String(reviewStatus || "").toUpperCase();
  return normalizedReview === "ACCEPTED"
    && ["ADDRESS_EXACT", "POI_EXACT"].includes(normalizedLevel)
    && /^MAPBOX_(?:POSTAL_VALIDATED|TOWNSHIP_EXACT_VALIDATED)_(?:ADDRESS_EXACT|POI_EXACT)$/.test(normalizedSource);
}
