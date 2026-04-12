import { Copy, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { registrarAuditoria } from '@/lib/audit'
import { getStoredEventoFoco, setStoredEventoFoco } from '@/lib/admin-evento-foco'
import { copyText } from '@/lib/clipboard'
import { crearEventoBorrador } from '@/lib/crear-evento-borrador'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Fila = {
  id: string
  nombre: string
  fecha: string
  estado: string
  codigo_acceso: string
  created_at: string
}

export function AdminHistorialPage() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const orgId = perfil?.organizacionId
  const focoId = orgId ? getStoredEventoFoco(orgId) : null
  const [rows, setRows] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cloneId, setCloneId] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [plantillasCriterios, setPlantillasCriterios] = useState<{ id: string; nombre_plantilla: string }[]>([])

  const load = useCallback(async () => {
    if (!orgId) return
    setError(null)
    const { data, error: e } = await supabase
      .from('eventos')
      .select('id, nombre, fecha, estado, codigo_acceso, created_at')
      .eq('organizacion_id', orgId)
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    else setRows((data ?? []) as Fila[])
  }, [orgId])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  useEffect(() => {
    if (!orgId) return
    void (async () => {
      const { data } = await supabase
        .from('plantillas_criterios')
        .select('id, nombre_plantilla')
        .eq('organizacion_id', orgId)
        .order('created_at', { ascending: false })
      setPlantillasCriterios((data ?? []) as { id: string; nombre_plantilla: string }[])
    })()
  }, [orgId])

  async function clonar(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const { data: newId, error: e } = await supabase.rpc('admin_clonar_evento', { p_evento_origen_id: id })
      if (e) {
        setError(e.message)
        return
      }
      const uuid = typeof newId === 'string' ? newId : null
      if (uuid && orgId) {
        setStoredEventoFoco(orgId, uuid)
        await load()
        navigate(`/admin/evento/${uuid}`)
        return
      }
      await load()
    } finally {
      setBusyId(null)
      setCloneId(null)
    }
  }

  function irAGestionar(id: string) {
    if (orgId) setStoredEventoFoco(orgId, id)
    navigate(`/admin/evento/${id}`)
  }

  async function copiarCodigoAcceso(codigo: string) {
    const ok = await copyText(codigo)
    if (ok) toast.success('Código copiado')
    else toast.error('No se pudo copiar al portapapeles')
  }

  async function onCrearNuevo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!orgId || !perfil) return
    setError(null)
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const fecha = String(fd.get('fecha') ?? '')
    const puestos = Number(fd.get('puestos') ?? 3) === 2 ? 2 : 3
    const plantillaId = String(fd.get('plantilla_criterios_id') ?? '').trim()
    setCreateBusy(true)
    try {
      const { data, error: errMsg } = await crearEventoBorrador(supabase, {
        orgId,
        nombre,
        fecha,
        puestos,
      })
      if (errMsg || !data) {
        setError(errMsg ?? 'Error al crear.')
        return
      }
      setStoredEventoFoco(orgId, data.id)
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: data.id,
        usuarioId: perfil.id,
        accion: 'evento_creado',
        detalle: { nombre: data.nombre, plantilla_criterios_id: plantillaId || null },
      })
      if (plantillaId) {
        const { error: rpcErr } = await supabase.rpc('admin_aplicar_plantilla_criterios', {
          p_evento_id: data.id,
          p_plantilla_id: plantillaId,
        })
        if (rpcErr) {
          toast.error(`Evento creado, pero no se pudo aplicar la plantilla: ${rpcErr.message}`)
        } else {
          await registrarAuditoria({
            organizacionId: orgId,
            eventoId: data.id,
            usuarioId: perfil.id,
            accion: 'evento_criterios_desde_plantilla',
            detalle: { plantilla_id: plantillaId, al_crear: true },
          })
        }
      }
      await load()
      navigate(`/admin/evento/${data.id}`)
    } finally {
      setCreateBusy(false)
    }
  }

  if (!perfil) return null

  return (
    <div className="space-y-6">
      <SimplePanel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Historial de eventos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Todos los eventos de tu organización. El marcador «en foco» es el que usa gestión, sala y coordinación
              en este navegador.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin">Inicio</Link>
          </Button>
        </div>

        <div className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold text-foreground">Crear evento nuevo</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Borrador; puedes cargar criterios desde una{' '}
            <Link to="/admin/plantillas-criterios" className="text-primary underline underline-offset-2">
              plantilla guardada
            </Link>{' '}
            o configurarlos después.
          </p>
          <form className="mt-4 flex max-w-2xl flex-col gap-3" onSubmit={(e) => void onCrearNuevo(e)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[8rem] flex-1 space-y-2">
                <Label htmlFor="hist-nombre">Nombre</Label>
                <Input id="hist-nombre" name="nombre" required placeholder="Nombre del concurso" />
              </div>
              <div className="w-full space-y-2 sm:w-36">
                <Label htmlFor="hist-fecha">Fecha</Label>
                <Input id="hist-fecha" name="fecha" type="date" required />
              </div>
              <div className="w-full space-y-2 sm:w-32">
                <Label htmlFor="hist-puestos">Podio</Label>
                <select
                  id="hist-puestos"
                  name="puestos"
                  defaultValue={3}
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <option value={2}>2</option>
                  <option value={3}>3</option>
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
            </div>
            {plantillasCriterios.length > 0 && (
              <div className="w-full max-w-md space-y-2">
                <Label htmlFor="hist-plantilla">Plantilla de criterios (opcional)</Label>
                <select
                  id="hist-plantilla"
                  name="plantilla_criterios_id"
                  defaultValue=""
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <option value="">Sin plantilla</option>
                  {plantillasCriterios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_plantilla}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-6 hidden md:block overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-4">Nombre</th>
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4">Código</th>
                <th className="py-2 pr-4">Creado</th>
                <th className="py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-medium text-foreground">
                    {r.nombre}
                    {r.id === focoId ? (
                      <Badge variant="secondary" className="ml-2 align-middle text-xs font-normal">
                        en foco
                      </Badge>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4">{r.fecha}</td>
                  <td className="py-2 pr-4">{r.estado}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="font-mono text-xs">{r.codigo_acceso}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={`Copiar código ${r.codigo_acceso}`}
                        title="Copiar código"
                        onClick={() => void copiarCodigoAcceso(r.codigo_acceso)}
                      >
                        <Copy className="size-3.5" aria-hidden />
                      </Button>
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('es-PE')}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => irAGestionar(r.id)}
                      >
                        Gestionar
                      </Button>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto gap-2 p-0"
                        disabled={busyId !== null}
                        onClick={() => setCloneId(r.id)}
                      >
                        {busyId === r.id ? (
                          <>
                            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                            Clonando…
                          </>
                        ) : (
                          'Clonar'
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 space-y-3 md:hidden">
          {rows.map((r) => (
            <div
              key={r.id}
              className={cn(
                'rounded-lg border p-4 shadow-sm',
                r.id === focoId ? 'border-primary/50 bg-primary/5' : 'border-border bg-card',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-foreground">{r.nombre}</p>
                {r.id === focoId ? (
                  <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                    en foco
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {r.fecha} · {r.estado} ·{' '}
                  <span className="inline-flex items-center gap-0.5 align-middle">
                    <span className="font-mono">{r.codigo_acceso}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`Copiar código ${r.codigo_acceso}`}
                      title="Copiar código"
                      onClick={() => void copiarCodigoAcceso(r.codigo_acceso)}
                    >
                      <Copy className="size-3.5" aria-hidden />
                    </Button>
                  </span>
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString('es-PE')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => irAGestionar(r.id)}>
                  Gestionar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => setCloneId(r.id)}
                >
                  {busyId === r.id ? (
                    <>
                      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                      Clonando…
                    </>
                  ) : (
                    'Clonar'
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {rows.length === 0 && !error && (
          <p className="mt-4 text-sm text-muted-foreground">No hay eventos todavía.</p>
        )}
      </SimplePanel>

      <AlertDialog open={cloneId !== null} onOpenChange={(o) => !o && setCloneId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clonar evento</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Crear un borrador copiando categorías y criterios de este evento? No se copian participantes ni jurados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null}
              onClick={(e) => {
                e.preventDefault()
                if (cloneId) void clonar(cloneId)
              }}
            >
              {busyId !== null ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Clonando…
                </>
              ) : (
                'Clonar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
