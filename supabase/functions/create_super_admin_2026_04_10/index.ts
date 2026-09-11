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

    // Create the super admin user
    const email = 'md@britiumexpress.com';
    const password = 'Bv@000899600';
    const fullName = 'Managing Director';
    const role = 'super-admin';

    console.log('Creating super admin account...');

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
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

    // The trigger should create the profile automatically, but let's verify and update if needed
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for trigger

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Check profile error:', checkError);
    }

    if (existingProfile) {
      console.log('Profile exists, updating role...');
      // Update the role to super-admin
      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({ 
          role: role,
          full_name: fullName
        })
        .eq('id', authData.user.id);

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }
    } else {
      console.log('Profile does not exist, creating manually...');
      // Create profile manually if trigger failed
      const { error: insertError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          email: email,
          full_name: fullName,
          role: role,
          is_active: true
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }
    }

    console.log('Super admin account created successfully');

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