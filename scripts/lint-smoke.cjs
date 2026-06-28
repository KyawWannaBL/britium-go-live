const fs = require("fs");
const path = require("path");

const root = process.cwd();
const src = path.join(root, "src");
let failed = false;
let suppressionCount = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (["node_modules", "dist", ".git"].includes(item)) continue;
      walk(p);
      continue;
    }

    if (!/\.(ts|tsx|js|jsx|css)$/.test(item)) continue;
    const s = fs.readFileSync(p, "utf8");
    const rel = path.relative(root, p);

    if (s.includes("@ts-ignore") || s.includes("@ts-nocheck")) suppressionCount += 1;

    if (s.includes("<<<<<<<") || s.includes("=======") || s.includes(">>>>>>>")) {
      console.error("Merge conflict marker:", rel);
      failed = true;
    }

    if (/service[_-]?role/i.test(s) && /eyJ/.test(s)) {
      console.error("Possible service-role secret in source:", rel);
      failed = true;
    }
  }
}

walk(src);

if (suppressionCount) {
  console.warn(`Smoke lint warning: ${suppressionCount} files still contain TypeScript suppression comments. Allowed for testing stabilization; remove before final production hardening.`);
}

if (failed) process.exit(1);
console.log("Smoke lint passed.");
