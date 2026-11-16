import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const expectedRef = "hgijdyfwmvskchsruknp";
const expectedUrl = `https://${expectedRef}.supabase.co`;
const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const proxy = cfg.rewrites.find(x => x.source === "/supabase/:path*");
assert.equal(proxy?.destination, `${expectedUrl}/:path*`, "UAT proxy must target isolated Supabase");

const client = readFileSync(new URL("../src/integrations/supabase/client.ts", import.meta.url), "utf8");
assert.ok(client.includes(expectedUrl), "UAT client must target isolated Supabase");
assert.ok(!client.includes("dltavabvjwocknkyvwgz"), "Production Supabase reference forbidden");
assert.ok(!client.includes("www.britiumexpress.com/supabase"), "Production API proxy forbidden");

const isVercel = process.env.VERCEL === "1";
if (isVercel) {
  const url = String(process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const apiKey = String(process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const nativeUrl = String(process.env.VITE_NATIVE_SUPABASE_PROXY_URL || "").trim().replace(/\/+$/, "");
  const problems = [];
  if (url !== expectedUrl) problems.push("VITE_SUPABASE_URL must be the isolated UAT project URL");
  if (!apiKey) problems.push("VITE_SUPABASE_ANON_KEY is missing; configure the isolated UAT publishable/anon key");
  if (nativeUrl && nativeUrl !== expectedUrl) problems.push("VITE_NATIVE_SUPABASE_PROXY_URL points outside UAT");

  // A legacy anon key is a public JWT. Check its project-ref claim without printing the key.
  if (apiKey.split(".").length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(apiKey.split(".")[1], "base64url").toString());
      if (payload.ref && payload.ref !== expectedRef) problems.push("VITE_SUPABASE_ANON_KEY belongs to a different Supabase project");
      if (payload.role && payload.role !== "anon") problems.push("Do not expose a non-anon JWT in VITE_SUPABASE_ANON_KEY");
    } catch {
      problems.push("Invalid JWT format in VITE_SUPABASE_ANON_KEY");
    }
  } else if (apiKey && !apiKey.startsWith("sb_publishable_")) {
    problems.push("Expected a Supabase publishable key or legacy anon JWT, never a secret/service-role key");
  }
  if (problems.length > 0) {
    for (const item of problems) console.error(`UAT_CONFIG_ERROR: ${item}`);
    console.error("UAT deployment blocked to prevent Production data leakage and nonfunctional logins.");
    process.exit(1);
  }
}
console.log("PASS: Mandalay/Insein UAT routing and build-time environment isolation");
