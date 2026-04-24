import { ArrowRight, CalendarCheck2, CalendarClock, CalendarDays, Copy, MonitorPlay, Sparkles, Trophy, Users } from 'lucide-react'
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
import { supabase } from '@/lib/supabase'

type EventoRow = {
  id: string
  nombre: string
  fecha: string
  estado: string
  codigo_acceso: string
  puestos_a_premiar: number
}

type ProgresoFila = {
  categoria_id: string
  categoria_nombre: string
  total_participantes: number
  num_jurados: number
  calificaciones_registradas: number
  calificaciones_esperadas: number
  publicado?: boolean
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

export function AdministradorInicioPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const [eventoActivo, setEventoActivo] = useState<EventoRow | null>(null)
  const [ultimoRealizado, setUltimoRealizado] = useState<EventoRow | null>(null)
  const [progreso, setProgreso] = useState<ProgresoFila[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!orgId) return
    setError(null)

    const { data, error: e } = await supabase
      .from('eventos')
      .select('id, nombre, fecha, estado, codigo_acceso, puestos_a_premiar, created_at')
      .eq('organizacion_id', orgId)
      .order('created_at', { ascending: false })
    if (e) {
      setError(e.message)
      return
    }
    const lista = (data ?? []) as (EventoRow & { created_at: string })[]
    const activo = lista.find((x) => ESTADOS_ACTIVOS.has(x.estado)) ?? null
    const realizado = lista.find((x) => ESTADOS_REALIZADOS.has(x.estado)) ?? null
    setEventoActivo(activo)
    setUltimoRealizado(realizado)

    if (activo) {
      const { data: prog, error: ep } = await supabase.rpc('coordinador_progreso_evento', {
        p_evento_id: activo.id,
      })
      if (ep) setError(ep.message)
      else setProgreso((prog ?? []) as ProgresoFila[])
    } else {
      setProgreso([])
    }
  }, [orgId])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await cargar()
      setLoading(false)
    })()
  }, [cargar])

  async function copiarCodigo(codigo: string) {
    const ok = await copyText(codigo)
    if (ok) toast.success('Código copiado')
    else toast.error('No se pudo copiar')
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
        </div>
      </div>
    )
  }

  const totalCategorias = progreso.length
  const publicadas = progreso.filter((p) => p.publicado).length
  const totalParticipantes = progreso.reduce((acc, p) => acc + Number(p.total_participantes ?? 0), 0)
  const totalJurados = progreso[0]?.num_jurados ?? 0
  const totalEsperadas = progreso.reduce((acc, p) => acc + Number(p.calificaciones_esperadas ?? 0), 0)
  const totalRegistradas = progreso.reduce((acc, p) => acc + Number(p.calificaciones_registradas ?? 0), 0)
  const porcentajeAvance = totalEsperadas > 0 ? Math.round((totalRegistradas / totalEsperadas) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Panel de coordinación</h2>
        <p className="mt-1 text-muted-foreground">
          {perfil.nombreCompleto ? `Hola, ${perfil.nombreCompleto}.` : 'Bienvenido.'}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Evento activo con progreso */}
        <SimplePanel className="sm:col-span-2">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Evento activo</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Solo eventos en curso.</p>
            </div>
          </div>

          {eventoActivo ? (
            <div className="mt-4 space-y-4">
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
                      aria-label="Copiar código"
                      onClick={() => void copiarCodigo(eventoActivo.codigo_acceso)}
                    >
                      <Copy className="size-3.5" aria-hidden />
                    </Button>
                  </span>
                </div>
              </div>

              {totalEsperadas > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Avance de calificaciones</span>
                    <span className="font-medium text-foreground">
                      {totalRegistradas}/{totalEsperadas} · {porcentajeAvance}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${porcentajeAvance}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link to={`/administrador/evento/${eventoActivo.id}`}>
                    <MonitorPlay className="size-4" /> Ir al panel en vivo
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm">
              <p className="text-muted-foreground">
                No hay eventos en curso. El administrador debe abrir un evento para empezar a coordinar.
              </p>
              {ultimoRealizado && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Último realizado: <span className="font-medium text-foreground">{ultimoRealizado.nombre}</span>
                </p>
              )}
            </div>
          )}
        </SimplePanel>

        {/* 2. Categorías publicadas */}
        <SimplePanel>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CalendarCheck2 className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Categorías publicadas</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Resultados revelados al público.</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold text-foreground">{publicadas}</span>
              <span className="text-lg text-muted-foreground">/ {totalCategorias}</span>
            </p>
            {totalCategorias > 0 && (
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round((publicadas / totalCategorias) * 100)}%` }}
                />
              </div>
            )}
            {totalCategorias === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Sin categorías configuradas.</p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Trophy className="size-3.5" />
              <span>
                <span className="font-semibold text-foreground">{totalParticipantes}</span> participantes
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-3.5" />
              <span>
                <span className="font-semibold text-foreground">{totalJurados}</span> jurados
              </span>
            </div>
          </div>
        </SimplePanel>

        {/* 3. Acciones rápidas */}
        <SimplePanel className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <CalendarDays className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">Acciones rápidas</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Accesos directos.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {eventoActivo && (
              <Button variant="outline" className="justify-between" asChild>
                <Link to={`/administrador/evento/${eventoActivo.id}`}>
                  <span className="flex items-center gap-2">
                    <MonitorPlay className="size-4" /> Panel en vivo
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
            <Button variant="outline" className="justify-between" asChild>
              <Link to="/administrador/historial">
                <span className="flex items-center gap-2">
                  <CalendarClock className="size-4" /> Historial de eventos
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {eventoActivo && (
              <Button variant="outline" className="justify-between" asChild>
                <Link to={`/publico/${eventoActivo.codigo_acceso}`} target="_blank" rel="noreferrer">
                  <span className="flex items-center gap-2">
                    <Sparkles className="size-4" /> Abrir pantalla pública
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </SimplePanel>
      </div>
    </div>
  )
}
