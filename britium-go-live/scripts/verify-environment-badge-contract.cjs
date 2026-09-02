const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relativePath) =>
  fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");

const loginSource = read("src/pages/Login.tsx");
const bootstrapSource = read("src/enterpriseFinalTouchBootstrap.ts");
const finalTouchStyles = read("src/styles/enterpriseFinalTouch.css");
const environmentBadgeSource = read("src/components/system/EnvironmentBadge.tsx");

for (const [name, source] of [
  ["login page", loginSource],
  ["final-touch bootstrap", bootstrapSource],
  ["final-touch stylesheet", finalTouchStyles],
]) {
  assert.doesNotMatch(
    source,
    /Britium Go-Live UAT|be-golive-watermark/i,
    `${name} must not inject a hard-coded UAT badge`
  );
}

assert.match(
  environmentBadgeSource,
  /const isProd = env === "production" \|\| env === "prod";/,
  "The centralized environment badge must detect Production explicitly"
);
assert.match(
  environmentBadgeSource,
  /if \(!showBadge\) return null;/,
  "Production must render no environment overlay"
);

console.log("Environment badge contract regression check passed");
