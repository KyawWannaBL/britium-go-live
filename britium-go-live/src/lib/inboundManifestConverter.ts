import { POSTAL_CODE_REGIONS, POSTAL_CODE_TOWNSHIPS } from "@/lib/postalCodeData";
import { resolvePostalCode, type PostalMatch } from "@/lib/postalCodeResolver";

export const WAYBILL_GENERATE_HEADERS = [
  "Way ID / Pickup ID",
  "Merchant Name",
  "Receiver Name",
  "Receiver Phone",
  "City (Dropdown)",
  "Township (Dropdown)",
  "Ward / Village Tract (Dropdown)",
  "Postal Code (Auto)",
  "Receiver Address",
  "Actual Weight (KG)",
  "Service Type",
  "Payment Type",
  "Item Price",
  "OS Set Price",
  "Merchant Tier",
  "မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)",
] as const;

type SourceKey = "wayId" | "merchant" | "recipient" | "phone" | "town" | "address" | "itemPrice" | "osPrice" | "weight" | "remarks";

const SOURCE_ALIASES: Record<SourceKey, string[]> = {
  wayId: ["way id", "pickup id"],
  merchant: ["merchant", "merchant name"],
  recipient: ["recipient name", "receiver name"],
  phone: ["recipient phone", "receiver phone", "phone"],
  town: ["recipient town", "township", "recipient township", "destination"],
  address: ["recipient address", "receiver address", "delivery address", "address"],
  itemPrice: ["item price", "item value"],
  osPrice: ["deli fee os", "os set price", "os delivery fee"],
  weight: ["weight", "actual weight"],
  remarks: ["remarks", "remark", "notes"],
};

const MYANMAR_DIGITS: Record<string, string> = {
  "၀": "0", "၁": "1", "၂": "2", "၃": "3", "၄": "4",
  "၅": "5", "၆": "6", "၇": "7", "၈": "8", "၉": "9",
};

function text(value: unknown) {
  return String(value ?? "").replace(/^\uFEFF/, "").normalize("NFC").trim();
}

function key(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/[၀-၉]/g, (digit) => MYANMAR_DIGITS[digit] || digit)
    .replace(/\b(?:township|town|city|region|state|union territory)\b/g, " ")
    .replace(/(?:မြို့နယ်|မြို့|တိုင်းဒေသကြီး|ပြည်နယ်|ပြည်ထောင်စုနယ်မြေ)/g, " ")
    .replace(/[^a-z0-9\u1000-\u109f]+/g, "");
}

function headerKey(value: unknown) {
  return text(value).toLowerCase().replace(/[()（）\n\r/_-]+/g, " ").replace(/[^a-z0-9\u1000-\u109f]+/g, " ").replace(/\s+/g, " ").trim();
}

function sourceColumn(value: unknown): SourceKey | null {
  const header = headerKey(value);
  for (const [column, aliases] of Object.entries(SOURCE_ALIASES) as Array<[SourceKey, string[]]>) {
    if (aliases.some((alias) => header === alias || header.includes(alias))) return column;
  }
  return null;
}

function numberOrBlank(value: unknown): number | "" {
  const normalized = text(value).replace(/[၀-၉]/g, (digit) => MYANMAR_DIGITS[digit] || digit).replace(/[ ,]/g, "").replace(/(?:mmk|ks|ကျပ်)$/i, "");
  if (!normalized || normalized === "-") return "";
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : "";
}

function phone(value: unknown) {
  const normalized = text(value).replace(/[၀-၉]/g, (digit) => MYANMAR_DIGITS[digit] || digit).replace(/\.0+$/, "").replace(/[^0-9+]/g, "");
  return /^9\d{8,9}$/.test(normalized) ? `0${normalized}` : normalized;
}

function hlaingTharyarAlias(value: unknown) {
  const candidate = key(value);
  return /hlaingthar(?:ya|yar)|hlaingtharya|လှိုင်သာယာ/.test(candidate);
}

function townshipHint(town: unknown, address: unknown) {
  const supplied = text(town);
  if (hlaingTharyarAlias(supplied) || hlaingTharyarAlias(address)) return "Hlaing Tharyar";
  const combined = key(`${supplied} ${text(address)}`);
  let best = supplied;
  let bestLength = 0;
  for (const [en, mm] of POSTAL_CODE_TOWNSHIPS) {
    for (const candidate of [en, mm]) {
      const candidateKey = key(candidate);
      if (candidateKey.length >= 3 && combined.includes(candidateKey) && candidateKey.length > bestLength) {
        best = candidate;
        bestLength = candidateKey.length;
      }
    }
  }
  return best;
}

