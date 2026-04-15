import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useParams } from 'react-router-dom'
import { ConuroMarketingCta } from '@/components/marketing/ConuroMarketingCta'
import { normalizeAccentHex, normalizePlantillaPublica } from '@/lib/publico-theme'
import { playRevealChime } from '@/lib/sound'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type EventoHeader = {
  id: string
  nombre: string
  estado: string
  fecha: string
  puestos_a_premiar: number
  codigo_acceso: string
  org_nombre: string
  logo_url: string | null
  /** Presente tras migración `publico_evento_por_codigo` con subsede. */
  logo_subsede_url?: string | null
  sonido_revelacion_activo?: boolean
  plantilla_publica?: string
  color_accento_hex?: string | null
  modo_revelacion_podio?: 'simultaneo' | 'escalonado' | string
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

type Publicado = { categoria_id: string; publicado_at: string; paso_revelacion?: number }

type PodioFila = {
  puesto: number
  participante_id: string
  codigo: string
  nombre_completo: string
  puntaje_final: number
}

/** 2 o 3 puestos; si llega 0/null, PodioSlot ocultaba todo el podio (puestos menor que lugar para 1,2,3). */
function puestosPremiarSeguros(raw: unknown): 2 | 3 {
  const n = Number(raw)
  return n === 2 ? 2 : 3
}

/** PostgREST suele mandar `row_number()` (bigint) como string; sin esto `puesto === 1` falla y el podio queda vacío. */
function normalizarFilasPodio(raw: unknown): PodioFila[] {
  const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : []
  return arr
    .map((r) => {
      const x = r as Record<string, unknown>
      return {
        puesto: Number(x.puesto),
        participante_id: String(x.participante_id ?? ''),
        codigo: String(x.codigo ?? ''),
        nombre_completo: String(x.nombre_completo ?? ''),
        puntaje_final: Number(x.puntaje_final),
      }
    })
    .filter((r) => Number.isFinite(r.puesto) && r.puesto >= 1)
}

function filaPodio(filas: PodioFila[], lugar: number): PodioFila | undefined {
  return filas.find((x) => Number(x.puesto) === lugar)
}

function hayEmpateEnLugar(filas: PodioFila[], lugar: number): boolean {
  const fila = filaPodio(filas, lugar)
  if (!fila) return false
  return filas.filter((x) => Number(x.puntaje_final) === Number(fila.puntaje_final)).length > 1
}

const POLL_MS = 5000

/** Piso más alto que 0.22 para legibilidad en TVs pequeñas; el contenido compacto con podio ayuda a no llegar al piso. */
const PUBLICO_ESCALA_MIN = 0.28

function fingerprintLayout(
  progreso: ProgresoFila[],
  podio: PodioFila[],
  publicados: Publicado[],
): number {
  const prog = progreso
    .map((r) => `${r.categoria_id}:${r.calificaciones_registradas}/${r.calificaciones_esperadas}`)
    .join('|')
  const pod = podio.map((p) => `${p.puesto}:${p.participante_id}:${p.puntaje_final}`).join('|')
  const pub = publicados.map((p) => p.categoria_id).join('|')
  const s = `${prog}#${pod}#${pub}`
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/**
 * Escala todo el lienzo al viewport (TV/proyector) sin scroll ni interacción.
 */
function PublicoEscaladoViewport({
  children,
  layoutRevision = 0,
}: {
  children: ReactNode
  /** Cambia cuando se actualizan datos (poll); vuelve a medir y escalar. */
  layoutRevision?: number
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const scaleBoxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const recompute = useCallback(() => {
    const vp = viewportRef.current
    const box = scaleBoxRef.current
    if (!vp || !box) return
    const m = Math.min(vp.clientWidth, vp.clientHeight)
    const pad = Math.round(Math.min(28, Math.max(6, m * 0.025)))
    const rw = Math.max(1, vp.clientWidth - pad * 2)
    const rh = Math.max(1, vp.clientHeight - pad * 2)
    const cw = Math.max(1, box.scrollWidth)
    const ch = Math.max(1, box.scrollHeight)
    const s = Math.max(PUBLICO_ESCALA_MIN, Math.min(rw / cw, rh / ch, 1))
    setScale(s)
  }, [])

  useLayoutEffect(() => {
    recompute()
    const roVp = new ResizeObserver(recompute)
    const roBox = new ResizeObserver(recompute)
    if (viewportRef.current) roVp.observe(viewportRef.current)
    if (scaleBoxRef.current) roBox.observe(scaleBoxRef.current)
    window.addEventListener('resize', recompute)
    window.addEventListener('orientationchange', recompute)
    return () => {
      roVp.disconnect()
      roBox.disconnect()
      window.removeEventListener('resize', recompute)
      window.removeEventListener('orientationchange', recompute)
    }
  }, [recompute, layoutRevision])

  return (
    <div
      ref={viewportRef}
      className="box-border flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch justify-start overflow-hidden overscroll-none p-[clamp(0.35rem,2vmin,1.25rem)]"
    >
      <div
        ref={scaleBoxRef}
        className="will-change-transform mx-auto flex w-full min-w-0 max-w-[min(100%,96rem)] min-h-0 flex-1 flex-col"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

type ConnectionStatus = 'realtime' | 'polling' | 'offline'

export function PublicoEventoPage() {
  const { eventoSlug } = useParams<{ eventoSlug: string }>()
  const codigo = (eventoSlug ?? '').trim()
  const [header, setHeader] = useState<EventoHeader | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [progreso, setProgreso] = useState<ProgresoFila[]>([])
  const [publicados, setPublicados] = useState<Publicado[]>([])
  const [podio, setPodio] = useState<PodioFila[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline')
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const prevPubCount = useRef(0)
  const lastSyncRef = useRef<Date | null>(null)
  const realtimeActiveRef = useRef(false)

  const cargar = useCallback(async () => {
    if (!codigo) return
    try {
      const { data: h } = await supabase.rpc('publico_evento_por_codigo', { p_codigo: codigo })
      const row = h?.[0] as EventoHeader | undefined
      if (!row) {
        setNotFound(true)
        setHeader(null)
        return
      }
      setNotFound(false)
      setHeader(row)

      const { data: p } = await supabase.rpc('publico_progreso_por_codigo', { p_codigo: codigo })
      setProgreso((p ?? []) as ProgresoFila[])

      const { data: pub } = await supabase.rpc('publico_categorias_publicadas', { p_codigo: codigo })
      const list = (pub ?? []) as Publicado[]
      setPublicados(list)

      if (
        list.length > prevPubCount.current &&
        prevPubCount.current > 0 &&
        row.sonido_revelacion_activo !== false
      ) {
        playRevealChime()
      }
      prevPubCount.current = list.length

      const ultima = list[0]
      if (ultima) {
        const { data: pod, error: podErr } = await supabase.rpc('publico_podio_categoria', {
          p_codigo: codigo,
          p_categoria_id: ultima.categoria_id,
        })
        if (podErr) {
          console.error('[publico] publico_podio_categoria', podErr)
          setPodio([])
        } else {
          setPodio(normalizarFilasPodio(pod))
        }
      } else {
        setPodio([])
      }

      // Actualizar estado de conexión y timestamp
      lastSyncRef.current = new Date()
      setLastSyncedAt(new Date())
      if (!realtimeActiveRef.current) {
        setConnectionStatus('polling')
      }
    } catch (err) {
      console.error('[publico] error cargando datos', err)
      // Si pasan >10s sin sincronización, mostrar offline
      const now = new Date()
      if (lastSyncRef.current && now.getTime() - lastSyncRef.current.getTime() > 10000) {
        setConnectionStatus('offline')
      }
    }
  }, [codigo])

  useEffect(() => {
    prevPubCount.current = 0
  }, [codigo])

  useEffect(() => {
    if (!header) return
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflow
    const prevBody = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtml
      body.style.overflow = prevBody
    }
  }, [header])

  // Realtime listener para cambios en resultados_publicados
  useEffect(() => {
    if (!header?.id) return
    const eventoId = header.id
    const ch = supabase
      .channel(`publico-${codigo}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'resultados_publicados', filter: `evento_id=eq.${eventoId}` },
        () => {
          realtimeActiveRef.current = true
          setConnectionStatus('realtime')
          queueMicrotask(() => void cargar())
        },
      )
      .subscribe((_status, err) => {
        if (err) {
          realtimeActiveRef.current = false
          setConnectionStatus('polling')
        } else {
          realtimeActiveRef.current = true
          setConnectionStatus('realtime')
        }
      })
    return () => {
      realtimeActiveRef.current = false
      void supabase.removeChannel(ch)
    }
  }, [header?.id, codigo, cargar])

  useEffect(() => {
    queueMicrotask(() => {
      void cargar()
    })
    const t = window.setInterval(() => {
      queueMicrotask(() => void cargar())
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [cargar])

  const nombreUltimaCategoria = useMemo(() => {
    const u = publicados[0]
    if (!u) return null
    return progreso.find((r) => r.categoria_id === u.categoria_id)?.categoria_nombre ?? null
  }, [publicados, progreso])

  const puestosPodio = useMemo(() => puestosPremiarSeguros(header?.puestos_a_premiar), [header?.puestos_a_premiar])

  // Paso actual de revelación (modo escalonado)
  const pasoRevelacion = publicados[0]?.paso_revelacion ?? 0
  const modoEscalonado = header?.modo_revelacion_podio === 'escalonado'
  const revelaciónEnProgreso = modoEscalonado && pasoRevelacion > 0 && pasoRevelacion < puestosPodio

  const pctGlobal = useMemo(() => {
    const reg = progreso.reduce((a, r) => a + Number(r.calificaciones_registradas), 0)
    const esp = progreso.reduce((a, r) => a + Number(r.calificaciones_esperadas), 0)
    if (esp <= 0) return 0
    return Math.min(100, Math.round((reg / esp) * 100))
  }, [progreso])

  const layoutRevision = useMemo(
    () => fingerprintLayout(progreso, podio, publicados),
    [progreso, podio, publicados],
  )

  if (!codigo) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <p className="text-xl">Código de evento no válido.</p>
      </main>
    )
  }

  if (notFound || !header) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Pantalla pública</p>
        <h1 className="mt-4 text-3xl font-semibold md:text-5xl">Evento no disponible</h1>
        <p className="mt-4 max-w-lg text-slate-400">
          Comprueba el enlace o que el concurso ya esté activo (no en borrador).
        </p>
      </main>
    )
  }

  const finalizado = header.estado === 'publicado'
  const hayPodioPublicado = podio.length > 0
  const publicadoSinPodio = publicados.length > 0 && podio.length === 0
  /** En escritorio/TV: priorizar panel derecho si hay podio o categoría publicada sin filas aún. */
  const panelRevelacionPrioritario = hayPodioPublicado || publicadoSinPodio

  const plantillaTv = normalizePlantillaPublica(header.plantilla_publica)
  const accentOverride = normalizeAccentHex(header.color_accento_hex)
  const accentStyle = accentOverride
    ? ({ ['--publico-accent-override' as string]: accentOverride } as CSSProperties)
    : undefined

  // Formatear tiempo desde última sincronización
  const timeAgoStr = lastSyncedAt
    ? (() => {
        const diff = Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000)
        if (diff < 60) return 'hace unos segundos'
        if (diff < 120) return 'hace 1 minuto'
        if (diff < 3600) return `hace ${Math.floor(diff / 60)} minutos`
        return `hace ${Math.floor(diff / 3600)} horas`
      })()
    : null

  const connectionLabel = {
    realtime: '🟢 Conectado',
    polling: '🟡 Sincronizando',
    offline: '🔴 Sin conexión',
  }[connectionStatus]

  return (
    <main
      className="publico-root fixed inset-0 z-10 flex h-[100dvh] max-h-[100dvh] w-screen flex-col overflow-hidden overscroll-none"
      data-publico-theme={plantillaTv}
      style={accentStyle}
    >
      {/* Badge de estado de conexión (esquina superior derecha) */}
      <div className="fixed top-4 right-4 z-50 text-xs opacity-75 mix-blend-multiply">
        <div className="rounded bg-white/60 px-2.5 py-1.5 text-[#333] backdrop-blur-sm dark:bg-black/60 dark:text-white">
          <p className="font-semibold whitespace-nowrap">{connectionLabel}</p>
          {timeAgoStr && <p className="text-[10px] opacity-70 mt-0.5">{timeAgoStr}</p>}
        </div>
      </div>

      <PublicoEscaladoViewport layoutRevision={layoutRevision}>
        <div className="publico-display flex min-h-[100dvh] w-full min-w-0 flex-col px-[clamp(1rem,3.5vw,2.75rem)] py-[clamp(0.75rem,2.5dvh,2.25rem)]">
          <header className="flex shrink-0 flex-col items-center gap-[clamp(0.75rem,2.5vmin,1.5rem)] text-center md:flex-row md:items-start md:justify-between md:text-left">
          <div className="flex flex-col items-center gap-[clamp(0.75rem,2.5vmin,1.5rem)] md:flex-row md:items-center">
            {header.logo_url || header.logo_subsede_url ? (
              <div className="flex max-w-full flex-row flex-wrap items-center justify-center gap-[clamp(0.5rem,2vmin,1.25rem)] md:justify-start">
                {header.logo_url ? (
                  <img
                    src={header.logo_url}
                    alt=""
                    className="h-[clamp(3rem,10dvh,7.5rem)] w-auto max-w-[min(42vw,13rem)] object-contain sm:max-w-[min(40vw,12rem)]"
                  />
                ) : null}
                {header.logo_url && header.logo_subsede_url ? (
                  <div
                    className="hidden h-[clamp(2rem,6dvh,4.5rem)] w-px shrink-0 bg-[var(--publico-text-muted)] opacity-35 sm:block"
                    aria-hidden
                  />
                ) : null}
                {header.logo_subsede_url ? (
                  <img
                    src={header.logo_subsede_url}
                    alt=""
                    className="h-[clamp(3rem,10dvh,7.5rem)] w-auto max-w-[min(42vw,13rem)] object-contain sm:max-w-[min(40vw,12rem)]"
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex h-[clamp(3rem,10dvh,7.5rem)] w-[clamp(3rem,10dvh,7.5rem)] shrink-0 items-center justify-center rounded-2xl bg-[var(--publico-placeholder-bg)] text-[clamp(1.25rem,4vmin,2rem)] font-bold text-[var(--publico-placeholder-text)]">
                PJ
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[clamp(0.65rem,1.8vmin,0.9rem)] uppercase tracking-[0.35em] text-[var(--publico-text-muted)]">
                {header.org_nombre}
              </p>
              <h1 className="mt-1 text-balance text-[clamp(1.35rem,4.2vmin,3.75rem)] font-bold leading-[1.1] text-[var(--publico-text-heading)]">
                {header.nombre}
              </h1>
              <p className="mt-1 text-[clamp(0.85rem,2.2vmin,1.15rem)] text-[var(--publico-text-muted)]">
                {new Date(header.fecha).toLocaleDateString('es-PE', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 md:items-end">
          {finalizado && (
            <div className="rounded-2xl border border-[color:var(--publico-badge-border)] bg-[var(--publico-badge-bg)] px-6 py-3 text-center md:text-right">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--publico-badge-title)]">
                Concurso finalizado
              </p>
              <p className="mt-1 text-sm text-[var(--publico-badge-sub)]">Gracias por participar</p>
            </div>
          )}
          </div>
          </header>

          <section
            className={cn(
              'mt-[clamp(1rem,3dvh,2.5rem)] flex min-h-0 flex-1 flex-col gap-[clamp(1rem,3vmin,2.5rem)] lg:flex-row lg:gap-[clamp(0.75rem,2vmin,1.5rem)]',
            )}
          >
            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-col overflow-y-auto',
                'max-lg:[flex:1_1_0%]',
                panelRevelacionPrioritario ? 'lg:[flex:1_1_0%]' : 'lg:[flex:4_1_0%]',
              )}
            >
              <h2 className="text-[clamp(1.05rem,2.8vmin,1.5rem)] font-semibold text-[var(--publico-text-heading)]">
                En curso
              </h2>
              <p
                className={cn(
                  'mt-1 text-[clamp(0.75rem,2vmin,0.95rem)] text-[var(--publico-text-muted)]',
                  hayPodioPublicado && 'lg:sr-only',
                )}
              >
                Avance por categoría. Las notas se darán a conocer al publicar cada resultado.
              </p>
              {hayPodioPublicado && (
                <p className="mt-1 hidden text-[clamp(0.7rem,1.8vmin,0.85rem)] text-[var(--publico-text-muted)] lg:block">
                  Progreso general del concurso.
                </p>
              )}
              <div className="mt-[clamp(0.75rem,2dvh,1.5rem)] h-[clamp(0.85rem,1.8dvh,1.35rem)] w-full overflow-hidden rounded-full bg-[var(--publico-track)]">
                <div
                  className="publico-progress-fill-global h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${pctGlobal}%` }}
                />
              </div>
              <p className="mt-2 text-center text-[clamp(1.35rem,4vmin,2.25rem)] font-semibold text-[var(--publico-text-heading)]">
                {pctGlobal}%
              </p>

              <ul
                className={cn(
                  'mt-4 space-y-2 sm:mt-6 sm:space-y-3',
                  hayPodioPublicado && 'lg:hidden',
                )}
              >
                {progreso.map((r) => {
                  const esp = Number(r.calificaciones_esperadas)
                  const reg = Number(r.calificaciones_registradas)
                  const p = esp > 0 ? Math.min(100, Math.round((reg / esp) * 100)) : 0
                  return (
                    <li
                      key={r.categoria_id}
                      className="rounded-xl border border-[color:var(--publico-card-border)] bg-[var(--publico-card-bg)] px-4 py-3"
                    >
                      <div className="flex justify-between gap-4 text-sm md:text-base">
                        <span className="font-medium text-[var(--publico-text-heading)]">{r.categoria_nombre}</span>
                        <span className="text-[var(--publico-text-muted)]">
                          {reg}/{esp}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--publico-track)]">
                        <div
                          className="h-full rounded-full bg-[var(--publico-track-inner)]"
                          style={{ width: `${p}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-col overflow-y-auto',
                'max-lg:[flex:1_1_0%]',
                panelRevelacionPrioritario ? 'lg:[flex:4_1_0%]' : 'lg:[flex:1_1_0%]',
              )}
            >
              {/* Estado del evento */}
              <div className="mb-3 inline-block">
                <div
                  className={cn(
                    'rounded-full px-3 py-1 text-[clamp(0.65rem,1.6vmin,0.8rem)] font-semibold uppercase tracking-wider',
                    header?.estado === 'calificando'
                      ? 'bg-[color-mix(in_srgb,#f59e0b_20%,transparent)] text-[color-mix(in_srgb,#f59e0b_85%,transparent)]'
                      : 'bg-[color-mix(in_srgb,#ef4444_20%,transparent)] text-[color-mix(in_srgb,#ef4444_85%,transparent)]',
                  )}
                >
                  {header?.estado === 'calificando' ? '⏱️ En calificación' : '🔒 Evento cerrado'}
                </div>
              </div>

              <h2 className="text-[clamp(1.05rem,2.8vmin,1.5rem)] font-semibold text-[var(--publico-text-heading)]">
                Última revelación
              </h2>
              {nombreUltimaCategoria && (
                <p className="publico-categoria-nombre-acento mt-2 text-[clamp(1rem,2.8vmin,1.35rem)] font-medium">
                  Categoría: {nombreUltimaCategoria}
                </p>
              )}
              {modoEscalonado && publicados.length > 0 && (
                <div className="mt-2 inline-block">
                  <div
                    className={cn(
                      'rounded-full px-3 py-1 text-[clamp(0.65rem,1.6vmin,0.8rem)] font-semibold uppercase tracking-wider',
                      revelaciónEnProgreso
                        ? 'bg-[color-mix(in_srgb,var(--publico-accent)_20%,transparent)] text-[color-mix(in_srgb,var(--publico-accent)_85%,transparent)]'
                        : 'bg-[color-mix(in_srgb,#a0a0a0_20%,transparent)] text-[color-mix(in_srgb,#a0a0a0_85%,transparent)]',
                    )}
                  >
                    Paso {Math.min(pasoRevelacion, puestosPodio)}/{puestosPodio} — Revelación progresiva
                  </div>
                </div>
              )}
              {(hayPodioPublicado || publicadoSinPodio) && (
                <p className="mt-1 text-[clamp(0.75rem,2vmin,0.95rem)] text-[var(--publico-text-muted)]">
                  Puntajes visibles solo para categorías ya publicadas.
                </p>
              )}

              {publicadoSinPodio ? (
                <p className="mt-8 text-balance text-center text-[clamp(1rem,2.8vmin,1.35rem)] leading-relaxed text-[var(--publico-waiting-text)]">
                  {nombreUltimaCategoria
                    ? `Estamos preparando la tabla de resultados de «${nombreUltimaCategoria}». En breve debería aparecer el podio en esta pantalla.`
                    : 'Estamos preparando la tabla de resultados. En breve debería aparecer el podio en esta pantalla.'}
                </p>
              ) : podio.length === 0 ? (
                <p className="mt-8 text-balance text-center text-[clamp(1rem,2.8vmin,1.25rem)] leading-relaxed text-[var(--publico-text-muted)]">
                  Aún no hay resultados publicados. Esta pantalla se actualizará sola; mantenla a la vista del
                  público.
                </p>
              ) : (
                <div className="mt-6 flex min-h-0 flex-1 flex-col justify-center">
                  <div
                    className={cn(
                      'publico-podium-container publico-podium-reveal flex items-end justify-center gap-[clamp(0.5rem,2vmin,1.5rem)]',
                      podio.length > 0 ? 'visible' : 'hidden',
                    )}
                  >
                    <PodioSlot lugar={2} fila={filaPodio(podio, 2)} puestos={puestosPodio} hayEmpate={hayEmpateEnLugar(podio, 2)} />
                    <PodioSlot lugar={1} fila={filaPodio(podio, 1)} puestos={puestosPodio} alto hayEmpate={hayEmpateEnLugar(podio, 1)} />
                    <PodioSlot lugar={3} fila={filaPodio(podio, 3)} puestos={puestosPodio} hayEmpate={hayEmpateEnLugar(podio, 3)} />
                  </div>
                </div>
              )}
            </div>
          </section>
          {/*
            Franja inferior discreta en proyector/TV: texto mínimo y opacidad baja para no competir con el podio.
          */}
          <footer className="mt-auto shrink-0 pt-[clamp(0.35rem,1dvh,0.75rem)] opacity-[0.72]">
            <ConuroMarketingCta
              utmMedium="publico_tv"
              darkSurface={plantillaTv === 'oscuro'}
              publicoLight={plantillaTv === 'claro'}
              className="text-center text-[clamp(0.55rem,1.35vmin,0.72rem)] leading-tight"
            />
          </footer>
        </div>
      </PublicoEscaladoViewport>
    </main>
  )
}

/** Nombre en podio para TV/proyector: sin hover; si no cabe, desplazamiento vertical automático con pausas. */
function PodioNombreProyector({ nombre, destacado }: { nombre: string; destacado: boolean }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [excesoPx, setExcesoPx] = useState(0)

  const trackH = destacado
    ? 'h-[clamp(3.25rem,11dvh,7rem)]'
    : 'h-[clamp(2.5rem,8dvh,5.25rem)]'

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const medir = () => {
      const d = inner.scrollHeight - outer.clientHeight
      setExcesoPx(d > 2 ? d : 0)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(outer)
    ro.observe(inner)
    return () => ro.disconnect()
  }, [nombre, destacado])

  const necesitaScroll = excesoPx > 0

  return (
    <div
      ref={outerRef}
      className={cn(
        'relative mt-[clamp(0.35rem,1.2dvh,0.75rem)] w-full max-w-[min(42vmin,16rem)] overflow-hidden',
        trackH,
      )}
      aria-label={`Ganador: ${nombre}`}
    >
      <div
        ref={innerRef}
        className={cn(
          'px-0.5 text-center text-[clamp(0.8rem,2.2vmin,1.15rem)] font-semibold leading-tight text-pretty break-words text-[var(--publico-text-heading)]',
          necesitaScroll
            ? 'publico-podium-name-scroll absolute inset-x-0 top-0'
            : 'absolute inset-x-0 top-1/2 -translate-y-1/2',
        )}
        style={
          necesitaScroll
            ? ({ '--publico-podium-dy': `-${excesoPx}px` } as CSSProperties)
            : undefined
        }
      >
        {nombre}
      </div>
    </div>
  )
}

function PodioSlot({
  lugar,
  fila,
  puestos,
  alto,
  hayEmpate,
}: {
  lugar: 1 | 2 | 3
  fila: PodioFila | undefined
  puestos: 2 | 3
  alto?: boolean
  hayEmpate?: boolean
}) {
  if (puestos < lugar) {
    return <div className="w-[28%] max-w-[min(30vmin,15rem)]" aria-hidden />
  }
  const h = alto
    ? 'min-h-[clamp(11rem,30dvh,22rem)]'
    : 'min-h-[clamp(8.5rem,24dvh,17rem)]'
  const orden = lugar === 1 ? 'order-2' : lugar === 2 ? 'order-1' : 'order-3'
  return (
    <div
      className={`flex w-[30%] max-w-[min(32vmin,15rem)] flex-col items-center transition-all duration-700 sm:max-w-[min(34vmin,16rem)] ${orden}`}
    >
      <div
        className={cn(
          'flex w-full flex-col items-center justify-end rounded-t-2xl border bg-[var(--publico-podio-card)] px-[clamp(0.5rem,1.8vmin,1rem)] pb-[clamp(1rem,2.5dvh,1.75rem)] pt-[clamp(1.25rem,3dvh,2.25rem)] text-center transition-all duration-700',
          h,
          lugar === 1 && fila
            ? 'publico-podium-first border-[color:color-mix(in_srgb,var(--publico-accent)_45%,transparent)] ring-2 ring-[color:color-mix(in_srgb,var(--publico-accent)_35%,transparent)]'
            : 'border-[color:var(--publico-podio-border)]',
        )}
      >
        <span className="text-[clamp(1.75rem,5.5vmin,3.25rem)] font-black text-[color:var(--publico-accent)]">
          {lugar}°
        </span>
        {fila ? (
          <>
            <PodioNombreProyector nombre={fila.nombre_completo} destacado={!!alto} />
            <p className="mt-[clamp(0.5rem,1.5dvh,1rem)] text-[clamp(1.25rem,4vmin,2.5rem)] font-bold text-[var(--publico-text-heading)]">
              {fila.puntaje_final}
            </p>
            <p className="text-[clamp(0.6rem,1.5vmin,0.75rem)] uppercase tracking-wider text-[var(--publico-text-muted)]">
              puntos
            </p>
            {hayEmpate && (
              <p className="mt-[clamp(0.4rem,1.2dvh,0.6rem)] inline-block rounded-full bg-[color-mix(in_srgb,var(--publico-accent)_15%,transparent)] px-[clamp(0.5rem,1.5vmin,0.75rem)] py-[clamp(0.2rem,0.6dvh,0.3rem)] text-[clamp(0.5rem,1.2vmin,0.65rem)] font-medium text-[color-mix(in_srgb,var(--publico-accent)_75%,transparent)]">
                ⚔️ Desempate
              </p>
            )}
          </>
        ) : (
          <p className="mt-6 text-[var(--publico-placeholder-text)]">—</p>
        )}
      </div>
      <div
        className={`w-full rounded-b-xl bg-[var(--publico-podio-base)] transition-all duration-700 ${
          lugar === 1
            ? 'h-[clamp(2.5rem,6dvh,6rem)]'
            : lugar === 2
              ? 'h-[clamp(1.75rem,4dvh,3.75rem)]'
              : 'h-[clamp(1.35rem,3.2dvh,3rem)]'
        }`}
      />
    </div>
  )
}
