import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pagePath = path.join(root, "src", "pages", "WayplanCommandCenterPage.tsx");
let source = fs.readFileSync(pagePath, "utf8");

const preserveSelectionBefore = `      setRevisionSource({ ...activeWayplan, ...data });\n      setRevisionRows(stops);\n      setRevisionRemoveSelected({});\n      setSelected({});\n      setMessage(`;
const preserveSelectionAfter = `      setRevisionSource({ ...activeWayplan, ...data });\n      setRevisionRows(stops);\n      setRevisionRemoveSelected({});\n      setMessage(`;
if (!source.includes(preserveSelectionBefore) && !source.includes(preserveSelectionAfter)) {
  throw new Error("V47 patch could not locate beginRevision selection block");
}
source = source.replace(preserveSelectionBefore, preserveSelectionAfter);

const functionAnchor = `  async function generateWayplan() {`;
const deleteFunction = `  async function deleteCreatedWayplan() {\n    if (!activeWayplan?.wayplan_id || activeWayplan?.wayplan_status !== "CREATED") {\n      setError("Only a CREATED Wayplan can be deleted before dispatch.");\n      return;\n    }\n    const confirmed = window.confirm(\`Delete \${activeWayplan.wayplan_id} and return its ways to READY?\`);\n    if (!confirmed) return;\n    setLoading(true);\n    setError("");\n    setMessage("");\n    try {\n      const { data, error } = await supabase.rpc("be_delete_created_wayplan_v55", {\n        p_payload: {\n          wayplan_id: activeWayplan.wayplan_id,\n          request_id: crypto.randomUUID(),\n          reason: "Deleted by operator before dispatch",\n        },\n      });\n      if (error) throw error;\n      if (!data?.ok) throw new Error(data?.error || "Could not delete the CREATED Wayplan.");\n      cancelRevision();\n      setSelected({});\n      setMessage(\`\${data.wayplan_id} deleted before dispatch. \${data.released_count || 0} way(s) returned to READY; the deleted Wayplan was removed from Generated Wayplans. Audit history remains.\`);\n      await loadAll();\n    } catch (err: any) {\n      setError(err?.message || "Could not delete the CREATED Wayplan.");\n    } finally {\n      setLoading(false);\n    }\n  }\n\n`;
if (!source.includes("async function deleteCreatedWayplan()")) {
  if (!source.includes(functionAnchor)) throw new Error("V47 patch could not locate generateWayplan anchor");
  source = source.replace(functionAnchor, deleteFunction + functionAnchor);
}

const editButton = `<button onClick={beginRevision} disabled={loading || !canEditCreatedWayplan || Boolean(revisionSource)} style={{ ...btn("blue"), opacity: canEditCreatedWayplan ? 1 : 0.45 }}>Edit CREATED Wayplan</button>`;
const rightActions = `${editButton}\n                {revisionSource && <div data-wayplan-revision-actions-v47="true" style={{ display: "grid", gap: 8, border: \`1px solid \${C.gold}\`, borderRadius: 12, padding: 10, background: "rgba(246,184,75,0.08)" }}>\n                  <div style={{ color: C.gold, fontWeight: 900, fontSize: 12 }}>Editing {revisionSource.wayplan_id} · {revisionRows.length} current/revised ways</div>\n                  <button style={btn("gold")} disabled={!filteredSelectedRows.length} onClick={addSelectedToRevision}>Add Selected ({filteredSelectedRows.length})</button>\n                  <button style={btn("red")} disabled={!removeCount} onClick={removeSelectedFromRevision}>Remove Selected ({removeCount})</button>\n                  <button style={btn("plain")} onClick={cancelRevision}>Cancel Edit</button>\n                </div>}\n                <button onClick={deleteCreatedWayplan} disabled={loading || !canEditCreatedWayplan || Boolean(revisionSource)} style={{ ...btn("red"), opacity: canEditCreatedWayplan ? 1 : 0.45 }}>Delete Generated Wayplan</button>`;
if (!source.includes('data-wayplan-revision-actions-v47="true"')) {
  if (!source.includes(editButton)) throw new Error("V47 patch could not locate Edit CREATED Wayplan button");
  source = source.replace(editButton, rightActions);
}

fs.writeFileSync(pagePath, source);
console.log("Applied Wayplan revision/delete V47 build patch");
await import("./apply-wayplan-multiselect-save-v48.mjs");
