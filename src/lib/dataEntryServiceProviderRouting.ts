import { resolvePostalCode, type PostalMatch } from "@/lib/postalCodeResolver";
import { convertMyanmarTownshipToEnglish } from "@/lib/myanmarAddressConverter";
import { POSTAL_CODE_REGIONS } from "@/lib/postalCodeData";

export type DataEntryProviderCode =
  | "BRITIUM"
  | "DK DELIVERY"
  | "NPT BRANCH"
  | "ROYAL EXPRESS"
  | "H.TERMINAL DROP-OFF"
  | "GRS"
  | "";

export type DataEntryRouteRegion =
  | "YANGON"
  | "MANDALAY"
  | "NAYPYITAW"
  | "OUTSIDE_CORE"
  | "UNRESOLVED";

export type DataEntryDeliveryMode =
  | "DOORSTEP_MAP"
  | "ROYAL_EXPRESS"
  | "HIGHWAY_BUS_STATION"
  | "UNRESOLVED";

export const DATA_ENTRY_HANDOFF_STATIONS = [
  { code: "AUNG_MINGALAR", name: "Aung Mingalar Highway Bus Station / အောင်မင်္ဂလာအဝေးပြေး" },
  { code: "DAGON_AYAR_THIRI", name: "Dagon Ayar / Dagon Thiri Highway Bus Station / ဒဂုံဧရာ-ဒဂုံသီရိအဝေးပြေး" },
  { code: "OTHER", name: "Other highway station / အခြားအဝေးပြေးဂိတ်" },
] as const;

export function dataEntryHandoffStationCharge(code: unknown): number | null {
  const stationCode = String(code ?? "").trim().toUpperCase();
  if (stationCode === "AUNG_MINGALAR") return 3000;
  if (stationCode === "DAGON_AYAR_THIRI" || stationCode === "OTHER") return 4000;
  return null;
}

export type DataEntryProviderTariffOption = {
  destination_key: string;
  destination_name: string;
  provider_code: string;
  [key: string]: unknown;
};

export type DataEntryProviderRouting = {
  township: string;
  providerCode: DataEntryProviderCode;
  routeRegion: DataEntryRouteRegion;
  deliveryMode: DataEntryDeliveryMode;
  mapRequired: boolean;
  stationRequired: boolean;
  reason:
    | "NAYPYITAW_EXCEPTION_OUTSIDE_CORE"
    | "MANDALAY_DK_SERVICE_AREA"
    | "NAYPYITAW_BRANCH_SERVICE_AREA"
    | "EXACT_BRITIUM_ROUTE"
    | "OUTSIDE_CORE_ROYAL_DEFAULT"
    | "OUTSIDE_CORE_ROYAL_WITH_ITEM_PRICE"
    | "OUTSIDE_CORE_HIGHWAY_STATION"
    | "UNRESOLVED";
  option: DataEntryProviderTariffOption | null;
  postal: PostalMatch;
};

const PROVIDER_PRIORITY = ["BRITIUM", "NPT BRANCH", "DK DELIVERY", "ROYAL EXPRESS", "H.TERMINAL DROP-OFF", "GRS"];
const routingCache = new WeakMap<DataEntryProviderTariffOption[], Map<string, DataEntryProviderRouting>>();

function compactLocationKey(value: unknown): string {
  return convertMyanmarTownshipToEnglish(stripServiceProviderDecoration(value))
    .normalize("NFC")
    .toLowerCase()
    .replace(/\b(?:township|town|city|region|union\s+territory)\b/g, " ")
    .replace(/(?:မြို့နယ်|မြို့|တိုင်းဒေသကြီး|ပြည်ထောင်စုနယ်မြေ)/g, " ")
    .replace(/[^a-z0-9\u1000-\u109f]+/g, "");
}

function keySet(values: readonly string[]): Set<string> {
  return new Set(values.map(compactLocationKey).filter(Boolean));
}

const NAYPYITAW_ROYAL_EXCEPTIONS = keySet([
  "Tatkon", "Tat Kon", "တပ်ကုန်း",
  "Lewe", "Le Way", "လယ်ဝေး",
]);

// DK's approved Mandalay service area is the seven city townships in the
// tariff master. Other townships in Mandalay Region continue to Royal.
const MANDALAY_DK_SERVICE_AREA = keySet([
  "Mandalay", "မန္တလေး",
  "Aungmyaythazan", "Aung Myay Thar Zan", "အောင်မြေသာစံ",
  "Chanayethazan", "Chan Aye Thar Zan", "ချမ်းအေးသာစံ",
  "Mahaaungmyay", "Maha Aung Myay", "မဟာအောင်မြေ",
  "Chanmyathazi", "Chan Mya Thar Si", "ချမ်းမြသာစည်",
  "Pyigyitagon", "Pyi Gyi Tagon", "ပြည်ကြီးတံခွန်",
  "Amarapura", "အမရပူရ",
  "Patheingyi", "Pathein Gyi", "ပုသိမ်ကြီး",
]);

