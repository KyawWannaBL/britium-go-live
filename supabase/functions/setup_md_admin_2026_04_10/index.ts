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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const email = 'md@britiumexpress.com';
    const password = 'Bv@000899600';

    console.log('Creating/updating super admin...');

    // Try to create user
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Managing Director',
        role: 'super-admin'
      }
    });

    let userId: string;

    if (userError) {
      if (userError.message.includes('already been registered')) {
        console.log('User exists, getting user ID...');
        
        // Get user by email using list
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) throw listError;
        
        const existingUser = listData.users.find(u => u.email === email);
        
        if (!existingUser) {
          throw new Error('User exists but could not be found');
        }
        
        userId = existingUser.id;
        
        // Update password
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: password,
          email_confirm: true
        });
        
        console.log('Password updated for user:', userId);
      } else {
        throw userError;
      }
    } else {
      userId = userData.user.id;
      console.log('New user created:', userId);
    }

    // Wait a moment for trigger
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update profile to super-admin
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        role: 'super-admin',
        full_name: 'Managing Director',
        is_active: true
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Profile update error:', profileError);
      // Try insert if update failed
      const { error: insertError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: userId,
          email: email,
          full_name: 'Managing Director',
          role: 'super-admin',
          is_active: true
        });
      
      if (insertError) {
        console.error('Profile insert error:', insertError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Super admin account ready',
        email: email,
        userId: userId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});