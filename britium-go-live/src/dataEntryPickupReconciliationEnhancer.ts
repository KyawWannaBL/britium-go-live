import { supabase } from "@/integrations/supabase/client";
import {
  buildUnresolvedExportRows,
  parseCorrectedWorkbookRows,
  type ReconciliationParcelRow,
} from "@/lib/pickupReconciliation";

const PANEL_ID = "britium-pickup-reconciliation-panel";
const RECONCILIATION_TOGGLE_ID = "britium-pickup-reconciliation-toggle";
const FILE_INPUT_ID = "britium-pickup-reconciliation-upload";
const LEGACY_TEXT = "DOWNLOAD UNRESOLVED ROWS";
const CHUNK_SIZE = 50;

type DraftRow = {
  owner_id?: string;
  pickup_id?: string;
  parcel_sequence?: number;
  snapshot?: Record<string, unknown> | null;
  skipped?: boolean;
  updated_at?: string;
};

type PickupState = {
  pickupId: string;
  expected: number;
  registered: number;
  unresolvedRows: ReconciliationParcelRow[];
  drafts: DraftRow[];
};

function normalizeText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function positiveInt(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function pickupSelect(): HTMLSelectElement | null {
  for (const element of Array.from(document.querySelectorAll("select"))) {
    const select = element as HTMLSelectElement;
    const hasBulkOption = Array.from(select.options).some((option) =>
      normalizeText(option.textContent).includes("Bulk upload · Way ID + Merchant Name"),
    );
    if (hasBulkOption) return select;
  }
  return null;
}

function selectedPickupId(): string {
  const value = normalizeText(pickupSelect()?.value);
  return value && value !== "__BULK_UPLOAD__" ? value : "";
}

function hideLegacyJsonButton(): boolean {
  let found = false;
  for (const button of Array.from(document.querySelectorAll("button"))) {
    if (normalizeText(button.textContent).toUpperCase() !== LEGACY_TEXT) continue;
    found = true;
    (button as HTMLButtonElement).style.display = "none";
    button.setAttribute("aria-hidden", "true");
  }
  return found;
}

function expectedFromPickupId(pickupId: string): number {
  const tail = pickupId.match(/-(\d+)$/)?.[1];
  return positiveInt(tail);
}

async function loadPickupState(pickupId: string): Promise<PickupState> {
  const [draftResult, registeredResult] = await Promise.all([
    (supabase as any)
      .from("be_data_entry_pending_drafts")
      .select("owner_id,pickup_id,parcel_sequence,snapshot,skipped,updated_at")
      .eq("pickup_id", pickupId)
      .order("parcel_sequence", { ascending: true }),
    (supabase as any)
      .from("be_data_entry_parcel_details")
      .select("parcel_sequence")
      .eq("pickup_id", pickupId),
  ]);
  if (draftResult.error) throw draftResult.error;
  if (registeredResult.error) throw registeredResult.error;

  const drafts: DraftRow[] = Array.isArray(draftResult.data) ? draftResult.data : [];
  const registeredSequences = new Set<number>(
    (Array.isArray(registeredResult.data) ? registeredResult.data : [])
      .map((row: any) => positiveInt(row?.parcel_sequence))
      .filter(Boolean),
  );
  const rows: ReconciliationParcelRow[] = drafts.map((draft) => {
    const sequence = positiveInt(draft.parcel_sequence);
    const snapshot = draft.snapshot && typeof draft.snapshot === "object" ? draft.snapshot : {};
    return {
      ...snapshot,
      pickup_id: pickupId,
      parcel_sequence: sequence,
      saved: registeredSequences.has(sequence),
      skipped: Boolean(draft.skipped),
    } as ReconciliationParcelRow;
  });
  const maxSequence = rows.reduce((max, row) => Math.max(max, positiveInt(row.parcel_sequence)), 0);
  const expected = Math.max(expectedFromPickupId(pickupId), drafts.length, maxSequence, registeredSequences.size);
  return {
    pickupId,
    expected,
    registered: registeredSequences.size,
    unresolvedRows: rows.filter((row) => !row.saved),
    drafts,
  };
}

function setStatus(message: string, isError = false): void {
  const status = document.querySelector<HTMLElement>(`#${PANEL_ID} [data-reconciliation-status]`);
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "#fecaca" : "#d1fae5";
}

function setBusy(busy: boolean): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  for (const button of Array.from(panel.querySelectorAll("button"))) {
    (button as HTMLButtonElement).disabled = busy;
    (button as HTMLButtonElement).style.opacity = busy ? "0.55" : "1";
  }
}

