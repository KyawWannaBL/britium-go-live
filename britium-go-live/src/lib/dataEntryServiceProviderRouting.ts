import { resolvePostalCode, type PostalMatch } from "@/lib/postalCodeResolver";
import { convertMyanmarTownshipToEnglish } from "@/lib/myanmarAddressConverter";

export type DataEntryProviderCode =
  | "BRITIUM"
  | "DK DELIVERY"
  | "NPT BRANCH"
  | "ROYAL EXPRESS"
  | "GRS"
  | "";

export type DataEntryProviderTariffOption = {
  destination_key: string;
  destination_name: string;
  provider_code: string;
  [key: string]: unknown;
};

export type DataEntryProviderRouting = {
  township: string;
  providerCode: DataEntryProviderCode;
  reason:
    | "NAYPYITAW_EXCEPTION_ROYAL"
    | "MANDALAY_DK_SERVICE_AREA"
    | "NAYPYITAW_BRANCH_SERVICE_AREA"
    | "EXACT_BRITIUM_ROUTE"
    | "EXACT_CONFIGURED_ROUTE"
    | "OUTSIDE_BRITIUM_SERVICE_AREA"
    | "UNRESOLVED";
  option: DataEntryProviderTariffOption | null;
  postal: PostalMatch;
};

const PROVIDER_PRIORITY = ["BRITIUM", "NPT BRANCH", "DK DELIVERY", "ROYAL EXPRESS", "GRS"];

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

export function stripServiceProviderDecoration(value: unknown): string {
  return String(value ?? "")
    .replace(/[（(]\s*(?:royal(?:\s+express)?|dk(?:\s+delivery)?|grs|npt(?:\s+branch)?)\s*[)）]/gi, " ")
    .replace(/(?:^|[\s/|·,-])(?:royal(?:\s+express)?|dk(?:\s+delivery)?|grs|npt(?:\s+branch)?)(?=$|[\s/|·,-])/gi, " ")
    .replace(/နေပြည်တော်\s*ရုံးခွဲ|မန္တလေး\s*ရုံးခွဲ|ရွိုင်ရယ်(?:\s*အိတ်စပရက်)?|ဒီကေ(?:\s*ဒီလီဗာရီ)?|ဂျီအာရ်အက်စ်/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dataEntryProviderHint(value: unknown): DataEntryProviderCode {
  const source = String(value ?? "").normalize("NFC").toLowerCase();
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
  options: { fallbackUnknownToRoyal?: boolean } = {},
): DataEntryProviderRouting {
  const raw = String(townshipValue ?? "").trim();
  const cleanTownship = stripServiceProviderDecoration(raw);
  const postal = resolvePostalCode(deliveryAddress, cleanTownship);
  const candidateKeys = new Set([
    compactLocationKey(cleanTownship),
    compactLocationKey(postal.township),
    compactLocationKey(postal.townshipMm),
  ].filter(Boolean));
  const exactMatches = matchingTariffs(cleanTownship, postal, tariffOptions);

  let providerCode: DataEntryProviderCode = "";
  let reason: DataEntryProviderRouting["reason"] = "UNRESOLVED";

  if ([...candidateKeys].some((candidate) => NAYPYITAW_ROYAL_EXCEPTIONS.has(candidate))) {
    providerCode = "ROYAL EXPRESS";
    reason = "NAYPYITAW_EXCEPTION_ROYAL";
  } else if ([...candidateKeys].some((candidate) => MANDALAY_DK_SERVICE_AREA.has(candidate))) {
    providerCode = "DK DELIVERY";
    reason = "MANDALAY_DK_SERVICE_AREA";
  } else if ([...candidateKeys].some((candidate) => NAYPYITAW_BRANCH_SERVICE_AREA.has(candidate))) {
    providerCode = "NPT BRANCH";
    reason = "NAYPYITAW_BRANCH_SERVICE_AREA";
  } else {
    const hintedProvider = dataEntryProviderHint(raw);
    const exact = preferredTariff(exactMatches, hintedProvider);
    const exactProvider = exact?.provider_code.toUpperCase() as DataEntryProviderCode | undefined;
    if (exactProvider === "BRITIUM") {
      providerCode = "BRITIUM";
      reason = "EXACT_BRITIUM_ROUTE";
    } else if (exactProvider) {
      providerCode = exactProvider;
      reason = "EXACT_CONFIGURED_ROUTE";
    } else if (postal.matchLevel !== "UNRESOLVED" || (options.fallbackUnknownToRoyal && cleanTownship)) {
      providerCode = "ROYAL EXPRESS";
      reason = "OUTSIDE_BRITIUM_SERVICE_AREA";
    }
  }

  const option = preferredTariff(exactMatches, providerCode);
  const prefersMyanmar = /[\u1000-\u109f]/.test(raw);
  const township = option?.destination_name
    || (prefersMyanmar ? postal.townshipMm : postal.township)
    || cleanTownship;

  return { township, providerCode, reason, option, postal };
}

export function providerRoutingMessage(route: DataEntryProviderRouting): string {
  switch (route.reason) {
    case "MANDALAY_DK_SERVICE_AREA": return "Mandalay service area · DK Delivery selected automatically.";
    case "NAYPYITAW_BRANCH_SERVICE_AREA": return "Naypyitaw service area · NPT Branch selected automatically.";
    case "NAYPYITAW_EXCEPTION_ROYAL": return "Tatkon / Lewe exception · Royal Express selected automatically.";
    case "EXACT_BRITIUM_ROUTE": return "Britium service area · Britium Express selected automatically.";
    case "EXACT_CONFIGURED_ROUTE": return "The configured service provider was selected automatically.";
    case "OUTSIDE_BRITIUM_SERVICE_AREA": return "Outside Britium's service area · Royal Express selected automatically.";
    default: return "Enter a recognized township to select its service provider automatically.";
  }
}
