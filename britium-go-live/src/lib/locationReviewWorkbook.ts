type ReviewPickup = { pickup_id: string; expected_parcels: number; verified_parcels: number };
type ReviewRow = { township: string; delivery_address: string; locationCandidate?: { latitude: number; longitude: number; matchLevel?: string; confidence?: number; coordinateSource?: string } | null };

const SAFE_AUTO_LEVELS = new Set(["ADDRESS_EXACT", "POI_EXACT"]);

function truthy(value: string) {
  return ["YES", "TRUE", "1", "Y"].includes(value.trim().toUpperCase());
}

// A workbook survives browser state loss. Validate its identities against the
// authenticated pickup list; the review RPC independently enforces access/range.
// V30 additionally carries location quality evidence so the server can reject
// township-centre/default coordinates instead of treating them as exact pins.
export function parseLocationReviewWorkbook(
  entries: Record<string, unknown>[],
  pickups: ReviewPickup[],
  knownRows: Map<string, ReviewRow>,
  fileName: string,
) {
  const seen = new Set<string>();
  return entries.map((entry, index) => {
    const value = (key: string) => String(entry[key] ?? "").trim();
    const first = (...keys: string[]) => keys.map(value).find(Boolean) || "";
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
    let action = (value("Action") || "APPLY_CORRECTION").toUpperCase();
    const blankSuggestedPin = !value("Suggested Latitude") && !value("Suggested Longitude") && !current?.locationCandidate;
    // Backward compatibility: older operational workbooks used SKIP_REVIEW even
    // when Google quota exhaustion left no suggested pin. That means defer, not
    // accept a fabricated 0,0 coordinate.
    if (action === "SKIP_REVIEW" && blankSuggestedPin) action = "DEFER_REVIEW";
    if (!["APPLY_CORRECTION", "SKIP_REVIEW", "DEFER_REVIEW"].includes(action)) {
      fail("Action must be APPLY_CORRECTION, SKIP_REVIEW, or DEFER_REVIEW.");
    }
    const latitude = action === "DEFER_REVIEW" ? null : Number(action === "SKIP_REVIEW"
      ? value("Suggested Latitude") || current?.locationCandidate?.latitude
      : value("Corrected Latitude"));
    const longitude = action === "DEFER_REVIEW" ? null : Number(action === "SKIP_REVIEW"
      ? value("Suggested Longitude") || current?.locationCandidate?.longitude
      : value("Corrected Longitude"));
    if (action !== "DEFER_REVIEW" && (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Number(latitude) < 9 || Number(latitude) > 29 || Number(longitude) < 92 || Number(longitude) > 102)) {
      fail(`Enter valid Myanmar latitude and longitude for ${deliveryWayId}.`);
    }
    const reason = value("Reason") || (action === "DEFER_REVIEW"
      ? "Location review temporarily deferred; parcel details remain pending for later map correction."
      : "Location corrected through consolidated review workbook");
    if (reason.length < 10) fail("Reason must contain at least 10 characters.");
    const township = value("Township") || current?.township || "";
    const address = value("Delivery Address") || current?.delivery_address || "";
    if (township.length < 2 || address.length < 3) fail("Township and Delivery Address are required.");

    const matchLevel = first("Suggested Match Level", "Location Precision")
      || String(current?.locationCandidate?.matchLevel || "").toUpperCase();
    const confidenceText = first("Suggested Confidence", "Confidence");
    const confidence = confidenceText ? Number(confidenceText) : Number(current?.locationCandidate?.confidence || 0);
    const coordinateSource = first("Suggested Source", "Coordinate Source")
      || String(current?.locationCandidate?.coordinateSource || "");
    const manualPinConfirmed = truthy(first("Manual Pin Confirmed", "Manual Pin Confirmation"));

    if (action === "SKIP_REVIEW") {
      if (!SAFE_AUTO_LEVELS.has(matchLevel.toUpperCase()) || !Number.isFinite(confidence) || confidence < 0.95) {
        fail("SKIP_REVIEW is allowed only for ADDRESS_EXACT or POI_EXACT suggestions with confidence at least 0.95. Otherwise enter a corrected/manual pin.");
      }
    }

    return {
      delivery_way_id: deliveryWayId, pickup_id: pickupId, parcel_sequence: sequence,
      township,
      delivery_address: address,
      latitude, longitude, action, reason, source_file_name: fileName, source_row_number: index + 2,
      match_level: matchLevel || (action === "APPLY_CORRECTION" ? "MANUAL" : ""),
      confidence: Number.isFinite(confidence) ? confidence : 0,
      coordinate_source: coordinateSource,
      manual_pin_confirmed: manualPinConfirmed,
    };
  });
}
