import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(root, "src/pages/WayplanCommandCenterPage.tsx");
let source = fs.readFileSync(sourcePath, "utf8");

if (source.includes("WAYPLAN_MULTI_VAN_ENTRY_V50")) {
  console.log("Wayplan Multi-Van Entry V50 already applied");
  process.exit(0);
}

function replaceOnce(label, before, after) {
  if (!source.includes(before)) throw new Error(`V50 patch anchor not found: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
  "single-van hard-coded defaults",
  `  const [vehicleCode] = useState("FLT001");
  const [vehicleName] = useState("6H-7397");
  const [driverCode] = useState("DRV001");
  const [driverName] = useState("U Wai Phyo Lwin");
  const [riderCode] = useState("RID001");
  const [riderName] = useState("Ko Kyaw Zin Khant");
  const [helperCode] = useState("HLP001");
  const [helperName] = useState("Ko Moe Sat Zin Tun");

`,
  `  const WAYPLAN_MULTI_VAN_ENTRY_V50 = true;

`
);

const functionStart = source.indexOf("  async function generateWayplan() {");
const functionEnd = source.indexOf("  async function updateWayplanStatus(", functionStart);
if (functionStart < 0 || functionEnd < 0 || functionEnd <= functionStart) {
  throw new Error("V50 patch could not locate legacy single-wayplan generator");
}
source = source.slice(0, functionStart) + source.slice(functionEnd);

replaceOnce(
  "legacy single-wayplan action",
  `                {!revisionSource && <button onClick={generateWayplan} disabled={loading || !selectedRows.length} style={btn("gold")}>Generate from {selectedRows.length} selected</button>}
`,
  `                {!revisionSource && <div data-wayplan-multivan-entry-v50="true" style={{ border: \`1px solid \${C.blue}\`, background: "rgba(78,168,222,0.10)", borderRadius: 12, padding: 10, color: C.sub, fontSize: 11 }}>Create new delivery Wayplans through the Multi-Van Planner above. It assigns the selected queue across available DELIVERY vans and creates separate Wayplans per van/route.</div>}
`
);

replaceOnce(
  "manifest hard-coded fallback",
  `<div>Vehicle: {activeWayplan?.vehicle_code || vehicleCode} / {activeWayplan?.vehicle_name || vehicleName}</div><div>Driver: {activeWayplan?.driver_code || driverCode} / {activeWayplan?.driver_name || driverName}</div><div>Rider: {activeWayplan?.rider_code || riderCode} / {activeWayplan?.rider_name || riderName}</div>`,
  `<div>Vehicle: {activeWayplan?.vehicle_code || "-"} / {activeWayplan?.vehicle_name || "-"}</div><div>Driver: {activeWayplan?.driver_code || "-"} / {activeWayplan?.driver_name || "-"}</div><div>Rider: {activeWayplan?.rider_code || "-"} / {activeWayplan?.rider_name || "-"}</div>`
);

fs.writeFileSync(sourcePath, source);
console.log("Applied Wayplan Multi-Van Entry V50 build patch");
