import { CheckCircle2, ChevronDown, ChevronRight, Copy, Loader2, Radio } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DesempateInlinePanel } from '@/components/coordinacion/DesempateInlinePanel'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { registrarAuditoria } from '@/lib/audit'
import { copyText } from '@/lib/clipboard'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { AdminExportaciones } from '@/pages/admin/AdminExportaciones'

export type CoordinacionEvento = {
  id: string
  organizacion_id?: string
  nombre: string
  descripcion?: string | null
  fecha?: string
  estado: string
  codigo_acceso: string
  puestos_a_premiar: number
  modo_revelacion_podio?: 'simultaneo' | 'escalonado' | string
  tiene_tv_publica?: boolean
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
  publicado?: boolean
  paso_revelacion?: number
}

type ProgresoJurado = {
  jurado_id: string
  jurado_nombre: string
  jurado_orden: number
  categoria_id: string
  categoria_nombre: string
  calificaciones_registradas: number
  calificaciones_esperadas: number
}

type HistorialFila = {
  categoria_id: string
  publicado_at: string
  publicado_por: string | null
  nombre_publicador: string
  paso_revelacion?: number
}

type RankFila = {
  participante_id: string
  codigo: string
  nombre_completo: string
  puntaje_final: number
  promedio_por_criterio?: Record<string, number>
}

const POLL_MS = 6000

