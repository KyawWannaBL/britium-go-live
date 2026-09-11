const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (relativePath) =>
  fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");

const canonicalClient = readSource("src/integrations/supabase/client.ts");
const loginSource = readSource("src/pages/Login.tsx");
const authContextSource = readSource("src/contexts/AuthContext.tsx");

const sourceRoot = path.resolve(__dirname, "../src");
const sourceFiles = [];
const collectSourceFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(entryPath);
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) sourceFiles.push(entryPath);
  }
};

collectSourceFiles(sourceRoot);

for (const sourceFile of sourceFiles) {
  if (sourceFile.endsWith(path.join("integrations", "supabase", "client.ts"))) continue;

  assert.doesNotMatch(
    fs.readFileSync(sourceFile, "utf8"),
    /\bcreateClient(?:<[^>]+>)?\s*\(/,
    `${path.relative(sourceRoot, sourceFile)} must use the canonical browser auth client`
  );
}

assert.equal(
  canonicalClient.match(/\bcreateClient(?:<[^>]+>)?\s*\(/g)?.length,
  1,
  "Exactly one browser Supabase client factory must exist"
);

for (const entrypoint of [
  "src/lib/supabase.ts",
  "src/lib/supabase/client.ts",
  "src/lib/supabaseClient.ts",
]) {
  const source = readSource(entrypoint);

  assert.doesNotMatch(
    source,
    /createClient\s*\(/,
    `${entrypoint} must not create a second browser auth client`
  );
  assert.match(
    source,
    /from\s+["']@\/integrations\/supabase\/client["']/,
    `${entrypoint} must re-export the canonical Supabase client`
  );
}

assert.match(
  canonicalClient,
  /storageKey:\s*authStorageKey/,
  "The canonical client must use a stable auth storage key"
);
assert.match(
  canonicalClient,
  /VITE_SUPABASE_URL\s*\|\|\s*DEFAULT_SUPABASE_URL/,
  "Git-triggered Production builds must retain the public Supabase URL fallback"
);
assert.match(
  canonicalClient,
  /VITE_SUPABASE_ANON_KEY\s*\|\|\s*DEFAULT_SUPABASE_ANON_KEY/,
  "Git-triggered Production builds must retain the public Supabase anon-key fallback"
);
assert.match(
  loginSource,
  /const SUPABASE_CONFIGURED = isSupabaseConfigured;/,
  "Login must use the canonical client's effective configuration status"
);
assert.match(
  loginSource,
  /await auth\.refreshProfile\(\);/,
  "Login must refresh the shared AuthContext after sign-in"
);
assert.doesNotMatch(
  loginSource,
  /auth\.refresh\?\.\(/,
  "Login must not silently call a missing AuthContext method"
);

assert.match(
  authContextSource,
  /event === 'TOKEN_REFRESHED' && profileRef\.current\?\.authorized/,
  "Token refreshes must preserve an already-authorized profile"
);
assert.match(
  authContextSource,
  /Profile refresh was temporarily unavailable; preserving the active session/,
  "Transient profile refresh errors must preserve the active session"
);
assert.match(
  authContextSource,
  /error instanceof AccountAccessDeniedError/,
  "Only an authoritative access denial may reject the active session"
);
assert.match(
  authContextSource,
  /globalThis\.setTimeout\(\(\) => \{[\s\S]*loadProfile\(newSession\.user\)/,
  "Profile verification must run outside the Supabase auth callback"
);
assert.match(
  authContextSource,
  /requestId === profileRequestRef\.current/,
  "Stale profile requests must not overwrite a newer session state"
);

console.log("Auth session contract regression check passed");
