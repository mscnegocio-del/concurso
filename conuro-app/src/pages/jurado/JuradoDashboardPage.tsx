import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useJurado } from '@/hooks/useJurado'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Fila = {
  id: string
  nombre: string
  orden: number
  total_participantes: number
  participantes_completos: number
}

export function JuradoDashboardPage() {
  const { session } = useJurado()
  const [rows, setRows] = useState<Fila[]>([])
  const [eventoId, setEventoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargarCategorias = useCallback(async () => {
    if (!session?.tokenSesion) return
    const { data, error: e } = await supabase.rpc('jurado_listar_categorias', {
      p_token: session.tokenSesion,
    })
    if (e) setError(e.message)
    else setRows((data ?? []) as Fila[])
  }, [session?.tokenSesion])

  useEffect(() => {
    if (!session?.tokenSesion) return
    void (async () => {
      // Cargar categorías
      await cargarCategorias()
      // Obtener evento_id para Realtime
      const { data } = await supabase.rpc('jurado_resolver_sesion', { p_token: session.tokenSesion })
      const row = data?.[0] as { evento_id: string } | undefined
      if (row?.evento_id) setEventoId(row.evento_id)
    })()
  }, [session?.tokenSesion, cargarCategorias])

  // Realtime + polling para refrescar al cambiar estado del evento
  useEffect(() => {
    if (!eventoId) return

    const t = window.setInterval(() => void cargarCategorias(), 10_000)

    const ch = supabase
      .channel(`jurado-dashboard-evento-${eventoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'eventos', filter: `id=eq.${eventoId}` },
        () => void cargarCategorias(),
      )
      .subscribe()

    return () => {
      window.clearInterval(t)
      void supabase.removeChannel(ch)
    }
  }, [eventoId, session?.tokenSesion, cargarCategorias])

  if (!session) return null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Categorías</CardTitle>
          <CardDescription>
            Elige una categoría para ver participantes y calificar en orden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/jurado/panel/categoria/${r.id}`}
                  className={cn(
                    'flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent/50',
                  )}
                >
                  <span className="font-medium text-foreground">{r.nombre}</span>
                  <span className="text-muted-foreground">
                    {r.participantes_completos}/{r.total_participantes} listos
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length === 0 && !error && (
            <p className="mt-4 text-sm text-muted-foreground">No hay categorías en este evento.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
