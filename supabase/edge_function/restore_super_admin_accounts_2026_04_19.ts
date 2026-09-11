import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

const TARGETS = [
  { email: 'md@britiumexpress.com', fullName: 'Managing Director' },
  { email: 'sai@britiumexpress.com', fullName: 'Sai' },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const requestedPasswords = (body?.passwords ?? {}) as Record<string, string>;

    const listResp = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listResp.error) throw listResp.error;

    const results = [];

    for (const target of TARGETS) {
      const existingUser = listResp.data.users.find((u: { email?: string | null }) => (u.email ?? '').toLowerCase() === target.email);
      let userId = existingUser?.id ?? null;
      let action = 'updated-profile';

      if (!userId) {
        const password = requestedPasswords[target.email];
        if (!password) {
          results.push({
            email: target.email,
            success: false,
            action: 'skipped-missing-auth-user',
            error: 'Auth user not found. Re-run with passwords payload to create the user.'
          });
          continue;
        }

        const createResp = await adminClient.auth.admin.createUser({
          email: target.email,
          password,
          email_confirm: true,
          app_metadata: { role: 'super-admin', role_code: 'SUPER_ADMIN' },
          user_metadata: { full_name: target.fullName, role: 'super-admin' },
        });

        if (createResp.error || !createResp.data.user) {
          results.push({ email: target.email, success: false, action: 'create-auth-user', error: createResp.error?.message ?? 'Unknown create error' });
          continue;
        }

        userId = createResp.data.user.id;
        action = 'created-auth-user';
      } else {
        const updateResp = await adminClient.auth.admin.updateUserById(userId, {
          email_confirm: true,
          app_metadata: { role: 'super-admin', role_code: 'SUPER_ADMIN' },
          user_metadata: { full_name: target.fullName, role: 'super-admin' },
        });

        if (updateResp.error) {
          results.push({ email: target.email, success: false, action: 'update-auth-user', error: updateResp.error.message });
          continue;
        }
      }

      const profileResp = await adminClient.from('user_profiles').upsert({
        id: userId,
        email: target.email,
        full_name: target.fullName,
        role: 'super-admin',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (profileResp.error) {
        results.push({ email: target.email, success: false, action: 'upsert-profile', error: profileResp.error.message });
        continue;
      }

      results.push({ email: target.email, success: true, action, role: 'super-admin' });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
