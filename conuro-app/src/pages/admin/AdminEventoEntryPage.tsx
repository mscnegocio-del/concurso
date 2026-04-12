import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { registrarAuditoria } from '@/lib/audit'
import { getStoredEventoFoco, setStoredEventoFoco } from '@/lib/admin-evento-foco'
import { crearEventoBorrador } from '@/lib/crear-evento-borrador'
import { supabase } from '@/lib/supabase'

/**
 * /admin/evento sin ID: redirige al evento en foco o al más reciente; si no hay eventos, formulario crear borrador.
 */
export function AdminEventoEntryPage() {
  const { perfil } = useAuth()
  const navigate = useNavigate()
  const orgId = perfil?.organizacionId
  const [phase, setPhase] = useState<'resolving' | 'create' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const resolve = useCallback(async () => {
    if (!orgId) return
    setPhase('resolving')
    setError(null)
    const stored = getStoredEventoFoco(orgId)
    if (stored) {
      const { data } = await supabase
        .from('eventos')
        .select('id')
        .eq('id', stored)
        .eq('organizacion_id', orgId)
        .maybeSingle()
      if (data?.id) {
        navigate(`/admin/evento/${data.id}`, { replace: true })
        return
      }
    }
    const { data: latest, error: e } = await supabase
      .from('eventos')
      .select('id')
      .eq('organizacion_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (e) {
      setError(e.message)
      setPhase(null)
      return
    }
    if (latest?.id) {
      setStoredEventoFoco(orgId, latest.id)
      navigate(`/admin/evento/${latest.id}`, { replace: true })
      return
    }
    setPhase('create')
  }, [orgId, navigate])

  useEffect(() => {
    if (!orgId) return
    queueMicrotask(() => void resolve())
  }, [orgId, resolve])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!orgId || !perfil) return
    setError(null)
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const fecha = String(fd.get('fecha') ?? '')
    const puestos = Number(fd.get('puestos') ?? 3) === 2 ? 2 : 3
    setBusy(true)
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
        detalle: { nombre: data.nombre },
      })
      navigate(`/admin/evento/${data.id}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  if (!perfil) return null

  if (phase === 'resolving' || phase === null) {
    return (
      <SimplePanel>
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">Resolviendo evento</span>
          <Skeleton className="h-7 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
      </SimplePanel>
    )
  }

  return (
    <SimplePanel>
      <h2 className="text-lg font-semibold text-foreground">Crear evento</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Aún no hay un evento en tu organización. Crea uno en estado borrador para configurarlo.
      </p>
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form className="mt-6 max-w-md space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div className="space-y-2">
          <Label htmlFor="ce-nombre">Nombre del evento</Label>
          <Input id="ce-nombre" name="nombre" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ce-fecha">Fecha</Label>
          <Input id="ce-fecha" name="fecha" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ce-puestos">Puestos a premiar</Label>
          <select
            id="ce-puestos"
            name="puestos"
            defaultValue={3}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value={2}>2 (1° y 2°)</option>
            <option value={3}>3 (podio completo)</option>
          </select>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? (
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
  )
}
