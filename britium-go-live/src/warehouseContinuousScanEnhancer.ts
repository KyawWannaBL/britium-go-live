// Warehouse UX enhancer: persistent scan mode, Myanmar return reasons, manual fallback,
// phone-camera auto-submit, and table space cleanup. Runs only on the Warehouse route.
// IMPORTANT: all DOM writes are idempotent and performed with the observer disconnected
// to prevent MutationObserver feedback loops / browser freezes.

const MANUAL_CODE = "OTHER_MANUAL";
const MANUAL_LABEL = "အခြားအကြောင်းပြချက် — ကိုယ်တိုင်ရိုက်ထည့်မည်";

const MM_LABELS: Record<string, string> = {
  COD_NOT_READY: "COD ငွေ မပြင်ဆင်ရသေးပါ",
  CUSTOMER_NOT_AVAILABLE: "Customer မရှိ / မရရှိနိုင်",
  CUSTOMER_REFUSED: "Customer မှ လက်မခံပါ",
  CUSTOMER_REQUESTED_RESCHEDULE: "Customer မှ ပြန်ချိန်းဆိုရန် တောင်းဆိုသည်",
  NO_ACCESS_TO_BUILDING: "အဆောက်အဦး/ဝင်းအတွင်း ဝင်ခွင့်မရပါ",
  PARCEL_DAMAGED: "ပစ္စည်း ပျက်စီးနေသည်",
  PHONE_UNREACHABLE: "ဖုန်းဆက်မရပါ",
  RIDER_ISSUE: "Rider ဘက်မှ လုပ်ငန်းဆိုင်ရာ ပြဿနာ",
  WEATHER_TRAFFIC_ISSUE: "ရာသီဥတု/လမ်းကြောင်း ပြဿနာ",
  WRONG_ADDRESS: "လိပ်စာ မှားယွင်းသည်",
  DAMAGED_PARCEL: "ပစ္စည်း ပျက်စီးနေသည်",
  DUPLICATE_SCAN: "Scan ထပ်နေသည်",
  HOLD_BY_CUSTOMER_SERVICE: "Customer Service မှ Hold ပြုလုပ်ထားသည်",
  HOLD_BY_FINANCE: "Finance မှ Hold ပြုလုပ်ထားသည်",
  MISSING_INVOICE: "Invoice မပါရှိပါ",
  RESTRICTED_ITEM: "တားမြစ်ပစ္စည်း",
  UNIDENTIFIED_PARCEL: "မသိရှိနိုင်သော ပစ္စည်း",
  WAYBILL_MISMATCH: "Waybill မကိုက်ညီပါ",
  WEIGHT_MISMATCH: "အလေးချိန် မကိုက်ညီပါ",
  WRONG_DESTINATION: "ဦးတည်ရာ မှားယွင်းသည်",
};

function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  if (el.value === value) return;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function warehouseRoot(): HTMLElement | null {
  if (!location.hash.startsWith("#/warehouse")) return null;
  return document.querySelector("main[data-be-main='true']") || document.body;
}

function findModeSelect(root: ParentNode): HTMLSelectElement | null {
  return Array.from(root.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.value === "inbound") &&
    Array.from(s.options).some((o) => o.value === "dispatch") &&
    Array.from(s.options).some((o) => o.value === "return")
  ) || null;
}

function findReasonSelect(root: ParentNode, modeSelect: HTMLSelectElement | null): HTMLSelectElement | null {
  return Array.from(root.querySelectorAll("select")).find((s) => s !== modeSelect &&
    Array.from(s.options).some((o) => MM_LABELS[o.value])) || null;
}

function findRemarkInput(root: ParentNode): HTMLInputElement | null {
  return Array.from(root.querySelectorAll("input")).find((i) =>
    /return remark|phone note|မှတ်ချက်/i.test(i.placeholder || "")
  ) || null;
}

function beautifyReasonDropdown(select: HTMLSelectElement) {
  for (const option of Array.from(select.options)) {
    const mm = MM_LABELS[option.value];
    if (mm && option.textContent !== mm) option.textContent = mm;
  }
  if (!Array.from(select.options).some((o) => o.value === MANUAL_CODE)) {
    const option = document.createElement("option");
    option.value = MANUAL_CODE;
    option.textContent = MANUAL_LABEL;
    select.appendChild(option);
  }
}

