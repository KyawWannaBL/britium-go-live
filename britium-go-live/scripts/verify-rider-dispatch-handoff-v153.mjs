import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const sql=fs.readFileSync(path.join(root,"supabase/migrations/20260927235500_rider_dispatch_handoff_v153.sql"),"utf8");

assert.match(sql,/financial_validation_status/);
assert.match(sql,/in \(''VALID'',''OK''\)/);
assert.match(sql,/be_dispatch_autofinalize_rider_handoff_v153/);
assert.match(sql,/trg_dispatch_scan_autofinalize_rider_v153/);
assert.match(sql,/review_status<>''DISPATCH_READY''/);
assert.match(sql,/v_scanned<>v_total/);
assert.match(sql,/rider_email=coalesce\(excluded\.rider_email/);
assert.match(sql,/RIDER_DELIVERY_WAYPLAN_ASSIGNED/);
assert.match(sql,/visible_to_rider_app/);
assert.match(sql,/RIDER_HANDOFF_AUTO_PUBLISHED_V153/);

console.log("Rider dispatch handoff V153 contract PASS");
