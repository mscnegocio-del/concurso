import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useJurado } from '@/hooks/useJurado'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Criterio = {
  id: string
  nombre: string
  puntaje_maximo: number
  orden: number
  es_criterio_desempate: boolean
}

type PartRow = { id: string; codigo: string; nombre_completo: string; completo: boolean }

const PUNTAJE_STEP = 0.5

function clampPuntaje(raw: number, max: number, step: number): number {
  if (!Number.isFinite(raw) || max <= 0) return 0
  const clamped = Math.min(max, Math.max(0, raw))
  const k = Math.round(clamped / step)
  return Math.min(max, Math.max(0, k * step))
}

export function JuradoCalificarPage() {
  const { categoriaId, participanteId } = useParams<{
    categoriaId: string
    participanteId: string
  }>()
  const { session } = useJurado()
  const navigate = useNavigate()
  const [criterios, setCriterios] = useState<Criterio[]>([])
  const [parts, setParts] = useState<PartRow[]>([])
  const [scores, setScores] = useState<Record<string, number>>({})
  const [estadoEvento, setEstadoEvento] = useState<string | null>(null)
  const [eventoId, setEventoId] = useState<string | null>(null)
  const [alertaCierre, setAlertaCierre] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const loadAll = useCallback(async () => {
    if (!session?.tokenSesion || !categoriaId || !participanteId) return
    setError(null)
    const { data: ses } = await supabase.rpc('jurado_resolver_sesion', {
      p_token: session.tokenSesion,
    })
    const row = ses?.[0] as { evento_estado: string; evento_id: string } | undefined
    setEstadoEvento(row?.evento_estado ?? null)
    if (row?.evento_id) setEventoId(row.evento_id)

    const { data: crit, error: e1 } = await supabase.rpc('jurado_listar_criterios', {
      p_token: session.tokenSesion,
    })
    if (e1) {
      setError(e1.message)
      return
    }
    setCriterios((crit ?? []) as Criterio[])

    const { data: prts, error: e2 } = await supabase.rpc('jurado_listar_participantes', {
      p_token: session.tokenSesion,
      p_categoria_id: categoriaId,
    })
    if (e2) {
      setError(e2.message)
      return
    }
    const list = (prts ?? []) as PartRow[]
    setParts(list)

    const idx = list.findIndex((p) => p.id === participanteId)
    for (let j = 0; j < idx; j++) {
      if (!list[j]?.completo) {
        navigate(`/jurado/panel/categoria/${categoriaId}`, { replace: true })
        return
      }
    }

    const { data: exist, error: e3 } = await supabase.rpc('jurado_obtener_mis_calificaciones', {
      p_token: session.tokenSesion,
      p_participante_id: participanteId,
    })
    if (e3) {
      setError(e3.message)
      return
    }
    const map: Record<string, number> = {}
    for (const r of exist ?? []) {
      const rrow = r as { criterio_id: string; puntaje: number }
      map[rrow.criterio_id] = Number(rrow.puntaje)
    }
    for (const c of (crit ?? []) as Criterio[]) {
      if (map[c.id] === undefined) map[c.id] = 0
    }
    setScores(map)
  }, [session?.tokenSesion, categoriaId, participanteId, navigate])

  useEffect(() => {
    queueMicrotask(() => {
      void loadAll()
    })
  }, [loadAll])

  // Realtime + polling para detectar cambios de estado del evento en tiempo real
  useEffect(() => {
    if (!eventoId) return

    const token = session?.tokenSesion
    const t = window.setInterval(async () => {
      if (!token) return
      const { data } = await supabase.rpc('jurado_resolver_sesion', { p_token: token })
      const r = data?.[0] as { evento_estado: string } | undefined
      if (r) setEstadoEvento(r.evento_estado)
    }, 10_000)

    const ch = supabase
      .channel(`jurado-calificar-evento-${eventoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'eventos', filter: `id=eq.${eventoId}` },
        (payload) => {
          const nuevo = (payload.new as { estado: string }).estado
          setEstadoEvento(nuevo)
          if (nuevo === 'cerrado') setAlertaCierre(true)
        },
      )
      .subscribe()

    return () => {
      window.clearInterval(t)
      void supabase.removeChannel(ch)
    }
  }, [eventoId, session?.tokenSesion])

  const puedeEditar = estadoEvento === 'calificando'

  const totalAcumulado = useMemo(() => {
    let t = 0
    for (const c of criterios) {
      const v = scores[c.id]
      if (v !== undefined && Number.isFinite(v)) t += v
    }
    return Math.round(t * 100) / 100
  }, [criterios, scores])

  const ajustarPuntaje = useCallback((criterioId: string, max: number, delta: number) => {
    if (!puedeEditar || max <= 0) return
    setScores((s) => {
      const cur = s[criterioId] ?? 0
      const next = clampPuntaje(cur + delta, max, PUNTAJE_STEP)
      return { ...s, [criterioId]: next }
    })
  }, [puedeEditar])

  const guardar = useCallback(async (): Promise<boolean> => {
    if (!session?.tokenSesion || !participanteId || !puedeEditar) return false
    for (const c of criterios) {
      const v = scores[c.id]
      if (v === undefined || Number.isNaN(v)) {
        setError('Completa todos los criterios.')
        return false
      }
    }
    setSaving(true)
    setError(null)
    try {
      for (const c of criterios) {
        const { error: e } = await supabase.rpc('jurado_guardar_calificacion', {
          p_token: session.tokenSesion,
          p_participante_id: participanteId,
          p_criterio_id: c.id,
          p_puntaje: scores[c.id] ?? 0,
        })
        if (e) {
          setError(e.message)
          return false
        }
      }
      navigate(`/jurado/panel/categoria/${categoriaId}`)
      return true
    } finally {
      setSaving(false)
    }
  }, [session?.tokenSesion, participanteId, puedeEditar, criterios, scores, navigate, categoriaId])

  function solicitarConfirmacion() {
    for (const c of criterios) {
      const v = scores[c.id]
      if (v === undefined || Number.isNaN(v)) {
        setError('Completa todos los criterios.')
        return
      }
    }
    setError(null)
    setConfirmOpen(true)
  }

  if (!session || !categoriaId || !participanteId) return null

  const pNombre = parts.find((p) => p.id === participanteId)?.nombre_completo ?? ''

  return (
    <>
    <Card>
      <CardHeader>
        <Button variant="link" className="h-auto w-fit p-0" asChild>
          <Link to={`/jurado/panel/categoria/${categoriaId}`}>← Lista de participantes</Link>
        </Button>
        <CardTitle className="mt-2">{pNombre}</CardTitle>
        {criterios.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Tu total para este participante:{' '}
            <span className="font-semibold tabular-nums text-foreground">{totalAcumulado}</span> puntos
          </p>
        )}
      </CardHeader>
      <CardContent>
        {!puedeEditar && (
          <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTitle>Calificación no editable</AlertTitle>
            <AlertDescription className="mt-2 text-sm">
              {estadoEvento === 'abierto' ? (
                <>
                  <strong>Calificación aún no iniciada.</strong> En estado <strong>abierto</strong> puedes
                  entrar y ver participantes, pero las barras y notas se habilitan cuando el{' '}
                  <strong>administrador</strong>, en <span className="whitespace-nowrap">Admin → Evento</span>,
                  pulse <strong>Iniciar calificación</strong> (el evento pasará a{' '}
                  <strong>calificando</strong>).
                </>
              ) : estadoEvento === 'cerrado' || estadoEvento === 'publicado' ? (
                <>
                  Las notas están <strong>bloqueadas</strong>: el evento está en{' '}
                  <strong>{estadoEvento}</strong>. Si hubo un error, el administrador debe reabrir el flujo
                  según las reglas del concurso.
                </>
              ) : (
                <>
                  Solo puedes editar notas cuando el evento está en <strong>calificando</strong>. Estado
                  actual: <strong>{estadoEvento ?? '—'}</strong>.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-5">
          {criterios.map((c) => {
            const max = Number(c.puntaje_maximo)
            const val = scores[c.id] ?? 0
            const fillPct = max > 0 ? Math.min(100, Math.max(0, (val / max) * 100)) : 0
            const atMin = val <= 0
            const atMax = val >= max

            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-xl border border-border bg-card/60 p-4 shadow-sm',
                  !puedeEditar && 'opacity-90',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <Label htmlFor={`jurado-range-${c.id}`} className="text-base font-medium text-foreground">
                    {c.nombre}
                  </Label>
                  <span className="shrink-0 text-muted-foreground">Máx. {c.puntaje_maximo}</span>
                </div>

                <p
                  className="mt-3 text-center text-2xl font-semibold tabular-nums tracking-tight text-foreground"
                  aria-live="polite"
                >
                  {val}
                </p>

                <div
                  className="jurado-range-touch"
                  style={{ ['--jurado-range-fill' as string]: `${fillPct}%` }}
                >
                  <input
                    id={`jurado-range-${c.id}`}
                    type="range"
                    min={0}
                    max={max}
                    step={PUNTAJE_STEP}
                    disabled={!puedeEditar}
                    value={val}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      setScores((s) => ({
                        ...s,
                        [c.id]: clampPuntaje(n, max, PUNTAJE_STEP),
                      }))
                    }}
                    className="jurado-calificacion-range"
                    aria-valuetext={`${val} de ${max}`}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-stretch gap-2 sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-h-12 min-w-12 shrink-0 px-0 text-lg"
                    disabled={!puedeEditar || atMin}
                    aria-label={`Restar ${PUNTAJE_STEP} en ${c.nombre}`}
                    onClick={() => ajustarPuntaje(c.id, max, -PUNTAJE_STEP)}
                  >
                    −
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    step={PUNTAJE_STEP}
                    disabled={!puedeEditar}
                    value={val}
                    className="min-h-12 w-full min-w-0 flex-1 text-center text-base tabular-nums sm:w-28 sm:flex-none"
                    inputMode="decimal"
                    onChange={(e) => {
                      const raw = Number(e.target.value)
                      setScores((s) => ({
                        ...s,
                        [c.id]: clampPuntaje(raw, max, PUNTAJE_STEP),
                      }))
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="min-h-12 min-w-12 shrink-0 px-0 text-lg"
                    disabled={!puedeEditar || atMax}
                    aria-label={`Sumar ${PUNTAJE_STEP} en ${c.nombre}`}
                    onClick={() => ajustarPuntaje(c.id, max, PUNTAJE_STEP)}
                  >
                    +
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
        {puedeEditar && (
          <>
            <Button
              type="button"
              className="mt-8 w-full"
              size="lg"
              disabled={saving}
              onClick={solicitarConfirmacion}
            >
              Confirmar calificación
            </Button>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Confirmar tus notas?</AlertDialogTitle>
                  <AlertDialogDescription className="text-left">
                    Revisa antes de guardar. El total que estás asignando a este participante es{' '}
                    <strong className="text-foreground tabular-nums">{totalAcumulado}</strong> puntos (suma de
                    criterios). Después de guardar volverás a la lista de participantes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={saving}>Volver a revisar</AlertDialogCancel>
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      void (async () => {
                        const ok = await guardar()
                        if (!ok) setConfirmOpen(false)
                      })()
                    }}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                        Guardando…
                      </>
                    ) : (
                      'Sí, guardar'
                    )}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>

    {/* Alerta en tiempo real cuando el evento es cerrado por el admin/coordinador */}
    <AlertDialog open={alertaCierre}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Calificación cerrada</AlertDialogTitle>
          <AlertDialogDescription>
            El administrador ha cerrado la calificación. Tus notas quedaron guardadas y ya no pueden modificarse.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => setAlertaCierre(false)}>
            Entendido
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
