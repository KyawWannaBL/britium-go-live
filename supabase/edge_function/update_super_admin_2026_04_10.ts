import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Client-Info, apikey, Content-Type, X-Application-Name',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const email = 'md@britiumexpress.com';
    const password = 'Bv@000899600';
    const fullName = 'Managing Director';
    const role = 'super-admin';

    console.log('Looking for user with email:', email);

    // Get user by email
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('List users error:', listError);
      throw listError;
    }

    const user = users.find(u => u.email === email);

    if (!user) {
      // User doesn't exist, create new one
      console.log('User not found, creating new account...');
      
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: role
        }
      });

      if (authError) {
        console.error('Auth error:', authError);
        throw authError;
      }

      console.log('Auth user created:', authData.user.id);

      // Wait for trigger
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update profile
      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          id: authData.user.id,
          email: email,
          full_name: fullName,
          role: role,
          is_active: true
        });

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Super admin account created successfully',
          user: {
            id: authData.user.id,
            email: email,
            role: role
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    } else {
      // User exists, update password and role
      console.log('User found, updating password and role...');
      console.log('User ID:', user.id);

      // Update password
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          password: password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: role
          }
        }
      );

      if (passwordError) {
        console.error('Password update error:', passwordError);
        throw passwordError;
      }

      console.log('Password updated');

      // Update profile role
      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          id: user.id,
          email: email,
          full_name: fullName,
          role: role,
          is_active: true
        }, {
          onConflict: 'id'
        });

      if (profileError) {
        console.error('Profile update error:', profileError);
        throw profileError;
      }

      console.log('Profile updated');

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Super admin account updated successfully',
          user: {
            id: user.id,
            email: email,
            role: role
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});