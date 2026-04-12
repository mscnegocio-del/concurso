import { Copy, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { registrarAuditoria } from '@/lib/audit'
import { copyText } from '@/lib/clipboard'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export type CoordinacionEvento = {
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

type HistorialFila = {
  categoria_id: string
  publicado_at: string
  publicado_por: string | null
  nombre_publicador: string
}

type RankFila = {
  participante_id: string
  codigo: string
  nombre_completo: string
  puntaje_final: number
}

const POLL_MS = 6000

type Props = {
  perfil: { id: string; organizacionId: string; email: string }
  orgId: string
  evento: CoordinacionEvento | null
  eventoReady: boolean
  onReloadEvento: () => void
  /** Texto bajo el título (p. ej. uso desde admin de sala). */
  avisoAdmin?: string
}

export function CoordinacionSalaPanel({
  perfil,
  orgId,
  evento,
  eventoReady,
  onReloadEvento,
  avisoAdmin,
}: Props) {
  const [progreso, setProgreso] = useState<ProgresoFila[]>([])
  const [historial, setHistorial] = useState<HistorialFila[]>([])
  const [catPreview, setCatPreview] = useState<string>('')
  const [ranking, setRanking] = useState<RankFila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pubBusy, setPubBusy] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const urlPublica = evento ? `${appOrigin}/publico/${evento.codigo_acceso}` : ''

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

  const categoriaSeleccionada = useMemo(() => {
    if (catPreview && progreso.some((p) => p.categoria_id === catPreview)) return catPreview
    return progreso[0]?.categoria_id ?? ''
  }, [catPreview, progreso])

  const filaSeleccionada = useMemo(
    () => progreso.find((p) => p.categoria_id === categoriaSeleccionada),
    [progreso, categoriaSeleccionada],
  )

  const calificacionesIncompletas = useMemo(() => {
    if (!filaSeleccionada) return false
    const esp = Number(filaSeleccionada.calificaciones_esperadas)
    const reg = Number(filaSeleccionada.calificaciones_registradas)
    return esp > 0 && reg < esp
  }, [filaSeleccionada])

  useEffect(() => {
    if (!evento?.id) return
    queueMicrotask(() => {
      void cargarProgreso()
      void cargarHistorial()
    })
  }, [evento?.id, cargarProgreso, cargarHistorial])

  useEffect(() => {
    const eid = evento?.id
    const cid = categoriaSeleccionada
    if (!eid || !cid) {
      setRanking([])
      return
    }
    let cancelled = false
    ;(async () => {
      setError(null)
      const { data, error: e } = await supabase.rpc('coordinador_ranking_categoria', {
        p_evento_id: eid,
        p_categoria_id: cid,
      })
      if (cancelled) return
      if (e) {
        setError(e.message)
        return
      }
      setRanking((data ?? []) as RankFila[])
    })()
    return () => {
      cancelled = true
    }
  }, [evento?.id, categoriaSeleccionada, progreso])

  useEffect(() => {
    if (!evento?.id) return
    const id = evento.id
    const ch = supabase
      .channel(`coordinacion-${id}`)
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
          void onReloadEvento()
          void cargarProgreso()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [evento?.id, cargarProgreso, cargarHistorial, onReloadEvento])

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

  const publicadosSet = useMemo(
    () => new Set(historial.map((h) => h.categoria_id)),
    [historial],
  )

  async function publicarCategoria() {
    if (!evento || !categoriaSeleccionada) return
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
          categoria_id: categoriaSeleccionada,
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
        organizacionId: orgId,
        eventoId: evento.id,
        usuarioId: perfil.id,
        accion: 'resultados_publicados',
        detalle: { categoria_id: categoriaSeleccionada },
      })
      await cargarHistorial()
      await cargarProgreso()
    } finally {
      setPubBusy(false)
    }
  }

  async function copiarUrl() {
    if (!urlPublica) return
    const ok = await copyText(urlPublica)
    if (ok) toast.success('URL copiada')
    else toast.error('No se pudo copiar al portapapeles')
  }

  async function copiarCodigoAcceso() {
    if (!evento) return
    const ok = await copyText(evento.codigo_acceso)
    if (ok) toast.success('Código copiado')
    else toast.error('No se pudo copiar al portapapeles')
  }

  if (!eventoReady) {
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
        <h2 className="text-lg font-semibold text-foreground">Sin evento</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No hay evento en foco ni reciente. El administrador debe crear o seleccionar un evento desde el panel de
          administración.
        </p>
      </SimplePanel>
    )
  }

  const publicarDeshabilitado = evento.estado === 'borrador'

  return (
    <div className={cn('space-y-6', 'pb-24 lg:pb-6')}>
      {avisoAdmin ? (
        <Alert>
          <AlertTitle>Coordinación de sala</AlertTitle>
          <AlertDescription>{avisoAdmin}</AlertDescription>
        </Alert>
      ) : null}

      {historial.length > 0 && (
        <Alert>
          <AlertTitle>Estado en pantalla pública</AlertTitle>
          <AlertDescription>
            {historial.length} categoría{historial.length === 1 ? '' : 's'} ya publicada
            {historial.length === 1 ? '' : 's'} en el proyector. El historial completo está al final de la página.
          </AlertDescription>
        </Alert>
      )}

      {evento.estado === 'borrador' && (
        <Alert variant="destructive">
          <AlertTitle>Evento en borrador</AlertTitle>
          <AlertDescription>
            Aún no puedes publicar resultados. El administrador debe activar el evento (pasar a abierto) cuando
            esté lista la configuración.
          </AlertDescription>
        </Alert>
      )}

      {(evento.estado === 'cerrado' || evento.estado === 'publicado') && (
        <Alert>
          <AlertTitle>Evento {evento.estado}</AlertTitle>
          <AlertDescription>
            La calificación terminó. Puedes seguir viendo URL y ranking; la publicación en TV puede estar limitada
            según la política del concurso.
          </AlertDescription>
        </Alert>
      )}

      <SimplePanel>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1 · Sala</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{evento.nombre}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estado: <span className="font-medium text-foreground">{evento.estado}</span> · Código público:{' '}
              <span className="inline-flex items-center gap-0.5 align-middle">
                <span className="font-mono">{evento.codigo_acceso}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Copiar código de acceso"
                  title="Copiar código"
                  onClick={() => void copiarCodigoAcceso()}
                >
                  <Copy className="size-4" aria-hidden />
                </Button>
              </span>
            </p>
          </div>
          {lastSyncedAt && (
            <Badge variant="secondary" className="shrink-0 font-normal">
              Avance actualizado{' '}
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
        <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" onClick={() => void copiarUrl()}>
          <Copy className="size-4 shrink-0" aria-hidden />
          Copiar URL
        </Button>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </SimplePanel>

      <SimplePanel>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2 · Avance</p>
        <h3 className="mt-2 text-base font-semibold text-foreground">Progreso por categoría</h3>
        <ul className="mt-4 divide-y divide-border">
          {progreso.map((r) => {
            const esp = Number(r.calificaciones_esperadas)
            const reg = Number(r.calificaciones_registradas)
            const pct = esp > 0 ? Math.min(100, Math.round((reg / esp) * 100)) : 0
            return (
              <li key={r.categoria_id} className="py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="font-medium text-foreground">{r.categoria_nombre}</span>
                  <span className="text-muted-foreground">
                    {reg}/{esp} ({pct}%)
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        {progreso.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No hay categorías.</p>}
      </SimplePanel>

      <SimplePanel>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3 · Revisar y publicar</p>
        <h3 className="mt-2 text-base font-semibold text-foreground">Ranking previo (coordinación)</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Vista previa antes de publicar; el público solo ve el podio tras publicar la categoría. Los códigos de
          participante no se muestran aquí para alinear con la pantalla pública.
        </p>
        <div className="mt-4">
          <label className="text-sm text-muted-foreground" htmlFor="coord-cat">
            Categoría
          </label>
          <select
            id="coord-cat"
            value={categoriaSeleccionada}
            onChange={(e) => setCatPreview(e.target.value)}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1 flex h-10 w-full max-w-md rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {progreso.map((r) => (
              <option key={r.categoria_id} value={r.categoria_id}>
                {r.categoria_nombre}
              </option>
            ))}
          </select>
        </div>
        {calificacionesIncompletas && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Calificaciones incompletas</AlertTitle>
            <AlertDescription>
              Esta categoría aún no tiene todas las calificaciones esperadas. Puedes publicar igualmente si el
              comité lo autoriza; de lo contrario espera a que terminen los jurados.
            </AlertDescription>
          </Alert>
        )}
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
          {ranking.map((x) => (
            <li key={x.participante_id}>
              <span className="text-foreground">{x.nombre_completo}</span> —{' '}
              <strong>{x.puntaje_final}</strong>
            </li>
          ))}
        </ol>
        {ranking.length === 0 && categoriaSeleccionada && (
          <p className="mt-2 text-sm text-muted-foreground">Sin datos de ranking aún.</p>
        )}

        <div className="mt-6 hidden lg:block">
          <PublicarBlock
            disabled={pubBusy || !categoriaSeleccionada || publicarDeshabilitado}
            busy={pubBusy}
            yaPublicada={publicadosSet.has(categoriaSeleccionada)}
            onClick={() => void publicarCategoria()}
          />
        </div>
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-base font-semibold text-foreground">Historial de publicaciones</h3>
        <ul className="mt-3 space-y-3 text-sm">
          {historial.map((h) => {
            const nombre =
              progreso.find((p) => p.categoria_id === h.categoria_id)?.categoria_nombre ?? h.categoria_id
            return (
              <li
                key={`${h.categoria_id}-${h.publicado_at}`}
                className="flex flex-col gap-1 border-b border-border/60 pb-3 last:border-0"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-foreground">{nombre}</span>
                  <span className="text-muted-foreground">
                    {new Date(h.publicado_at).toLocaleString('es-PE')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Por: {h.nombre_publicador ?? 'Sin registro'}
                </p>
              </li>
            )
          })}
        </ul>
        {historial.length === 0 && <p className="text-sm text-muted-foreground">Ninguna categoría publicada aún.</p>}
      </SimplePanel>

      <div
        className={cn(
          'fixed right-0 bottom-0 left-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur-sm lg:hidden',
        )}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <PublicarBlock
          disabled={pubBusy || !categoriaSeleccionada || publicarDeshabilitado}
          busy={pubBusy}
          yaPublicada={publicadosSet.has(categoriaSeleccionada)}
          onClick={() => void publicarCategoria()}
          className="w-full"
        />
      </div>
    </div>
  )
}

function PublicarBlock({
  disabled,
  busy,
  yaPublicada,
  onClick,
  className,
}: {
  disabled: boolean
  busy: boolean
  yaPublicada: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {yaPublicada && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Esta categoría ya fue publicada; puedes volver a guardar para actualizar la hora en pantalla.
        </p>
      )}
      <Button type="button" size="lg" className="w-full sm:w-auto" disabled={disabled} onClick={onClick}>
        {busy ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            Publicando…
          </>
        ) : (
          'Publicar categoría en pantalla pública'
        )}
      </Button>
    </div>
  )
}
