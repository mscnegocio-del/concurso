import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  abierto: 'Abierto',
  calificando: 'Calificando',
  cerrado: 'Cerrado',
  publicado: 'Publicado',
}

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  borrador: 'secondary',
  abierto: 'default',
  calificando: 'default',
  cerrado: 'outline',
  publicado: 'outline',
}

function formatFechaRelativa(fecha: string, today: string): string {
  const d = new Date(fecha + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  const diffMs = d.getTime() - t.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  const fechaLocal = d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' })

  if (diffDays === 0) return `Hoy — ${fechaLocal}`
  if (diffDays === 1) return `Mañana — ${fechaLocal}`
  return `En ${diffDays} días — ${fechaLocal}`
}

function EventoCard({
  evento,
  today,
  destacado,
}: {
  evento: EventoRow
  today: string
  destacado?: boolean
}) {
  const navigate = useNavigate()

  async function copiarCodigo() {
    await copyText(evento.codigo_acceso)
    toast.success('Código copiado')
  }

  return (
    <Card className={destacado ? 'border-primary shadow-md' : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{evento.nombre}</CardTitle>
          <Badge variant={ESTADO_VARIANT[evento.estado] ?? 'secondary'} className="shrink-0">
            {ESTADO_LABEL[evento.estado] ?? evento.estado}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{formatFechaRelativa(evento.fecha, today)}</p>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-0">
        <button
          type="button"
          onClick={() => void copiarCodigo()}
          className="flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          title="Copiar código de acceso"
        >
          {evento.codigo_acceso}
          <Copy className="h-3 w-3" />
        </button>
        <Button size="sm" onClick={() => navigate(`/administrador/evento/${evento.id}`)}>
          Coordinar →
        </Button>
      </CardContent>
    </Card>
  )
}

export function AdministradorInicioPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const [eventos, setEventos] = useState<EventoRow[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const cargar = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const { data } = await supabase
      .from('eventos')
      .select('id, nombre, fecha, estado, codigo_acceso')
      .eq('organizacion_id', orgId)
      .gte('fecha', today)
      .order('fecha', { ascending: true })
    setEventos((data as EventoRow[]) ?? [])
    setLoading(false)
  }, [orgId, today])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const eventoHoy = eventos.filter((e) => e.fecha === today)
  const proximos = eventos.filter((e) => e.fecha > today)

  if (!orgId) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Eventos</h2>
        {!loading && eventos.length > 0 && (
          <span className="text-sm text-muted-foreground">{eventos.length} próximo{eventos.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : eventos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-muted-foreground">No hay eventos programados</p>
            <p className="mt-1 text-sm text-muted-foreground/70">El administrador debe crear un evento.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {eventoHoy.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">Hoy</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {eventoHoy.map((e) => (
                  <EventoCard key={e.id} evento={e} today={today} destacado />
                ))}
              </div>
            </section>
          )}

          {proximos.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Próximos</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {proximos.map((e) => (
                  <EventoCard key={e.id} evento={e} today={today} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
