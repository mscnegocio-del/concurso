import { useCallback, useEffect, useState } from 'react'
import { getStoredEventoFoco, setStoredEventoFoco } from '@/lib/admin-evento-foco'
import { supabase } from '@/lib/supabase'

export type EventoFocoRow = {
  id: string
  nombre: string
  estado: string
  codigo_acceso: string
  puestos_a_premiar: number
}

/**
 * Resuelve el evento de trabajo para sala/coordinador: localStorage foco, o el más reciente por created_at.
 */
export function useEventoFocoOrg(orgId: string | undefined) {
  const [evento, setEvento] = useState<EventoFocoRow | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!orgId) {
      setEvento(null)
      setReady(true)
      return
    }
    setError(null)
    setReady(false)
    const targetId = getStoredEventoFoco(orgId)
    if (targetId) {
      const { data: row } = await supabase
        .from('eventos')
        .select('id, nombre, estado, codigo_acceso, puestos_a_premiar')
        .eq('id', targetId)
        .eq('organizacion_id', orgId)
        .maybeSingle()
      if (row) {
        setEvento(row as EventoFocoRow)
        setReady(true)
        return
      }
    }
    const { data: latest, error: e } = await supabase
      .from('eventos')
      .select('id, nombre, estado, codigo_acceso, puestos_a_premiar')
      .eq('organizacion_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (e) {
      setError(e.message)
      setEvento(null)
      setReady(true)
      return
    }
    if (latest) {
      setStoredEventoFoco(orgId, latest.id)
      setEvento(latest as EventoFocoRow)
    } else {
      setEvento(null)
    }
    setReady(true)
  }, [orgId])

  useEffect(() => {
    queueMicrotask(() => {
      void reload()
    })
  }, [reload])

  return { evento, ready, error, reload }
}
