#!/usr/bin/env node
// Invite the preapproved 16 Mandalay/Insein UAT identities.
// Requires a privately supplied service role key. DRY RUN by default.
// NEVER run against production or create direct auth.users rows.
const ref = 'hgijdyfwmvskchsruknp';
const baseUrl = 'https://' + ref + '.supabase.co';
const redirectTo = 'https://britium-uat-mdy-insein.vercel.app';
const args = new Set(process.argv.slice(2));
const perform = args.has('--execute');
const ack = args.has('--confirm-isolated-uat');
const roles = [
  ['branch_mgr', 'Branch Manager', 1],
  ['rider', 'Rider', 3],
  ['warehouse', 'Warehouse', 1],
  ['cashier', 'Cashier', 1],
  ['driver', 'Driver', 1],
  ['helper', 'Helper', 1],
];
const roster = [];
for (const [code, branch] of [['mdy', 'Mandalay'], ['isn', 'Insein']]) {
  for (const [prefix, role, count] of roles) {
    for (let n = 1; n <= count; n++) {
      roster.push({
        email: prefix + '_' + code + '_' + String(n).padStart(3, '0') + '_uat@britiumventures.com',
        branch, role,
      });
    }
  }
}
if (roster.length !== 16 || new Set(roster.map(x => x.email)).size !== 16) {
  throw new Error('UAT account roster integrity failed');
}
if (!perform) {
  console.log('DRY RUN ONLY. No invitations sent. Intended isolated Supabase: ' + ref);
  console.table(roster);
  console.log('To invite, use --execute --confirm-isolated-uat with SUPABASE_SERVICE_ROLE_KEY in a private environment.');
  process.exit(0);
}
if (!ack) throw new Error('Explicit --confirm-isolated-uat required');
if (process.env.SUPABASE_URL !== baseUrl) {
  throw new Error('SUPABASE_URL must exactly match isolated UAT: ' + baseUrl);
}
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key || key.trim().length < 40) {
  throw new Error('A Supabase Auth Admin service-role key is required privately');
}
let created = 0;
for (const account of roster) {
  const result = await fetch(baseUrl + '/auth/v1/invite?redirect_to=' +
    encodeURIComponent(redirectTo), {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + key,
      apikey: key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({email: account.email}),
  });
  if (!result.ok) {
    const payload = await result.json().catch(() => ({}));
    // No secrets, tokens, or raw invitation URLs in error output.
    console.error('INVITATION FAILED', account.email, result.status,
      String(payload.code || payload.msg || payload.message || 'Auth admin error').slice(0,180));
    process.exitCode = 1;
    break;
  }
  const payload = await result.json();
  console.log('INVITED', account.email, account.branch, account.role, payload.id || '(id not returned)');
  created++;
}
console.log('Invitations sent:', created, '/', roster.length);
console.log('Auth invitations do NOT grant app roles. Map actual auth IDs to branch-scoped roles via approved registry process after schema is ready.');
