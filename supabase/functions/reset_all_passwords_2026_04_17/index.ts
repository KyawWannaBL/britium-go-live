
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
        // First try to find the user
        const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
        
        if (listError) {
          results.push({ email: account.email, status: 'error', error: listError.message });
          continue;
        }

        const existingUser = users.find((u: any) => u.email === account.email);

        if (existingUser) {
          // Update password
          const { error: updateError } = await adminClient.auth.admin.updateUserById(
            existingUser.id,
            { password: account.password }
          );

          if (updateError) {
            results.push({ email: account.email, status: 'update_error', error: updateError.message });
          } else {
            // Ensure profile exists
            const { error: profileError } = await adminClient
              .from('user_profiles')
              .upsert({
                id: existingUser.id,
                email: account.email,
                full_name: account.name,
                role: account.role,
                is_active: true,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'id' });

            results.push({ 
              email: account.email, 
              status: 'updated', 
              id: existingUser.id,
              profileError: profileError?.message 
            });
          }
        } else {
          // Create new user
          const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email: account.email,
            password: account.password,
            email_confirm: true,
          });

          if (createError) {
            results.push({ email: account.email, status: 'create_error', error: createError.message });
          } else if (newUser.user) {
            // Create profile
            const { error: profileError } = await adminClient
              .from('user_profiles')
              .upsert({
                id: newUser.user.id,
                email: account.email,
                full_name: account.name,
                role: account.role,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'id' });

            results.push({ 
              email: account.email, 
              status: 'created', 
              id: newUser.user.id,
              profileError: profileError?.message 
            });
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
