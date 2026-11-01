// Verify COD fee regex execution and generated Data Entry module syntax.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = readFileSync(resolve(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");
const lines = source.split(/\r?\n/);

function parseSourceRegex(name) {
  const line = lines.find((value) => value.includes("const " + name + " = /"));
  assert.ok(line, "Missing " + name + " source regex");
  const begin = line.indexOf("= /") + 2;
  const end = line.indexOf(".exec(", begin);
  assert.ok(begin > 1 && end > begin, "Cannot isolate " + name + " regex");
  // Compile the actual source literal as executable JavaScript.
  return Function('"use strict"; return (' + line.slice(begin, end).trim() + ');')();
}

const election = parseSourceRegex("feeElection");
const reason = parseSourceRegex("feeReason");
const message = "customer note [COD_FEE_ELECTION:WAIVE] [COD_FEE_REASON:Approved exception]";
assert.equal(election.exec(message)?.[1], "WAIVE");
assert.equal(reason.exec(message)?.[1], "Approved exception");
assert.equal(election.exec("[COD_FEE_ELECTION:COLLECT]")?.[1], "COLLECT");
assert.equal(reason.exec("[COD_FEE_REASON:contains line\nbreak]"), null);

const dist = resolve(root, "dist/assets");
const chunks = readdirSync(dist).filter((file) => /^DataEntryFinancialV2Page-.*\.js$/.test(file));
assert.equal(chunks.length, 1, "Expected one generated Data Entry module");
execFileSync(process.execPath, ["--check", resolve(dist, chunks[0])], { stdio: "pipe" });
console.log("PASS: COD fee regex semantics and generated Data Entry module syntax");
