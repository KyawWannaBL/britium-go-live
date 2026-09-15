import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const planner = read("src/lib/multiVanPlanner.ts");
assert.match(planner, /NORMAL_MIN_PARCELS_PER_VAN\s*=\s*50\s*;/, "normal minimum must remain 50 parcels per van");
assert.match(planner, /PRACTICAL_MAX_PARCELS_PER_VAN\s*=\s*75\s*;/, "hard per-van maximum must remain 75 parcels");
assert.doesNotMatch(planner, /below 45 parcels|70\/95|95 for compact/i, "V37 45/95 guardrails must not return");

const zonePlanner = read("api/wayplan-zone-plan.mjs");
assert.match(zonePlanner, /const FLOOR\s*=\s*50\s*;/, "Yangon zone floor must be 50");
assert.match(zonePlanner, /const COMPACT_CEILING\s*=\s*75\s*;/, "Yangon compact ceiling must be 75");
assert.match(zonePlanner, /townships:\s*\["Thanlyin"\]/, "Thanlyin must have an explicit Britium planning zone");
assert.doesNotMatch(zonePlanner, /OTHER_OUT_OF_SCOPE[^\n]*Thanlyin/, "Thanlyin must not be excluded from Britium planning");
assert.match(zonePlanner, /more than one (?:van|route) below 50/i, "zone planner must reject multiple under-50 routes");

const ui = read("src/components/MultiVanPlanner.tsx");
assert.match(ui, /be_generate_multi_van_v3/, "UI must save through V38 contract validator");
assert.doesNotMatch(ui, /isYangonMaster\s*\?\s*true\s*:\s*approved/, "Yangon must not silently auto-approve under-50 routes");
assert.doesNotMatch(ui, /isYangonMaster\s*\?\s*\[\]\s*:\s*plans\.filter/, "Yangon under-50 routes must remain visible to validation");
assert.match(ui, /NORMAL_MIN_PARCELS_PER_VAN/, "UI must use the shared minimum constant");
assert.match(ui, /PRACTICAL_MAX_PARCELS_PER_VAN/, "UI must use the shared maximum constant");

const migrationDir = path.join(root, "supabase", "migrations");
const v38 = fs.readdirSync(migrationDir).find((name) => /wayplan_capacity_contract_v38\.sql$/.test(name));
assert.ok(v38, "V38 wayplan capacity contract migration is missing");
const migration = read(path.join("supabase", "migrations", v38));
assert.match(migration, /be_generate_multi_van_v3/, "V38 migration must define be_generate_multi_van_v3");
assert.match(migration, /Only one delivery van may be below 50 parcels\./, "DB must reject multiple under-50 vans");
assert.match(migration, /Operator approval and a reason are required\./, "DB must require explicit approval and reason for the one under-50 exception");

console.log("PASS: V38 wayplan capacity contract is aligned across planner, zone API, UI, and database.");
