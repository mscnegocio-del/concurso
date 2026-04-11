// Webhook Lemon Squeezy — esqueleto. En producción: validar X-Signature con LEMON_SQUEEZY_WEBHOOK_SECRET
// y actualizar public.organizaciones.plan según el payload (orden completada).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type, x-signature',
      },
    })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  // const raw = await req.text()
  // Verificar firma HMAC (documentación Lemon Squeezy) antes de confiar en el cuerpo.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
