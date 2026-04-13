import { supabase } from '@/lib/supabase'

export async function registrarAuditoria(params: {
  organizacionId: string
  eventoId: string | null
  usuarioId: string
  accion: string
  detalle: Record<string, unknown>
}) {
  const { error } = await supabase.from('audit_log').insert({
    organizacion_id: params.organizacionId,
    evento_id: params.eventoId,
    usuario_id: params.usuarioId,
    jurado_id: null,
    accion: params.accion,
    detalle: params.detalle as never,
  })
  if (error) console.warn('[audit]', error.message)
}
