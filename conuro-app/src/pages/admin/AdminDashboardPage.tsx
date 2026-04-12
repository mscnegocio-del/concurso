import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { registrarAuditoria } from '@/lib/audit'
import { getStoredEventoFoco } from '@/lib/admin-evento-foco'
import { crearEventoBorrador } from '@/lib/crear-evento-borrador'
import { maxJuradosPorPlan } from '@/lib/planes'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type EventoLista = {
  id: string
  nombre: string
  fecha: string
  estado: string
  codigo_acceso: string
  created_at: string
}

export function AdminDashboardPage() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const orgId = perfil?.organizacionId
  const [orgNombre, setOrgNombre] = useState<string>('')
  const [orgPlan, setOrgPlan] = useState<string>('gratuito')
  const [eventos, setEventos] = useState<EventoLista[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const focoId = orgId ? getStoredEventoFoco(orgId) : null

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
      .limit(12)
    if (e) setError(e.message)
    else setEventos((data ?? []) as EventoLista[])
  }, [orgId])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await load()
      setLoading(false)
    })()
  }, [load])

  async function onCrearRapido(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!orgId || !perfil) return
    setCreateErr(null)
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const fecha = String(fd.get('fecha') ?? '')
    const puestos = Number(fd.get('puestos') ?? 3) === 2 ? 2 : 3
    setCreateBusy(true)
    try {
      const { data, error: errMsg } = await crearEventoBorrador(supabase, {
        orgId,
        nombre,
        fecha,
        puestos,
      })
      if (errMsg || !data) {
        setCreateErr(errMsg ?? 'Error')
        return
      }
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: data.id,
        usuarioId: perfil.id,
        accion: 'evento_creado',
        detalle: { nombre: data.nombre },
      })
      navigate(`/admin/evento/${data.id}`)
    } finally {
      setCreateBusy(false)
    }
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
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const enFoco = focoId ? eventos.find((x) => x.id === focoId) ?? eventos[0] : eventos[0]
  const recientes = eventos.slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Inicio</h2>
        <p className="mt-1 text-muted-foreground">
          Organización: <span className="font-medium text-foreground">{orgNombre || '—'}</span>
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SimplePanel>
        <h3 className="text-lg font-semibold text-foreground">Evento en foco</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Es el evento que usas para gestión, sala/TV y coordinación. Se recuerda en este navegador.
        </p>
        {enFoco ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{enFoco.nombre}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <Badge variant="secondary" className="mr-2 font-normal">
                    {enFoco.estado}
                  </Badge>
                  Fecha: {enFoco.fecha} · Código:{' '}
                  <span className="font-mono text-foreground">{enFoco.codigo_acceso}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to={`/admin/evento/${enFoco.id}`}>Abrir gestión</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/admin/coordinacion">Coordinación de sala</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No hay eventos todavía. Crea uno con el formulario de abajo o desde el historial.
          </p>
        )}
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-lg font-semibold text-foreground">Crear evento nuevo</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Borrador en blanco (categorías y criterios los configuras después).
          {maxJuradosPorPlan(orgPlan) != null && (
            <span className="text-amber-800 dark:text-amber-200">
              {' '}
              Plan gratuito: máximo {maxJuradosPorPlan(orgPlan)} jurados por evento.
            </span>
          )}
        </p>
        {createErr && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{createErr}</AlertDescription>
          </Alert>
        )}
        <form className="mt-4 flex max-w-lg flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={(e) => void onCrearRapido(e)}>
          <div className="min-w-[10rem] flex-1 space-y-2">
            <Label htmlFor="dash-nombre">Nombre</Label>
            <Input id="dash-nombre" name="nombre" required placeholder="Nombre del concurso" />
          </div>
          <div className="w-full min-w-[8rem] space-y-2 sm:w-40">
            <Label htmlFor="dash-fecha">Fecha</Label>
            <Input id="dash-fecha" name="fecha" type="date" required />
          </div>
          <div className="w-full min-w-[8rem] space-y-2 sm:w-36">
            <Label htmlFor="dash-puestos">Podio</Label>
            <select
              id="dash-puestos"
              name="puestos"
              defaultValue={3}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <option value={2}>2 puestos</option>
              <option value={3}>3 puestos</option>
            </select>
          </div>
          <Button type="submit" disabled={createBusy} className="w-full sm:w-auto">
            {createBusy ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                Creando…
              </>
            ) : (
              'Crear borrador'
            )}
          </Button>
        </form>
      </SimplePanel>

      <SimplePanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-foreground">Últimos eventos</h3>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/historial">Ver historial completo</Link>
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {recientes.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <span className="font-medium text-foreground">{r.nombre}</span>
                <span className="ml-2 text-muted-foreground">{r.fecha}</span>
                <Badge
                  variant="outline"
                  className={cn('ml-2 font-normal', r.id === focoId && 'border-primary text-primary')}
                >
                  {r.estado}
                  {r.id === focoId ? ' · foco' : ''}
                </Badge>
              </div>
              <Button variant="link" className="h-auto p-0" asChild>
                <Link to={`/admin/evento/${r.id}`}>Gestionar</Link>
              </Button>
            </li>
          ))}
        </ul>
        {recientes.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Aún no hay eventos en esta organización.</p>
        )}
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-sm font-semibold text-foreground">Accesos rápidos</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChild>
            <Link to="/admin/organizacion">Organización y logos</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/admin/coordinacion">Coordinación de sala</Link>
          </Button>
        </div>
      </SimplePanel>
    </div>
  )
}