type MobileTab = 'avance' | 'publicar' | 'historial'

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
  const [mobileTab, setMobileTab] = useState<MobileTab>('publicar')
  const [criterios, setCriterios] = useState<Array<{ id: string; nombre: string; es_criterio_desempate: boolean }>>([])
  const [desempateActivo, setDesempateActivo] = useState<{ categoriaId: string; lugar: number } | null>(null)
  const [desempateBusy, setDesempateBusy] = useState(false)
  const [progresoJurados, setProgresoJurados] = useState<ProgresoJurado[]>([])
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [iniciandoCal, setIniciandoCal] = useState(false)
  const [orgPlan, setOrgPlan] = useState<string>('gratuito')

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

  const cargarProgresoJurados = useCallback(async () => {
    if (!evento?.id) return
    const { data, error: e } = await supabase.rpc('coordinador_progreso_jurados', {
      p_evento_id: evento.id,
    })
    if (!e) setProgresoJurados((data ?? []) as ProgresoJurado[])
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

  const modoRevelacion = (evento?.modo_revelacion_podio ?? 'simultaneo') === 'escalonado' ? 'escalonado' : 'simultaneo'
  const maxPaso = evento?.puestos_a_premiar === 2 ? 2 : 3
  const filaActivaEscalonada = useMemo(() => {
    if (modoRevelacion !== 'escalonado') return null
    return (
      progreso.find((p) => {
        const paso = Number(p.paso_revelacion ?? 0)
        const publicado = Boolean(p.publicado)
        return publicado && paso > 0 && paso < maxPaso
      }) ?? null
    )
  }, [modoRevelacion, progreso, maxPaso])

  const pasoSeleccionado = Number(filaSeleccionada?.paso_revelacion ?? 0)

  const empatesDetectados = useMemo(() => {
    const grupos: Array<{ lugar: number; filas: RankFila[] }> = []
    const puntajesProcesados = new Set<number>()

    ranking.forEach((r, i) => {
      const puntaje = Number(r.puntaje_final)
      if (puntajesProcesados.has(puntaje)) return

      const empatados = ranking.filter((x) => x.puntaje_final === r.puntaje_final)
      if (empatados.length > 1) {
        grupos.push({ lugar: i + 1, filas: empatados })
        puntajesProcesados.add(puntaje)
      }
    })
    return grupos
  }, [ranking])

  useEffect(() => {
    if (!evento?.id) return
    queueMicrotask(() => {
      void cargarProgreso()
      void cargarHistorial()
      void cargarProgresoJurados()
    })
  }, [evento?.id, cargarProgreso, cargarHistorial, cargarProgresoJurados])

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
    const t = window.setInterval(() => {
      void cargarProgreso()
      void cargarProgresoJurados()
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [evento?.id, cargarProgreso, cargarProgresoJurados])

  useEffect(() => {
    setProgreso([])
    setHistorial([])
    setCatPreview('')
    setDesempateActivo(null)
    setProgresoJurados([])
    setExpandedCats(new Set())
  }, [evento?.id])

  useEffect(() => {
    if (!evento?.id) return
    const loadCriterios = async () => {
      const { data } = await supabase
        .from('criterios')
        .select('id, nombre, es_criterio_desempate')
        .eq('evento_id', evento.id)
      setCriterios((data ?? []) as Array<{ id: string; nombre: string; es_criterio_desempate: boolean }>)
    }
    void loadCriterios()
  }, [evento?.id])

  useEffect(() => {
    if (!orgId) return
    void supabase
      .from('organizaciones')
      .select('plan')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        setOrgPlan((data as { plan?: string } | null)?.plan ?? 'gratuito')
      })
  }, [orgId])

  useEffect(() => {
    if (!filaActivaEscalonada) return
    if (categoriaSeleccionada !== filaActivaEscalonada.categoria_id) {
      setCatPreview(filaActivaEscalonada.categoria_id)
    }
  }, [filaActivaEscalonada, categoriaSeleccionada])

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
    if (
      modoRevelacion === 'escalonado' &&
      filaActivaEscalonada &&
      filaActivaEscalonada.categoria_id !== categoriaSeleccionada
    ) {
      setError('Debes terminar la revelación de la categoría en progreso antes de cambiar.')
      return
    }
    setPubBusy(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.rpc('coordinador_avanzar_revelacion_categoria', {
        p_evento_id: evento.id,
        p_categoria_id: categoriaSeleccionada,
      })
      if (e) {
        setError(e.message)
        return
      }
      const row = Array.isArray(data) ? data[0] : null
      const paso = Number(row?.paso_revelacion ?? 0)
      const completado = Boolean(row?.completado)
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: evento.id,
        usuarioId: perfil.id,
        accion: 'resultados_publicados',
        detalle: {
          categoria_id: categoriaSeleccionada,
          modo_revelacion_podio: modoRevelacion,
          paso_revelacion: paso,
          completado,
        },
      })
      if (modoRevelacion === 'escalonado') {
        toast.success(completado ? 'Categoría completada en pantalla pública.' : `Avance de revelación: paso ${paso}.`)
      } else {
        toast.success('Categoría publicada en pantalla pública.')
      }
      await cargarHistorial()
      await cargarProgreso()
    } finally {
      setPubBusy(false)
    }
  }

  async function toggleDesempate(lugar: number, filas: RankFila[]) {
    if (!evento || !categoriaSeleccionada) return
    const yaActivo = desempateActivo?.lugar === lugar && desempateActivo.categoriaId === categoriaSeleccionada
    const criterioDesempate = criterios.find((c) => c.es_criterio_desempate)
    const criterioId = criterioDesempate?.id

    // Obtener puntaje en el criterio de desempate para ambos participantes
    const puntajeCriterio1 = criterioId && filas[0].promedio_por_criterio
      ? Number(filas[0].promedio_por_criterio[criterioId])
      : filas[0].puntaje_final
    const puntajeCriterio2 = criterioId && filas[1].promedio_por_criterio
      ? Number(filas[1].promedio_por_criterio[criterioId])
      : filas[1].puntaje_final

    const payload = yaActivo
      ? null
      : {
          puesto: lugar,
          criterioDesempate: criterioDesempate?.nombre ?? 'Criterio de desempate',
          participante1: {
            nombre: filas[0].nombre_completo,
            puntajeTotal: filas[0].puntaje_final,
            puntajeCriterio: puntajeCriterio1,
          },
          participante2: {
            nombre: filas[1].nombre_completo,
            puntajeTotal: filas[1].puntaje_final,
            puntajeCriterio: puntajeCriterio2,
          },
        }
    setDesempateBusy(true)
    try {
      await supabase.rpc('coordinador_toggle_desempate', {
        p_evento_id: evento.id,
        p_categoria_id: categoriaSeleccionada,
        p_payload: payload,
      })
      setDesempateActivo(yaActivo ? null : { categoriaId: categoriaSeleccionada, lugar })
      toast.success(yaActivo ? 'Desempate ocultado en TV.' : 'Desempate mostrado en TV.')
    } catch (err) {
      console.error('Error toggling desempate:', err)
      toast.error('Error al cambiar el estado del desempate')
    } finally {
      setDesempateBusy(false)
    }
  }

  async function iniciarCalificacion() {
    if (!evento) return
    setIniciandoCal(true)
    try {
      const { error: e } = await supabase
        .from('eventos')
        .update({ estado: 'calificando' })
        .eq('id', evento.id)
      if (e) { setError(e.message); return }
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: evento.id,
        usuarioId: perfil.id,
        accion: 'evento_estado',
        detalle: { anterior: 'abierto', nuevo: 'calificando' },
      })
      toast.success('Calificación iniciada.')
      onReloadEvento()
    } finally {
      setIniciandoCal(false)
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
  const selectorBloqueado =
    modoRevelacion === 'escalonado' &&
    !!filaActivaEscalonada &&
    filaActivaEscalonada.categoria_id !== categoriaSeleccionada

  const yaPublicadaSeleccion = publicadosSet.has(categoriaSeleccionada)
  const revelacionCompletaSeleccion = yaPublicadaSeleccion && pasoSeleccionado >= maxPaso

  const sinTV = !(evento?.tiene_tv_publica ?? true)
  const botonLabel = (() => {
    if (sinTV) {
      if (modoRevelacion === 'simultaneo') {
        return pubBusy ? 'Registrando…' : 'Registrar resultados de categoría'
      }
      if (pubBusy) return 'Registrando…'
      if (!yaPublicadaSeleccion || pasoSeleccionado <= 0) return 'Iniciar registro de resultados'
      if (revelacionCompletaSeleccion) return 'Registro completo'
      return 'Siguiente registro'
    }
    if (modoRevelacion === 'simultaneo') {
      return pubBusy ? 'Publicando…' : 'Publicar categoría en pantalla pública'
    }
    if (pubBusy) return 'Avanzando…'
    if (!yaPublicadaSeleccion || pasoSeleccionado <= 0) return 'Iniciar revelación en pantalla'
    if (revelacionCompletaSeleccion) return 'Revelación completa'
    return 'Siguiente revelación'
  })()

  const pubDisabled =
    pubBusy ||
    !categoriaSeleccionada ||
    publicarDeshabilitado ||
    (modoRevelacion === 'escalonado' && revelacionCompletaSeleccion)

  // ── Sección Sala (info del evento) ───────────────────────────────────
  const seccionSala = (
    <SimplePanel>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sala</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{evento.nombre}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Estado: <span className="font-medium text-foreground">{evento.estado}</span>
            {' · '}Código público:{' '}
            <span className="inline-flex items-center gap-0.5 align-middle">
              <span className="font-mono">{evento.codigo_acceso}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Copiar código de acceso"
                onClick={() => void copiarCodigoAcceso()}
              >
                <Copy className="size-4" aria-hidden />
              </Button>
            </span>
          </p>
        </div>
        {lastSyncedAt && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radio className="size-3 text-green-500 animate-pulse" aria-hidden />
            {lastSyncedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>
      {(evento.tiene_tv_publica ?? true) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground break-all">
            <a href={urlPublica} className="font-mono text-primary underline" target="_blank" rel="noreferrer">
              {urlPublica}
            </a>
          </p>
          <Button type="button" variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => void copiarUrl()}>
            <Copy className="size-4 shrink-0" aria-hidden />
            Copiar URL
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Este evento no tiene pantalla pública activa. Los resultados publicados quedan registrados en historial y exportaciones.
        </p>
      )}
      {evento.estado === 'abierto' && (
        <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 p-4">
          <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
            El evento está abierto. Los jurados pueden entrar pero aún no calificar.
          </p>
          <Button
            type="button"
            disabled={iniciandoCal}
            onClick={() => void iniciarCalificacion()}
            className="mt-3 gap-2 bg-indigo-700 hover:bg-indigo-800 text-white"
            size="sm"
          >
            {iniciandoCal ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Iniciar calificación
          </Button>
        </div>
      )}
      {error && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </SimplePanel>
  )

  // ── Sección Avance ────────────────────────────────────────────────────
  const seccionAvance = (
    <SimplePanel>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avance</p>
      <h3 className="mt-2 text-base font-semibold text-foreground">Progreso por categoría</h3>
      <ul className="mt-4 divide-y divide-border">
        {progreso.map((r) => {
          const esp = Number(r.calificaciones_esperadas)
          const reg = Number(r.calificaciones_registradas)
          const pct = esp > 0 ? Math.min(100, Math.round((reg / esp) * 100)) : 0
          const completa = pct === 100
          const publicada = publicadosSet.has(r.categoria_id)
          const isExpanded = expandedCats.has(r.categoria_id)
          const juradosFila = progresoJurados.filter((j) => j.categoria_id === r.categoria_id)

          function toggleExpand() {
            setExpandedCats((prev) => {
              const next = new Set(prev)
              if (next.has(r.categoria_id)) next.delete(r.categoria_id)
              else next.add(r.categoria_id)
              return next
            })
          }

          return (
            <li key={r.categoria_id} className="py-3 text-sm">
              <button
                type="button"
                className="w-full text-left"
                onClick={toggleExpand}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    {completa ? (
                      <CheckCircle2 className="size-4 shrink-0 text-green-500" aria-hidden />
                    ) : (
                      <span className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="font-medium text-foreground truncate">{r.categoria_nombre}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {publicada && (
                      <Badge variant="secondary" className="text-xs">publicada</Badge>
                    )}
                    <span className="text-muted-foreground tabular-nums">
                      {reg}/{esp}
                    </span>
                    {juradosFila.length > 0 && (
                      isExpanded
                        ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                        : <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', completa ? 'bg-green-500' : 'bg-primary')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>

              {isExpanded && juradosFila.length > 0 && (
                <ul className="mt-2 space-y-1 pl-6 border-l-2 border-border">
                  {juradosFila.map((jf) => {
                    const jEsp = Number(jf.calificaciones_esperadas)
                    const jReg = Number(jf.calificaciones_registradas)
                    const jCompleta = jEsp > 0 && jReg >= jEsp
                    return (
                      <li
                        key={jf.jurado_id}
                        className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
                      >
                        <span className={cn('truncate', jCompleta && 'text-green-600 dark:text-green-400 font-medium')}>
                          {jCompleta && <CheckCircle2 className="inline size-3 mr-1" aria-hidden />}
                          {jf.jurado_nombre}
                        </span>
                        <span className="shrink-0 tabular-nums">{jReg}/{jEsp}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {progreso.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No hay categorías.</p>}
    </SimplePanel>
  )

  // ── Sección Publicar ──────────────────────────────────────────────────
  const seccionPublicar = (
    <SimplePanel>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revisar y publicar</p>
      <h3 className="mt-2 text-base font-semibold text-foreground">Ranking previo</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Vista previa antes de publicar en pantalla pública. Modo:{' '}
        <strong>{modoRevelacion === 'escalonado' ? 'Revelación escalonada' : 'Podio completo'}</strong>
      </p>

      {/* Selector de categoría: chips scrollables */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {progreso.map((r) => {
          const selected = r.categoria_id === categoriaSeleccionada
          const publicada = publicadosSet.has(r.categoria_id)
          const bloqueada = modoRevelacion === 'escalonado' && !!filaActivaEscalonada && r.categoria_id !== filaActivaEscalonada.categoria_id
          return (
            <button
              key={r.categoria_id}
              type="button"
              disabled={bloqueada}
              onClick={() => setCatPreview(r.categoria_id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition-colors whitespace-nowrap',
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted',
                publicada && !selected && 'border-green-500/50 text-green-700 dark:text-green-400',
                bloqueada && 'cursor-not-allowed opacity-40',
              )}
            >
              {r.categoria_nombre}
              {publicada && ' ✓'}
            </button>
          )
        })}
      </div>

      {selectorBloqueado && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
          Completa la revelación de <strong>{filaActivaEscalonada?.categoria_nombre}</strong> antes de cambiar.
        </p>
      )}

      {calificacionesIncompletas && (
        <Alert variant="destructive" className="mt-3">
          <AlertTitle>Calificaciones incompletas</AlertTitle>
          <AlertDescription>
            Esta categoría aún no tiene todas las calificaciones. Puedes publicar si el comité lo autoriza.
          </AlertDescription>
        </Alert>
      )}

      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm">
        {ranking.map((x) => (
          <li key={x.participante_id}>
            <span className="text-foreground">{x.nombre_completo}</span>{' '}
            — <strong>{x.puntaje_final}</strong>
          </li>
        ))}
      </ol>
      {ranking.length === 0 && categoriaSeleccionada && (
        <p className="mt-2 text-sm text-muted-foreground">Sin datos de ranking aún.</p>
      )}

      <div className="mt-6">
        <PublicarBlock
          disabled={pubDisabled}
          busy={pubBusy}
          yaPublicada={yaPublicadaSeleccion}
          escalonada={modoRevelacion === 'escalonado'}
          pasoActual={pasoSeleccionado}
          pasoMax={maxPaso}
          label={botonLabel}
          onClick={() => void publicarCategoria()}
        />
      </div>

      {/* Botones para mostrar/ocultar desempates (si hay TV) o panel inline (si no hay TV) */}
      {yaPublicadaSeleccion && empatesDetectados.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          {sinTV ? (
            <DesempateInlinePanel
              empatesDetectados={empatesDetectados}
              criterioDesempate={criterios.find(c => c.es_criterio_desempate) ?? null}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empates detectados</p>
              <div className="flex flex-wrap gap-2">
                {empatesDetectados.map(({ lugar, filas }) => {
                  const activo = desempateActivo?.lugar === lugar && desempateActivo.categoriaId === categoriaSeleccionada
                  return (
                    <Button
                      key={lugar}
                      variant={activo ? 'destructive' : 'outline'}
                      size="sm"
                      disabled={desempateBusy}
                      onClick={() => void toggleDesempate(lugar, filas)}
                    >
                      {activo ? `Ocultar desempate ${lugar}° lugar` : `⚔️ Mostrar desempate ${lugar}° lugar en TV`}
                    </Button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </SimplePanel>
  )

  // ── Sección Historial ─────────────────────────────────────────────────
  const seccionHistorial = (
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
      {historial.length === 0 && (
        <p className="text-sm text-muted-foreground">Ninguna categoría publicada aún.</p>
      )}
    </SimplePanel>
  )

  return (
    <div className="space-y-4">
      {/* ── Alertas ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {avisoAdmin && (
          <Alert>
            <AlertTitle>Coordinación de sala</AlertTitle>
            <AlertDescription>{avisoAdmin}</AlertDescription>
          </Alert>
        )}
        {historial.length > 0 && (
          <Alert variant="success">
            <AlertTitle>Estado en pantalla pública</AlertTitle>
            <AlertDescription>
              {historial.length} categoría{historial.length === 1 ? '' : 's'} publicada
              {historial.length === 1 ? '' : 's'}.
            </AlertDescription>
          </Alert>
        )}
        {evento.estado === 'borrador' && (
          <Alert variant="destructive">
            <AlertTitle>Evento en borrador</AlertTitle>
            <AlertDescription>
              El administrador debe activar el evento para poder publicar resultados.
            </AlertDescription>
          </Alert>
        )}
        {(evento.estado === 'cerrado' || evento.estado === 'publicado') && (
          <Alert variant="warning">
            <AlertTitle>Evento {evento.estado}</AlertTitle>
            <AlertDescription>
              La calificación terminó. Puedes seguir publicando categorías pendientes.
            </AlertDescription>
          </Alert>
        )}
        {modoRevelacion === 'escalonado' && filaActivaEscalonada && (
          <Alert>
            <AlertTitle>Revelación en progreso</AlertTitle>
            <AlertDescription>
              Debes terminar la categoría <strong>{filaActivaEscalonada.categoria_nombre}</strong> antes de cambiar a otra.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* ── Info sala (siempre visible) ────────────────────────────── */}
      {seccionSala}

      {/* ── MÓVIL: tabs Avance / Publicar / Historial ─────────────── */}
      <div className="lg:hidden">
        <div className="flex border-b border-border">
          {(['avance', 'publicar', 'historial'] as MobileTab[]).map((tab) => {
            const labels: Record<MobileTab, string> = {
              avance: 'Avance',
              publicar: 'Publicar',
              historial: 'Historial',
            }
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setMobileTab(tab)}
                className={cn(
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  mobileTab === tab
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {labels[tab]}
                {tab === 'historial' && historial.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                    {historial.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="mt-4">
          {mobileTab === 'avance' && seccionAvance}
          {mobileTab === 'publicar' && seccionPublicar}
          {mobileTab === 'historial' && seccionHistorial}
        </div>
      </div>

      {/* ── DESKTOP: grid 2 cols ────────────────────────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
        {seccionAvance}
        {seccionPublicar}
        <div className="lg:col-span-2">{seccionHistorial}</div>
      </div>

      {/* ── Exportación (cerrado/publicado) ────────────────────────── */}
      {(evento.estado === 'cerrado' || evento.estado === 'publicado') &&
        evento.organizacion_id && evento.fecha && (
          <AdminExportaciones
            evento={{
              id: evento.id,
              organizacion_id: evento.organizacion_id,
              nombre: evento.nombre,
              descripcion: evento.descripcion ?? null,
              fecha: evento.fecha,
              estado: evento.estado,
              puestos_a_premiar: evento.puestos_a_premiar,
              codigo_acceso: evento.codigo_acceso,
            }}
            planOrganizacion={orgPlan}
            setError={setError}
          />
        )}
    </div>
  )
}

function PublicarBlock({
  disabled,
  busy,
  yaPublicada,
  escalonada,
  pasoActual,
  pasoMax,
  label,
  onClick,
}: {
  disabled: boolean
  busy: boolean
  yaPublicada: boolean
  escalonada: boolean
  pasoActual: number
  pasoMax: number
  label: string
  onClick: () => void
}) {
  return (
    <div className="space-y-2">
      {yaPublicada && !escalonada && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Ya publicada. Puedes volver a guardar para actualizar la hora en pantalla.
        </p>
      )}
      {escalonada && yaPublicada && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Revelación: paso {Math.min(pasoActual, pasoMax)}/{pasoMax}
        </p>
      )}
      <Button type="button" size="lg" className="w-full sm:w-auto" disabled={disabled} onClick={onClick}>
        {busy ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            {label}
          </>
        ) : (
          label
        )}
      </Button>
    </div>
  )
}
