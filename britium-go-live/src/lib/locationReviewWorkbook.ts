type ReviewPickup = { pickup_id: string; expected_parcels: number; verified_parcels: number };
type ReviewRow = { township: string; delivery_address: string; locationCandidate?: { latitude: number; longitude: number } | null };

// A workbook survives browser state loss. Validate its identities against the
// authenticated pickup list; the review RPC independently enforces access/range.
export function parseLocationReviewWorkbook(
  entries: Record<string, unknown>[],
  pickups: ReviewPickup[],
  knownRows: Map<string, ReviewRow>,
  fileName: string,
) {
  const seen = new Set<string>();
  return entries.map((entry, index) => {
    const value = (key: string) => String(entry[key] ?? "").trim();
    const fail = (message: string): never => { throw new Error(`Excel row ${index + 2}: ${message}`); };
    const deliveryWayId = value("Delivery Way ID");
    const pickupId = value("Pickup ID");
    const sequenceText = value("Parcel Sequence");
    const sequence = Number(sequenceText);
    if (!/^[1-9]\d*$/.test(sequenceText) || !Number.isSafeInteger(sequence)
        || !pickupId || deliveryWayId !== `${pickupId}-${String(sequence).padStart(3, "0")}`) {
      fail("Delivery Way ID must match Pickup ID and Parcel Sequence. Keep the original identifiers.");
    }
    if (seen.has(deliveryWayId)) fail(`Duplicate Delivery Way ID ${deliveryWayId}.`);
    seen.add(deliveryWayId);
    const pickup = pickups.find(item => item.pickup_id === pickupId);
    if (!pickup || sequence > Math.max(pickup.expected_parcels, pickup.verified_parcels)) {
      fail(`Pickup ${pickupId} is unavailable or the parcel is outside its authorized quantity. Check the date filter and your access.`);
    }
    const current = knownRows.get(deliveryWayId);
    const action = (value("Action") || "APPLY_CORRECTION").toUpperCase();
    if (!["APPLY_CORRECTION", "SKIP_REVIEW"].includes(action)) fail("Action must be APPLY_CORRECTION or SKIP_REVIEW.");
    const latitude = Number(action === "SKIP_REVIEW"
      ? value("Suggested Latitude") || current?.locationCandidate?.latitude
      : value("Corrected Latitude"));
    const longitude = Number(action === "SKIP_REVIEW"
      ? value("Suggested Longitude") || current?.locationCandidate?.longitude
      : value("Corrected Longitude"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || latitude < 9 || latitude > 29 || longitude < 92 || longitude > 102) {
      fail(`Enter valid Myanmar latitude and longitude for ${deliveryWayId}.`);
    }
    const reason = value("Reason") || "Location corrected through consolidated review workbook";
    if (reason.length < 10) fail("Reason must contain at least 10 characters.");
    const township = value("Township") || current?.township || "";
    const address = value("Delivery Address") || current?.delivery_address || "";
    if (township.length < 2 || address.length < 3) fail("Township and Delivery Address are required.");
    return {
      delivery_way_id: deliveryWayId, pickup_id: pickupId, parcel_sequence: sequence,
      township,
      delivery_address: address,
      latitude, longitude, action, reason, source_file_name: fileName, source_row_number: index + 2,
    };
  });
}
