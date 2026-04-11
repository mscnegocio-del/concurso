import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

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
  const orgId = perfil?.organizacionId
  const [rows, setRows] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cloneId, setCloneId] = useState<string | null>(null)

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

  async function clonar(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const { error: e } = await supabase.rpc('admin_clonar_evento', { p_evento_origen_id: id })
      if (e) {
        setError(e.message)
        return
      }
      await load()
    } finally {
      setBusyId(null)
      setCloneId(null)
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
              Todos los eventos de tu organización. El más reciente es el que se muestra en «Evento».
            </p>
          </div>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link to="/admin/evento">← Volver al evento actual</Link>
          </Button>
        </div>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="mt-4 overflow-x-auto">
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
                  <td className="py-2 pr-4 font-medium text-foreground">{r.nombre}</td>
                  <td className="py-2 pr-4">{r.fecha}</td>
                  <td className="py-2 pr-4">{r.estado}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.codigo_acceso}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('es-PE')}
                  </td>
                  <td className="py-2">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      disabled={busyId !== null}
                      onClick={() => setCloneId(r.id)}
                    >
                      {busyId === r.id ? 'Clonando…' : 'Clonar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !error && (
            <p className="mt-4 text-sm text-muted-foreground">No hay eventos todavía.</p>
          )}
        </div>
      </SimplePanel>

      <AlertDialog open={cloneId !== null} onOpenChange={(o) => !o && setCloneId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clonar evento</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Crear un borrador copiando categorías y criterios de este evento? No se copian participantes ni
              jurados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (cloneId) void clonar(cloneId)
              }}
            >
              Clonar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
