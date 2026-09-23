export type RecoverableWayplanRow = {
  delivery_way_id: string;
  latitude?: number;
  longitude?: number;
  [key: string]: unknown;
};

export type RecoveredLocation = {
  deliveryWayId: string;
  latitude: number;
  longitude: number;
  reviewStatus?: string;
  [key: string]: unknown;
};

type RecoveryDependencies<Row extends RecoverableWayplanRow> = {
  resolve: (row: Row) => Promise<RecoveredLocation | null>;
  persist: (location: RecoveredLocation) => Promise<unknown>;
  concurrency?: number;
};

function hasCoordinate(row: RecoverableWayplanRow) {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function acceptedLocation(location: RecoveredLocation | null): location is RecoveredLocation {
  if (!location || String(location.reviewStatus || "").toUpperCase() !== "ACCEPTED") return false;
  const source = String(location.coordinateSource || "").toUpperCase();
  const routingSource = /^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)/.test(source)
    || (/^MAPBOX_(?:POSTAL_VALIDATED|TOWNSHIP_EXACT_VALIDATED)_(?:ADDRESS_EXACT|POI_EXACT)$/.test(source)
      && ["ADDRESS_EXACT", "POI_EXACT"].includes(String(location.matchLevel || "").toUpperCase()));
  if (!routingSource) return false;
  return Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude));
}

export async function recoverWayplanLocations<Row extends RecoverableWayplanRow>(
  rows: Row[],
  dependencies: RecoveryDependencies<Row>,
) {
  const output = rows.map((row) => ({ ...row })) as Row[];
  const pendingIndexes = output.flatMap((row, index) => hasCoordinate(row) ? [] : [index]);
  const unresolvedIds: string[] = [];
  let recovered = 0;
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(6, Math.trunc(dependencies.concurrency || 3)));

  async function worker() {
    while (cursor < pendingIndexes.length) {
      const index = pendingIndexes[cursor++];
      const row = output[index];
      try {
        const location = await dependencies.resolve(row);
        if (!acceptedLocation(location)) {
          unresolvedIds.push(row.delivery_way_id);
          continue;
        }
        await dependencies.persist(location);
        output[index] = {
          ...row,
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          location_review_status: "ACCEPTED",
          location_coordinate_source: location.coordinateSource,
        } as Row;
        recovered += 1;
      } catch {
        unresolvedIds.push(row.delivery_way_id);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, pendingIndexes.length)) }, () => worker()));

  return {
    rows: output,
    attempted: pendingIndexes.length,
    recovered,
    unresolved: unresolvedIds.length,
    unresolvedIds,
  };
}
