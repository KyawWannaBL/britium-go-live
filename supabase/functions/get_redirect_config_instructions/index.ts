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

    // Get the site URL from the request
    const { siteUrl } = await req.json();
    
    const redirectUrls = [
      `${siteUrl}/**`,
      'http://localhost:5173/**',
      'http://localhost:3000/**'
    ];

    console.log('Configuring redirect URLs:', redirectUrls);

    // Note: Redirect URLs must be configured manually in Supabase Dashboard
    // This function provides instructions and verification
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Redirect URL configuration instructions',
        instructions: [
          '1. Go to Supabase Dashboard',
          '2. Navigate to Authentication > URL Configuration',
          '3. Add the following URLs to "Redirect URLs":',
          ...redirectUrls.map(url => `   - ${url}`),
          '4. Click "Save"',
          '5. Test password reset again'
        ],
        redirectUrls: redirectUrls,
        currentSiteUrl: siteUrl,
        note: 'These URLs must be added manually in the Supabase Dashboard for security reasons'
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