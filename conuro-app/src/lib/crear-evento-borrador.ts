import type { SupabaseClient } from '@supabase/supabase-js'
import { generarCodigoAccesoEvento } from '@/lib/codigo-evento'

export type EventoBorradorRow = {
  id: string
  organizacion_id: string
  nombre: string
  descripcion: string | null
  fecha: string
  estado: string
  codigo_acceso: string
  puestos_a_premiar: number
}

export async function crearEventoBorrador(
  client: SupabaseClient,
  params: {
    orgId: string
    nombre: string
    fecha: string
    puestos: 2 | 3
    modoRevelacionPodio?: 'simultaneo' | 'escalonado'
  },
): Promise<{ data: EventoBorradorRow | null; error: string | null }> {
  const nombre = params.nombre.trim()
  if (!nombre || !params.fecha) {
    return { data: null, error: 'Nombre y fecha son obligatorios.' }
  }
  let codigo = generarCodigoAccesoEvento()
  for (let intento = 0; intento < 8; intento++) {
    const { data: ins, error: err } = await client
      .from('eventos')
      .insert({
        organizacion_id: params.orgId,
        nombre,
        descripcion: null,
        fecha: params.fecha,
        estado: 'borrador',
        codigo_acceso: codigo,
        puestos_a_premiar: params.puestos,
        plantilla_criterios_id: null,
        modo_revelacion_podio: params.modoRevelacionPodio ?? 'simultaneo',
      })
      .select(
        'id, organizacion_id, nombre, descripcion, fecha, estado, codigo_acceso, puestos_a_premiar',
      )
      .single()
    if (!err && ins) {
      return { data: ins as EventoBorradorRow, error: null }
    }
    if (err?.code === '23505') {
      codigo = generarCodigoAccesoEvento()
      continue
    }
    return { data: null, error: err?.message ?? 'No se pudo crear el evento.' }
  }
  return { data: null, error: 'No se pudo generar un código de acceso único.' }
}
