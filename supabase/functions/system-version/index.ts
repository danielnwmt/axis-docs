import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  return new Response(
    JSON.stringify({
      version: '1.0.0',
      commit: Deno.env.get('SUPABASE_DEPLOY_COMMIT') ?? 'cloud',
      built_at: new Date().toISOString(),
      environment: 'cloud',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
  )
})
