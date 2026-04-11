import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useJurado } from '@/hooks/useJurado'
import { supabase } from '@/lib/supabase'

type Criterio = {
  id: string
  nombre: string
  puntaje_maximo: number
  orden: number
  es_criterio_desempate: boolean
}

type PartRow = { id: string; codigo: string; nombre_completo: string; completo: boolean }

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
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadAll = useCallback(async () => {
    if (!session?.tokenSesion || !categoriaId || !participanteId) return
    setError(null)
    const { data: ses } = await supabase.rpc('jurado_resolver_sesion', {
      p_token: session.tokenSesion,
    })
    const row = ses?.[0] as { evento_estado: string } | undefined
    setEstadoEvento(row?.evento_estado ?? null)

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

  const puedeEditar = estadoEvento === 'calificando'

  async function guardar() {
    if (!session?.tokenSesion || !participanteId || !puedeEditar) return
    for (const c of criterios) {
      const v = scores[c.id]
      if (v === undefined || Number.isNaN(v)) {
        setError('Completa todos los criterios.')
        return
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
          return
        }
      }
      navigate(`/jurado/panel/categoria/${categoriaId}`)
    } finally {
      setSaving(false)
    }
  }

  if (!session || !categoriaId || !participanteId) return null

  const pNombre = parts.find((p) => p.id === participanteId)?.nombre_completo ?? ''

  return (
    <Card>
      <CardHeader>
        <Button variant="link" className="h-auto w-fit p-0" asChild>
          <Link to={`/jurado/panel/categoria/${categoriaId}`}>← Lista de participantes</Link>
        </Button>
        <CardTitle className="mt-2">{pNombre}</CardTitle>
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
        <div className="space-y-6">
          {criterios.map((c) => (
            <div key={c.id}>
              <div className="flex justify-between text-sm">
                <Label className="text-foreground">{c.nombre}</Label>
                <span className="text-muted-foreground">Máx. {c.puntaje_maximo}</span>
              </div>
              <input
                type="range"
                min={0}
                max={c.puntaje_maximo}
                step={0.5}
                disabled={!puedeEditar}
                value={scores[c.id] ?? 0}
                onChange={(e) =>
                  setScores((s) => ({ ...s, [c.id]: Number(e.target.value) }))
                }
                className="mt-2 w-full accent-primary"
              />
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={c.puntaje_maximo}
                  step={0.5}
                  disabled={!puedeEditar}
                  value={scores[c.id] ?? 0}
                  className="w-28"
                  onChange={(e) =>
                    setScores((s) => ({ ...s, [c.id]: Number(e.target.value) }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
        {puedeEditar && (
          <Button
            type="button"
            className="mt-8 w-full"
            size="lg"
            disabled={saving}
            onClick={() => void guardar()}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              'Confirmar calificación'
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