async function refreshSummary(): Promise<void> {
  const pickupId = selectedPickupId();
  if (!pickupId) {
    setStatus("Select a pickup request to reconcile.");
    return;
  }
  try {
    const state = await loadPickupState(pickupId);
    const outstanding = Math.max(state.expected - state.registered, 0);
    setStatus(`${pickupId}: ${state.expected} expected · ${state.registered} registered · ${outstanding} unresolved.`);
  } catch (error: any) {
    setStatus(error?.message || "Unable to read reconciliation state.", true);
  }
}

async function downloadUnresolvedExcel(): Promise<void> {
  const pickupId = selectedPickupId();
  if (!pickupId) throw new Error("Select a pickup request first.");
  const state = await loadPickupState(pickupId);
  if (!state.unresolvedRows.length) throw new Error(`${pickupId} has no unresolved Data Entry parcels.`);
  const XLSX = await import("xlsx");
  const unresolved = buildUnresolvedExportRows(state.unresolvedRows);
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet([
    {
      "Pickup ID": pickupId,
      "Expected Parcels": state.expected,
      "Registered Parcels": state.registered,
      "Unresolved Parcels": state.unresolvedRows.length,
      "Instruction": "Correct only the unresolved rows, keep Pickup ID and Parcel Sequence unchanged, then upload this workbook back into Britium.",
    },
  ]);
  const unresolvedSheet = XLSX.utils.json_to_sheet(unresolved);
  unresolvedSheet["!cols"] = [
    { wch: 18 }, { wch: 16 }, { wch: 26 }, { wch: 24 }, { wch: 24 }, { wch: 18 },
    { wch: 48 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 },
    { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 48 },
    { wch: 18 }, { wch: 36 },
  ];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, unresolvedSheet, "Unresolved");
  XLSX.writeFile(workbook, `Britium_Unresolved_${pickupId}.xlsx`, { compression: true });
  setStatus(`Downloaded ${state.unresolvedRows.length} unresolved parcel(s) for ${pickupId} as Excel.`);
}

async function uploadCorrectedExcel(file: File): Promise<void> {
  const pickupId = selectedPickupId();
  if (!pickupId) throw new Error("Select a pickup request first.");
  const state = await loadPickupState(pickupId);
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetName = workbook.SheetNames.includes("Unresolved") ? "Unresolved" : workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook does not contain a worksheet.");
  const workbookRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
  if (!workbookRows.length) throw new Error("No corrected parcel rows were found in the workbook.");

  const allowed = new Set(state.unresolvedRows.map((row) => positiveInt(row.parcel_sequence)).filter(Boolean));
  const parsed = parseCorrectedWorkbookRows(workbookRows, pickupId, allowed);
  if (parsed.errors.length) {
    throw new Error(`Workbook rejected: ${parsed.errors.slice(0, 8).join(" | ")}${parsed.errors.length > 8 ? ` | +${parsed.errors.length - 8} more` : ""}`);
  }
  if (!parsed.updates.length) throw new Error("No valid unresolved parcels were found to import.");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError || new Error("Sign in before importing corrected parcels.");
  const draftBySequence = new Map<number, DraftRow>(
    state.drafts.map((draft) => [positiveInt(draft.parcel_sequence), draft]),
  );
  const now = new Date().toISOString();
  const upserts = parsed.updates.map(({ parcel_sequence, patch }) => {
    const draft = draftBySequence.get(parcel_sequence);
    if (!draft) throw new Error(`Parcel sequence ${parcel_sequence} is no longer available as a pending draft.`);
    const snapshot = draft.snapshot && typeof draft.snapshot === "object" ? draft.snapshot : {};
    return {
      owner_id: authData.user.id,
      pickup_id: pickupId,
      parcel_sequence,
      skipped: false,
      updated_at: now,
      snapshot: {
        ...snapshot,
        ...patch,
        pickup_id: pickupId,
        parcel_sequence,
        saved: false,
        skipped: false,
        checking: false,
        calculating: false,
      },
    };
  });

  for (let offset = 0; offset < upserts.length; offset += CHUNK_SIZE) {
    const result = await (supabase as any)
      .from("be_data_entry_pending_drafts")
      .upsert(upserts.slice(offset, offset + CHUNK_SIZE), { onConflict: "owner_id,pickup_id,parcel_sequence" });
    if (result.error) throw new Error(`Corrected workbook import stopped at row ${offset + 1}: ${result.error.message}`);
  }
  setStatus(`Imported ${upserts.length} corrected parcel(s) into ${pickupId}. Reloading the pickup for Calculate All / Save All.`);
  window.setTimeout(() => window.location.reload(), 650);
}

