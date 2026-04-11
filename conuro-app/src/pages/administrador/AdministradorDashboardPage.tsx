import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { registrarAuditoria } from '@/lib/audit'
import { supabase } from '@/lib/supabase'

type Evento = {
  id: string
  nombre: string
  estado: string
  codigo_acceso: string
  puestos_a_premiar: number
}

type ProgresoFila = {
  categoria_id: string
  categoria_nombre: string
  orden: number
  total_participantes: number
  num_jurados: number
  num_criterios: number
  calificaciones_registradas: number
  calificaciones_esperadas: number
}

type HistorialFila = { categoria_id: string; publicado_at: string }

type RankFila = {
  participante_id: string
  codigo: string
  nombre_completo: string
  puntaje_final: number
}

const POLL_MS = 6000

export function AdministradorDashboardPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const [evento, setEvento] = useState<Evento | null>(null)
  const [progreso, setProgreso] = useState<ProgresoFila[]>([])
  const [historial, setHistorial] = useState<HistorialFila[]>([])
  const [catPreview, setCatPreview] = useState<string>('')
  const [ranking, setRanking] = useState<RankFila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pubBusy, setPubBusy] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  /** Evita mostrar «Sin evento» antes de terminar la primera carga para esta org. */
  const [eventoInicializado, setEventoInicializado] = useState(false)

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const urlPublica = evento ? `${appOrigin}/publico/${evento.codigo_acceso}` : ''

  const cargarEvento = useCallback(async () => {
    if (!orgId) return
    const { data, error: e } = await supabase
      .from('eventos')
      .select('id, nombre, estado, codigo_acceso, puestos_a_premiar')
      .eq('organizacion_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (e) setError(e.message)
    setEvento((data as Evento) ?? null)
    setEventoInicializado(true)
  }, [orgId])

  const cargarProgreso = useCallback(async () => {
    if (!evento?.id) return
    setError(null)
    const { data, error: e } = await supabase.rpc('coordinador_progreso_evento', {
      p_evento_id: evento.id,
    })
    if (e) {
      setError(e.message)
      return
    }
    setProgreso((data ?? []) as ProgresoFila[])
    setLastSyncedAt(new Date())
  }, [evento?.id])

  const cargarHistorial = useCallback(async () => {
    if (!evento?.id) return
    const { data, error: e } = await supabase.rpc('coordinador_resultados_publicados_lista', {
      p_evento_id: evento.id,
    })
    if (e) setError(e.message)
    else setHistorial((data ?? []) as HistorialFila[])
  }, [evento?.id])

  const cargarRanking = useCallback(async () => {
    if (!evento?.id || !catPreview) {
      setRanking([])
      return
    }
    setError(null)
    const { data, error: e } = await supabase.rpc('coordinador_ranking_categoria', {
      p_evento_id: evento.id,
      p_categoria_id: catPreview,
    })
    if (e) {
      setError(e.message)
      return
    }
    setRanking((data ?? []) as RankFila[])
  }, [evento?.id, catPreview])

  useEffect(() => {
    setEventoInicializado(false)
  }, [orgId])

  useEffect(() => {
    queueMicrotask(() => {
      void cargarEvento()
    })
  }, [cargarEvento])

  useEffect(() => {
    if (!evento?.id) return
    queueMicrotask(() => {
      void cargarProgreso()
      void cargarHistorial()
    })
  }, [evento?.id, cargarProgreso, cargarHistorial])

  useEffect(() => {
    queueMicrotask(() => {
      void cargarRanking()
    })
  }, [cargarRanking])

  useEffect(() => {
    if (!evento?.id) return
    const id = evento.id
    const ch = supabase
      .channel(`coordinador-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'resultados_publicados', filter: `evento_id=eq.${id}` },
        () => {
          void cargarProgreso()
          void cargarHistorial()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'eventos', filter: `id=eq.${id}` },
        () => {
          void cargarEvento()
          void cargarProgreso()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [evento?.id, cargarEvento, cargarProgreso, cargarHistorial])

  useEffect(() => {
    if (!evento?.id) return
    const t = window.setInterval(() => void cargarProgreso(), POLL_MS)
    return () => window.clearInterval(t)
  }, [evento?.id, cargarProgreso])

  useEffect(() => {
    setProgreso([])
    setHistorial([])
    setCatPreview('')
  }, [evento?.id])

  useEffect(() => {
    if (progreso.length > 0 && !catPreview) {
      setCatPreview(progreso[0].categoria_id)
    }
  }, [progreso, catPreview])

  const publicadosSet = useMemo(
    () => new Set(historial.map((h) => h.categoria_id)),
    [historial],
  )

  async function publicarCategoria() {
    if (!perfil || !evento || !catPreview) return
    if (evento.estado === 'borrador') {
      setError('El evento debe estar activo (no en borrador) para publicar.')
      return
    }
    setPubBusy(true)
    setError(null)
    try {
      const { error: e } = await supabase.from('resultados_publicados').upsert(
        {
          evento_id: evento.id,
          categoria_id: catPreview,
          publicado_por: perfil.id,
          publicado_at: new Date().toISOString(),
        },
        { onConflict: 'evento_id,categoria_id' },
      )
      if (e) {
        setError(e.message)
        return
      }
      await registrarAuditoria({
        organizacionId: perfil.organizacionId,
        eventoId: evento.id,
        usuarioId: perfil.id,
        accion: 'resultados_publicados',
        detalle: { categoria_id: catPreview },
      })
      await cargarHistorial()
      await cargarProgreso()
    } finally {
      setPubBusy(false)
    }
  }

  if (!perfil) return null

  if (!orgId) {
    return (
      <SimplePanel>
        <p className="text-slate-600">Sin organización asignada.</p>
      </SimplePanel>
    )
  }

  if (!eventoInicializado) {
    return (
      <SimplePanel>
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">Cargando evento</span>
          <Skeleton className="h-7 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-24 w-full" />
        </div>
      </SimplePanel>
    )
  }

  if (!evento) {
    return (
      <SimplePanel>
        <h2 className="text-lg font-semibold text-slate-900">Sin evento</h2>
        <p className="mt-2 text-sm text-slate-600">
          El administrador debe crear un evento antes de usar esta pantalla.
        </p>
      </SimplePanel>
    )
  }

  return (
    <div className="space-y-6">
      <SimplePanel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{evento.nombre}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estado: <span className="font-medium text-foreground">{evento.estado}</span> · Código público:{' '}
              <span className="font-mono">{evento.codigo_acceso}</span>
            </p>
          </div>
          {lastSyncedAt && (
            <Badge variant="secondary" className="shrink-0 font-normal">
              Progreso actualizado{' '}
              {lastSyncedAt.toLocaleTimeString('es-PE', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </Badge>
          )}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          URL para proyector:{' '}
          <a
            href={urlPublica}
            className="break-all font-mono text-primary underline"
            target="_blank"
            rel="noreferrer"
          >
            {urlPublica}
          </a>
        </p>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-base font-semibold text-slate-900">Progreso por categoría</h3>
        <ul className="mt-4 divide-y divide-slate-100">
          {progreso.map((r) => {
            const esp = Number(r.calificaciones_esperadas)
            const reg = Number(r.calificaciones_registradas)
            const pct = esp > 0 ? Math.min(100, Math.round((reg / esp) * 100)) : 0
            return (
              <li key={r.categoria_id} className="py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-slate-800">{r.categoria_nombre}</span>
                  <span className="text-slate-500">
                    {reg}/{esp} ({pct}%)
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        {progreso.length === 0 && <p className="mt-2 text-sm text-slate-500">No hay categorías.</p>}
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-base font-semibold text-slate-900">Ranking previo (solo coordinación)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Vista previa antes de publicar; el público solo ve podio tras publicar la categoría.
        </p>
        <div className="mt-4">
          <label className="text-sm text-slate-600">Categoría</label>
          <select
            value={catPreview}
            onChange={(e) => setCatPreview(e.target.value)}
            className="mt-1 w-full max-w-md rounded border border-slate-200 px-3 py-2 text-sm"
          >
            {progreso.map((r) => (
              <option key={r.categoria_id} value={r.categoria_id}>
                {r.categoria_nombre}
              </option>
            ))}
          </select>
        </div>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
          {ranking.map((x) => (
            <li key={x.participante_id}>
              <span className="font-mono text-slate-500">{x.codigo}</span> {x.nombre_completo} —{' '}
              <strong>{x.puntaje_final}</strong>
            </li>
          ))}
        </ol>
        {ranking.length === 0 && catPreview && (
          <p className="mt-2 text-sm text-slate-500">Sin datos de ranking aún.</p>
        )}
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-base font-semibold text-slate-900">Publicar resultados</h3>
        <p className="mt-1 text-sm text-slate-600">
          Publica la categoría seleccionada arriba para mostrar el podio en la pantalla pública.
        </p>
        {catPreview && publicadosSet.has(catPreview) && (
          <p className="mt-2 text-sm text-amber-800">Esta categoría ya fue publicada; puedes volver a guardar para actualizar la hora.</p>
        )}
        <Button
          type="button"
          className="mt-4"
          disabled={pubBusy || !catPreview || evento.estado === 'borrador'}
          onClick={() => void publicarCategoria()}
        >
          {pubBusy ? (
            <>
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              Publicando…
            </>
          ) : (
            'Publicar categoría en pantalla pública'
          )}
        </Button>
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-base font-semibold text-slate-900">Historial de publicaciones</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {historial.map((h) => {
            const nombre = progreso.find((p) => p.categoria_id === h.categoria_id)?.categoria_nombre ?? h.categoria_id
            return (
              <li key={`${h.categoria_id}-${h.publicado_at}`} className="flex justify-between gap-4 border-b border-slate-50 pb-2">
                <span>{nombre}</span>
                <span className="text-slate-500">
                  {new Date(h.publicado_at).toLocaleString('es-PE')}
                </span>
              </li>
            )
          })}
        </ul>
        {historial.length === 0 && <p className="text-sm text-slate-500">Ninguna categoría publicada aún.</p>}
      </SimplePanel>
    </div>
  )
}
