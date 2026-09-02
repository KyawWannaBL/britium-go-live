const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const loginSource = fs.readFileSync(
  path.resolve(__dirname, "../src/pages/Login.tsx"),
  "utf8"
);

assert.match(
  loginSource,
  /\.from\("be_user_account_registry"\)[\s\S]*?\.eq\("auth_user_id", userId\)[\s\S]*?\.maybeSingle\(\)/,
  "Login profile lookup must use the account registry auth-user key"
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

for (const field of [
  "must_change_password",
  "force_password_change",
  "password_change_required",
]) {
  assert.ok(
    loginSource.includes(field),
    `Login must preserve the ${field} compatibility flag`
  );
}

assert.match(
  loginSource,
  /\.update\(\{[\s\S]*?must_change_password:\s*false,[\s\S]*?force_password_change:\s*false,[\s\S]*?password_change_required:\s*false,[\s\S]*?\}\)[\s\S]*?\.eq\("auth_user_id", user\.id\)/,
  "Password changes must clear every registry compatibility flag"
);
assert.match(
  loginSource,
  /if \(profileError\) throw profileError;/,
  "Password-flag update failures must reach the login error handler"
);

console.log("Login profile contract regression check passed");
