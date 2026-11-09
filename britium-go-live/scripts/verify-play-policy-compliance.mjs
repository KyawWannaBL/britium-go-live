import fs from "node:fs";
import path from "node:path";

const roots = ["dist"];
const allowedExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".html", ".json", ".css"]);
const forbidden = [
  { label: "Android package download URL", pattern: /\.apk(?:\b|[?/#])/i },
  { label: "external release download path", pattern: /releases\/download/i },
  { label: "external installer environment variable", pattern: /VITE_(?:RIDER|DRIVER|HELPER|ENTERPRISE)_APK_URL/i },
];

const findings = [];

function scan(target) {
  if (!fs.existsSync(target)) {
    throw new Error(`Required compliance scan target does not exist: ${target}`);
  }
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) scan(path.join(target, entry));
    return;
  }
  if (!allowedExtensions.has(path.extname(target).toLowerCase())) return;
  const text = fs.readFileSync(target, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) findings.push(`${target}: ${rule.label}`);
  }
}

for (const root of roots) scan(root);

if (findings.length) {
  console.error("Google Play distribution compliance check failed:");
  for (const finding of findings) console.error(` - ${finding}`);
  process.exit(1);
}

console.log("Google Play distribution compliance check passed: no external Android installer path is bundled.");
