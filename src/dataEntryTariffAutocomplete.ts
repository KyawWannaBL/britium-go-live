import { supabase } from "@/integrations/supabase/client";
import "./styles/dataEntryTariffAutocomplete.css";

type TownshipSuggestion = {
  township?: string;
  township_name?: string;
  city?: string;
  region?: string;
  zone_code?: string;
};

type DeliveryFeeResult = {
  ok?: boolean;
  delivery_fee?: number | string;
  base_fee?: number | string;
  cod_fee?: number | string;
  tariff_code?: string;
  tariff_name?: string;
  message?: string;
  township?: string;
  city?: string;
  zone_code?: string;
};

const FALLBACK_TOWNSHIPS: TownshipSuggestion[] = [
  { township: "Ahlone", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Bahan", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Dagon", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Dagon Seikkan", city: "Yangon", zone_code: "YGN_OUTER" },
  { township: "Hlaing", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Kamayut", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Kyauktada", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Mayangone", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "North Okkalapa", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "South Okkalapa", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Sanchaung", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Thingangyun", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Yankin", city: "Yangon", zone_code: "YGN_LOCAL" },
  { township: "Insein", city: "Yangon", zone_code: "YGN_OUTER" },
  { township: "Hlaing Tharyar", city: "Yangon", zone_code: "YGN_OUTER" },
  { township: "Shwepyithar", city: "Yangon", zone_code: "YGN_OUTER" },
  { township: "Thanlyin", city: "Yangon", zone_code: "YGN_OUTER" },
  { township: "Mandalay", city: "Mandalay", zone_code: "MDY_LOCAL" },
  { township: "Naypyitaw", city: "Naypyitaw", zone_code: "NPT_LOCAL" },
];

const timers = new WeakMap<HTMLInputElement, number>();

function isDataEntryRoute() {
  return window.location.hash.includes("/data-entry") || window.location.pathname.includes("/data-entry");
}

function ensureDatalist() {
  let list = document.getElementById("be-township-suggestions") as HTMLDataListElement | null;
  if (!list) {
    list = document.createElement("datalist");
    list.id = "be-township-suggestions";
    document.body.appendChild(list);
  }
  return list;
}

function normalizeSuggestions(data: any): TownshipSuggestion[] {
  if (!data) return [];
  if (typeof data === "string") {
    try {
      return normalizeSuggestions(JSON.parse(data));
    } catch {
      return [];
    }
  }
  if (Array.isArray(data)) return data as TownshipSuggestion[];
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.townships)) return data.townships;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

async function fetchTownships(query: string) {
  const q = query.trim();

  try {
    const { data, error } = await (supabase as any).rpc("be_data_entry_township_suggest", {
      p_query: q,
      p_limit: 20,
    });
    if (!error) {
      const rows = normalizeSuggestions(data);
      if (rows.length) return rows;
    }
  } catch (error) {
    console.warn("Township RPC unavailable; using local fallback", error);
  }

  const lower = q.toLowerCase();
  return FALLBACK_TOWNSHIPS.filter((item) => {
    const name = `${item.township || item.township_name || ""} ${item.city || ""} ${item.zone_code || ""}`.toLowerCase();
    return !lower || name.includes(lower);
  }).slice(0, 20);
}

function setDatalist(items: TownshipSuggestion[]) {
  const list = ensureDatalist();
  list.innerHTML = "";

  items.forEach((item) => {
    const name = item.township || item.township_name || "";
    if (!name) return;
    const opt = document.createElement("option");
    opt.value = name;
    opt.label = [item.city, item.zone_code].filter(Boolean).join(" · ");
    list.appendChild(opt);
  });
}

function getOrCreateHint(input: HTMLInputElement) {
  const cell = input.closest("td") || input.parentElement || input;
  let hint = cell.querySelector(".be-township-hint") as HTMLElement | null;
  if (!hint) {
    hint = document.createElement("div");
    hint.className = "be-township-hint";
    input.insertAdjacentElement("afterend", hint);
  }
  return hint;
}

function getOrCreateFeeBadge(deliveryInput: HTMLInputElement) {
  const cell = deliveryInput.closest("td") || deliveryInput.parentElement || deliveryInput;
  let badge = cell.querySelector(".be-auto-fee-badge") as HTMLElement | null;
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "be-auto-fee-badge";
    deliveryInput.insertAdjacentElement("afterend", badge);
  }
  return badge;
}

