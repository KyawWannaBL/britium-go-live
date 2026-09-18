import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(root, "src/pages/DataEntryFinancialV2Page.tsx");
let source = fs.readFileSync(sourcePath, "utf8");

if (source.includes("DATA_ENTRY_INTERACTIVE_LATENCY_V49")) {
  console.log("Data Entry Interactive Latency V49 already applied");
  process.exit(0);
}

function replaceOnce(label, before, after) {
  if (!source.includes(before)) throw new Error(`V49 patch anchor not found: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "build marker",
  'export const DATA_ENTRY_PROVIDER_ROUTING_BUILD = "DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903";\n',
  'export const DATA_ENTRY_PROVIDER_ROUTING_BUILD = "DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903";\nexport const DATA_ENTRY_INTERACTIVE_LATENCY_V49 = "DATA_ENTRY_INTERACTIVE_LATENCY_V49";\nconst TOWNSHIP_SEARCH_DEBOUNCE_MS = 180;\n'
);

replaceOnce(
  "township master debounce",
  '  const query = text(draftTownship).trim().toLowerCase();\n  const masterMatches = useMemo(() => open ? searchMasterLocations(query) : [], [open, query]);\n',
  '  const query = text(draftTownship).trim().toLowerCase();\n  const [debouncedTownshipQuery,setDebouncedTownshipQuery]=useState(query);\n  useEffect(()=>{\n    const timer=window.setTimeout(()=>setDebouncedTownshipQuery(query),TOWNSHIP_SEARCH_DEBOUNCE_MS);\n    return ()=>window.clearTimeout(timer);\n  },[query]);\n  const masterMatches = useMemo(() => open ? searchMasterLocations(debouncedTownshipQuery) : [], [open, debouncedTownshipQuery]);\n'
);

replaceOnce(
  "tariff search debounce",
  '  const matches = useMemo(()=>(tariffOptions as TariffOption[])\n    .filter((option) => providerFilter === "ALL" || option.provider_code === providerFilter)\n    .filter((option) => !query || option.destination_name.toLowerCase().includes(query) || option.provider_name.toLowerCase().includes(query))\n    .slice(0, 18),[providerFilter,query,tariffOptions]);\n',
  '  const matches = useMemo(()=>(tariffOptions as TariffOption[])\n    .filter((option) => providerFilter === "ALL" || option.provider_code === providerFilter)\n    .filter((option) => !debouncedTownshipQuery || option.destination_name.toLowerCase().includes(debouncedTownshipQuery) || option.provider_name.toLowerCase().includes(debouncedTownshipQuery))\n    .slice(0, 18),[providerFilter,debouncedTownshipQuery,tariffOptions]);\n'
);

replaceOnce(
  "photo rejection note buffer",
  '          <textarea\n            rows={2}\n            className="mt-3 w-full rounded-lg border border-rose-500/30 bg-[#0b2236] px-3 py-2 text-[11px] text-white placeholder:text-slate-500"\n            placeholder="Optional detail for the rider…"\n            value={row.photoRejectionNote}\n            onChange={(e) => updateRow(index, { photoRejectionNote: e.target.value })}\n          />',
  '          <BufferedDataEntryInput\n            multiline\n            rows={2}\n            className="mt-3 w-full rounded-lg border border-rose-500/30 bg-[#0b2236] px-3 py-2 text-[11px] text-white placeholder:text-slate-500"\n            placeholder="Optional detail for the rider…"\n            value={row.photoRejectionNote}\n            onCommit={(value) => updateRow(index, { photoRejectionNote: value })}\n          />'
);

fs.writeFileSync(sourcePath, source);
console.log("Applied Data Entry Interactive Latency V49 build patch");