const NAYPYITAW_BRANCH_SERVICE_AREA = keySet([
  "Naypyitaw", "Nay Pyi Taw", "Naypyidaw", "နေပြည်တော်",
  "Za Bu Thi Ri", "Zabuthiri", "ဇမ္ဗူသီရိ",
  "Pyinmana", "ပျဉ်းမနား",
  "Zay Yar Thi Ri", "Zeyathiri", "ဇေယျာသီရိ",
  "Det Khi Na Thi Ri", "Dekkhinathiri", "ဒက္ခိဏသီရိ",
  "Poke Ba Thi Ri", "Pobbathiri", "ပုဗ္ဗသီရိ",
  "Oke Ta Ra Thi Ri", "Ottarathiri", "ဥတ္တရသီရိ",
]);

// These Yangon outreach townships must route to Britium even while the tariff
// catalog is still loading. Other configured Britium outreach tariffs continue
// to be recognized by the exact-tariff branch below.
const YANGON_BRITIUM_OUTREACH_SERVICE_AREA = keySet([
  "Yangon", "Rangoon", "ရန်ကုန်",
  "Thanlyin", "Syriam", "သန်လျင်",
  "Thongwa", "Thone Gwa", "သုံးခွ",
]);

const CORE_REGION_KEYS = {
  yangon: keySet(["Yangon Region", "ရန်ကုန်တိုင်းဒေသကြီး"]),
  mandalay: keySet(["Mandalay Region", "မန္တလေးတိုင်းဒေသကြီး"]),
  naypyitaw: keySet(["Naypyitaw Union Territory", "Nay Pyi Taw", "နေပြည်တော် ပြည်ထောင်စုနယ်မြေ", "နေပြည်တော်"]),
};

const OUTSIDE_CORE_REGION_KEYS = keySet(POSTAL_CODE_REGIONS.flatMap(([region, regionMm]) => [region, regionMm]));

function sourceContainsAnyLocation(source: unknown, candidates: Set<string>): boolean {
  const sourceKey = compactLocationKey(source);
  return [...candidates].some((candidate) => candidate.length >= 4 && sourceKey.includes(candidate));
}

function hasOutsideCoreRegionEvidence(source: unknown): boolean {
  if (!sourceContainsAnyLocation(source, OUTSIDE_CORE_REGION_KEYS)) return false;
  return !sourceContainsAnyLocation(source, CORE_REGION_KEYS.yangon)
    && !sourceContainsAnyLocation(source, CORE_REGION_KEYS.mandalay)
    && !sourceContainsAnyLocation(source, CORE_REGION_KEYS.naypyitaw);
}

function detectedRegionLabel(source: unknown): string {
  const sourceKey = compactLocationKey(source);
  const prefersMyanmar = /[\u1000-\u109f]/.test(String(source ?? ""));
  const match = POSTAL_CODE_REGIONS.find(([region, regionMm]) =>
    [compactLocationKey(region), compactLocationKey(regionMm)]
      .some((candidate) => candidate.length >= 4 && sourceKey.includes(candidate)),
  );
  return match ? (prefersMyanmar ? match[1] : match[0]) : "";
}

