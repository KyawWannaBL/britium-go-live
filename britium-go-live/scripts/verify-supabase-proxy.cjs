const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const config = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8")
);

const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
const proxyIndex = rewrites.findIndex(
  (rule) => rule.source === "/supabase/:path*"
);
const spaIndex = rewrites.findIndex((rule) => rule.destination === "/index.html");

assert.notEqual(proxyIndex, -1, "Supabase proxy rewrite is missing");
assert.notEqual(spaIndex, -1, "SPA fallback rewrite is missing");
assert.ok(proxyIndex < spaIndex, "Supabase proxy must precede the SPA fallback");
assert.equal(
  rewrites[proxyIndex].destination,
  "https://dltavabvjwocknkyvwgz.supabase.co/:path*",
  "Supabase proxy must target the fixed Britium project origin"
);

const noCacheRule = (config.headers || []).find(
  (rule) => rule.source === "/supabase/:path*"
);
assert.ok(noCacheRule, "Supabase proxy cache protection is missing");
assert.ok(
  noCacheRule.headers?.some(
    (header) =>
      header.key === "x-vercel-enable-rewrite-caching" && header.value === "0"
  ),
  "Supabase proxy must disable Vercel rewrite caching"
);

console.log("Supabase proxy routing regression check passed");
