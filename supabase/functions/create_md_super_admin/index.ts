import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }

    console.log('Supabase URL:', supabaseUrl);
    console.log('Service key exists:', !!supabaseServiceKey);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const email = 'md@britiumexpress.com';
    const password = 'Bv@000899600';
    const fullName = 'Managing Director';

    console.log('Attempting to create user:', email);

    // Create user with admin API
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'super-admin'
      }
    });

    if (createError) {
      console.error('Create error:', createError.message);
      
      // If user already exists, that's okay
      if (!createError.message.includes('already been registered')) {
        throw createError;
      }
      
      console.log('User already exists, will update profile');
    } else {
      console.log('User created successfully:', createData.user.id);
    }

    // Get the user ID
    let userId: string | null = null;
    
    if (createData?.user) {
      userId = createData.user.id;
    } else {
      // User exists, need to find them
      console.log('Querying for existing user...');
      
      const { data: queryData, error: queryError } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .single();
      
      if (queryError) {
        console.error('Query error:', queryError);
        throw new Error('User exists but profile not found. Please sign up through the website first.');
      }
      
      userId = queryData.id;
    }

    if (!userId) {
      throw new Error('Could not determine user ID');
    }

    console.log('Updating profile for user:', userId);

    // Update the profile
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        role: 'super-admin',
        full_name: fullName,
        is_active: true
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Update error:', updateError);
      throw updateError;
    }

    console.log('Profile updated successfully');

    // If user already existed, update their password
    if (!createData?.user) {
      console.log('Updating password...');
      const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: password
      });
      
      if (pwdError) {
        console.error('Password update error:', pwdError);
      } else {
        console.log('Password updated');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Super admin account is ready',
        credentials: {
          email: email,
          password: '(set as requested)',
          role: 'super-admin'
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: error.toString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});