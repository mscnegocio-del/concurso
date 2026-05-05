import { CheckCircle2, ChevronDown, ChevronRight, Copy, History, Loader2, Lock, Play, Radio } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DesempateInlinePanel } from '@/components/coordinacion/DesempateInlinePanel'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  institucion?: string | null
  puntaje_final: number
  promedio_por_criterio?: Record<string, number>
}

const POLL_MS = 6000

type MobileTab = 'publicar' | 'historial'

const ESTADO_BADGE: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  abierto: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  calificando: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  cerrado: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  publicado: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

const MEDAL = [
  { bg: 'bg-yellow-50 dark:bg-yellow-950/30', border: 'border-yellow-200 dark:border-yellow-800', badge: 'bg-yellow-400 text-white' },
  { bg: 'bg-slate-50 dark:bg-slate-900/40', border: 'border-slate-200 dark:border-slate-700', badge: 'bg-slate-400 text-white' },
  { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-600 text-white' },
]

type Props = {
  perfil: { id: string; organizacionId: string; email: string }
  orgId: string
  evento: CoordinacionEvento | null
  eventoReady: boolean
  onReloadEvento: () => void
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
  const [historialAbierto, setHistorialAbierto] = useState(false)
  const [cerrarOpen, setCerrarOpen] = useState(false)
  const [cerrarBusy, setCerrarBusy] = useState(false)

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

  const progresoGlobal = useMemo(() => {
    let esp = 0
    let reg = 0
    let categoriasIncompletas = 0
    progreso.forEach((p) => {
      const e = Number(p.calificaciones_esperadas)
      const r = Number(p.calificaciones_registradas)
      esp += e
      reg += r
      if (e > 0 && r < e) categoriasIncompletas += 1
    })
    return { esp, reg, categoriasIncompletas, todasCompletas: esp > 0 && reg >= esp }
  }, [progreso])

  const empatesDetectados = useMemo(() => {
    if (!filaSeleccionada || Number(filaSeleccionada.calificaciones_registradas) === 0) return []
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
  }, [ranking, filaSeleccionada])

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
    if (!eid || !cid) { setRanking([]); return }
    let cancelled = false
    ;(async () => {
      setError(null)
      const { data, error: e } = await supabase.rpc('coordinador_ranking_categoria', {
        p_evento_id: eid,
        p_categoria_id: cid,
      })
      if (cancelled) return
      if (e) { setError(e.message); return }
      setRanking((data ?? []) as RankFila[])
    })()
    return () => { cancelled = true }
  }, [evento?.id, categoriaSeleccionada, progreso])

  useEffect(() => {
    if (!evento?.id) return
    const id = evento.id
    const ch = supabase
      .channel(`coordinacion-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resultados_publicados', filter: `evento_id=eq.${id}` }, () => {
        void cargarProgreso()
        void cargarHistorial()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos', filter: `id=eq.${id}` }, () => {
        void onReloadEvento()
        void cargarProgreso()
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
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
    void supabase
      .from('criterios')
      .select('id, nombre, es_criterio_desempate')
      .eq('evento_id', evento.id)
      .then(({ data }) => setCriterios((data ?? []) as Array<{ id: string; nombre: string; es_criterio_desempate: boolean }>))
  }, [evento?.id])

  useEffect(() => {
    if (!orgId) return
    void supabase
      .from('organizaciones')
      .select('plan')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => { setOrgPlan((data as { plan?: string } | null)?.plan ?? 'gratuito') })
  }, [orgId])

  useEffect(() => {
    if (!filaActivaEscalonada) return
    if (categoriaSeleccionada !== filaActivaEscalonada.categoria_id) {
      setCatPreview(filaActivaEscalonada.categoria_id)
    }
  }, [filaActivaEscalonada, categoriaSeleccionada])

  const publicadosSet = useMemo(() => new Set(historial.map((h) => h.categoria_id)), [historial])

  function toggleExpand(catId: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  async function publicarCategoria() {
    if (!evento || !categoriaSeleccionada) return
    if (evento.estado === 'borrador') { setError('El evento debe estar activo (no en borrador) para publicar.'); return }
    if (modoRevelacion === 'escalonado' && filaActivaEscalonada && filaActivaEscalonada.categoria_id !== categoriaSeleccionada) {
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
      if (e) { setError(e.message); return }
      const row = Array.isArray(data) ? data[0] : null
      const paso = Number(row?.paso_revelacion ?? 0)
      const completado = Boolean(row?.completado)
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: evento.id,
        usuarioId: perfil.id,
        accion: 'resultados_publicados',
        detalle: { categoria_id: categoriaSeleccionada, modo_revelacion_podio: modoRevelacion, paso_revelacion: paso, completado },
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
    const puntajeCriterio1 = criterioId && filas[0].promedio_por_criterio ? Number(filas[0].promedio_por_criterio[criterioId]) : filas[0].puntaje_final
    const puntajeCriterio2 = criterioId && filas[1].promedio_por_criterio ? Number(filas[1].promedio_por_criterio[criterioId]) : filas[1].puntaje_final
    const payload = yaActivo ? null : {
      puesto: lugar,
      criterioDesempate: criterioDesempate?.nombre ?? 'Criterio de desempate',
      participante1: { nombre: filas[0].nombre_completo, puntajeTotal: filas[0].puntaje_final, puntajeCriterio: puntajeCriterio1 },
      participante2: { nombre: filas[1].nombre_completo, puntajeTotal: filas[1].puntaje_final, puntajeCriterio: puntajeCriterio2 },
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

  async function cerrarCalificacion() {
    if (!evento) return
    setCerrarBusy(true)
    try {
      const { error: e } = await supabase.from('eventos').update({ estado: 'cerrado' }).eq('id', evento.id)
      if (e) { setError(e.message); return }
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: evento.id,
        usuarioId: perfil.id,
        accion: 'evento_estado',
        detalle: { anterior: 'calificando', nuevo: 'cerrado' },
      })
      toast.success('Calificación cerrada. Los jurados verán el aviso automáticamente.')
      setCerrarOpen(false)
      onReloadEvento()
    } finally {
      setCerrarBusy(false)
    }
  }

  async function iniciarCalificacion() {
    if (!evento) return
    setIniciandoCal(true)
    try {
      const { error: e } = await supabase.from('eventos').update({ estado: 'calificando' }).eq('id', evento.id)
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

  // ── Loading / empty states ────────────────────────────────────────────
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
          No hay evento en foco ni reciente. El administrador debe crear o seleccionar un evento desde el panel de administración.
        </p>
      </SimplePanel>
    )
  }

  const publicarDeshabilitado = evento.estado === 'borrador' || evento.estado === 'abierto'
  const selectorBloqueado = modoRevelacion === 'escalonado' && !!filaActivaEscalonada && filaActivaEscalonada.categoria_id !== categoriaSeleccionada
  const yaPublicadaSeleccion = publicadosSet.has(categoriaSeleccionada)
  const revelacionCompletaSeleccion = yaPublicadaSeleccion && pasoSeleccionado >= maxPaso
  const sinTV = !(evento?.tiene_tv_publica ?? true)

  const botonLabel = (() => {
    if (sinTV) {
      if (modoRevelacion === 'simultaneo') return pubBusy ? 'Registrando…' : 'Registrar resultados de categoría'
      if (pubBusy) return 'Registrando…'
      if (!yaPublicadaSeleccion || pasoSeleccionado <= 0) return 'Iniciar registro de resultados'
      if (revelacionCompletaSeleccion) return 'Registro completo'
      return 'Siguiente registro'
    }
    if (modoRevelacion === 'simultaneo') return pubBusy ? 'Publicando…' : 'Publicar en pantalla pública'
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

  // ── Cabecera compacta del evento ──────────────────────────────────────
  const cabeceraEvento = (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="font-semibold text-foreground truncate">{evento.nombre}</h2>
          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', ESTADO_BADGE[evento.estado] ?? ESTADO_BADGE.borrador)}>
            {evento.estado}
          </span>
          {(evento.tiene_tv_publica ?? true) && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="font-mono">{evento.codigo_acceso}</span>
              <button
                type="button"
                onClick={() => void copiarCodigoAcceso()}
                className="rounded p-0.5 hover:bg-muted transition-colors"
                aria-label="Copiar código de acceso"
              >
                <Copy className="size-3" aria-hidden />
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {lastSyncedAt && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Radio className="size-3 text-green-500 animate-pulse" aria-hidden />
              {lastSyncedAt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {(evento.tiene_tv_publica ?? true) && (
            <>
              <a
                href={urlPublica}
                className="hidden sm:inline text-xs text-primary font-mono underline underline-offset-2 truncate max-w-xs"
                target="_blank"
                rel="noreferrer"
              >
                {urlPublica}
              </a>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => void copiarUrl()}>
                <Copy className="size-3.5" aria-hidden />
                Copiar URL
              </Button>
            </>
          )}
          {!(evento.tiene_tv_publica ?? true) && (
            <span className="text-xs text-muted-foreground">Sin pantalla pública activa</span>
          )}
          {evento.estado === 'calificando' && (
            <Button
              type="button"
              size="sm"
              variant={progresoGlobal.todasCompletas ? 'default' : 'outline'}
              className={cn(
                'gap-1.5 shrink-0',
                progresoGlobal.todasCompletas
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40',
              )}
              onClick={() => setCerrarOpen(true)}
            >
              <Lock className="size-3.5" aria-hidden />
              Cerrar calificación
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  const dialogoCerrar = (
    <AlertDialog open={cerrarOpen} onOpenChange={setCerrarOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cerrar la calificación?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Los jurados verán el aviso en tiempo real y ya no podrán modificar sus notas. Esta acción no se puede
                deshacer desde este panel.
              </p>
              {!progresoGlobal.todasCompletas && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="font-semibold">⚠️ Hay calificaciones pendientes</p>
                  <p className="mt-0.5 text-sm">
                    {progresoGlobal.categoriasIncompletas} categoría
                    {progresoGlobal.categoriasIncompletas === 1 ? '' : 's'} sin completar (
                    {progresoGlobal.reg}/{progresoGlobal.esp} calificaciones registradas). Las notas incompletas
                    quedarán como están.
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cerrarBusy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={cerrarBusy}
            onClick={(e) => {
              e.preventDefault()
              void cerrarCalificacion()
            }}
            className={
              progresoGlobal.todasCompletas
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }
          >
            {cerrarBusy ? 'Cerrando…' : 'Sí, cerrar calificación'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // ── CTA Iniciar calificación ──────────────────────────────────────────
  const ctaIniciarCalificacion = evento.estado === 'abierto' && (
    <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40 p-5">
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="size-10 shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
          <Play className="size-5 text-indigo-600 dark:text-indigo-400" aria-hidden />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="font-semibold text-indigo-900 dark:text-indigo-100">Sala abierta — esperando inicio</p>
          <p className="mt-0.5 text-sm text-indigo-700 dark:text-indigo-300">Los jurados pueden ingresar pero aún no pueden calificar.</p>
        </div>
        <Button
          type="button"
          disabled={iniciandoCal}
          onClick={() => void iniciarCalificacion()}
          size="lg"
          className="shrink-0 bg-indigo-700 hover:bg-indigo-800 text-white gap-2"
        >
          {iniciandoCal ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
          Iniciar calificación
        </Button>
      </div>
    </div>
  )

  // ── Alertas ───────────────────────────────────────────────────────────
  const alertas = (
    <div className="space-y-2">
      {avisoAdmin && (
        <Alert>
          <AlertTitle>Coordinación de sala</AlertTitle>
          <AlertDescription>{avisoAdmin}</AlertDescription>
        </Alert>
      )}
      {historial.length > 0 && !sinTV && (
        <Alert variant="success">
          <AlertTitle>Estado en pantalla pública</AlertTitle>
          <AlertDescription>
            {historial.length} categoría{historial.length === 1 ? '' : 's'} publicada{historial.length === 1 ? '' : 's'}.
          </AlertDescription>
        </Alert>
      )}
      {evento.estado === 'borrador' && (
        <Alert variant="destructive">
          <AlertTitle>Evento en borrador</AlertTitle>
          <AlertDescription>El administrador debe activar el evento para poder publicar resultados.</AlertDescription>
        </Alert>
      )}
      {(evento.estado === 'cerrado' || evento.estado === 'publicado') && (
        <Alert variant="warning">
          <AlertTitle>Evento {evento.estado}</AlertTitle>
          <AlertDescription>La calificación terminó. Puedes seguir publicando categorías pendientes.</AlertDescription>
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
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )

  // ── Sidebar de categorías (desktop izquierdo) ─────────────────────────
  const sidebarCategorias = (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorías</p>
      <div className="space-y-0.5">
        {progreso.map((r) => {
          const esp = Number(r.calificaciones_esperadas)
          const reg = Number(r.calificaciones_registradas)
          const pct = esp > 0 ? Math.min(100, Math.round((reg / esp) * 100)) : 0
          const completa = pct === 100
          const publicada = publicadosSet.has(r.categoria_id)
          const selected = r.categoria_id === categoriaSeleccionada
          const isExpanded = expandedCats.has(r.categoria_id)
          const juradosFila = progresoJurados.filter((j) => j.categoria_id === r.categoria_id)
          const bloqueada = modoRevelacion === 'escalonado' && !!filaActivaEscalonada && r.categoria_id !== filaActivaEscalonada.categoria_id

          return (
            <div key={r.categoria_id}>
              <button
                type="button"
                disabled={bloqueada}
                onClick={() => setCatPreview(r.categoria_id)}
                className={cn(
                  'w-full text-left rounded-lg px-3 py-2.5 transition-colors',
                  selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground',
                  bloqueada && 'cursor-not-allowed opacity-40',
                )}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <span className="text-sm font-medium truncate">{r.categoria_nombre}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {publicada && <CheckCircle2 className="size-3.5 text-green-500" aria-hidden />}
                    {juradosFila.length > 0 && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={isExpanded ? 'Contraer jurados' : 'Expandir jurados'}
                        onClick={(e) => { e.stopPropagation(); toggleExpand(r.categoria_id) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleExpand(r.categoria_id) } }}
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {isExpanded ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', completa ? 'bg-green-500' : 'bg-primary')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">{reg}/{esp}</span>
                </div>
              </button>

              {isExpanded && juradosFila.length > 0 && (
                <ul className="mt-0.5 mb-1 ml-3 pl-3 border-l-2 border-border space-y-0.5">
                  {juradosFila.map((jf) => {
                    const jCompleta = Number(jf.calificaciones_registradas) >= Number(jf.calificaciones_esperadas)
                    return (
                      <li key={jf.jurado_id} className="flex items-center justify-between gap-2 py-1 text-xs text-muted-foreground">
                        <span className={cn('truncate', jCompleta && 'text-green-600 dark:text-green-400 font-medium')}>
                          {jCompleta && <CheckCircle2 className="inline size-3 mr-0.5" aria-hidden />}
                          {jf.jurado_nombre}
                        </span>
                        <span className="tabular-nums shrink-0">{jf.calificaciones_registradas}/{jf.calificaciones_esperadas}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
        {progreso.length === 0 && <p className="px-3 text-sm text-muted-foreground">No hay categorías.</p>}
      </div>
    </div>
  )


  // ── Panel ranking (podio) ─────────────────────────────────────────────
  const panelRanking = (
    <div>
      {filaSeleccionada ? (
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-foreground">{filaSeleccionada.categoria_nombre}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {filaSeleccionada.calificaciones_registradas}/{filaSeleccionada.calificaciones_esperadas} calificaciones
              {!sinTV && (
                <>
                  {' · '}Modo: <strong>{modoRevelacion === 'escalonado' ? 'revelación escalonada' : 'podio completo'}</strong>
                </>
              )}
            </p>
          </div>
          {publicadosSet.has(categoriaSeleccionada) && (
            <Badge variant="secondary" className="gap-1 text-xs shrink-0">
              <CheckCircle2 className="size-3" aria-hidden />
              {sinTV ? 'Registrada' : 'Publicada'}
            </Badge>
          )}
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">Selecciona una categoría para ver el ranking.</p>
      )}

      {ranking.length > 0 && Number(filaSeleccionada?.calificaciones_registradas ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">Sin calificaciones aún — el ranking aparecerá cuando los jurados comiencen a calificar.</p>
      ) : ranking.length > 0 ? (
        <ol className="space-y-2">
          {ranking.map((x, i) => {
            const medal = MEDAL[i]
            if (medal) {
              return (
                <li
                  key={x.participante_id}
                  className={cn('flex flex-col gap-1 rounded-lg border px-4 py-3', medal.bg, medal.border)}
                >
                  <div className="flex items-start gap-3">
                    <span className={cn('size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5', medal.badge)}>
                      {i + 1}°
                    </span>
                    <span className="flex-1 min-w-0 font-medium text-foreground text-sm">{x.nombre_completo}</span>
                    <span className="font-bold text-foreground tabular-nums shrink-0">{x.puntaje_final}</span>
                  </div>
                  {x.institucion && (
                    <p className="text-xs text-muted-foreground ml-10">{x.institucion}</p>
                  )}
                </li>
              )
            }
            return (
              <li key={x.participante_id} className="flex flex-col gap-0.5 px-4 py-2 text-sm border-b border-border/40 last:border-0">
                <div className="flex items-start gap-3">
                  <span className="size-6 shrink-0 flex items-center justify-center text-xs text-muted-foreground font-medium mt-0.5">{i + 1}°</span>
                  <span className="flex-1 min-w-0 text-foreground">{x.nombre_completo}</span>
                  <span className="text-foreground tabular-nums shrink-0">{x.puntaje_final}</span>
                </div>
                {x.institucion && (
                  <p className="text-xs text-muted-foreground ml-9">{x.institucion}</p>
                )}
              </li>
            )
          })}
        </ol>
      ) : categoriaSeleccionada ? (
        <p className="text-sm text-muted-foreground">Sin datos de ranking aún.</p>
      ) : null}
    </div>
  )

  // ── Bloque publicar + empates ─────────────────────────────────────────
  const bloquePublicar = (
    <div className="mt-5 border-t border-border pt-5 space-y-4">
      {selectorBloqueado && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Completa la revelación de <strong>{filaActivaEscalonada?.categoria_nombre}</strong> antes de cambiar.
        </p>
      )}
      {evento.estado === 'abierto' && (
        <Alert>
          <AlertTitle>Calificación no iniciada</AlertTitle>
          <AlertDescription>Primero inicia la calificación para poder {sinTV ? 'registrar resultados' : 'publicar en pantalla pública'}.</AlertDescription>
        </Alert>
      )}
      {evento.estado !== 'abierto' && calificacionesIncompletas && (
        <Alert variant="destructive">
          <AlertTitle>Calificaciones incompletas</AlertTitle>
          <AlertDescription>Esta categoría aún no tiene todas las calificaciones. Puedes publicar si el comité lo autoriza.</AlertDescription>
        </Alert>
      )}
      <PublicarBlock
        disabled={pubDisabled}
        busy={pubBusy}
        yaPublicada={yaPublicadaSeleccion}
        escalonada={modoRevelacion === 'escalonado'}
        pasoActual={pasoSeleccionado}
        pasoMax={maxPaso}
        label={botonLabel}
        sinTV={sinTV}
        onClick={() => void publicarCategoria()}
      />
      {yaPublicadaSeleccion && empatesDetectados.length > 0 && (
        <div className="border-t border-border pt-4">
          {sinTV ? (
            <DesempateInlinePanel
              empatesDetectados={empatesDetectados}
              criterioDesempate={criterios.find((c) => c.es_criterio_desempate) ?? null}
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
    </div>
  )

  // ── Historial acordeón ────────────────────────────────────────────────
  const historialAcordeon = (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setHistorialAbierto((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        aria-expanded={historialAbierto}
      >
        <span className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Historial de resultados
          {historial.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">{historial.length}</span>
          )}
        </span>
        {historialAbierto
          ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          : <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        }
      </button>
      {historialAbierto && (
        <div className="border-t border-border px-4 py-3">
          {historial.length > 0 ? (
            <ul className="space-y-3 text-sm">
              {historial.map((h) => {
                const nombre = progreso.find((p) => p.categoria_id === h.categoria_id)?.categoria_nombre ?? h.categoria_id
                return (
                  <li key={`${h.categoria_id}-${h.publicado_at}`} className="flex flex-col gap-0.5 border-b border-border/60 pb-3 last:border-0">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-foreground">{nombre}</span>
                      <span className="text-muted-foreground text-xs">{new Date(h.publicado_at).toLocaleString('es-PE')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Por: {h.nombre_publicador ?? 'Sin registro'}</p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ninguna categoría publicada aún.</p>
          )}
        </div>
      )}
    </div>
  )

  // ── Exportaciones ─────────────────────────────────────────────────────
  const exportaciones = (evento.estado === 'cerrado' || evento.estado === 'publicado') && evento.organizacion_id && evento.fecha && (
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
  )

  return (
    <div className="space-y-4">
      {dialogoCerrar}
      {cabeceraEvento}
      {ctaIniciarCalificacion}
      {alertas}

      {/* ── DESKTOP: sidebar + panel principal ───────────────────────── */}
      <div className="hidden lg:flex gap-6 items-start">
        {/* Sidebar izquierdo sticky */}
        <div className="w-56 shrink-0 rounded-xl border border-border bg-card p-4 sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto">
          {sidebarCategorias}
        </div>

        {/* Panel principal */}
        <div className="flex-1 min-w-0 space-y-4">
          <SimplePanel>
            {panelRanking}
            {bloquePublicar}
          </SimplePanel>
          {historialAcordeon}
          {exportaciones}
        </div>
      </div>

      {/* ── MÓVIL: tabs Publicar / Historial ─────────────────────────── */}
      <div className="lg:hidden">
        <div className="flex border-b border-border">
          {(['publicar', 'historial'] as MobileTab[]).map((tab) => {
            const labels: Record<MobileTab, string> = {
              publicar: sinTV ? 'Resultados' : 'Publicar',
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
                  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                    {historial.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-4 space-y-4">
          {mobileTab === 'publicar' && (
            <>
              <SimplePanel>
                {sidebarCategorias}
              </SimplePanel>
              <SimplePanel>
                {panelRanking}
                {bloquePublicar}
              </SimplePanel>
            </>
          )}
          {mobileTab === 'historial' && (
            <SimplePanel>
              <h3 className="text-base font-semibold text-foreground mb-3">Historial de resultados</h3>
              {historial.length > 0 ? (
                <ul className="space-y-3 text-sm">
                  {historial.map((h) => {
                    const nombre = progreso.find((p) => p.categoria_id === h.categoria_id)?.categoria_nombre ?? h.categoria_id
                    return (
                      <li key={`${h.categoria_id}-${h.publicado_at}`} className="flex flex-col gap-0.5 border-b border-border/60 pb-3 last:border-0">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium text-foreground">{nombre}</span>
                          <span className="text-muted-foreground text-xs">{new Date(h.publicado_at).toLocaleString('es-PE')}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Por: {h.nombre_publicador ?? 'Sin registro'}</p>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ninguna categoría publicada aún.</p>
              )}
            </SimplePanel>
          )}
          {exportaciones}
        </div>
      </div>
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
  sinTV,
  onClick,
}: {
  disabled: boolean
  busy: boolean
  yaPublicada: boolean
  escalonada: boolean
  pasoActual: number
  pasoMax: number
  label: string
  sinTV: boolean
  onClick: () => void
}) {
  return (
    <div className="space-y-2">
      {yaPublicada && !escalonada && !sinTV && (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Ya publicada. Puedes volver a guardar para actualizar la hora en pantalla.
        </p>
      )}
      {yaPublicada && sinTV && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          Resultados registrados. Puedes guardar de nuevo para actualizar el registro.
        </p>
      )}
      {escalonada && yaPublicada && !sinTV && (
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