export function stripServiceProviderDecoration(value: unknown): string {
  return String(value ?? "")
    .replace(/[（(]\s*(?:royal(?:\s+express)?|dk(?:\s+delivery)?|grs|npt(?:\s+branch)?|h\.?\s*terminal(?:\s+drop-?off)?)\s*[)）]/gi, " ")
    .replace(/(?:^|[\s/|·,-])(?:royal(?:\s+express)?|dk(?:\s+delivery)?|grs|npt(?:\s+branch)?|h\.?\s*terminal(?:\s+drop-?off)?)(?=$|[\s/|·,-])/gi, " ")
    .replace(/နေပြည်တော်\s*ရုံးခွဲ|မန္တလေး\s*ရုံးခွဲ|ရွိုင်ရယ်(?:\s*အိတ်စပရက်)?|ဒီကေ(?:\s*ဒီလီဗာရီ)?|ဂျီအာရ်အက်စ်|အဝေးပြေး\s*ဂိတ်ချ/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dataEntryProviderHint(value: unknown): DataEntryProviderCode {
  const source = String(value ?? "").normalize("NFC").toLowerCase();
  if (/h\.?\s*terminal|terminal\s+drop|highway\s+(?:bus\s+)?station|အဝေးပြေး\s*ဂိတ်ချ/.test(source)) return "H.TERMINAL DROP-OFF";
  if (/royal|ရွိုင်ရယ်/.test(source)) return "ROYAL EXPRESS";
  if (/(?:^|[^a-z])dk(?:[^a-z]|$)|ဒီကေ/.test(source)) return "DK DELIVERY";
  if (/(?:^|[^a-z])npt(?:\s+branch)?(?:[^a-z]|$)|နေပြည်တော်\s*ရုံးခွဲ/.test(source)) return "NPT BRANCH";
  if (/(?:^|[^a-z])grs(?:[^a-z]|$)|ဂျီအာရ်အက်စ်/.test(source)) return "GRS";
  if (/britium/.test(source)) return "BRITIUM";
  return "";
}

function matchingTariffs(
  rawTownship: unknown,
  postal: PostalMatch,
  options: DataEntryProviderTariffOption[],
): DataEntryProviderTariffOption[] {
  const keys = new Set([
    compactLocationKey(rawTownship),
    compactLocationKey(postal.township),
    compactLocationKey(postal.townshipMm),
  ].filter(Boolean));

  return options.filter((option) =>
    keys.has(compactLocationKey(option.destination_name))
      || keys.has(compactLocationKey(option.destination_key)),
  );
}

function preferredTariff(
  matches: DataEntryProviderTariffOption[],
  providerCode: DataEntryProviderCode,
): DataEntryProviderTariffOption | null {
  if (providerCode) {
    return matches.find((option) => option.provider_code.toUpperCase() === providerCode) || null;
  }

  const priority = (providerCodeValue: string) => {
    const index = PROVIDER_PRIORITY.indexOf(providerCodeValue.toUpperCase());
    return index < 0 ? PROVIDER_PRIORITY.length : index;
  };
  return [...matches].sort((left, right) => priority(left.provider_code)-priority(right.provider_code))[0] || null;
}

export function resolveDataEntryServiceProvider(
  townshipValue: unknown,
  deliveryAddress: unknown,
  tariffOptions: DataEntryProviderTariffOption[],
  options: { fallbackUnknownToRoyal?: boolean; itemPrice?: unknown } = {},
): DataEntryProviderRouting {
  const raw = String(townshipValue ?? "").trim();
  const cleanTownship = stripServiceProviderDecoration(raw);
  const addressText = String(deliveryAddress ?? "").trim();
  const cacheKey = [raw, addressText, String(options.itemPrice ?? ""), options.fallbackUnknownToRoyal ? "1" : "0"].join("\u0000");
  let cache = routingCache.get(tariffOptions);
  if (!cache) {
    cache = new Map();
    routingCache.set(tariffOptions, cache);
  }
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // When the spreadsheet township cell is blank or noisy, use the full address
  // as township evidence. The postal resolver then extracts an explicit locality
  // instead of forcing the operator to type it again.
  const postal = resolvePostalCode(deliveryAddress, cleanTownship || addressText);
  const candidateKeys = new Set([
    compactLocationKey(cleanTownship),
    compactLocationKey(postal.township),
    compactLocationKey(postal.townshipMm),
  ].filter(Boolean));
  const exactMatches = matchingTariffs(cleanTownship, postal, tariffOptions);

  let providerCode: DataEntryProviderCode = "";
  let reason: DataEntryProviderRouting["reason"] = "UNRESOLVED";
  let routeRegion: DataEntryRouteRegion = "UNRESOLVED";
  let deliveryMode: DataEntryDeliveryMode = "UNRESOLVED";
  let mapRequired = false;
  let stationRequired = false;
  const recognizedDestination = postal.matchLevel !== "UNRESOLVED"
    || exactMatches.length > 0
    || Boolean(options.fallbackUnknownToRoyal && cleanTownship)
    || Boolean(options.fallbackUnknownToRoyal && hasOutsideCoreRegionEvidence(addressText));

  if ([...candidateKeys].some((candidate) => NAYPYITAW_ROYAL_EXCEPTIONS.has(candidate))) {
    routeRegion = "OUTSIDE_CORE";
    reason = "NAYPYITAW_EXCEPTION_OUTSIDE_CORE";
  } else if ([...candidateKeys].some((candidate) => MANDALAY_DK_SERVICE_AREA.has(candidate))) {
    providerCode = "DK DELIVERY";
    reason = "MANDALAY_DK_SERVICE_AREA";
    routeRegion = "MANDALAY";
    deliveryMode = "DOORSTEP_MAP";
    mapRequired = true;
  } else if ([...candidateKeys].some((candidate) => NAYPYITAW_BRANCH_SERVICE_AREA.has(candidate))) {
    providerCode = "NPT BRANCH";
    reason = "NAYPYITAW_BRANCH_SERVICE_AREA";
    routeRegion = "NAYPYITAW";
    deliveryMode = "DOORSTEP_MAP";
    mapRequired = true;
  } else if (sourceContainsAnyLocation(addressText, CORE_REGION_KEYS.naypyitaw)
    && !sourceContainsAnyLocation(addressText, NAYPYITAW_ROYAL_EXCEPTIONS)) {
    // Naypyitaw addresses sometimes contain only the Union Territory/city name.
    // They still belong to the NPT branch unless Tatkon or Lewe is stated.
    providerCode = "NPT BRANCH";
    reason = "NAYPYITAW_BRANCH_SERVICE_AREA";
    routeRegion = "NAYPYITAW";
    deliveryMode = "DOORSTEP_MAP";
    mapRequired = true;
  } else if ([...candidateKeys].some((candidate) => YANGON_BRITIUM_OUTREACH_SERVICE_AREA.has(candidate))) {
    providerCode = "BRITIUM";
    reason = "EXACT_BRITIUM_ROUTE";
    routeRegion = "YANGON";
    deliveryMode = "DOORSTEP_MAP";
    mapRequired = true;
  } else {
    const hintedProvider = dataEntryProviderHint(raw);
    const exact = preferredTariff(exactMatches, hintedProvider);
    const exactProvider = exact?.provider_code.toUpperCase() as DataEntryProviderCode | undefined;
    if (exactProvider === "BRITIUM") {
      providerCode = "BRITIUM";
      reason = "EXACT_BRITIUM_ROUTE";
      routeRegion = "YANGON";
      deliveryMode = "DOORSTEP_MAP";
      mapRequired = true;
    } else if (recognizedDestination) {
      routeRegion = "OUTSIDE_CORE";
    }
  }

  if (routeRegion === "OUTSIDE_CORE") {
    const hintedProvider = dataEntryProviderHint(raw);
    const royalAvailable = hintedProvider === "ROYAL EXPRESS"
      || exactMatches.some((match) => match.provider_code.toUpperCase() === "ROYAL EXPRESS")
      || reason === "NAYPYITAW_EXCEPTION_OUTSIDE_CORE";
    const hasItemPrice = Number(options.itemPrice) > 0;
    const hasAddress = String(deliveryAddress ?? "").trim().length > 0;
    if (!hasItemPrice && !hasAddress && !royalAvailable) {
      providerCode = "H.TERMINAL DROP-OFF";
      deliveryMode = "HIGHWAY_BUS_STATION";
      reason = "OUTSIDE_CORE_HIGHWAY_STATION";
      stationRequired = true;
    } else {
      providerCode = "ROYAL EXPRESS";
      deliveryMode = "ROYAL_EXPRESS";
      reason = hasItemPrice ? "OUTSIDE_CORE_ROYAL_WITH_ITEM_PRICE" : "OUTSIDE_CORE_ROYAL_DEFAULT";
    }
  }

  const option = preferredTariff(exactMatches, providerCode);
  const prefersMyanmar = /[\u1000-\u109f]/.test(raw || addressText);
  const postalTownship = postal.matchLevel === "UNRESOLVED"
    ? ""
    : (prefersMyanmar ? postal.townshipMm : postal.township);
  const regionFallback = detectedRegionLabel(addressText);
  const township = option?.destination_name
    || postalTownship
    || (reason === "NAYPYITAW_BRANCH_SERVICE_AREA" ? (prefersMyanmar ? "နေပြည်တော်" : "Naypyitaw") : "")
    || regionFallback
    || cleanTownship;

  const result: DataEntryProviderRouting = {
    township,
    providerCode,
    routeRegion,
    deliveryMode,
    mapRequired,
    stationRequired,
    reason,
    option,
    postal,
  };
  if (cache.size >= 2000) cache.clear();
  cache.set(cacheKey, result);
  return result;
}

export function providerRoutingMessage(route: DataEntryProviderRouting): string {
  switch (route.reason) {
    case "MANDALAY_DK_SERVICE_AREA": return "Mandalay service area · DK Delivery selected automatically.";
    case "NAYPYITAW_BRANCH_SERVICE_AREA": return "Naypyitaw service area · NPT Branch selected automatically.";
    case "NAYPYITAW_EXCEPTION_OUTSIDE_CORE": return "Tatkon / Lewe are outside the NPT Branch area; the item-price routing rule applies.";
    case "EXACT_BRITIUM_ROUTE": return "Britium service area · Britium Express selected automatically.";
    case "OUTSIDE_CORE_ROYAL_DEFAULT": return "Outside Yangon/Britium outreach, Mandalay, and eligible Naypyitaw · Royal Express selected automatically.";
    case "OUTSIDE_CORE_ROYAL_WITH_ITEM_PRICE": return "Outside the active core areas · item price present · Royal Express selected; Google Map is not required.";
    case "OUTSIDE_CORE_HIGHWAY_STATION": return "Outside Yangon, Mandalay, and Naypyitaw · no item price, no address, and no Royal route · choose a highway handoff station.";
    default: return "Enter a recognized township to select its service provider automatically.";
  }
}
