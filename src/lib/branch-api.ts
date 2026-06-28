type AnyRecord = Record<string, any>;

function okArray<T = AnyRecord>(): T[] {
  return [];
}

function okObject<T = AnyRecord>(extra: T = {} as T): T {
  return extra;
}

export async function getBranchOffices() {
  return okArray();
}

export async function getBranchSnapshot(branchCode?: string) {
  return okObject({
    branch_code: branchCode || null,
    summary: {},
    shipments: [],
    staff: [],
    amendments: [],
    notifications: [],
  });
}

export async function getBranchStaff(branchCode?: string) {
  return okArray();
}

export async function addBranchStaff(payload: AnyRecord) {
  return okObject({ ...payload, status: "created" });
}

export async function updateBranchStaff(id: string | number, payload: AnyRecord) {
  return okObject({ id, ...payload, status: "updated" });
}

export async function deleteBranchStaff(id: string | number) {
  return okObject({ id, status: "deleted" });
}

export async function getBranchShipments(branchCode?: string) {
  return okArray();
}

export async function createBranchShipment(payload: AnyRecord) {
  return okObject({ ...payload, status: "created" });
}

export async function updateBranchShipment(id: string | number, payload: AnyRecord) {
  return okObject({ id, ...payload, status: "updated" });
}

export async function lockBranchShipment(id: string | number) {
  return okObject({ id, locked: true });
}

export async function unlockBranchShipment(id: string | number) {
  return okObject({ id, locked: false });
}

export async function getBranchAmendments(branchCode?: string) {
  return okArray();
}

export async function getAllPendingAmendments() {
  return okArray();
}

export async function submitAmendmentRequest(payload: AnyRecord) {
  return okObject({ ...payload, status: "pending" });
}

export async function reviewAmendment(id: string | number, payload: AnyRecord) {
  return okObject({ id, ...payload, status: "reviewed" });
}

export async function fetchTariffs() {
  return okArray();
}

export async function updateTariff(id: string | number, payload: AnyRecord) {
  return okObject({ id, ...payload, status: "updated" });
}

export async function calculateFee(payload: AnyRecord) {
  const weight = Number(payload?.weight || payload?.actual_weight || 0);
  const baseFee = Number(payload?.base_fee || 0);
  const extraWeightFee = Math.max(0, Math.ceil(weight) - 3) * 500;

  return okObject({
    base_fee: baseFee,
    extra_weight_fee: extraWeightFee,
    total_fee: baseFee + extraWeightFee,
  });
}

export async function fetchServiceAreas() {
  return okArray();
}

export async function addServiceArea(payload: AnyRecord) {
  return okObject({ ...payload, status: "created" });
}

export async function deleteServiceArea(id: string | number) {
  return okObject({ id, status: "deleted" });
}
