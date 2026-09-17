import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pagePath = path.join(root, "src", "pages", "WayplanCommandCenterPage.tsx");
const plannerPath = path.join(root, "src", "components", "CreatedWayplanRevisionPlanner.tsx");

let page = fs.readFileSync(pagePath, "utf8");

const importAnchor = 'import CreatedWayplanRevisionPlanner from "@/components/CreatedWayplanRevisionPlanner";';
const multiImport = 'import MultiSelectQueueFilter from "@/components/MultiSelectQueueFilter";';
if (!page.includes(multiImport)) {
  if (!page.includes(importAnchor)) throw new Error("V48 patch could not locate Wayplan planner import anchor");
  page = page.replace(importAnchor, `${importAnchor}\n${multiImport}`);
}

const oldState = `  const [townshipFilter, setTownshipFilter] = useState("ALL");\n  const [merchantFilter, setMerchantFilter] = useState("ALL");\n  const [providerFilter, setProviderFilter] = useState("ALL");\n  const [statusFilter, setStatusFilter] = useState("ALL");`;
const newState = `  const [townshipFilters, setTownshipFilters] = useState<string[]>([]);\n  const [merchantFilters, setMerchantFilters] = useState<string[]>([]);\n  const [providerFilters, setProviderFilters] = useState<string[]>([]);\n  const [statusFilters, setStatusFilters] = useState<string[]>([]);`;
if (page.includes(oldState)) page = page.replace(oldState, newState);
else if (!page.includes(newState)) throw new Error("V48 patch could not locate Wayplan filter state block");

const oldFilter = `      township: townshipFilter,\n      merchant: merchantFilter,\n      provider: providerFilter,\n      status: statusFilter,`;
const newFilter = `      townships: townshipFilters,\n      merchants: merchantFilters,\n      providers: providerFilters,\n      statuses: statusFilters,`;
if (page.includes(oldFilter)) page = page.replace(oldFilter, newFilter);
else if (!page.includes(newFilter)) throw new Error("V48 patch could not locate Wayplan filter payload block");

const oldDeps = `[readyRows, townshipFilter, merchantFilter, providerFilter, statusFilter, queueSearch]`;
const newDeps = `[readyRows, townshipFilters, merchantFilters, providerFilters, statusFilters, queueSearch]`;
if (page.includes(oldDeps)) page = page.replace(oldDeps, newDeps);
else if (!page.includes(newDeps)) throw new Error("V48 patch could not locate Wayplan filter dependency block");

const oldReset = `    setTownshipFilter("ALL");\n    setMerchantFilter("ALL");\n    setProviderFilter("ALL");\n    setStatusFilter("ALL");`;
const newReset = `    setTownshipFilters([]);\n    setMerchantFilters([]);\n    setProviderFilters([]);\n    setStatusFilters([]);`;
if (page.includes(oldReset)) page = page.replace(oldReset, newReset);
else if (!page.includes(newReset)) throw new Error("V48 patch could not locate Wayplan reset block");

const oldTownship = `<label style={{ color: C.sub, fontSize: 11 }}>Township<select value={townshipFilter} onChange={(e) => setTownshipFilter(e.target.value)} style={input()}><option value="ALL">All Townships</option>{queueFilterOptions.townships.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>`;
const newTownship = `<MultiSelectQueueFilter label="Township" allLabel="All Townships" options={queueFilterOptions.townships} values={townshipFilters} onChange={setTownshipFilters} filterKey="township" />`;
if (page.includes(oldTownship)) page = page.replace(oldTownship, newTownship);
else if (!page.includes(newTownship)) throw new Error("V48 patch could not locate Township filter control");

const oldMerchant = `<label style={{ color: C.sub, fontSize: 11 }}>Merchant<select value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)} style={input()}><option value="ALL">All Merchants</option>{queueFilterOptions.merchants.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>`;
const newMerchant = `<MultiSelectQueueFilter label="Merchant" allLabel="All Merchants" options={queueFilterOptions.merchants} values={merchantFilters} onChange={setMerchantFilters} filterKey="merchant" />`;
if (page.includes(oldMerchant)) page = page.replace(oldMerchant, newMerchant);
else if (!page.includes(newMerchant)) throw new Error("V48 patch could not locate Merchant filter control");

const oldProvider = `<label style={{ color: C.sub, fontSize: 11 }}>Service Provider<select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} style={input()}><option value="ALL">All Providers</option>{queueFilterOptions.providers.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>`;
const newProvider = `<MultiSelectQueueFilter label="Service Provider" allLabel="All Providers" options={queueFilterOptions.providers} values={providerFilters} onChange={setProviderFilters} filterKey="provider" />`;
if (page.includes(oldProvider)) page = page.replace(oldProvider, newProvider);
else if (!page.includes(newProvider)) throw new Error("V48 patch could not locate Service Provider filter control");

const oldStatus = `<label style={{ color: C.sub, fontSize: 11 }}>Status<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={input()}><option value="ALL">All Statuses</option>{queueFilterOptions.statuses.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>`;
const newStatus = `<MultiSelectQueueFilter label="Status" allLabel="All Statuses" options={queueFilterOptions.statuses} values={statusFilters} onChange={setStatusFilters} filterKey="status" />`;
if (page.includes(oldStatus)) page = page.replace(oldStatus, newStatus);
else if (!page.includes(newStatus)) throw new Error("V48 patch could not locate Status filter control");

fs.writeFileSync(pagePath, page);

let planner = fs.readFileSync(plannerPath, "utf8");
const saveStart = planner.indexOf("  async function saveRevision() {");
const saveEnd = planner.indexOf("  const short =", saveStart);
if (saveStart < 0 || saveEnd < 0) throw new Error("V48 patch could not locate revision save function");
let saveBlock = planner.slice(saveStart, saveEnd);
if (!saveBlock.includes("const reviewed = plan;")) {
  if (!saveBlock.includes("const optimized = await optimizeOne(plan);")) throw new Error("V48 patch could not locate redundant save-time road optimization");
  saveBlock = saveBlock.replace("setMessage(\"Re-optimizing the reviewed route and saving a replacement CREATED Wayplan…\");", "setMessage(\"Saving the reviewed route and replacement CREATED Wayplan…\");");
  saveBlock = saveBlock.replace("const optimized = await optimizeOne(plan);", "const reviewed = plan;");
  saveBlock = saveBlock.replaceAll("optimized.", "reviewed.");
  planner = planner.slice(0, saveStart) + saveBlock + planner.slice(saveEnd);
}
fs.writeFileSync(plannerPath, planner);

console.log("Applied Wayplan multi-select filters and reviewed-route save V48 build patch");