function locationLabels(match: PostalMatch) {
  if (match.matchLevel === "UNRESOLVED") return { city: "", township: "", ward: "", postalCode: "" };
  const city = `${match.region} / ${match.regionMm}`;
  const township = `${match.township} / ${match.townshipMm}`;
  const ward = match.matchLevel === "EXACT_QUARTER"
    ? `${match.townshipMm} • ${match.quarterMm} [${match.postalCode}]`
    : "";
  return { city, township, ward, postalCode: match.matchLevel === "EXACT_QUARTER" ? match.postalCode : "" };
}

function providerFor(match: PostalMatch, originalTown: unknown, address: unknown) {
  if (hlaingTharyarAlias(originalTown) || hlaingTharyarAlias(address) || match.region === "Yangon Region") return "Britium Express";
  if (match.region === "Mandalay Region") {
    const dk = new Set(["Aungmyaythazan", "Chanayethazan", "Mahaaungmyay", "Chanmyathazi", "Pyigyitagon", "Amarapura", "Patheingyi"]);
    return [...dk].some((name) => key(match.township).includes(key(name))) ? "DK Delivery" : "Royal Express";
  }
  if (match.region === "Naypyitaw Union Territory") {
    return /tatkon|lewe|တပ်ကုန်း|လယ်ဝေး/.test(key(match.township)) ? "Royal Express" : "NPT Branch";
  }
  return match.matchLevel === "UNRESOLVED" ? "" : "Royal Express";
}

export type InboundConversionResult = {
  rows: Array<Array<string | number>>;
  convertedCount: number;
  exactPostalCount: number;
  unresolvedCount: number;
};

export function convertInboundManifestMatrix(matrix: unknown[][]): InboundConversionResult {
  let headerIndex = -1;
  let columns = new Map<SourceKey, number>();
  matrix.slice(0, 25).forEach((row, index) => {
    const candidate = new Map<SourceKey, number>();
    row.forEach((value, columnIndex) => {
      const column = sourceColumn(value);
      if (column && !candidate.has(column)) candidate.set(column, columnIndex);
    });
    if (candidate.size > columns.size) {
      columns = candidate;
      headerIndex = index;
    }
  });
  if (headerIndex < 0 || !columns.has("wayId") || !columns.has("recipient") || !columns.has("address")) {
    throw new Error("Inbound manifest headers were not found. Use Inboundmanifest_template.xlsx.");
  }

  const output: Array<Array<string | number>> = [];
  let exactPostalCount = 0;
  let unresolvedCount = 0;
  for (const source of matrix.slice(headerIndex + 1)) {
    if (!source.some((value) => text(value))) continue;
    const value = (column: SourceKey) => columns.has(column) ? source[columns.get(column)!] : "";
    const address = text(value("address"));
    const town = text(value("town"));
    const postal = resolvePostalCode(address, townshipHint(town, address));
    const location = locationLabels(postal);
    if (postal.matchLevel === "EXACT_QUARTER") exactPostalCount += 1;
    if (postal.matchLevel === "UNRESOLVED") unresolvedCount += 1;
    const itemPrice = numberOrBlank(value("itemPrice"));
    const osPrice = numberOrBlank(value("osPrice"));
    const remarks = text(value("remarks"));
    const receiverAddress = remarks ? `${address}${address ? " | " : ""}Remarks: ${remarks}` : address;
    const paymentType = itemPrice !== "" ? "ITEM_PRICE_PLUS_DECLARED_DELIVERY" : osPrice !== "" ? "DELIVERY_CHARGE_ONLY" : "";
    output.push([
      text(value("wayId")), text(value("merchant")), text(value("recipient")), phone(value("phone")),
      location.city, location.township, location.ward, location.postalCode, receiverAddress,
      numberOrBlank(value("weight")), "STANDARD", paymentType, itemPrice, osPrice, "STANDARD",
      providerFor(postal, town, address),
    ]);
  }
  if (!output.length) throw new Error("No inbound manifest data rows were found below the header.");
  if (output.length > 500) throw new Error("Convert no more than 500 inbound rows at one time.");
  return { rows: output, convertedCount: output.length, exactPostalCount, unresolvedCount };
}

export function inboundWaybillFileName(sourceName: string) {
  const base = sourceName.replace(/\.(xlsx|xls|csv)$/i, "").replace(/[^a-z0-9\u1000-\u109f._-]+/gi, "_");
  return `${base || "Inboundmanifest"}_Waybillgeneratetemplate.xlsx`;
}