function makeButton(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText = "border:1px solid rgba(251,191,36,.65);background:#1f2937;color:#fef3c7;border-radius:8px;padding:9px 12px;font:800 11px/1.2 system-ui;cursor:pointer;white-space:nowrap";
  button.addEventListener("click", async () => {
    try {
      setBusy(true);
      await onClick();
    } catch (error: any) {
      setStatus(error?.message || "Reconciliation action failed.", true);
    } finally {
      setBusy(false);
    }
  });
  return button;
}

function toggleReconciliationPanel(open?: boolean): void {
  const panel = document.getElementById(PANEL_ID);
  const toggle = document.getElementById(RECONCILIATION_TOGGLE_ID) as HTMLButtonElement | null;
  if (!panel) return;
  const shouldOpen = open ?? panel.style.display === "none";
  panel.style.display = shouldOpen ? "block" : "none";
  toggle?.setAttribute("aria-expanded", String(shouldOpen));
}

function createReconciliationToggle(): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = RECONCILIATION_TOGGLE_ID;
  button.type = "button";
  button.textContent = "PICKUP RECONCILIATION";
  button.setAttribute("aria-expanded", "false");
  button.style.cssText = "position:fixed;right:18px;bottom:66px;z-index:2147482999;border:1px solid rgba(251,191,36,.65);background:#071b2b;color:#fbbf24;border-radius:999px;padding:10px 14px;font:900 10px/1.2 system-ui;letter-spacing:.08em;box-shadow:0 10px 30px rgba(0,0,0,.32);cursor:pointer";
  button.addEventListener("click", () => toggleReconciliationPanel());
  return button;
}

function createPanel(): HTMLElement {
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.style.cssText = "position:fixed;right:18px;bottom:112px;z-index:2147483000;max-width:min(680px,calc(100vw - 36px));background:#071b2b;border:1px solid rgba(251,191,36,.55);box-shadow:0 16px 50px rgba(0,0,0,.4);border-radius:12px;padding:12px;color:white;font-family:system-ui";
  panel.style.display = "none";

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px";
  const title = document.createElement("div");
  title.textContent = "PICKUP RECONCILIATION";
  title.style.cssText = "font:900 11px/1.2 system-ui;letter-spacing:.12em;color:#fbbf24";
  header.appendChild(title);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close Pickup Reconciliation");
  closeButton.style.cssText = "border:1px solid rgba(148,163,184,.45);background:#102536;color:white;border-radius:7px;padding:3px 8px;font:900 15px/1 system-ui;cursor:pointer";
  closeButton.addEventListener("click", () => toggleReconciliationPanel(false));
  header.appendChild(closeButton);
  panel.appendChild(header);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;align-items:center";
  actions.appendChild(makeButton("DOWNLOAD UNRESOLVED EXCEL", downloadUnresolvedExcel));
  const uploadButton = makeButton("UPLOAD CORRECTED EXCEL", async () => {
    const input = document.getElementById(FILE_INPUT_ID) as HTMLInputElement | null;
    input?.click();
  });
  actions.appendChild(uploadButton);
  actions.appendChild(makeButton("REFRESH RECONCILIATION", refreshSummary));
  panel.appendChild(actions);

  const input = document.createElement("input");
  input.id = FILE_INPUT_ID;
  input.type = "file";
  input.accept = ".xlsx,.xls";
  input.style.display = "none";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      setBusy(true);
      await uploadCorrectedExcel(file);
    } catch (error: any) {
      setStatus(error?.message || "Corrected workbook import failed.", true);
    } finally {
      setBusy(false);
    }
  });
  panel.appendChild(input);

  const status = document.createElement("div");
  status.dataset.reconciliationStatus = "true";
  status.style.cssText = "margin-top:9px;font:700 11px/1.4 system-ui;color:#d1fae5";
  status.textContent = "Select a pickup request to reconcile.";
  panel.appendChild(status);
  return panel;
}

let scheduled = false;
function reconcileDom(): void {
  scheduled = false;
  const active = hideLegacyJsonButton();
  let panel = document.getElementById(PANEL_ID);
  let toggle = document.getElementById(RECONCILIATION_TOGGLE_ID);
  if (!active) {
    if (panel) panel.style.display = "none";
    if (toggle) toggle.style.display = "none";
    return;
  }
  if (!toggle) {
    toggle = createReconciliationToggle();
    document.body.appendChild(toggle);
  }
  toggle.style.display = "block";
  if (!panel) {
    panel = createPanel();
    document.body.appendChild(panel);
  }
}

function scheduleDomReconcile(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(reconcileDom);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  scheduleDomReconcile();
  new MutationObserver(scheduleDomReconcile).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("change", (event) => {
    if (event.target === pickupSelect()) window.setTimeout(() => void refreshSummary(), 0);
  }, true);
  window.setTimeout(() => void refreshSummary(), 400);
}
