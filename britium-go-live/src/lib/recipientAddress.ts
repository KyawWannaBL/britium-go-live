const room = /^(?:(?:room|rm|unit|apt|suite)\b\.?|အခန်း(?:အမှတ်)?)\s*[:#.-]?\s*/i;
const premises = /^(?:(?:house|building|bldg|flat|apartment|tower|floor|no)\b\.?|အိမ်အမှတ်|အမှတ်|တိုက်|အဆောင်)|(?:[၀-၉\d]+\s*ထပ်|အိမ်ရာ|တိုက်ခန်း|\bfloor)$/i;
const ward = /\b(?:ward|quarter|block|village)\b|ရပ်ကွက်|ကျေးရွာ|ရပ်စု|ဘလောက်/i;
const township = /\b(?:township|tsp)\b|မြို့နယ်/i;
const city = /\b(?:city|region|division|state|union territory)\.?$|မြို့$|တိုင်း(?:ဒေသကြီး)?$|ပြည်နယ်$|^(?:Yangon|Rangoon|Mandalay|Nay\s*Pyi\s*Taw|Naypyidaw|ရန်ကုန်|မန္တလေး|နေပြည်တော်)$/i;
const street = /\b(?:street|road|avenue|lane|boulevard|rd|ave|st)\b|\b\d{1,3}(?:st|nd|rd|th)\b(?!\s+(?:floor|ward|quarter|block|unit|room)\b)|လမ်း/i;
const direction = /^(?:\(?\s*(?:look for|near(?:by)?|close to|next to|beside|opposite|across from|in front of|behind|by|landmark|remarks?|delivery notes?|call|ring|ask for)\b|\(?\s*(?:အနီး|အနား|ဘေး|ရှေ့|နောက်|မှတ်ချက်))|(?:အနီး(?:တွင်|မှာ)?|အနား|နား|ဘေး(?:တွင်|မှာ)?|ရှေ့(?:တွင်|မှာ)?|နောက်(?:တွင်|မှာ)?|မျက်နှာချင်းဆိုင်)\s*\)?$/i;
const venue = /\b(?:shop|store|market|mart|school|hospital|pagoda|bus stop|restaurant|café|cafe|bank|clinic|supermarket|landmark|mall|tea shop)\b|ဆိုင်|ဈေး|စျေး|ကျောင်း|ဆေးရုံ|ဘုရား|မှတ်တိုင်|ဘဏ်/i;
const streetEnd = /(?:\b(?:street|road|avenue|lane|boulevard|rd|ave|st)\b\.?|\b\d{1,3}(?:st|nd|rd|th)\b(?!\s+(?:floor|ward|quarter|block|unit|room)\b)|လမ်း(?:မကြီး|သွယ်)?)/gi;

function locationKey(value: string) {
  return value.normalize("NFC").toLowerCase().replace(/\b(?:township|tsp)\b|မြို့နယ်/g, "").replace(/[\s.()]+/g, "");
}

function addressClauses(label: string) {
  return label
    // New lines and Burmese punctuation often separate the address components.
    .split(/[,;\r\n၊။]+/)
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap(part => {
      if (direction.test(part) && !isStreetReference(part)) return [part];
      return part
        // Separate adjacent components in unpunctuated labels while retaining the spelling.
        .replace(/(\b(?:township|tsp|division|region)\b\.?|မြို့နယ်|တိုင်းဒေသကြီး|ရပ်ကွက်|ကျေးရွာ)(?=\s*\S)/gi, "$1, ")
        .replace(/(\b(?:ward|quarter|block)\s*(?:no\.?\s*|#\s*)?\(?[၀-၉\d]+[A-Za-z]?\)?)\s+(?=\S)/gi, "$1, ")
        .replace(/(\b[၀-၉\d]+(?:st|nd|rd|th)?\s+(?:ward|quarter|block)\b)\s+(?=\S)/gi, "$1, ")
        .replace(/(?<!^)\s+(?=(?:(?:room|rm|unit|apt|building|bldg|flat|apartment|tower|ward|quarter|block)\s*(?:no\.?\s*|#\s*)?[\d(]|no\.?\s*\d|အခန်း\s*[၀-၉\d(]|အမှတ်\s*[၀-၉\d(]))/gi, ", ")
        .replace(/(^(?:#\s*|(?:room|rm|unit|apt|flat|building|bldg|apartment|house|no)\s*[:.#-]?\s*|အခန်း(?:အမှတ်)?\s*|(?:အိမ်)?အမှတ်\s*|တိုက်\s*)\(?[\d၀-၉]+(?:[/-][\d၀-၉A-Za-z\u1000-\u109f]+|[A-Za-z](?=\s|$))?\)?)\s+(?=\S)/i, "$1, ")
        .replace(/\s+(?=(?:Yangon|Rangoon|Mandalay|Nay\s*Pyi\s*Taw|ရန်ကုန်|မန္တလေး|နေပြည်တော်)(?:\s+(?:City|Region|Division))?\s*$)/i, ", ")
        .replace(/(\b(?:street|road|avenue|lane|rd|st)\b\.?|\b\d{1,3}(?:st|nd|rd|th)\b(?!\s+(?:floor|ward|quarter|block|unit|room)\b))(\s+)(?=(?:near|close to|next to|opposite|behind|beside|across from|in front of)\b)/gi, "$1,$2")
        .replace(/(လမ်း(?:မကြီး|သွယ်)?)\s*(?=[(၀-၉\d]+\s*ရပ်ကွက်)/g, "$1, ")
        .split(/,\s*/)
        .filter(Boolean);
    });
}

function isStreetReference(value: string) {
  // A road can be a structural reference in a Mandalay address. A shop on that road is a landmark.
  if (!street.test(value)) return false;
  return !venue.test(value) || /(?:\b(?:street|road|avenue|lane|boulevard|rd|ave|st)\.?|လမ်း(?:မကြီး|သွယ်)?)(?:[)\s]*)$/i.test(value)
    && !/\b(?:on|at|off)\s|လမ်းပေါ်/i.test(value);
}

export function formatRecipientAddress(label: string, knownTownship = "") {
  const rooms: string[] = [];
  const buildings: string[] = [];
  const streets: string[] = [];
  const streetReferences: string[] = [];
  const wards: string[] = [];
  const townships: string[] = [];
  const cities: string[] = [];
  const landmarks: string[] = [];
  const unclassified: string[] = [];
  const townshipKey = locationKey(knownTownship);

  for (const clause of addressClauses(label)) {
    const streetPosition = [...clause.matchAll(streetEnd)].find(match => {
      const remaining = clause.slice(match.index! + match[0].length).trim();
      return Boolean(remaining && direction.test(remaining) && !isStreetReference(remaining) && venue.test(remaining));
    });
    const streetFinish = streetPosition ? streetPosition.index! + streetPosition[0].length : 0;
    const part = streetFinish ? clause.slice(0, streetFinish).trim() : clause;
    if (streetFinish) landmarks.push(clause.slice(streetFinish).trim());

    if (direction.test(part) && !isStreetReference(part)) landmarks.push(part);
    else if (township.test(part) || (townshipKey && locationKey(part) === townshipKey)) townships.push(part);
    else if (ward.test(part)) wards.push(part);
    else if (isStreetReference(part)) (direction.test(part) ? streetReferences : streets).push(part);
    else if (city.test(part)) cities.push(part);
    else if (room.test(part)) rooms.push(part);
    else if (premises.test(part) || /^#?\s*[\d၀-၉]+(?:[/-][\d၀-၉A-Za-zက-အ]+|[A-Za-z])?$/.test(part)) buildings.push(part);
    else if (venue.test(part)) landmarks.push(part);
    else {
      // Keep unfamiliar address text available for correction without making up a component.
      unclassified.push(part);
    }
  }

  return {
    address: [...rooms, ...buildings, ...unclassified, ...streets, ...streetReferences, ...wards, ...townships, ...cities].join(", "),
    landmarks: [...new Set(landmarks)],
    needsReview: unclassified.length > 0,
  };
}

export function mergeAddressLandmarks(remarks: string, previous: readonly string[], next: readonly string[]) {
  const previousLines = new Set(previous);
  const nextLines = remarks.split("\n").map(line => line.trim()).filter(line => line && !previousLines.has(line));
  return [...new Set([...nextLines, ...next])].join("\n");
}
