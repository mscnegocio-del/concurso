import { ArrowRight, CalendarCheck2, CalendarDays, Copy, Crown, MonitorPlay, Sparkles, Trophy, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { copyText } from '@/lib/clipboard'
import { maxJuradosPorPlan, normalizarPlan, puedeExportarPdf } from '@/lib/planes'
import { supabase } from '@/lib/supabase'

type EventoLista = {
  id: string
  nombre: string
  fecha: string
  estado: string
  codigo_acceso: string
  created_at: string
}

const ESTADOS_ACTIVOS = new Set(['abierto', 'calificando'])
const ESTADOS_REALIZADOS = new Set(['cerrado', 'publicado'])

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  abierto: 'Abierto',
  calificando: 'Calificando',
  cerrado: 'Cerrado',
  publicado: 'Publicado',
}

const PLAN_LABEL: Record<string, string> = {
  gratuito: 'Gratuito',
  basico: 'Básico',
  institucional: 'Institucional',
}

function formatFechaLarga(fecha: string): string {
  try {
    return new Date(fecha + 'T00:00:00').toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return fecha
  }
}

export function AdminDashboardPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const [orgNombre, setOrgNombre] = useState<string>('')
  const [orgPlan, setOrgPlan] = useState<string>('gratuito')
  const [eventos, setEventos] = useState<EventoLista[]>([])
  const [totalJurados, setTotalJurados] = useState<number | null>(null)
  const [totalParticipantes, setTotalParticipantes] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setError(null)

    const { data: org, error: e0 } = await supabase
      .from('organizaciones')
      .select('nombre, plan')
      .eq('id', orgId)
      .maybeSingle()
    if (e0) setError(e0.message)
    else {
      setOrgNombre((org as { nombre?: string })?.nombre ?? '')
      setOrgPlan((org as { plan?: string })?.plan ?? 'gratuito')
    }

    const { data, error: e } = await supabase
      .from('eventos')
      .select('id, nombre, fecha, estado, codigo_acceso, created_at')
      .eq('organizacion_id', orgId)
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    else setEventos((data ?? []) as EventoLista[])

    const eventoIds = ((data ?? []) as EventoLista[]).map((x) => x.id)
    if (eventoIds.length === 0) {
      setTotalJurados(0)
      setTotalParticipantes(0)
      return
    }

    const { count: juradosCount } = await supabase
      .from('jurados')
      .select('id', { count: 'exact', head: true })
      .in('evento_id', eventoIds)
    setTotalJurados(juradosCount ?? 0)

    const { data: cats } = await supabase
      .from('categorias')
      .select('id')
      .in('evento_id', eventoIds)
    const catIds = (cats ?? []).map((c: { id: string }) => c.id)
    if (catIds.length === 0) {
      setTotalParticipantes(0)
    } else {
      const { count: partCount } = await supabase
        .from('participantes')
        .select('id', { count: 'exact', head: true })
        .in('categoria_id', catIds)
      setTotalParticipantes(partCount ?? 0)
    }
  }, [orgId])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await load()
      setLoading(false)
    })()
  }, [load])

  async function copiarCodigoAcceso(codigo: string) {
    const ok = await copyText(codigo)
    if (ok) toast.success('Código copiado')
    else toast.error('No se pudo copiar al portapapeles')
  }

  if (!perfil) return null

  if (!orgId) {
    return (
      <SimplePanel>
        <p className="text-muted-foreground">Sin organización asignada.</p>
      </SimplePanel>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3 max-w-md" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  const eventoActivo = eventos.find((e) => ESTADOS_ACTIVOS.has(e.estado)) ?? null
  const eventosRealizados = eventos.filter((e) => ESTADOS_REALIZADOS.has(e.estado))
  const ultimoRealizado = eventosRealizados[0] ?? null
  const planNorm = normalizarPlan(orgPlan)
  const maxJur = maxJuradosPorPlan(orgPlan)
  const permitePdf = puedeExportarPdf(orgPlan)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Panel de control</h2>
        <p className="mt-1 text-muted-foreground">
          Organización: <span className="font-medium text-foreground">{orgNombre || '—'}</span>
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 1. Evento activo */}
        <SimplePanel>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Evento activo</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Solo eventos en curso (abierto o calificando).
              </p>
            </div>
          </div>

          {eventoActivo ? (
            <div className="mt-4 space-y-3">
              <div>
                <p className="font-medium text-foreground">{eventoActivo.nombre}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="default" className="font-normal">
                    {ESTADO_LABEL[eventoActivo.estado] ?? eventoActivo.estado}
                  </Badge>
                  <span>{formatFechaLarga(eventoActivo.fecha)}</span>
                  <span className="inline-flex items-center gap-0.5">
                    <span className="font-mono text-foreground">{eventoActivo.codigo_acceso}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label="Copiar código de acceso"
                      onClick={() => void copiarCodigoAcceso(eventoActivo.codigo_acceso)}
                    >
                      <Copy className="size-3.5" aria-hidden />
                    </Button>
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link to={`/admin/evento/${eventoActivo.id}`}>Gestionar</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/admin/coordinacion">
                    <MonitorPlay className="size-4" /> Panel en vivo
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm">
              <p className="text-muted-foreground">
                No hay eventos en curso actualmente.
              </p>
              <Button size="sm" variant="outline" className="mt-3" asChild>
                <Link to="/admin/historial">
                  Crear evento <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          )}
        </SimplePanel>

        {/* 2. Resumen de eventos */}
        <SimplePanel>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CalendarCheck2 className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Resumen de eventos</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Actividad histórica de la organización.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{eventos.length}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Realizados</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{eventosRealizados.length}</p>
            </div>
          </div>

          {ultimoRealizado ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Último realizado</p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <CalendarDays className="size-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{ultimoRealizado.nombre}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatFechaLarga(ultimoRealizado.fecha)}</p>
            </div>
          ) : (
            <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
              Aún no hay eventos cerrados.
            </p>
          )}

          <Button size="sm" variant="link" className="mt-2 h-auto px-0" asChild>
            <Link to="/admin/historial">
              Ver historial <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </SimplePanel>

        {/* 3. Participantes y jurados */}
        <SimplePanel>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Users className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Participantes y jurados</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Acumulado en todos los eventos de la org.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Participantes</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-foreground">{totalParticipantes ?? '—'}</span>
                <Trophy className="size-4 text-muted-foreground" />
              </p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Jurados</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold text-foreground">{totalJurados ?? '—'}</span>
                <Users className="size-4 text-muted-foreground" />
              </p>
            </div>
          </div>
        </SimplePanel>

        {/* 4. Plan actual */}
        <SimplePanel>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Crown className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Plan actual</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Gestionado por super admin.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {PLAN_LABEL[planNorm] ?? planNorm}
              </p>
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-foreground/40" />
                Jurados por evento:{' '}
                <span className="font-medium text-foreground">
                  {maxJur != null ? `máx. ${maxJur}` : 'ilimitado'}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-foreground/40" />
                Exportación PDF:{' '}
                <span className="font-medium text-foreground">{permitePdf ? 'Sí' : 'No'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-foreground/40" />
                Exportación Excel:{' '}
                <span className="font-medium text-foreground">Sí</span>
              </li>
            </ul>
          </div>
        </SimplePanel>
      </div>
    </div>
  )
}
