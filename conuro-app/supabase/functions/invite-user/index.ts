import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get JWT from Authorization header
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Sin autorización' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const body = await req.json()
    const { email, nombre_completo, rol, organizacion_id } = body

    if (!email || !nombre_completo || !rol || !organizacion_id) {
      return new Response(JSON.stringify({ error: 'Parámetros incompletos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create admin Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )

    // Verify user making the request
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check permissions
    const { data: callerData, error: callerError } = await supabaseAdmin
      .from('usuarios')
      .select('rol, organizacion_id')
      .eq('id', user.id)
      .single()

    if (callerError || !callerData) {
      return new Response(JSON.stringify({ error: 'Usuario no encontrado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callerRole = callerData.rol
    const callerOrgId = callerData.organizacion_id

    // Permission check:
    // - super_admin can invite admin or coordinador to any org
    // - admin can invite coordinador to their own org
    if (callerRole === 'admin' && (rol === 'admin' || organizacion_id !== callerOrgId)) {
      return new Response(JSON.stringify({ error: 'Sin permisos para esta acción' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (callerRole !== 'super_admin' && callerRole !== 'admin') {
      return new Response(JSON.stringify({ error: 'Rol insuficiente' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(email)
    if (existingUser) {
      return new Response(JSON.stringify({ error: 'Usuario ya existe' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Invite user via email
    const { data: invitedUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          nombre_completo,
          rol,
          organizacion_id,
        },
      },
    )

    if (inviteError || !invitedUser) {
      return new Response(JSON.stringify({ error: inviteError?.message || 'Error al invitar' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Insert into public.usuarios
    const { error: insertError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id: invitedUser.user?.id,
        email,
        nombre_completo,
        rol,
        organizacion_id,
      })

    if (insertError) {
      // Cleanup: delete the user from auth if insert failed
      await supabaseAdmin.auth.admin.deleteUser(invitedUser.user?.id || '')
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        usuario_id: invitedUser.user?.id,
        email,
        mensaje: `Invitación enviada a ${email}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
