import { supabase } from "@/integrations/supabase/client";
import { resolveDeliveryLocation, validMyanmarCoordinate } from "@/lib/deliveryLocationService";

const AUTO_GEO_BUTTON_TEXT = "Auto-Geocode Review File";
const ROUTE_READY_LEVELS = new Set(["ADDRESS_EXACT", "POI_EXACT"]);

function isAutoGeoInput(input: HTMLInputElement) {
  if (input.type !== "file") return false;
  const button = input.nextElementSibling as HTMLButtonElement | null;
  return Boolean(button && /Auto-Geocode Review File/i.test(button.textContent || ""));
}

function statusNode(input: HTMLInputElement) {
  const host = input.parentElement;
  if (!host) return null;
  let node = host.querySelector<HTMLElement>("[data-be-safe-auto-geo-status='true']");
  if (!node) {
    node = document.createElement("div");
    node.dataset.beSafeAutoGeoStatus = "true";
    node.style.marginTop = "8px";
    node.style.padding = "8px";
    node.style.border = "1px solid #6b8ca3";
    node.style.borderRadius = "8px";
    node.style.fontSize = "11px";
    node.style.lineHeight = "1.45";
    node.style.color = "#d8efff";
    node.style.background = "#071b2b";
    host.appendChild(node);
  }
  return node;
}

