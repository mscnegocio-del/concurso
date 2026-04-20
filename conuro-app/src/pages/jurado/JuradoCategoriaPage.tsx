import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useJurado } from '@/hooks/useJurado'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Part = { id: string; codigo: string; nombre_completo: string; completo: boolean }

export function JuradoCategoriaPage() {
  const { categoriaId } = useParams<{ categoriaId: string }>()
  const { session } = useJurado()
  const [parts, setParts] = useState<Part[]>([])
  const [eventoId, setEventoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargarParticipantes = useCallback(async () => {
    if (!session?.tokenSesion || !categoriaId) return
    const { data, error: e } = await supabase.rpc('jurado_listar_participantes', {
      p_token: session.tokenSesion,
      p_categoria_id: categoriaId,
    })
    if (e) setError(e.message)
    else setParts((data ?? []) as Part[])
  }, [session?.tokenSesion, categoriaId])

  useEffect(() => {
    if (!session?.tokenSesion || !categoriaId) return
    void (async () => {
      await cargarParticipantes()
      const { data } = await supabase.rpc('jurado_resolver_sesion', { p_token: session.tokenSesion })
      const row = data?.[0] as { evento_id: string } | undefined
      if (row?.evento_id) setEventoId(row.evento_id)
    })()
  }, [session?.tokenSesion, categoriaId, cargarParticipantes])

  // Realtime + polling para refrescar al cambiar estado del evento
  useEffect(() => {
    if (!eventoId) return

    const t = window.setInterval(() => void cargarParticipantes(), 10_000)

    const ch = supabase
      .channel(`jurado-categoria-evento-${eventoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'eventos', filter: `id=eq.${eventoId}` },
        () => void cargarParticipantes(),
      )
      .subscribe()

    return () => {
      window.clearInterval(t)
      void supabase.removeChannel(ch)
    }
  }, [eventoId, cargarParticipantes])

  const firstIncomplete = useMemo(
    () => parts.findIndex((p) => !p.completo),
    [parts],
  )

  function canOpenIndex(i: number) {
    for (let j = 0; j < i; j++) {
      if (!parts[j]?.completo) return false
    }
    return true
  }

  if (!session || !categoriaId) return null

  return (
    <Card>
      <CardHeader>
        <Button variant="link" className="h-auto w-fit p-0" asChild>
          <Link to="/jurado/panel">← Volver a categorías</Link>
        </Button>
        <CardTitle className="mt-2">Participantes</CardTitle>
        <CardDescription>Califica en orden; no puedes saltar a uno pendiente.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <ol className="space-y-2">
          {parts.map((p, i) => {
            const open = canOpenIndex(i)
            const isCurrent = i === firstIncomplete && firstIncomplete >= 0
            return (
              <li key={p.id}>
                {open ? (
                  <Link
                    to={`/jurado/panel/categoria/${categoriaId}/participante/${p.id}`}
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors',
                      isCurrent
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:bg-accent/50',
                    )}
                  >
                    <span>
                      <span className="font-mono text-muted-foreground">{p.codigo}</span>{' '}
                      {p.nombre_completo}
                    </span>
                    {p.completo ? (
                      <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                    ) : isCurrent ? (
                      <span className="text-primary">Siguiente</span>
                    ) : null}
                  </Link>
                ) : (
                  <div className="flex cursor-not-allowed items-center justify-between rounded-lg border border-muted bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                    <span>
                      <span className="font-mono">{p.codigo}</span> {p.nombre_completo}
                    </span>
                    <span>Bloqueado</span>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
