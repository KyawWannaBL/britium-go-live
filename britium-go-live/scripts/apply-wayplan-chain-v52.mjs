import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pagePath = path.join(root, "src/pages/WayplanCommandCenterPage.tsx");
let source = fs.readFileSync(pagePath, "utf8");

function replaceOnce(label, before, after) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`V52 patch anchor not found: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "filter collapse state",
  '  const [groupBy, setGroupBy] = useState<WayplanQueueGroupBy>("NONE");',
  '  const [groupBy, setGroupBy] = useState<WayplanQueueGroupBy>("NONE");\n  const [filtersExpanded, setFiltersExpanded] = useState(true);'
);

replaceOnce(
  "planner keeps all selected rows",
  '  const plannerRows = filteredSelectedRows;',
  '  const plannerRows = selectedRows;'
);

replaceOnce(
  "reset opens filters",
  '    setGroupBy("NONE");\n  }',
  '    setGroupBy("NONE");\n    setFiltersExpanded(true);\n  }'
);

replaceOnce(
  "single selection collapses filters",
  '    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));',
  '    const selecting = !selected[id];\n    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));\n    if (selecting) setFiltersExpanded(false);'
);

replaceOnce(
  "select all filtered collapses filters",
  '  function toggleAllVisible() {\n    setSelected((prev) => toggleVisibleWayplanSelection(prev, filteredReadyRows));\n  }',
  '  function toggleAllVisible() {\n    const selecting = !allVisibleSelected;\n    setSelected((prev) => toggleVisibleWayplanSelection(prev, filteredReadyRows));\n    if (selecting) setFiltersExpanded(false);\n  }'
);

replaceOnce(
  "prominent top select all",
  '<button onClick={toggleAllVisible} disabled={!filteredReadyRows.length} style={btn("plain")}>\n                <CheckCircle2 size={15} /> {allVisibleSelected ? "Clear Filtered" : "Select All Filtered"}\n              </button>',
  '<button data-wayplan-select-all-filtered-v52="true" onClick={toggleAllVisible} disabled={!filteredReadyRows.length} style={btn("gold")}>\n                <CheckCircle2 size={15} /> {allVisibleSelected ? "Clear Filtered (" + filteredReadyRows.length + ")" : "Select All Filtered (" + filteredReadyRows.length + ")"}\n              </button>'
);

const startMarker = '            <div data-wayplan-queue-filters="true"';
const endMarker = '            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 14 }}>';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) throw new Error("V52 patch could not locate Wayplan filter panel");

const filterBlock = `            <div data-wayplan-queue-filters="true" style={{ border: \`1px solid \${C.border}\`, background: C.panel2, borderRadius: 14, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.gold, fontSize: 12, fontWeight: 900 }}><SlidersHorizontal size={15} /> FILTER & GROUP WAYS</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ alignSelf: "center", color: C.sub, fontSize: 11 }}>{filteredReadyRows.length} filtered · {filteredSelectedRows.length} filtered selected · {selectedRows.length} total selected</span>
                  <button type="button" onClick={() => setFiltersExpanded((value) => !value)} style={btn("plain")}>{filtersExpanded ? "Hide Filters" : "Show Filters"}</button>
                </div>
              </div>
              {filtersExpanded ? <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 8, marginTop: 10 }}>
                  <MultiSelectQueueFilter label="Township" allLabel="All Townships" options={queueFilterOptions.townships} values={townshipFilters} onChange={setTownshipFilters} filterKey="township" />
                  <MultiSelectQueueFilter label="Merchant" allLabel="All Merchants" options={queueFilterOptions.merchants} values={merchantFilters} onChange={setMerchantFilters} filterKey="merchant" />
                  <MultiSelectQueueFilter label="Service Provider" allLabel="All Providers" options={queueFilterOptions.providers} values={providerFilters} onChange={setProviderFilters} filterKey="provider" />
                  <MultiSelectQueueFilter label="Status" allLabel="All Statuses" options={queueFilterOptions.statuses} values={statusFilters} onChange={setStatusFilters} filterKey="status" />
                  <label style={{ color: C.sub, fontSize: 11 }}>Group By<select value={groupBy} onChange={(e) => setGroupBy(e.target.value as WayplanQueueGroupBy)} style={input()}><option value="NONE">None</option><option value="TOWNSHIP">Township</option><option value="MERCHANT">Merchant</option><option value="PROVIDER">Service Provider</option></select></label>
                  <label style={{ color: C.sub, fontSize: 11 }}>Search<div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 11, top: 13, color: C.sub }} /><input value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)} placeholder="Waybill, recipient, address..." style={{ ...input(), paddingLeft: 34 }} /></div></label>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <div style={{ color: C.sub, fontSize: 11, alignSelf: "center" }}>Choose the filters, then use Select All Filtered. The filter panel collapses automatically so it does not cover the operation table.</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={toggleAllVisible} disabled={!filteredReadyRows.length} style={btn("gold")}><CheckCircle2 size={14} /> {allVisibleSelected ? `Clear Filtered (${filteredReadyRows.length})` : `Select All Filtered (${filteredReadyRows.length})`}</button>
                    <button onClick={resetQueueFilters} style={btn("plain")}><RotateCcw size={14} /> Reset Filters</button>
                  </div>
                </div>
              </> : <div data-wayplan-filter-summary-v52="true" style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ color: C.sub, fontSize: 11 }}>
                  Filters minimized · Townships {townshipFilters.length || "All"} · Merchants {merchantFilters.length || "All"} · Providers {providerFilters.length || "All"} · Statuses {statusFilters.length || "All"} · {filteredReadyRows.length} matching ways.
                </div>
                <button type="button" onClick={() => setFiltersExpanded(true)} style={btn("blue")}>Edit Filters</button>
              </div>}
            </div>

`;

source = source.slice(0, start) + filterBlock + source.slice(end);

fs.writeFileSync(pagePath, source);
console.log("Applied Wayplan whole-chain UX V52 build patch");
