
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

const ACCOUNTS = [
  { email: 'md@britiumexpress.com',         password: 'BritiumMD2026!',         role: 'super-admin',      name: 'Managing Director' },
  { email: 'sai@britiumexpress.com',        password: 'BritiumSai2026!',        role: 'super-admin',      name: 'Sai' },
  { email: 'admin@britiumexpress.com',       password: 'BritiumAdmin2026!',      role: 'admin',            name: 'System Admin' },
  { email: 'supervisor@britiumexpress.com',  password: 'BritiumSuper2026!',      role: 'supervisor',       name: 'Supervisor' },
  { email: 'warehouse@britiumexpress.com',   password: 'BritiumWarehouse2026!',  role: 'warehouse-staff',  name: 'Warehouse Staff' },
  { email: 'driver@britiumexpress.com',      password: 'BritiumDriver2026!',     role: 'driver',           name: 'Driver' },
  { email: 'merchant@britiumexpress.com',    password: 'BritiumMerchant2026!',   role: 'merchant',         name: 'Merchant' },
  { email: 'finance@britiumexpress.com',     password: 'BritiumFinance2026!',    role: 'finance',          name: 'Finance Staff' },
  { email: 'wayplan@britiumexpress.com',     password: 'BritiumWayplan2026!',    role: 'wayplan-manager',          name: 'Way Planner' },
  { email: 'hr@britiumexpress.com',          password: 'BritiumHR2026!',         role: 'hr-admin',               name: 'HR Manager' },
  { email: 'branch@britiumexpress.com',      password: 'BritiumBranch2026!',     role: 'branch-office',     name: 'Branch Office' },
  { email: 'customer@britiumexpress.com',    password: 'BritiumCustomer2026!',   role: 'customer-service', name: 'Customer Service' },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const results = [];

    for (const account of ACCOUNTS) {
      try {
        // Look up the user profile by email in our user_profiles table
        const { data: profileData } = await adminClient
          .from('user_profiles')
          .select('id')
          .eq('email', account.email)
          .maybeSingle();

        if (profileData?.id) {
          // User profile exists - update their password via admin API
          const { error: updateError } = await adminClient.auth.admin.updateUserById(
            profileData.id,
            { password: account.password, email_confirm: true }
          );

          if (updateError) {
            // Try creating a new auth user with a specific ID
            results.push({ email: account.email, status: 'update_error', error: updateError.message });
          } else {
            results.push({ email: account.email, status: 'password_updated', id: profileData.id });
          }
        } else {
          // No profile - try to create the auth user and profile
          const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email: account.email,
            password: account.password,
            email_confirm: true,
          });

          if (createError) {
            // User might already exist in auth but not profiles
            // Try to find by listing with filter
            const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
              page: 1, perPage: 1000
            });
            
            if (!listError && listData) {
              const found = listData.users.find((u: any) => u.email === account.email);
              if (found) {
                await adminClient.auth.admin.updateUserById(found.id, {
                  password: account.password
                });
                await adminClient.from('user_profiles').upsert({
                  id: found.id,
                  email: account.email,
                  full_name: account.name,
                  role: account.role,
                  is_active: true,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'id' });
                results.push({ email: account.email, status: 'found_and_updated', id: found.id });
              } else {
                results.push({ email: account.email, status: 'create_error', error: createError.message });
              }
            } else {
              results.push({ email: account.email, status: 'create_error', error: createError.message });
            }
          } else if (newUser.user) {
            await adminClient.from('user_profiles').upsert({
              id: newUser.user.id,
              email: account.email,
              full_name: account.name,
              role: account.role,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
            results.push({ email: account.email, status: 'created', id: newUser.user.id });
          }
        }
      } catch (err: any) {
        results.push({ email: account.email, status: 'exception', error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
