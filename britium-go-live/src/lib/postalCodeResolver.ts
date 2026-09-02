import { POSTAL_CODE_REGIONS, POSTAL_CODE_ROWS, POSTAL_CODE_TOWNSHIPS } from "@/lib/postalCodeData";

export type PostalMatch = {
  postalCode: string;
  township: string;
  townshipMm: string;
  quarter: string;
  quarterMm: string;
  region: string;
  regionMm: string;
  matchLevel: "EXACT_QUARTER" | "TOWNSHIP_ONLY" | "UNRESOLVED";
};

type PostalRow = {
  township: string;
  townshipMm: string;
  quarter: string;
  quarterMm: string;
  postalCode: string;
  region: string;
  regionMm: string;
  townshipKeys: string[];
  regionKeys: string[];
  typedQuarterKeys: string[];
  quarterKeys: string[];
  wardNumbers: string[];
};

const myanmarDigits: Record<string, string> = {
  "၀": "0",
  "၁": "1",
  "၂": "2",
  "၃": "3",
  "၄": "4",
  "၅": "5",
  "၆": "6",
  "၇": "7",
  "၈": "8",
  "၉": "9",
};

function withAsciiDigits(value: unknown) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[၀-၉]/g, (digit) => myanmarDigits[digit]);
}

function key(value: unknown) {
  return withAsciiDigits(value)
    .toLowerCase()
    .replace(/\bvillage\s*tract\b/g, " ")
    .replace(/\b(?:township|town|quarter|ward|section)\b/g, " ")
    // Remove the postal-source "No" label without corrupting North, Nono, or other names.
    .replace(/\bno\.?(?=\s|\(|\[|\d|$)/g, " ")
    .replace(/ကျေးရွာအုပ်စု|ရပ်ကွက်|မြို့နယ်|မြို့/g, " ")
    .replace(/[^a-z0-9\u1000-\u109f]+/g, "");
}

function typedKey(value: unknown) {
  return withAsciiDigits(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u1000-\u109f]+/g, "");
}

function extractWardNumbers(value: unknown) {
  const text = withAsciiDigits(value).toLowerCase();
  const numbers = new Set<string>();
  const patterns = [
    /\b(?:ward|quarter|section)\s*(?:no\.?\s*)?[\(\[\{#-]*\s*(\d{1,3})(?!\d)/gi,
    /\b(?:no\.?\s*)?[\(\[\{#-]*\s*(\d{1,3})\s*[\)\]\}]*\s*(?:ward|quarter|section)\b/gi,
    /(?:ရပ်ကွက်|အပိုင်း)\s*(?:အမှတ်\s*)?[\(\[\{#-]*\s*(\d{1,3})(?!\d)/g,
    /(?:အမှတ်\s*)?[\(\[\{#-]*\s*(\d{1,3})\s*[\)\]\}]*\s*(?:ရပ်ကွက်|အပိုင်း)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) numbers.add(String(Number(match[1])));
  }

  return [...numbers];
}

function regionKeys(region: string, regionMm: string) {
  return [...new Set([
    key(region),
    key(region.replace(/\b(?:region|state|union territory)\b/gi, "")),
    key(regionMm),
    key(regionMm.replace(/တိုင်းဒေသကြီး|ပြည်နယ်|ပြည်ထောင်စုနယ်မြေ/g, "")),
  ].filter((candidate) => candidate.length >= 3))];
}

const rows: PostalRow[] = POSTAL_CODE_ROWS.map(([townshipIndex, quarter, postalCode, quarterMm]) => {
  const [township, townshipMm, regionIndex] = POSTAL_CODE_TOWNSHIPS[townshipIndex];
  const [region, regionMm] = POSTAL_CODE_REGIONS[regionIndex];
  const quarterKeys = [...new Set([key(quarter), key(quarterMm)])]
    .filter((candidate) => candidate.length >= 2 && !/^\d+$/.test(candidate));

  return {
    township,
    townshipMm,
    quarter,
    quarterMm,
    postalCode,
    region,
    regionMm,
    townshipKeys: [...new Set([key(township), key(townshipMm)].filter(Boolean))],
    regionKeys: regionKeys(region, regionMm),
    typedQuarterKeys: [...new Set([typedKey(quarter), typedKey(quarterMm)].filter(Boolean))],
    quarterKeys,
    wardNumbers: [...new Set([...extractWardNumbers(quarter), ...extractWardNumbers(quarterMm)])],
  };
});

const townshipRowsByKey = new Map<string, PostalRow[]>();
for (const row of rows) {
  for (const townshipKey of row.townshipKeys) {
    const indexedRows = townshipRowsByKey.get(townshipKey) || [];
    indexedRows.push(row);
    townshipRowsByKey.set(townshipKey, indexedRows);
  }
}

const townshipAliases = new Map<string, string[]>([
  [key("North Dagon"), [key("Dagon Myothit (North)")]],
  [key("South Dagon"), [key("Dagon Myothit (South)")]],
  [key("East Dagon"), [key("Dagon Myothit (East)")]],
  [key("Dagon Seikkan"), [key("Dagon Myothit (Seikkan)")]],
  [key("မြောက်ဒဂုံ"), [key("ဒဂုံမြို့သစ် (မြောက်ပိုင်း)")]],
  [key("တောင်ဒဂုံ"), [key("ဒဂုံမြို့သစ် (တောင်ပိုင်း)")]],
  [key("အရှေ့ဒဂုံ"), [key("ဒဂုံမြို့သစ် (အရှေ့ပိုင်း)")]],
  [key("ဒဂုံဆိပ်ကမ်း"), [key("ဒဂုံမြို့သစ် (ဆိပ်ကမ်း)")]],
  [key("Hlaing Tharyar"), [key("Hlaingtharya (East)"), key("Hlaingtharya (West)")]],
  [key("Hlaing Thayar"), [key("Hlaingtharya (East)"), key("Hlaingtharya (West)")]],
  [key("Hlaing Thaya"), [key("Hlaingtharya (East)"), key("Hlaingtharya (West)")]],
  [key("လှိုင်သာယာ"), [key("လှိုင်သာယာ (အရှေ့)"), key("လှိုင်သာယာ (အနောက်)")]],
  [key("Shwepyitha"), [key("Shwepyithar")]],
  [key("Mayangon"), [key("Mayangone")]],
  [key("Botataung"), [key("Botahtaung")]],
  [key("Kyimyindaing"), [key("Kyeemyindaing")]],
  [key("Mingala Taungnyunt"), [key("Mingalartaungnyunt")]],
]);

function uniqueRows(groups: PostalRow[][]) {
  return [...new Set(groups.flat())];
}

function rowsForTownshipKey(townshipKey: string) {
  const lookupKeys = [townshipKey, ...(townshipAliases.get(townshipKey) || [])];
  return uniqueRows(lookupKeys.map((lookupKey) => townshipRowsByKey.get(lookupKey) || []));
}

function rowsMentionedInAddress(addressKey: string) {
  let bestLength = 0;
  const matchingGroups: PostalRow[][] = [];
  const searchKeys = [...new Set([...townshipRowsByKey.keys(), ...townshipAliases.keys()])];

  for (const searchKey of searchKeys) {
    if (searchKey.length < 4 || !addressKey.includes(searchKey)) continue;
    if (searchKey.length > bestLength) {
      bestLength = searchKey.length;
      matchingGroups.length = 0;
    }
    if (searchKey.length === bestLength) matchingGroups.push(rowsForTownshipKey(searchKey));
  }

  return uniqueRows(matchingGroups);
}

function filterByRegionEvidence(candidateRows: PostalRow[], addressKey: string) {
  const regionMatches = candidateRows.filter((row) =>
    row.regionKeys.some((regionKey) => addressKey.includes(regionKey)),
  );
  return regionMatches.length ? regionMatches : candidateRows;
}

function uniqueTopMatch(matches: Array<{ row: PostalRow; score: number }>) {
  if (!matches.length) return null;
  const bestScore = Math.max(...matches.map((match) => match.score));
  const bestMatches = matches.filter((match) => match.score === bestScore);
  const postalCodes = new Set(bestMatches.map((match) => match.row.postalCode));
  return postalCodes.size === 1 ? bestMatches[0].row : null;
}

function exactQuarterMatch(candidateRows: PostalRow[], address: unknown, addressKey: string) {
  const typedAddressKey = typedKey(address);
  const typedMatches = candidateRows.flatMap((row) => row.typedQuarterKeys
    .filter((quarterKey) => typedAddressKey.includes(quarterKey))
    .map((quarterKey) => ({ row, score: 5_000 + quarterKey.length })));
  // A complete Quarter/Village Tract phrase outranks all loose substrings. If
  // the source publishes that phrase against multiple codes, leave it blank.
  if (typedMatches.length) return uniqueTopMatch(typedMatches);

  const wardNumbers = new Set(extractWardNumbers(address));
  if (wardNumbers.size) {
    const numberedMatches = candidateRows
      .filter((row) => row.wardNumbers.some((number) => wardNumbers.has(number)))
      .map((row) => ({ row, score: 10_000 }));
    // A bare ward number is usable only when it identifies one published code.
    if (numberedMatches.length) return uniqueTopMatch(numberedMatches);
  }

  return uniqueTopMatch(candidateRows.flatMap((row) => row.quarterKeys
    .filter((quarterKey) => addressKey.includes(quarterKey))
    .map((quarterKey) => ({ row, score: quarterKey.length }))));
}

function exactMatch(row: PostalRow): PostalMatch {
  return {
    postalCode: row.postalCode,
    township: row.township,
    townshipMm: row.townshipMm,
    quarter: row.quarter,
    quarterMm: row.quarterMm,
    region: row.region,
    regionMm: row.regionMm,
    matchLevel: "EXACT_QUARTER",
  };
}

export function resolvePostalCode(address: unknown, township: unknown): PostalMatch {
  const addressKey = key(address);
  const townshipKey = key(township);
  const directRows = rowsForTownshipKey(townshipKey);
  // A blank/placeholder township is not enough evidence to infer a code. Scanning
  // the address in that case can mistake a short township name inside a region.
  const addressRows = townshipKey ? rowsMentionedInAddress(addressKey) : [];
  let townshipRows = directRows;

  if (directRows.length && addressRows.length) {
    const intersection = directRows.filter((row) => addressRows.includes(row));
    if (intersection.length) townshipRows = intersection;
  } else if (!directRows.length) townshipRows = addressRows;

  townshipRows = filterByRegionEvidence(townshipRows, addressKey);
  const exact = exactQuarterMatch(townshipRows, address, addressKey);
  if (exact) return exactMatch(exact);

  if (townshipRows.length) {
    const first = townshipRows[0];
    const uniqueTownships = new Set(townshipRows.map((row) => `${row.township}\u0000${row.townshipMm}`));
    const uniqueRegions = new Set(townshipRows.map((row) => `${row.region}\u0000${row.regionMm}`));
    return {
      postalCode: "",
      township: uniqueTownships.size === 1 ? first.township : String(township || ""),
      townshipMm: uniqueTownships.size === 1 ? first.townshipMm : "",
      quarter: "",
      quarterMm: "",
      region: uniqueRegions.size === 1 ? first.region : "",
      regionMm: uniqueRegions.size === 1 ? first.regionMm : "",
      matchLevel: "TOWNSHIP_ONLY",
    };
  }

  return {
    postalCode: "",
    township: String(township || ""),
    townshipMm: "",
    quarter: "",
    quarterMm: "",
    region: "",
    regionMm: "",
    matchLevel: "UNRESOLVED",
  };
}
