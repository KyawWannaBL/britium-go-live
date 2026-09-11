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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const accounts = [
      {
        email: 'md@britiumexpress.com',
        password: 'Bv@000899600',
        fullName: 'Managing Director',
        role: 'super-admin'
      },
      {
        email: 'branch@britiumexpress.com',
        password: 'branch123',
        fullName: 'Branch Manager',
        role: 'branch-office'
      }
    ];

    const results = [];

    for (const account of accounts) {
      console.log(`Processing account: ${account.email}`);

      // Try to create user
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: {
          full_name: account.fullName,
          role: account.role
        }
      });

      let userId: string | null = null;
      let action = 'created';

      if (createError) {
        if (createError.message.includes('already been registered')) {
          console.log(`User ${account.email} already exists, will update`);
          
          // Get existing user from profiles
          const { data: profileData, error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .select('id')
            .eq('email', account.email)
            .single();
          
          if (profileError) {
            console.error(`Profile query error for ${account.email}:`, profileError);
            results.push({
              email: account.email,
              success: false,
              error: 'User exists but profile not found'
            });
            continue;
          }
          
          userId = profileData.id;
          action = 'updated';
          
          // Update password
          const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: account.password,
            email_confirm: true
          });
          
          if (pwdError) {
            console.error(`Password update error for ${account.email}:`, pwdError);
          }
        } else {
          console.error(`Create error for ${account.email}:`, createError);
          results.push({
            email: account.email,
            success: false,
            error: createError.message
          });
          continue;
        }
      } else {
        userId = createData.user.id;
        console.log(`User created: ${userId}`);
      }

      if (!userId) {
        results.push({
          email: account.email,
          success: false,
          error: 'Could not determine user ID'
        });
        continue;
      }

      // Wait for trigger
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update profile
      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({
          role: account.role,
          full_name: account.fullName,
          is_active: true
        })
        .eq('id', userId);

      if (updateError) {
        console.error(`Profile update error for ${account.email}:`, updateError);
        
        // Try insert if update failed
        const { error: insertError } = await supabaseAdmin
          .from('user_profiles')
          .insert({
            id: userId,
            email: account.email,
            full_name: account.fullName,
            role: account.role,
            is_active: true
          });
        
        if (insertError) {
          console.error(`Profile insert error for ${account.email}:`, insertError);
          results.push({
            email: account.email,
            success: false,
            error: 'Profile update/insert failed'
          });
          continue;
        }
      }

      results.push({
        email: account.email,
        role: account.role,
        success: true,
        action: action
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Accounts processed',
        results: results
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