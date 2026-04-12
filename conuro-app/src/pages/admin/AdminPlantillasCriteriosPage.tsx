import { Loader2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { registrarAuditoria } from '@/lib/audit'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Plantilla = { id: string; nombre_plantilla: string; created_at: string }
type Item = {
  id: string
  plantilla_id: string
  nombre: string
  puntaje_maximo: number
  orden: number
  es_criterio_desempate: boolean
}

export function AdminPlantillasCriteriosPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId

  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nuevaPlantilla, setNuevaPlantilla] = useState('')
  const [creandoPlantilla, setCreandoPlantilla] = useState(false)
  const [plantillaDeleteId, setPlantillaDeleteId] = useState<string | null>(null)
  const [eliminandoPlantilla, setEliminandoPlantilla] = useState(false)

  const [agregandoItem, setAgregandoItem] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [guardandoItem, setGuardandoItem] = useState(false)
  const [itemDeleteId, setItemDeleteId] = useState<string | null>(null)
  const [eliminandoItem, setEliminandoItem] = useState(false)
  const [desempateBusy, setDesempateBusy] = useState(false)
  const [msgItems, setMsgItems] = useState<string | null>(null)

  const loadPlantillas = useCallback(async () => {
    if (!orgId) return
    setLoadingList(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('plantillas_criterios')
      .select('id, nombre_plantilla, created_at')
      .eq('organizacion_id', orgId)
      .order('created_at', { ascending: false })
    setLoadingList(false)
    if (e) {
      setError(e.message)
      return
    }
    setPlantillas((data ?? []) as Plantilla[])
  }, [orgId])

  const loadItems = useCallback(async (plantillaId: string) => {
    setLoadingItems(true)
    setMsgItems(null)
    const { data, error: e } = await supabase
      .from('plantilla_criterios_items')
      .select('id, plantilla_id, nombre, puntaje_maximo, orden, es_criterio_desempate')
      .eq('plantilla_id', plantillaId)
      .order('orden')
    setLoadingItems(false)
    if (e) {
      setMsgItems(e.message)
      return
    }
    setItems((data ?? []) as Item[])
  }, [])

  useEffect(() => {
    void loadPlantillas()
  }, [loadPlantillas])

  useEffect(() => {
    if (selectedId) void loadItems(selectedId)
    else setItems([])
  }, [selectedId, loadItems])

  if (!perfil) return null

  if (!orgId) {
    return (
      <SimplePanel>
        <p className="text-muted-foreground">No se pudo determinar la organización.</p>
      </SimplePanel>
    )
  }

  async function crearPlantilla(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !perfil) return
    const nombre = nuevaPlantilla.trim()
    if (!nombre) return
    setCreandoPlantilla(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('plantillas_criterios')
        .insert({ organizacion_id: orgId, nombre_plantilla: nombre })
        .select('id, nombre_plantilla, created_at')
        .single()
      if (err) {
        setError(err.message)
        return
      }
      setNuevaPlantilla('')
      const row = data as Plantilla
      await loadPlantillas()
      setSelectedId(row.id)
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: null,
        usuarioId: perfil.id,
        accion: 'plantilla_criterios_creada',
        detalle: { plantilla_id: row.id, nombre_plantilla: nombre },
      })
      toast.success('Plantilla creada')
    } finally {
      setCreandoPlantilla(false)
    }
  }

  async function ejecutarEliminarPlantilla() {
    const id = plantillaDeleteId
    if (!id || !orgId || !perfil) return
    setEliminandoPlantilla(true)
    try {
      const { error: err } = await supabase.from('plantillas_criterios').delete().eq('id', id)
      if (err) {
        setError(err.message)
        return
      }
      if (selectedId === id) setSelectedId(null)
      await loadPlantillas()
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: null,
        usuarioId: perfil.id,
        accion: 'plantilla_criterios_eliminada',
        detalle: { plantilla_id: id },
      })
      toast.success('Plantilla eliminada')
    } finally {
      setPlantillaDeleteId(null)
      setEliminandoPlantilla(false)
    }
  }

  async function agregarItem(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!selectedId || !orgId || !perfil) return
    setMsgItems(null)
    const fd = new FormData(ev.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const max = Number(fd.get('max') ?? 10)
    const des = fd.get('desempate') === 'on'
    if (!nombre) return
    setAgregandoItem(true)
    try {
      const ordenMax = items.length ? Math.max(...items.map((i) => i.orden)) : 0
      const orden = ordenMax + 1
      if (des) {
        await supabase
          .from('plantilla_criterios_items')
          .update({ es_criterio_desempate: false })
          .eq('plantilla_id', selectedId)
      }
      const { error: err } = await supabase.from('plantilla_criterios_items').insert({
        plantilla_id: selectedId,
        nombre,
        puntaje_maximo: max,
        orden,
        es_criterio_desempate: des,
      })
      if (err) {
        setMsgItems(err.message)
        return
      }
      ev.currentTarget.reset()
      await loadItems(selectedId)
      await registrarAuditoria({
        organizacionId: orgId,
        eventoId: null,
        usuarioId: perfil.id,
        accion: 'plantilla_criterio_item_creado',
        detalle: { plantilla_id: selectedId, nombre },
      })
    } finally {
      setAgregandoItem(false)
    }
  }

  async function guardarItemEdit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (!selectedId || !editingItemId) return
    setMsgItems(null)
    const fd = new FormData(ev.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const max = Number(fd.get('max') ?? 0)
    const des = fd.get('desempate') === 'on'
    if (!nombre || Number.isNaN(max) || max < 0) {
      setMsgItems('Nombre y puntaje máximo válidos son obligatorios.')
      return
    }
    setGuardandoItem(true)
    try {
      if (des) {
        await supabase
          .from('plantilla_criterios_items')
          .update({ es_criterio_desempate: false })
          .eq('plantilla_id', selectedId)
      }
      const { error: err } = await supabase
        .from('plantilla_criterios_items')
        .update({
          nombre,
          puntaje_maximo: max,
          es_criterio_desempate: des,
        })
        .eq('id', editingItemId)
      if (err) {
        setMsgItems(err.message)
        return
      }
      setEditingItemId(null)
      await loadItems(selectedId)
    } finally {
      setGuardandoItem(false)
    }
  }

  async function marcarDesempateItem(id: string) {
    if (!selectedId) return
    setDesempateBusy(true)
    setMsgItems(null)
    try {
      await supabase
        .from('plantilla_criterios_items')
        .update({ es_criterio_desempate: false })
        .eq('plantilla_id', selectedId)
      await supabase.from('plantilla_criterios_items').update({ es_criterio_desempate: true }).eq('id', id)
      await loadItems(selectedId)
    } finally {
      setDesempateBusy(false)
    }
  }

  async function ejecutarEliminarItem() {
    const id = itemDeleteId
    if (!id || !selectedId) return
    setEliminandoItem(true)
    try {
      const { error: err } = await supabase.from('plantilla_criterios_items').delete().eq('id', id)
      if (err) {
        setMsgItems(err.message)
        return
      }
      if (editingItemId === id) setEditingItemId(null)
      await loadItems(selectedId)
    } finally {
      setItemDeleteId(null)
      setEliminandoItem(false)
    }
  }

  const selected = plantillas.find((p) => p.id === selectedId)

  return (
    <div className="space-y-6">
      <SimplePanel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Plantillas de criterios</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Modelos reutilizables para cargar criterios en eventos nuevos (en borrador). Luego puedes ajustar
              puntajes en cada evento.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/historial">Historial</Link>
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="mt-6 flex max-w-xl flex-wrap items-end gap-2" onSubmit={(e) => void crearPlantilla(e)}>
          <div className="min-w-[12rem] flex-1 space-y-2">
            <Label htmlFor="np-nombre">Nueva plantilla</Label>
            <Input
              id="np-nombre"
              value={nuevaPlantilla}
              onChange={(e) => setNuevaPlantilla(e.target.value)}
              placeholder="Ej. Rúbrica estándar 2026"
              disabled={creandoPlantilla}
            />
          </div>
          <Button type="submit" disabled={creandoPlantilla}>
            {creandoPlantilla ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Crear
          </Button>
        </form>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,240px)_1fr]">
          <div>
            <h3 className="text-sm font-medium text-foreground">Tus plantillas</h3>
            {loadingList ? (
              <p className="mt-2 text-sm text-muted-foreground">Cargando…</p>
            ) : plantillas.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Aún no hay plantillas.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {plantillas.map((p) => (
                  <li key={p.id}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={cn(
                          'min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          selectedId === p.id
                            ? 'bg-primary/15 font-medium text-primary'
                            : 'text-foreground hover:bg-muted',
                        )}
                      >
                        <span className="line-clamp-2">{p.nombre_plantilla}</span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-destructive hover:text-destructive"
                        aria-label={`Eliminar plantilla ${p.nombre_plantilla}`}
                        onClick={() => setPlantillaDeleteId(p.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0 rounded-lg border border-border bg-card p-4">
            {!selectedId ? (
              <p className="text-sm text-muted-foreground">Selecciona una plantilla para editar sus criterios.</p>
            ) : loadingItems ? (
              <p className="text-sm text-muted-foreground">Cargando criterios…</p>
            ) : (
              <>
                <h3 className="font-medium text-foreground">{selected?.nombre_plantilla}</h3>
                {msgItems && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertDescription>{msgItems}</AlertDescription>
                  </Alert>
                )}
                <ul className="mt-4 space-y-3 text-sm">
                  {items.map((r) => (
                    <li key={r.id} className="border-b border-border pb-3">
                      {editingItemId === r.id ? (
                        <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => void guardarItemEdit(e)}>
                          <input
                            name="nombre"
                            defaultValue={r.nombre}
                            required
                            disabled={guardandoItem}
                            className="rounded border border-input bg-background px-3 py-2 sm:col-span-2"
                          />
                          <input
                            name="max"
                            type="number"
                            min={0}
                            step={0.5}
                            defaultValue={Number(r.puntaje_maximo)}
                            disabled={guardandoItem}
                            className="rounded border border-input bg-background px-3 py-2"
                          />
                          <label className="flex items-center gap-2 sm:col-span-2">
                            <input
                              name="desempate"
                              type="checkbox"
                              defaultChecked={r.es_criterio_desempate}
                              disabled={guardandoItem}
                            />
                            Criterio de desempate
                          </label>
                          <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <Button type="submit" size="sm" disabled={guardandoItem}>
                              {guardandoItem ? <Loader2 className="size-4 animate-spin" /> : null}
                              Guardar
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={guardandoItem}
                              onClick={() => setEditingItemId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span>
                            {r.orden}. {r.nombre} (máx {r.puntaje_maximo})
                            {r.es_criterio_desempate && (
                              <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">
                                Desempate
                              </span>
                            )}
                          </span>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <button
                              type="button"
                              className="text-primary underline"
                              onClick={() => setEditingItemId(r.id)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="text-destructive hover:underline"
                              onClick={() => setItemDeleteId(r.id)}
                            >
                              Eliminar
                            </button>
                            {!r.es_criterio_desempate && (
                              <button
                                type="button"
                                disabled={desempateBusy}
                                className="text-muted-foreground underline disabled:opacity-50"
                                onClick={() => void marcarDesempateItem(r.id)}
                              >
                                Usar como desempate
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={(e) => void agregarItem(e)}>
                  <Input name="nombre" placeholder="Nombre del criterio" required disabled={agregandoItem} />
                  <Input
                    name="max"
                    type="number"
                    min={0}
                    step={0.5}
                    defaultValue={10}
                    disabled={agregandoItem}
                  />
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input name="desempate" type="checkbox" disabled={agregandoItem} />
                    Marcar como desempate (desmarca otros)
                  </label>
                  <Button type="submit" disabled={agregandoItem} className="sm:col-span-2">
                    {agregandoItem ? <Loader2 className="size-4 animate-spin" /> : null}
                    Añadir criterio a la plantilla
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </SimplePanel>

      <AlertDialog
        open={plantillaDeleteId !== null}
        onOpenChange={(o) => {
          if (!o && !eliminandoPlantilla) setPlantillaDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán también todos los criterios guardados en esta plantilla. Los eventos que ya aplicaron la
              plantilla no se modifican.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminandoPlantilla}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminandoPlantilla}
              onClick={(e) => {
                e.preventDefault()
                void ejecutarEliminarPlantilla()
              }}
            >
              {eliminandoPlantilla ? <Loader2 className="size-4 animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={itemDeleteId !== null}
        onOpenChange={(o) => {
          if (!o && !eliminandoItem) setItemDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar criterio de la plantilla?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminandoItem}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminandoItem}
              onClick={(e) => {
                e.preventDefault()
                void ejecutarEliminarItem()
              }}
            >
              {eliminandoItem ? <Loader2 className="size-4 animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
