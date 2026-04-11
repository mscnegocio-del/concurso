import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
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

type Publicado = { categoria_id: string; publicado_at: string }

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

const POLL_MS = 5000

const PUBLICO_ESCALA_MIN = 0.22

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
    const pad = 12
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
      className="box-border flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden overscroll-none p-2 sm:p-3"
    >
      <div
        ref={scaleBoxRef}
        className="will-change-transform"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function PublicoEventoPage() {
  const { eventoSlug } = useParams<{ eventoSlug: string }>()
  const codigo = (eventoSlug ?? '').trim()
  const [header, setHeader] = useState<EventoHeader | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [progreso, setProgreso] = useState<ProgresoFila[]>([])
  const [publicados, setPublicados] = useState<Publicado[]>([])
  const [podio, setPodio] = useState<PodioFila[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const prevPubCount = useRef(0)

  const cargar = useCallback(async () => {
    if (!codigo) return
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

    if (list.length > prevPubCount.current && prevPubCount.current > 0) {
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
    setLastSyncedAt(new Date())
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

  const pctGlobal = useMemo(() => {
    const reg = progreso.reduce((a, r) => a + Number(r.calificaciones_registradas), 0)
    const esp = progreso.reduce((a, r) => a + Number(r.calificaciones_esperadas), 0)
    if (esp <= 0) return 0
    return Math.min(100, Math.round((reg / esp) * 100))
  }, [progreso])

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

  return (
    <main className="fixed inset-0 z-10 flex h-[100dvh] max-h-[100dvh] w-screen flex-col overflow-hidden overscroll-none bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <PublicoEscaladoViewport
        layoutRevision={
          (lastSyncedAt?.getTime() ?? 0) +
          progreso.length * 17 +
          podio.length * 31 +
          publicados.length * 13
        }
      >
        <div className="publico-display mx-auto flex w-full max-w-7xl min-w-0 flex-col px-4 py-4 sm:px-8 sm:py-6 md:px-10 md:py-8">
          <header className="flex flex-shrink-0 flex-col items-center gap-4 text-center sm:gap-5 md:flex-row md:items-start md:justify-between md:gap-6 md:text-left">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-center">
            {header.logo_url ? (
              <img
                src={header.logo_url}
                alt=""
                className="h-20 w-auto max-w-[200px] object-contain md:h-28"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-bold text-slate-500 md:h-28 md:w-28 md:text-3xl">
                PJ
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500 md:text-sm">{header.org_nombre}</p>
              <h1 className="mt-2 text-3xl font-bold leading-tight md:text-5xl lg:text-6xl">{header.nombre}</h1>
              <p className="mt-2 text-slate-400 md:text-lg">
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
            {lastSyncedAt && (
              <Badge
                variant="outline"
                className="border-slate-600 bg-slate-900/60 font-normal text-slate-300"
              >
                Actualizado{' '}
                {lastSyncedAt.toLocaleTimeString('es-PE', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </Badge>
            )}
          {finalizado && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-3 text-center md:text-right">
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-200">Concurso finalizado</p>
              <p className="mt-1 text-sm text-amber-100/90">Gracias por participar</p>
            </div>
          )}
          </div>
          </header>

          <section className="mt-6 grid grid-cols-1 gap-6 lg:mt-8 lg:grid-cols-2 lg:gap-8 xl:gap-10">
            <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-200 md:text-2xl">En curso</h2>
            <p className="mt-1 text-sm text-slate-500">Progreso de calificaciones (sin mostrar notas hasta la publicación).</p>
            <div className="mt-6 h-5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-700"
                style={{ width: `${pctGlobal}%` }}
              />
            </div>
            <p className="mt-3 text-center text-2xl font-semibold text-slate-200 md:text-3xl">{pctGlobal}%</p>

            <ul className="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
              {progreso.map((r) => {
                const esp = Number(r.calificaciones_esperadas)
                const reg = Number(r.calificaciones_registradas)
                const p = esp > 0 ? Math.min(100, Math.round((reg / esp) * 100)) : 0
                return (
                  <li key={r.categoria_id} className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
                    <div className="flex justify-between gap-4 text-sm md:text-base">
                      <span className="font-medium text-slate-200">{r.categoria_nombre}</span>
                      <span className="text-slate-500">
                        {reg}/{esp}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-slate-600" style={{ width: `${p}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
            </div>

            <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-200 md:text-2xl">Última revelación</h2>
            {nombreUltimaCategoria && (
              <p className="mt-2 text-lg font-medium text-indigo-200 md:text-xl">{nombreUltimaCategoria}</p>
            )}
            <p className="mt-1 text-sm text-slate-500">
              Solo se muestran puntajes de categorías ya publicadas por coordinación.
            </p>

            {publicados.length > 0 && podio.length === 0 ? (
              <p className="mt-10 text-center text-amber-200/90 md:text-lg">
                La categoría ya está publicada, pero el podio aún no tiene filas. Actualiza esta página; si sigue
                igual, en Supabase aplica las migraciones recientes de{' '}
                <code className="rounded bg-slate-800 px-1">publico_podio_categoria</code> y comprueba que el
                evento tenga <strong>puestos a premiar</strong> 2 o 3.
              </p>
            ) : podio.length === 0 ? (
              <p className="mt-10 text-center text-slate-500 md:text-lg">
                Aún no hay resultados publicados. Mantén esta pantalla visible.
              </p>
            ) : (
              <div className="mt-8 flex items-end justify-center gap-3 md:gap-6">
                <PodioSlot lugar={2} fila={filaPodio(podio, 2)} puestos={puestosPodio} />
                <PodioSlot lugar={1} fila={filaPodio(podio, 1)} puestos={puestosPodio} alto />
                <PodioSlot lugar={3} fila={filaPodio(podio, 3)} puestos={puestosPodio} />
              </div>
            )}
            </div>
          </section>
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
    ? 'h-[5.5rem] md:h-[6.75rem] lg:h-28'
    : 'h-[4rem] md:h-[5rem] lg:h-24'

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
        'relative mt-2 w-full max-w-[11rem] overflow-hidden md:max-w-[13rem] lg:max-w-[15rem]',
        trackH,
      )}
      aria-label={`Ganador: ${nombre}`}
    >
      <div
        ref={innerRef}
        className={cn(
          'px-0.5 text-center text-sm font-semibold leading-tight text-pretty break-words text-white md:text-base lg:text-lg',
          necesitaScroll
            ? 'publico-podium-name-scroll absolute inset-x-0 top-0'
            : 'absolute inset-x-0 top-1/2 -translate-y-1/2',
        )}
        style={
          necesitaScroll
            ? ({ '--publico-podium-dy': `-${excesoPx}px` } as React.CSSProperties)
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
}: {
  lugar: 1 | 2 | 3
  fila: PodioFila | undefined
  puestos: 2 | 3
  alto?: boolean
}) {
  if (puestos < lugar) {
    return <div className="w-[28%] max-w-[220px]" aria-hidden />
  }
  const h = alto ? 'min-h-[280px] md:min-h-[340px]' : 'min-h-[200px] md:min-h-[240px]'
  const orden = lugar === 1 ? 'order-2' : lugar === 2 ? 'order-1' : 'order-3'
  return (
    <div className={`flex w-[30%] max-w-[240px] flex-col items-center ${orden}`}>
      <div
        className={`flex w-full flex-col items-center justify-end rounded-t-2xl border border-slate-700 bg-slate-800/80 px-3 pb-6 pt-8 text-center ${h}`}
      >
        <span className="text-4xl font-black text-amber-300 md:text-5xl">{lugar}°</span>
        {fila ? (
          <>
            <p className="mt-3 rounded-md bg-slate-950/50 px-2.5 py-1 font-mono text-sm font-bold tracking-wide text-amber-200 md:mt-4 md:text-base">
              N.º {fila.codigo}
            </p>
            <PodioNombreProyector nombre={fila.nombre_completo} destacado={!!alto} />
            <p className="mt-3 text-3xl font-bold text-white md:text-4xl">{fila.puntaje_final}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">puntos</p>
          </>
        ) : (
          <p className="mt-6 text-slate-600">—</p>
        )}
      </div>
      <div
        className={`w-full rounded-b-xl bg-slate-700 ${lugar === 1 ? 'h-16 md:h-24' : lugar === 2 ? 'h-10 md:h-14' : 'h-8 md:h-12'}`}
      />
    </div>
  )
}
