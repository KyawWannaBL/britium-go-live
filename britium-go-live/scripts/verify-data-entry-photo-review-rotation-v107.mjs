import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/DataEntryFinancialV2Page.tsx"), "utf8");

const checks = [
  ["photo review has display rotation state", /const \[photoRotation,\s*setPhotoRotation\]\s*=\s*useState\(0\)/],
  ["preview open resets rotation", /setPhotoZoom\(1\);\s*setPhotoRotation\(0\);\s*setPhotoPreviewOpen\(true\)/],
  ["rotate-left control is present", /Rotate Left[\s\S]{0,260}setPhotoRotation\(\(v\)\s*=>\s*v\s*-\s*90\)/],
  ["rotate-right control is present", /Rotate Right[\s\S]{0,260}setPhotoRotation\(\(v\)\s*=>\s*v\s*\+\s*90\)/],
  ["reset restores zoom and orientation", /setPhotoZoom\(1\);\s*setPhotoRotation\(0\)/],
  ["review image uses CSS rotation only", /transform:\s*`rotate\(\$\{photoRotation\}deg\)`/],
  ["closing the review resets orientation", /setPhotoPreviewOpen\(false\);\s*setPhotoRotation\(0\)/],
];

const failures = checks.filter(([, pattern]) => !pattern.test(page)).map(([name]) => name);

const rotationArea = page.match(/photoRotation[\s\S]{0,1800}Parcel proof preview/)?.[0] || "";
if (/updateRow\(|proof_url\s*=|FileReader|canvas|toBlob|storage\.from/.test(rotationArea)) {
  failures.push("photo rotation mutates parcel proof data instead of review display only");
}

if (failures.length) {
  console.error("Data Entry photo review rotation V107 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}

console.log("Data Entry photo review rotation V107 contract PASS");