function readNumber(input: HTMLInputElement | null) {
  if (!input) return 0;
  const n = Number(String(input.value || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: any) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-US").format(Number.isFinite(n) ? n : 0);
}

function getRowInput(row: Element | null, name: string) {
  if (!row) return null;
  return row.querySelector(`input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`) as HTMLInputElement | null;
}

function readServiceType(row: Element | null) {
  return (
    getRowInput(row, "service_type")?.value ||
    getRowInput(row, "delivery_type")?.value ||
    (document.querySelector("[data-be-service-type]") as HTMLInputElement | null)?.value ||
    "STANDARD"
  );
}

function readParcelType(row: Element | null) {
  return (
    getRowInput(row, "parcel_type")?.value ||
    getRowInput(row, "master_type")?.value ||
    getRowInput(row, "item_type")?.value ||
    "NORMAL"
  );
}

async function calculateDeliveryFee(townshipInput: HTMLInputElement) {
  const township = townshipInput.value.trim();
  const row = townshipInput.closest("tr");
  const deliveryInput = getRowInput(row, "delivery_fee");
  if (!township || !deliveryInput) return;

  const cod = readNumber(getRowInput(row, "cod_amount"));
  const weight = readNumber(getRowInput(row, "weight")) || 1;
  const serviceType = readServiceType(row);
  const parcelType = readParcelType(row);

  const badge = getOrCreateFeeBadge(deliveryInput);
  badge.className = "be-auto-fee-badge warn";
  badge.textContent = "Calculating tariff...";

  try {
    const { data, error } = await (supabase as any).rpc("be_data_entry_calculate_delivery_charge", {
      p_township: township,
      p_service_type: serviceType,
      p_parcel_type: parcelType,
      p_cod_amount: cod,
      p_weight: weight,
    });

    if (error) throw error;

    const result: DeliveryFeeResult = Array.isArray(data) ? data[0] : data;
    if (result?.ok && result.delivery_fee !== undefined && result.delivery_fee !== null) {
      deliveryInput.value = String(result.delivery_fee);
      deliveryInput.dispatchEvent(new Event("input", { bubbles: true }));
      deliveryInput.dispatchEvent(new Event("change", { bubbles: true }));
      badge.className = "be-auto-fee-badge";
      badge.textContent = `Auto tariff: ${formatMoney(result.delivery_fee)} Ks · ${result.tariff_code || result.zone_code || ""}`;
    } else {
      badge.className = "be-auto-fee-badge warn";
      badge.textContent = result?.message || "No tariff found";
    }
  } catch (error: any) {
    console.warn("Delivery fee calculation failed", error);
    badge.className = "be-auto-fee-badge warn";
    badge.textContent = "Tariff RPC missing or failed";
  }
}

async function handleTownshipInput(input: HTMLInputElement) {
  const query = input.value.trim();
  const hint = getOrCreateHint(input);

  const rows = await fetchTownships(query);
  setDatalist(rows);

  const exact = rows.find((item) => {
    const name = item.township || item.township_name || "";
    return name.toLowerCase() === query.toLowerCase();
  });

  const best = exact || rows[0];
  if (best) {
    const name = best.township || best.township_name || "";
    hint.innerHTML = `Suggestion: <strong>${name}</strong>${best.city ? ` · ${best.city}` : ""}${best.zone_code ? ` · ${best.zone_code}` : ""}`;
  } else {
    hint.textContent = "No township suggestion found.";
  }

  if (query.length >= 2) {
    await calculateDeliveryFee(input);
  }
}

function enhanceTownshipInput(input: HTMLInputElement) {
  if ((input as any).dataset.beTownshipEnhanced === "true") return;
  (input as any).dataset.beTownshipEnhanced = "true";
  input.setAttribute("list", "be-township-suggestions");
  input.setAttribute("autocomplete", "off");
  input.placeholder = input.placeholder || "Type township...";

  input.addEventListener("focus", () => {
    void handleTownshipInput(input);
  });

  input.addEventListener("input", () => {
    const previous = timers.get(input);
    if (previous) window.clearTimeout(previous);
    const id = window.setTimeout(() => void handleTownshipInput(input), 350);
    timers.set(input, id);
  });

  input.addEventListener("change", () => {
    void handleTownshipInput(input);
  });

  input.addEventListener("blur", () => {
    void calculateDeliveryFee(input);
  });
}

function enhanceExisting() {
  if (!isDataEntryRoute()) return;

  ensureDatalist();

  const inputs = Array.from(
    document.querySelectorAll(
      'input[name="township"], input[placeholder*="Township"], input[placeholder*="township"], input[aria-label*="Township"], input[aria-label*="township"]'
    )
  ) as HTMLInputElement[];

  inputs.forEach(enhanceTownshipInput);

  const feeDrivers = Array.from(
    document.querySelectorAll(
      'input[name="cod_amount"], input[name="weight"], input[name="service_type"], select[name="service_type"], input[name="parcel_type"], select[name="parcel_type"], input[name="master_type"], select[name="master_type"]'
    )
  ) as HTMLInputElement[];

  feeDrivers.forEach((driver) => {
    if ((driver as any).dataset.beFeeDriverBound === "true") return;
    (driver as any).dataset.beFeeDriverBound = "true";
    driver.addEventListener("input", () => {
      const row = driver.closest("tr");
      const township = getRowInput(row, "township");
      if (township) void calculateDeliveryFee(township);
    });
    driver.addEventListener("change", () => {
      const row = driver.closest("tr");
      const township = getRowInput(row, "township");
      if (township) void calculateDeliveryFee(township);
    });
  });
}

function boot() {
  enhanceExisting();

  const observer = new MutationObserver(() => enhanceExisting());
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => setTimeout(enhanceExisting, 250));
  window.setInterval(enhanceExisting, 1500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