function setStatus(input: HTMLInputElement, message: string) {
  const node = statusNode(input);
  if (node) node.textContent = message;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function trustedAutoLocation(location: any) {
  return Boolean(
    location
    && location.reviewStatus === "ACCEPTED"
    && ROUTE_READY_LEVELS.has(String(location.matchLevel || "").toUpperCase())
    && Number(location.confidence || 0) >= 0.95
    && validMyanmarCoordinate(location.longitude, location.latitude)
  );
}

async function resolveRow(row: Record<string, any>, index: number) {
  const deliveryWayId = text(row["Delivery Way ID"] || row["Way ID"] || `REVIEW-${index + 2}`);
  const address = text(row["Delivery Address"] || row["Recipient Address"] || row["Receiver Address"]);
  const township = text(row["Township"] || row["Township (Dropdown)"] || row["Corrected Township"]);
  const ward = text(row["Ward / Village Tract (Dropdown)"] || row["Ward"]);
  const postalCode = text(row["Postal Code (Auto)"] || row["Postal Code"]);

  row["Corrected Latitude"] = "";
  row["Corrected Longitude"] = "";
  row["Manual Pin Confirmed"] = "NO";
  row["Route Eligible"] = "NO";

  if (!address || !township) {
    row["Action"] = "APPLY_CORRECTION";
    row["Suggested Review Status"] = "MANUAL_REVIEW";
    row["Quality Gate"] = "REVIEW_REQUIRED";
    row["Reason"] = "Address or township is missing. Correct the address/township and manually pin the actual delivery point.";
    return row;
  }

  try {
    const location = await resolveDeliveryLocation({
      deliveryWayId,
      address,
      township,
      ward,
      postalCode,
      client: supabase,
    });

    if (!location || !validMyanmarCoordinate(location.longitude, location.latitude)) {
      row["Action"] = "APPLY_CORRECTION";
      row["Suggested Review Status"] = "MANUAL_REVIEW";
      row["Quality Gate"] = "REVIEW_REQUIRED";
      row["Reason"] = "No reliable address-level coordinate was found. Use Google Maps/manual pin correction.";
      return row;
    }

    row["Suggested Latitude"] = location.latitude;
    row["Suggested Longitude"] = location.longitude;
    row["Suggested Match Level"] = location.matchLevel;
    row["Suggested Confidence"] = Number(location.confidence || 0);
    row["Suggested Source"] = location.coordinateSource || "";
    row["Suggested Review Status"] = location.reviewStatus || "MANUAL_REVIEW";
    row["Suggested Provider Label"] = location.label || "";

    if (trustedAutoLocation(location)) {
      row["Action"] = "SKIP_REVIEW";
      row["Route Eligible"] = "YES";
      row["Quality Gate"] = "ROUTE_READY_EXACT";
      row["Reason"] = "Address-level Google/validated exact result. Safe to accept unless the operator sees a mismatch.";
    } else {
      row["Action"] = "APPLY_CORRECTION";
      row["Quality Gate"] = "REVIEW_REQUIRED";
      row["Reason"] = location.reviewReason
        ? `Automatic result requires review: ${location.reviewReason}. Select the actual pin and confirm it manually.`
        : "Automatic result is not address/POI exact. Select the actual pin and confirm it manually.";
    }
  } catch (error: any) {
    row["Action"] = "APPLY_CORRECTION";
    row["Suggested Review Status"] = "MANUAL_REVIEW";
    row["Quality Gate"] = "REVIEW_REQUIRED";
    row["Reason"] = `Automatic address lookup failed: ${String(error?.message || error).slice(0, 300)}. No fallback coordinate was inserted.`;
  }
  return row;
}

async function processWorkbook(input: HTMLInputElement, file: File) {
  const XLSX: any = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.includes("Location Review") ? "Location Review" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false });
  if (!rows.length) throw new Error("The selected workbook has no location-review rows.");
  if (!("Delivery Address" in rows[0] || "Recipient Address" in rows[0] || "Receiver Address" in rows[0])) {
    throw new Error("Choose a Britium Location Review workbook. An address column was not found.");
  }

  let cursor = 0;
  let ready = 0;
  let review = 0;
  const workers = Array.from({ length: Math.min(3, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      setStatus(input, `Address-level geocoding ${index + 1}/${rows.length}… No township-centre fallback will be used.`);
      const row = await resolveRow(rows[index], index);
      rows[index] = row;
      if (row["Route Eligible"] === "YES") ready += 1;
      else review += 1;
    }
  });
  await Promise.all(workers);

  const outputSheet = XLSX.utils.json_to_sheet(rows);
  const header = Object.keys(rows[0]);
  outputSheet["!cols"] = header.map((key: string) => ({
    wch: Math.min(54, Math.max(14, key.length + 2, ...rows.slice(0, 100).map((row) => String(row[key] ?? "").length + 2))),
  }));
  outputSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(header.length - 1)}${rows.length + 1}` };
  workbook.Sheets[sheetName] = outputSheet;

  const guide = XLSX.utils.aoa_to_sheet([
    ["Britium Safe Auto Geo Review V30"],
    ["Rule", "Automatic routing requires a real address/POI pin. Township-centre coordinates and generic fallback coordinates are prohibited."],
    ["ROUTE_READY_EXACT", "ADDRESS_EXACT / POI_EXACT, confidence >= 0.95 and ACCEPTED. Action is SKIP_REVIEW unless you see a mismatch."],
    ["REVIEW_REQUIRED", "Open the address in Google Maps/system map, place the actual delivery pin, enter Corrected Latitude/Longitude, set Manual Pin Confirmed = YES, and use APPLY_CORRECTION."],
    ["Important", "Never copy one township coordinate to many unrelated addresses. The old 16.800000,96.150000 fallback has been removed."],
  ]);
  guide["!cols"] = [{ wch: 24 }, { wch: 110 }];
  if (workbook.SheetNames.includes("Auto Geo Safety")) workbook.Sheets["Auto Geo Safety"] = guide;
  else XLSX.utils.book_append_sheet(workbook, guide, "Auto Geo Safety");

  const outputName = `GeoReady_${file.name.replace(/^GeoReady_/i, "")}`;
  XLSX.writeFile(workbook, outputName, { compression: true });
  setStatus(input, `Completed: ${ready} address-level exact row(s) route-ready; ${review} row(s) left for manual pin review. No township/default coordinates were inserted.`);
}

if (typeof document !== "undefined") {
  document.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input || !isAutoGeoInput(input)) return;
    const file = input.files?.[0];
    if (!file) return;

    // Stop the legacy React handler before it can fill every parcel with a township centroid.
    event.preventDefault();
    event.stopPropagation();
    (event as any).stopImmediatePropagation?.();

    setStatus(input, "Starting safe address-level Auto Geo Review…");
    void processWorkbook(input, file)
      .catch((error: any) => setStatus(input, error?.message || "Safe Auto Geo Review failed."))
      .finally(() => { input.value = ""; });
  }, true);

  const relabel = () => {
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("button"))) {
      if ((button.textContent || "").includes(AUTO_GEO_BUTTON_TEXT)) {
        button.textContent = "🎯 Auto-Geocode Review File — SAFE ADDRESS MODE";
        button.title = "Uses address-level Google/validated resolution. Township-centre/default coordinates are never inserted.";
      }
      if (/SKIP ALL REVIEWS/i.test(button.textContent || "")) {
        button.disabled = true;
        button.title = "Bulk blind acceptance is disabled. Use the Safe Auto-Geocode workbook or review pins individually.";
      }
    }
  };
  window.addEventListener("hashchange", relabel);
  new MutationObserver(() => window.requestAnimationFrame(relabel)).observe(document.documentElement, { childList: true, subtree: true });
  relabel();
}
