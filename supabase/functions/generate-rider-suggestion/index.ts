import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pickup_id, location, top_riders } = await req.json()
    
    // Retrieve the secret securely from the Supabase environment
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in Supabase Secrets.')
    }

    const prompt = `You are an AI logistics dispatcher. 
    Analyze this pickup request:
    - Pickup ID: ${pickup_id}
    - Location: ${location}
    - Available Top Riders: ${JSON.stringify(top_riders)}
    
    Provide a concise, professional briefing (maximum 3 sentences) recommending the best rider based on location matching.`

    // Call the Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })

    const data = await response.json()
    const suggestion = data.candidates?.[0]?.content?.parts?.[0]?.text || 'AI analysis complete. Please select a rider manually.'

    return new Response(
      JSON.stringify({ suggestion }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
    )
  }
})