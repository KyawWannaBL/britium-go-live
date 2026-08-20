#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const target = path.resolve(projectRoot, process.argv[2] || "src/pages/RiderFieldPortalApp.tsx");

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(target)) fail(`Rider app file not found: ${target}`);

let source = fs.readFileSync(target, "utf8");
if (!source.includes('import { supabase }') || !source.includes('function LoginPortal')) {
  fail("Expected RiderFieldPortalApp.tsx structure was not found. No changes made.");
}

const backup = `${target}.before-auth-login-fix-${stamp()}`;
fs.copyFileSync(target, backup);
const changes = [];

const normalizeAnchor = `  const riderYgn = raw.match(/^rider_ygn_0*(\\d+)$/i);\n  if (riderYgn) return \`RID\${String(Number(riderYgn[1])).padStart(3, "0")}\`;\n\n  return raw;`;
if (source.includes(normalizeAnchor) && !source.includes("const drv = raw.match")) {
  const normalizeReplacement = `  const riderYgn = raw.match(/^rider_ygn_0*(\\d+)$/i);\n  if (riderYgn) return \`RID\${String(Number(riderYgn[1])).padStart(3, "0")}\`;\n\n  const drv = raw.match(/^DRV\\s*-?\\s*(\\d{1,3})$/i);\n  if (drv) return \`DRV\${String(Number(drv[1])).padStart(3, "0")}\`;\n\n  const driverYgn = raw.match(/^driver_ygn_0*(\\d+)$/i);\n  if (driverYgn) return \`DRV\${String(Number(driverYgn[1])).padStart(3, "0")}\`;\n\n  const hlp = raw.match(/^HLP\\s*-?\\s*(\\d{1,3})$/i);\n  if (hlp) return \`HLP\${String(Number(hlp[1])).padStart(3, "0")}\`;\n\n  const helperYgn = raw.match(/^helper_ygn_0*(\\d+)$/i);\n  if (helperYgn) return \`HLP\${String(Number(helperYgn[1])).padStart(3, "0")}\`;\n\n  return raw;`;
  source = source.replace(normalizeAnchor, normalizeReplacement);
  changes.push("DRV/HLP login normalization added");
}

const signInRegex = /  async function signIn\(e\?: React\.FormEvent\) \{[\s\S]*?\n  \}\n\n  async function requestAccess/;
const secureSignIn = `  async function signIn(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setSuccess("");

    const requestedLogin = login.trim();
    if (!requestedLogin) {
      setError("Enter your Rider / Driver / Helper code or registered email.");
      return;
    }
    if (!password.trim()) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    try {
      if (!riderSupabaseConfigured()) {
        throw new Error("Supabase is not configured. This field app requires authenticated Supabase login.");
      }

      clearAllSessions();
      try { await supabase.auth.signOut({ scope: "local" }); } catch {}

      const normalizedRequested = normalizeRiderLogin(requestedLogin);
      const { data: resolved, error: resolveError } = await supabase.rpc("be_field_team_resolve_login", {
        p_login: normalizedRequested || requestedLogin,
      });

      if (resolveError) throw new Error("Could not resolve this workforce login: " + resolveError.message);
      if (!resolved?.ok || !resolved?.email || !resolved?.auth_user_id) {
        throw new Error(
          resolved?.error === "workforce_login_not_mapped"
            ? "This Rider / Driver / Helper account is not mapped to Supabase Auth. Contact an administrator."
            : "This workforce login is not available for authenticated field-app access."
        );
      }

      const authEmail = String(resolved.email).trim().toLowerCase();
      const workerCode = String(resolved.worker_code || normalizedRequested || requestedLogin).trim().toUpperCase();

      const auth = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (auth.error) throw new Error("Invalid workforce code/email or password.");
      if (!auth.data?.session?.access_token || !auth.data?.session?.refresh_token || !auth.data?.user?.id) {
        throw new Error("Supabase authentication did not return a valid session. Please sign in again.");
      }
      if (String(auth.data.user.id) !== String(resolved.auth_user_id)) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Authenticated user does not match the workforce account mapping.");
      }

      const riderClient = getRiderSupabase();
      if (riderClient && riderClient !== supabase) {
        const mirrored = await riderClient.auth.setSession({
          access_token: auth.data.session.access_token,
          refresh_token: auth.data.session.refresh_token,
        });
        if (mirrored.error) {
          await supabase.auth.signOut({ scope: "local" });
          throw new Error("Could not initialize the field-app Auth session: " + mirrored.error.message);
        }
      }

      let payload = { identity: resolved, jobs: [], notifications: [], source: "auth:be_field_team_resolve_login" };
      try {
        const loaded = await fetchRiderPayload(workerCode);
        payload = {
          ...loaded,
          identity: { ...(loaded?.identity || {}), ...resolved, worker_code: workerCode, email: authEmail },
        };
      } catch (payloadError) {
        console.warn("Initial authenticated payload sync failed; session remains valid", payloadError);
      }

      const { data: sessionCheck, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionCheck?.session?.access_token) {
        clearAllSessions();
        throw new Error("Authenticated session was lost before app startup. Please sign in again.");
      }

      const session = makeSession(workerCode, {
        ...(payload.identity || {}),
        ...resolved,
        worker_code: workerCode,
        email: authEmail,
      });
      saveSession(session);
      onSignedIn(session, payload);
    } catch (err) {
      clearAllSessions();
      setError(err?.message || "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function requestAccess`;

if (!signInRegex.test(source)) fail(`Could not find the signIn() block. Backup is at: ${backup}`);
source = source.replace(signInRegex, secureSignIn);
changes.push("secure workforce-code Supabase Auth login installed");

const quickUnlockRegex = /  async function quickUnlock\(\) \{[\s\S]*?\n  \}\n\n  const configured/;
const secureQuickUnlock = `  async function quickUnlock() {
    setError("");
    const saved = readSavedSession();
    if (!saved) {
      setError("No remembered field-team session. Sign in once first.");
      return;
    }
    if (!("PublicKeyCredential" in window)) {
      setError("This browser does not expose passkey / biometric unlock. Use workforce code/email and password.");
      return;
    }

    const { data, error: authError } = await supabase.auth.getSession();
    if (authError || !data?.session?.access_token) {
      clearAllSessions();
      setError("Your secure session has expired. Sign in again with your workforce code/email and password.");
      return;
    }

    saveSession(saved);
    onSignedIn(saved);
  }

  const configured`;
if (quickUnlockRegex.test(source)) {
  source = source.replace(quickUnlockRegex, secureQuickUnlock);
  changes.push("quick unlock Auth check installed");
}

source = source
  .replaceAll("Enter your Rider code or registered email.", "Enter your Rider / Driver / Helper code or registered email.")
  .replaceAll("<label>Rider code / email</label>", "<label>Rider / Driver / Helper code or email</label>")
  .replaceAll('placeholder="RID001 or rider_ygn_0001@britiumventures.com"', 'placeholder="RID001, DRV001, HLP001 or company email"');

fs.writeFileSync(target, source, "utf8");

console.log("OK: Secure field-team Auth login patch installed.");
console.log(`Target: ${target}`);
console.log(`Backup: ${backup}`);
for (const change of changes) console.log(`- ${change}`);
console.log("NEXT: npm run build, deploy, logout/hard-refresh, then sign in with DRV001/RID001/HLP001 and the real Supabase Auth password.");
