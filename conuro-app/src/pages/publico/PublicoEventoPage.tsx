import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { playRevealChime } from '@/lib/sound'
import { supabase } from '@/lib/supabase'

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

const POLL_MS = 5000

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
      const { data: pod } = await supabase.rpc('publico_podio_categoria', {
        p_codigo: codigo,
        p_categoria_id: ultima.categoria_id,
      })
      setPodio((pod ?? []) as PodioFila[])
    } else {
      setPodio([])
    }
    setLastSyncedAt(new Date())
  }, [codigo])

  useEffect(() => {
    prevPubCount.current = 0
  }, [codigo])

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
    <main className="min-h-dvh bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="publico-display mx-auto flex min-h-dvh max-w-7xl flex-col px-6 py-10 md:px-12 md:py-14">
        <header className="flex flex-col items-center gap-6 text-center md:flex-row md:items-start md:justify-between md:text-left">
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

        <section className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <h2 className="text-xl font-semibold text-slate-200 md:text-2xl">En curso</h2>
            <p className="mt-1 text-sm text-slate-500">Progreso de calificaciones (sin mostrar notas hasta la publicación).</p>
            <div className="mt-6 h-5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-700"
                style={{ width: `${pctGlobal}%` }}
              />
            </div>
            <p className="mt-3 text-center text-2xl font-semibold text-slate-200 md:text-3xl">{pctGlobal}%</p>

            <ul className="mt-8 space-y-3">
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

          <div>
            <h2 className="text-xl font-semibold text-slate-200 md:text-2xl">Última revelación</h2>
            {nombreUltimaCategoria && (
              <p className="mt-2 text-lg font-medium text-indigo-200 md:text-xl">{nombreUltimaCategoria}</p>
            )}
            <p className="mt-1 text-sm text-slate-500">
              Solo se muestran puntajes de categorías ya publicadas por coordinación.
            </p>

            {podio.length === 0 ? (
              <p className="mt-10 text-center text-slate-500 md:text-lg">
                Aún no hay resultados publicados. Mantén esta pantalla visible.
              </p>
            ) : (
              <div className="mt-8 flex items-end justify-center gap-3 md:gap-6">
                <PodioSlot lugar={2} fila={podio.find((x) => x.puesto === 2)} puestos={header.puestos_a_premiar} />
                <PodioSlot lugar={1} fila={podio.find((x) => x.puesto === 1)} puestos={header.puestos_a_premiar} alto />
                <PodioSlot lugar={3} fila={podio.find((x) => x.puesto === 3)} puestos={header.puestos_a_premiar} />
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
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
  puestos: number
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
            <p className="mt-4 text-lg font-semibold leading-snug md:text-2xl">{fila.nombre_completo}</p>
            <p className="mt-2 font-mono text-sm text-slate-500">{fila.codigo}</p>
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
