import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Source contract tests: no database connection, no synthetic operational transactions.
// Run from britium-go-live/; scripts guard important workflow safety invariants.
const root = path.resolve(import.meta.dirname, '..');
const top = path.resolve(root, '..');
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const repoRead = (p) => fs.readFileSync(path.join(top,p),'utf8');
const monitor = repoRead('sql/harmonized_parcel_monitor_v1_20261122.sql');
const claims = repoRead('sql/harmonized_ground_outcome_claims_v1_20261122.sql');
const policies = repoRead('sql/harmonized_ground_claim_elevated_access_v1_20261122.sql');
const custody = repoRead('sql/harmonized_custody_events_v1_20261122.sql');
const page = read('src/pages/HarmonizedParcelControlPage.tsx');
const review = read('src/components/parcel/GroundEvidenceReviewPanel.tsx');
const followup = read('src/pages/ParcelFollowUpPage.tsx');
const actionSql = repoRead('sql/harmonized_parcel_followup_tasks_v1_20261122.sql');
const app = read('src/App.tsx');
const access = read('src/lib/accessControl.ts');
const sidebar = read('src/components/Sidebar.tsx');

const must = (source,patterns,label) => {
 for (const pattern of patterns) assert.match(source,pattern,label+': '+pattern);
};
must(monitor,[
 /WITH \(security_invoker = true\)/,
 /nullif\(trim\(delivery_way_id\)/,
 /FINANCE_SETTLED_PHYSICAL_OUTCOME_UNVERIFIED/,
 /RETURN_SCAN_READY_STATUS_CONFLICT/,
 /SETTLEMENT_OUTCOME_CONFLICT/,
 /COD_REMITTANCE_REVIEW/,
 /FINANCE_COD_COVERAGE_REVIEW_NOT_PROOF_OF_DEBT/,
 /REVOKE ALL ON public\.be_v_harmonized_parcel_monitor_v1 FROM PUBLIC, anon/
], 'parcel monitor');
must(claims,[
 /source_fingerprint text NOT NULL UNIQUE/,
 /review_state text NOT NULL DEFAULT 'UNREVIEWED'/,
 /reported_by_user_id uuid NOT NULL/,
 /reviewer_user_id <> reported_by_user_id/,
 /ENABLE ROW LEVEL SECURITY/,
 /REVOKE ALL ON public\.be_parcel_ground_outcome_claims_v1 FROM PUBLIC, anon, authenticated/
], 'claim evidence');
must(policies,[
 /TO authenticated/,
 /WITH CHECK/,
 /auth\.uid\(\)/,
 /be_current_role\(\)/,
 /reviewer_user_id = \(select auth\.uid\(\)\)/,
 /NEW\.reviewer_user_id = OLD\.reported_by_user_id/,
 /REVOKE ALL ON public\.be_parcel_ground_outcome_claims_v1 FROM PUBLIC, anon, authenticated/
], 'claim review security');
must(custody,[
 /UNIQUE/,
 /idempotency_key/,
 /HANDOVER_ACCEPTED/,
 /receipt_reference/,
 /ENABLE ROW LEVEL SECURITY/,
 /BEFORE UPDATE OR DELETE/
], 'custody events');
must(page,[
 /GroundEvidenceReviewPanel/,
 /delivery_way_id/,
 /exception_flags/,
 /return_scan_count/,
 /Export loaded page/,
 /CSV|csv/,
 /safe\.replace\(\/"/
], 'parcel monitor UI');
must(review,[
 /UNREVIEWED/,
 /NEEDS_EVIDENCE/,
 /VERIFIED/,
 /REJECTED/,
 /CONFLICT/,
 /reported_by_user_id===actor/,
 /source_document_reference/,
 /No parcel status or settlement was posted/
], 'ground evidence review UI');
must(app,[/path="\/parcel-control"/], 'route');
must(sidebar,[/path: "\/parcel-control"/], 'sidebar');
must(access,[/\['\/parcel-control', rule\(/], 'role gate');

assert.doesNotMatch(monitor,/\b(update|delete|insert)\s+public\./i,
 'monitor is a read-only projection');
assert.doesNotMatch(review,/\.rpc\(['"]be_finance_[^'"]+['"]/,
 'no finance mutation through evidence review');

console.log('PASS harmonized parcel guardrails: Way ID, custody, audit, maker/checker, no automatic financial posting, route and export');
