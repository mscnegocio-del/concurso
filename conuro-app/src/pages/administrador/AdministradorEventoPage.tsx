import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { CoordinacionSalaPanel, type CoordinacionEvento } from '@/components/coordinacion/CoordinacionSalaPanel'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export function AdministradorEventoPage() {
  const { perfil } = useAuth()
  const { eventoId } = useParams<{ eventoId: string }>()
  const orgId = perfil?.organizacionId

  const [evento, setEvento] = useState<CoordinacionEvento | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!orgId || !eventoId) return
    setReady(false)
    setError(null)
    const { data, error: e } = await supabase
      .from('eventos')
      .select('id, nombre, estado, codigo_acceso, puestos_a_premiar, modo_revelacion_podio, tiene_tv_publica')
      .eq('id', eventoId)
      .eq('organizacion_id', orgId)
      .maybeSingle()
    if (e) {
      setError(e.message)
    } else {
      setEvento((data as CoordinacionEvento) ?? null)
    }
    setReady(true)
  }, [orgId, eventoId])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!perfil || !orgId) return null

  return (
    <div className="space-y-4">
      {error && (
        <SimplePanel>
          <p className="text-sm text-destructive">{error}</p>
        </SimplePanel>
      )}
      <CoordinacionSalaPanel
        perfil={perfil}
        orgId={orgId}
        evento={evento}
        eventoReady={ready}
        onReloadEvento={() => void reload()}
      />
    </div>
  )
}
