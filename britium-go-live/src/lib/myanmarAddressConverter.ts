const MYANMAR_DIGITS: Record<string, string> = {
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

const ADDRESS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ရန်ကုန်တိုင်းဒေသကြီး|ရန်ကုန်တိုင်း|ရန်ကုန်/g, "Yangon"],
  [/ကမာရွတ်မြို့နယ်|ကမာရွတ်/g, "Kamayut Township"],
  [/စမ်းချောင်းမြို့နယ်|စမ်းချောင်း/g, "Sanchaung Township"],
  [/လှိုင်သာယာမြို့နယ်|လှိုင်သာယာ/g, "Hlaing Tharyar Township"],
  [/လှိုင်မြို့နယ်|လှိုင်/g, "Hlaing Township"],
  [/မရမ်းကုန်းမြို့နယ်|မရမ်းကုန်း/g, "Mayangone Township"],
  [/အလုံမြို့နယ်|အလုံ/g, "Ahlone Township"],
  [/ကြည့်မြင်တိုင်မြို့နယ်|ကြည့်မြင်တိုင်/g, "Kyimyindaing Township"],
  [/လမ်းမတော်မြို့နယ်|လမ်းမတော်/g, "Lanmadaw Township"],
  [/လသာမြို့နယ်|လသာ/g, "Latha Township"],
  [/ပန်းဘဲတန်းမြို့နယ်|ပန်းဘဲတန်း/g, "Pabedan Township"],
  [/ကျောက်တံတားမြို့နယ်|ကျောက်တံတား/g, "Kyauktada Township"],
  [/ဗိုလ်တထောင်မြို့နယ်|ဗိုလ်တထောင်/g, "Botahtaung Township"],
  [/ပုဇွန်တောင်မြို့နယ်|ပုဇွန်တောင်/g, "Pazundaung Township"],
  [/တာမွေမြို့နယ်|တာမွေ/g, "Tamwe Township"],
  [/မင်္ဂလာတောင်ညွန့်မြို့နယ်|မင်္ဂလာတောင်ညွန့်/g, "Mingala Taungnyunt Township"],
  [/ဗဟန်းမြို့နယ်|ဗဟန်း/g, "Bahan Township"],
  [/ရန်ကင်းမြို့နယ်|ရန်ကင်း/g, "Yankin Township"],
  [/သင်္ဃန်းကျွန်းမြို့နယ်|သင်္ဃန်းကျွန်း/g, "Thingangyun Township"],
  [/တောင်ဥက္ကလာပမြို့နယ်|တောင်ဥက္ကလာပ/g, "South Okkalapa Township"],
  [/မြောက်ဥက္ကလာပမြို့နယ်|မြောက်ဥက္ကလာပ/g, "North Okkalapa Township"],
  [/ဒေါပုံမြို့နယ်|ဒေါပုံ/g, "Dawbon Township"],
  [/သာကေတမြို့နယ်|သာကေတ/g, "Thaketa Township"],
  [/တောင်ဒဂုံ(?:မြို့နယ်)?|ဒဂုံမြို့သစ်တောင်ပိုင်း/g, "South Dagon Township"],
  [/မြောက်ဒဂုံ(?:မြို့နယ်)?|ဒဂုံမြို့သစ်မြောက်ပိုင်း/g, "North Dagon Township"],
  [/အရှေ့ဒဂုံ(?:မြို့နယ်)?|ဒဂုံမြို့သစ်အရှေ့ပိုင်း/g, "East Dagon Township"],
  [/ဒဂုံဆိပ်ကမ်းမြို့နယ်|ဒဂုံဆိပ်ကမ်း/g, "Dagon Seikkan Township"],
  [/ဒဂုံမြို့နယ်|ဒဂုံ/g, "Dagon Township"],
  [/အင်းစိန်မြို့နယ်|အင်းစိန်/g, "Insein Township"],
  [/မင်္ဂလာဒုံမြို့နယ်|မင်္ဂလာဒုံ/g, "Mingaladon Township"],
  [/ရွှေပြည်သာမြို့နယ်|ရွှေပြည်သာ/g, "Shwepyitha Township"],
  [/လမ်းသွယ်/g, "Lane"],
  [/လမ်းမကြီး/g, "Main Road"],
  [/လမ်း/g, "Road"],
  [/ရပ်ကွက်/g, "Ward"],
  [/ကျေးရွာ/g, "Village"],
  [/အမှတ်/g, "No."],
  [/တိုက်/g, "Building"],
  [/အခန်း/g, "Room"],
  [/ထပ်/g, "Floor"],
  [/ဈေး/g, "Market"],
  [/ဆေးရုံ/g, "Hospital"],
  [/ဘုရား/g, "Pagoda"],
  [/မြို့နယ်/g, "Township"],
  [/မြို့/g, "City"],
];

export function normalizeMyanmarAddress(value: unknown) {
  return String(value ?? "")
    .replace(/[၀-၉]/g, (digit) => MYANMAR_DIGITS[digit] || digit)
    .replace(/[၊။]/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function englishOrdinal(value: string | number) {
  const number = Number(value);
  const finalTwo = number % 100;
  if (finalTwo >= 11 && finalTwo <= 13) return `${number}th`;
  if (number % 10 === 1) return `${number}st`;
  if (number % 10 === 2) return `${number}nd`;
  if (number % 10 === 3) return `${number}rd`;
  return `${number}th`;
}

export function normalizeEnglishAddressForGeocoding(value: unknown) {
  return String(value ?? "")
    .replace(/\b(\d{1,3})(?:st|nd|rd|th)?\s+(?:road|street|st\.?)\b/gi, (_match, number) => `${englishOrdinal(number)} Street`)
    .replace(/\b(\d{1,3})\s+(?:ward|quarter)\b/gi, "Ward $1")
    .replace(/\bward\s*(?:no\.?\s*)?(\d{1,3})\b/gi, "Ward $1")
    .replace(/\bsouth\s+okkalapa\b/gi, "South Okkalapa")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

export function convertMyanmarAddressToEnglish(address: unknown, township?: unknown) {
  let convertedAddress = normalizeMyanmarAddress(address);
  for (const [pattern, replacement] of ADDRESS_REPLACEMENTS) convertedAddress = convertedAddress.replace(pattern, replacement);

  let convertedTownship = normalizeMyanmarAddress(township);
  for (const [pattern, replacement] of ADDRESS_REPLACEMENTS) convertedTownship = convertedTownship.replace(pattern, replacement);

  const parts = [convertedAddress, convertedTownship, "Yangon", "Myanmar"].filter(Boolean);
  return normalizeEnglishAddressForGeocoding(
    [...new Set(parts)].join(", ").replace(/(?:, Yangon){2,}/g, ", Yangon"),
  );
}

export function bilingualAddressQueries(address: unknown, township?: unknown) {
  const original = normalizeMyanmarAddress(address);
  const english = convertMyanmarAddressToEnglish(original, township);
  return [...new Set([original, english].filter(Boolean))];
}