function ensureManualInput(root: HTMLElement, reasonSelect: HTMLSelectElement, remarkInput: HTMLInputElement | null) {
  let manual = root.querySelector<HTMLInputElement>("#be-warehouse-manual-fail-reason");
  if (!manual) {
    manual = document.createElement("input");
    manual.id = "be-warehouse-manual-fail-reason";
    manual.type = "text";
    manual.autocomplete = "off";
    manual.placeholder = "အခြားအကြောင်းပြချက်ကို မြန်မာဘာသာဖြင့် ရိုက်ထည့်ပါ";
    manual.className = remarkInput?.className || "rounded-lg border border-slate-700 bg-[#071827] p-3";
    manual.style.display = "none";
    manual.setAttribute("aria-label", "Manual failed reason in Myanmar");
    reasonSelect.insertAdjacentElement("afterend", manual);
  }

  const sync = () => {
    const isManual = reasonSelect.value === MANUAL_CODE;
    const desiredManualDisplay = isManual ? "block" : "none";
    if (manual!.style.display !== desiredManualDisplay) manual!.style.display = desiredManualDisplay;
    if (remarkInput) {
      const desiredRemarkDisplay = isManual ? "none" : "block";
      if (remarkInput.style.display !== desiredRemarkDisplay) remarkInput.style.display = desiredRemarkDisplay;
      if (isManual) setNativeValue(remarkInput, manual!.value.trim());
    }
  };

  if (!reasonSelect.dataset.beManualBound) {
    reasonSelect.dataset.beManualBound = "1";
    reasonSelect.addEventListener("change", sync);
    manual.addEventListener("input", () => {
      if (reasonSelect.value === MANUAL_CODE && remarkInput) setNativeValue(remarkInput, manual!.value);
    });
  }
  sync();
}

function hideRedundantTableColumns(root: HTMLElement) {
  for (const table of Array.from(root.querySelectorAll("table"))) {
    const headers = Array.from(table.querySelectorAll("thead th"));
    const labels = headers.map((h) => (h.textContent || "").trim().toUpperCase());
    const deliveryIdx = labels.indexOf("DELIVERY WAY");
    const waybillIdx = labels.indexOf("WAYBILL");
    const actionIdx = labels.indexOf("ACTIONS");

    if (waybillIdx >= 0 && deliveryIdx >= 0) {
      if (headers[waybillIdx].textContent !== "WAY ID / WAYBILL") headers[waybillIdx].textContent = "WAY ID / WAYBILL";
      const col = deliveryIdx + 1;
      table.querySelectorAll(`tr > *:nth-child(${col})`).forEach((el) => {
        const node = el as HTMLElement;
        if (node.style.display !== "none") node.style.display = "none";
      });
    }
    if (actionIdx >= 0) {
      const col = actionIdx + 1;
      table.querySelectorAll(`tr > *:nth-child(${col})`).forEach((el) => {
        const node = el as HTMLElement;
        if (node.style.display !== "none") node.style.display = "none";
      });
    }
  }
}

function autoSubmitCameraRead(root: HTMLElement, modeSelect: HTMLSelectElement | null) {
  if (!modeSelect) return;
  const statuses = Array.from(root.querySelectorAll<HTMLElement>("[role='status']"));
  for (const status of statuses) {
    const text = status.textContent || "";
    if (!/^Read\s+.+Choose Inbound, Dispatch or Return to save\.$/i.test(text)) continue;
    if (status.dataset.beAutoSubmitted === text) continue;
    status.dataset.beAutoSubmitted = text;
    const mode = modeSelect.value;
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
      (b.textContent || "").trim().toLowerCase().startsWith(mode)
    );
    button?.click();
  }
}

function enhance() {
  const root = warehouseRoot();
  if (!root) return;
  const modeSelect = findModeSelect(root);
  const reasonSelect = findReasonSelect(root, modeSelect);
  const remarkInput = findRemarkInput(root);

  if (modeSelect) {
    if (modeSelect.getAttribute("aria-label") !== "Warehouse continuous scan mode") {
      modeSelect.setAttribute("aria-label", "Warehouse continuous scan mode");
    }
    const label = modeSelect.closest("label");
    if (label && !label.dataset.beContinuousLabel) {
      label.dataset.beContinuousLabel = "1";
      const textNode = Array.from(label.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = "Continuous scan mode / လုပ်ငန်းစဉ်ကို တစ်ကြိမ်ရွေးပါ: ";
    }
  }

  if (reasonSelect) {
    beautifyReasonDropdown(reasonSelect);
    ensureManualInput(root, reasonSelect, remarkInput);
  }

  hideRedundantTableColumns(root);
  autoSubmitCameraRead(root, modeSelect);
}

if (typeof window !== "undefined") {
  let observer: MutationObserver | null = null;
  let scheduled = false;
  let running = false;

  const observe = () => {
    if (!observer || !document.body) return;
    observer.observe(document.body, { subtree: true, childList: true });
  };

  const runSafely = () => {
    scheduled = false;
    if (running) return;
    running = true;
    observer?.disconnect();
    try {
      enhance();
    } finally {
      running = false;
      observe();
    }
  };

  const schedule = () => {
    if (!location.hash.startsWith("#/warehouse") || scheduled || running) return;
    scheduled = true;
    window.requestAnimationFrame(runSafely);
  };

  observer = new MutationObserver(() => schedule());
  window.addEventListener("hashchange", schedule);

  const start = () => {
    schedule();
    observe();
  };

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
