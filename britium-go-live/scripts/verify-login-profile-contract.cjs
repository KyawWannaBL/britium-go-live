const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const loginSource = fs.readFileSync(
  path.resolve(__dirname, "../src/pages/Login.tsx"),
  "utf8"
);

assert.match(
  loginSource,
  /\.rpc\("be_login_access_profile"\)/,
  "Login profile lookup must use the RLS-backed access contract"
);
assert.doesNotMatch(
  loginSource,
  /\.from\("profiles"\)/,
  "Login must not read or write password flags on the profiles table"
);
assert.doesNotMatch(
  loginSource,
  /requires_password_change/,
  "Login must not reference the removed requires_password_change column"
);

assert.match(
  loginSource,
  /\.rpc\([\s\S]*?"be_complete_password_change"[\s\S]*?\)/,
  "Password changes must clear flags through the authenticated-user RPC"
);
assert.match(
  loginSource,
  /if \(profileError\) throw profileError;/,
  "Password-flag update failures must reach the login error handler"
);

console.log("Login profile contract regression check passed");
