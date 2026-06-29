import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { action, data } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    
    if (!apiKey) throw new Error('GEMINI_API_KEY missing in Secrets.')

    let prompt = '';

    if (action === 'explain_quote') {
      prompt = `You are a polite Burmese customer service agent for Britium Express. 
      Write a short, friendly message to a customer explaining their delivery fee based on this data:
      ${JSON.stringify(data)}
      Format: "Hello! Your delivery fee is [Total]. This includes a base fee of [Base] for [Township], plus [Extra] for extra weight, and [Highway] for drop-off. Thank you!"
      Keep it brief. Write it in English but keep it friendly.`;
    } 
    else if (action === 'analyze_pricing') {
      prompt = `You are a Logistics Pricing Analyst. Review these delivery tariffs:
      ${JSON.stringify(data)}
      Point out 1-2 anomalies or business insights. For example, are two townships in the same zone priced differently? Is the Royal tier discount too small? 
      Keep your response to a concise 3-bullet-point briefing.`;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    })

    const result = await response.json()
    const suggestion = result.candidates?.[0]?.content?.parts?.[0]?.text || 'Analysis failed.'

    return new Response(JSON.stringify({ suggestion }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }
})