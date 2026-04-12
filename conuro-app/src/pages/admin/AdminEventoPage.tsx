import { Copy, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { registrarAuditoria } from '@/lib/audit'
import { AdminExportaciones } from '@/pages/admin/AdminExportaciones'
import { puedeAgregarJurado } from '@/lib/planes'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
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
import { setStoredEventoFoco } from '@/lib/admin-evento-foco'
import { copyText } from '@/lib/clipboard'
import {
  defaultAccentForPlantilla,
  normalizeAccentHex,
  normalizePlantillaPublica,
  type PlantillaPublica,
  PUBLICO_ACCENT_PRESETS,
} from '@/lib/publico-theme'
import { supabase } from '@/lib/supabase'

type EstadoEvento =
  | 'borrador'
  | 'abierto'
  | 'calificando'
  | 'cerrado'
  | 'publicado'

type Evento = {
  id: string
  organizacion_id: string
  nombre: string
  descripcion: string | null
  fecha: string
  estado: EstadoEvento
  codigo_acceso: string
  puestos_a_premiar: number
  plantilla_publica: string
  color_accento_hex: string | null
}

export function AdminEventoPage() {
  const { eventoId } = useParams<{ eventoId: string }>()
  const { perfil } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [evento, setEvento] = useState<Evento | null>(null)
  const [orgPlan, setOrgPlan] = useState<string>('gratuito')

  const orgId = perfil?.organizacionId

  /** Incrementa cuando cambian categorías para que Participantes vuelva a cargar el selector sin F5. */
  const [categoriasRevision, setCategoriasRevision] = useState(0)

  const cargar = useCallback(async () => {
    if (!orgId || !eventoId) return
    setError(null)
    const { data: orgRow } = await supabase.from('organizaciones').select('plan').eq('id', orgId).maybeSingle()
    setOrgPlan((orgRow as { plan?: string } | null)?.plan ?? 'gratuito')
    const { data, error: e } = await supabase
      .from('eventos')
      .select(
        'id, organizacion_id, nombre, descripcion, fecha, estado, codigo_acceso, puestos_a_premiar, plantilla_publica, color_accento_hex',
      )
      .eq('id', eventoId)
      .eq('organizacion_id', orgId)
      .maybeSingle()
    if (e) {
      setError(e.message)
      setEvento(null)
      return
    }
    const row = data as Evento | null
    setEvento(row)
    if (row) setStoredEventoFoco(orgId, row.id)
  }, [orgId, eventoId])

  const despuesDeCambioCategorias = useCallback(async () => {
    await cargar()
    setCategoriasRevision((n) => n + 1)
  }, [cargar])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await cargar()
      setLoading(false)
    })()
  }, [cargar])

  if (!perfil) return null

  if (!eventoId) {
    return (
      <SimplePanel>
        <p className="text-muted-foreground">Identificador de evento no válido.</p>
        <Button variant="link" className="mt-2 h-auto p-0" asChild>
          <Link to="/admin">Volver al inicio</Link>
        </Button>
      </SimplePanel>
    )
  }

  if (loading) {
    return (
      <SimplePanel>
        <div role="status" aria-live="polite" className="space-y-4">
          <span className="sr-only">Cargando evento</span>
          <Skeleton className="h-7 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <div className="flex flex-col gap-3 pt-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </SimplePanel>
    )
  }

  if (!evento) {
    return (
      <SimplePanel>
        <h2 className="text-lg font-semibold text-foreground">Evento no encontrado</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No existe un evento con ese identificador en tu organización, o fue eliminado.
        </p>
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin">Inicio</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/evento">Ir al evento actual</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/historial">Historial de eventos</Link>
          </Button>
        </div>
      </SimplePanel>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <EventoCabecera evento={evento} onReload={() => void cargar()} setError={setError} />
      <SeccionPantallaPublica
        evento={evento}
        usuarioId={perfil.id}
        onSaved={() => void cargar()}
        setError={setError}
      />
      <SeccionCategorias eventoId={evento.id} estado={evento.estado} onChanged={despuesDeCambioCategorias} />
      <SeccionCriterios
        eventoId={evento.id}
        estado={evento.estado}
        organizacionId={perfil.organizacionId}
        usuarioId={perfil.id}
        onChanged={cargar}
      />
      <SeccionParticipantes
        eventoId={evento.id}
        estado={evento.estado}
        onChanged={cargar}
        categoriasRevision={categoriasRevision}
      />
      <SeccionJurados
        eventoId={evento.id}
        estado={evento.estado}
        organizacionId={perfil.organizacionId}
        usuarioId={perfil.id}
        planOrg={orgPlan}
        onChanged={cargar}
        setError={setError}
      />
      <SeccionEstado
        evento={evento}
        perfil={perfil}
        onUpdated={cargar}
        setError={setError}
      />
      <AdminExportaciones evento={evento} planOrganizacion={orgPlan} setError={setError} />
    </div>
  )
}

function EventoCabecera({
  evento,
  onReload,
  setError,
}: {
  evento: Evento
  onReload: () => void
  setError: (s: string | null) => void
}) {
  const [edit, setEdit] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function copiarCodigoAcceso() {
    const ok = await copyText(evento.codigo_acceso)
    if (ok) toast.success('Código copiado')
    else toast.error('No se pudo copiar al portapapeles')
  }

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (evento.estado !== 'borrador') return
    setError(null)
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const fecha = String(fd.get('fecha') ?? '')
    setGuardando(true)
    try {
      const { error: err } = await supabase
        .from('eventos')
        .update({ nombre, fecha })
        .eq('id', evento.id)
      if (err) setError(err.message)
      else {
        setEdit(false)
        onReload()
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <SimplePanel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Evento</p>
          <h2 className="text-xl font-semibold text-slate-900">{evento.nombre}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Estado:{' '}
            <span className="font-medium text-slate-800">{evento.estado}</span> · Código jurados:{' '}
            <span className="inline-flex items-center gap-0.5 align-middle">
              <span className="font-mono font-semibold">{evento.codigo_acceso}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-slate-700"
                aria-label="Copiar código de acceso"
                title="Copiar código"
                onClick={() => void copiarCodigoAcceso()}
              >
                <Copy className="size-4" aria-hidden />
              </Button>
            </span>
          </p>
        </div>
        {evento.estado === 'borrador' && !edit && (
          <button
            type="button"
            onClick={() => setEdit(true)}
            className="text-sm font-medium text-slate-700 underline"
          >
            Editar datos
          </button>
        )}
      </div>
      {edit && evento.estado === 'borrador' && (
        <form className="mt-4 max-w-md space-y-3" onSubmit={(e) => void guardar(e)}>
          <input name="nombre" defaultValue={evento.nombre} className="w-full rounded border px-3 py-2" />
          <input
            name="fecha"
            type="date"
            defaultValue={evento.fecha.slice(0, 10)}
            className="w-full rounded border px-3 py-2"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center justify-center gap-2 rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {guardando ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              className="text-sm text-slate-600 disabled:opacity-50"
              disabled={guardando}
              onClick={() => setEdit(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </SimplePanel>
  )
}

function SeccionPantallaPublica({
  evento,
  usuarioId,
  onSaved,
  setError,
}: {
  evento: Evento
  usuarioId: string
  onSaved: () => void
  setError: (s: string | null) => void
}) {
  const puedeEditarTv =
    evento.estado === 'borrador' || evento.estado === 'abierto' || evento.estado === 'calificando'
  const [plantilla, setPlantilla] = useState<PlantillaPublica>(() =>
    normalizePlantillaPublica(evento.plantilla_publica),
  )
  const [hexInput, setHexInput] = useState(evento.color_accento_hex ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPlantilla(normalizePlantillaPublica(evento.plantilla_publica))
    setHexInput(evento.color_accento_hex ?? '')
  }, [evento.id, evento.plantilla_publica, evento.color_accento_hex])

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const urlPublica = `${appOrigin}/publico/${evento.codigo_acceso}`

  async function copiarUrl() {
    const ok = await copyText(urlPublica)
    if (ok) toast.success('URL copiada')
    else toast.error('No se pudo copiar')
  }

  async function guardarTv() {
    setError(null)
    const trimmed = hexInput.trim()
    const accentToSave = trimmed === '' ? null : normalizeAccentHex(trimmed)
    if (trimmed !== '' && !accentToSave) {
      setError('Color de acento: usa formato #RRGGBB (ej. #2563EB) o elige un preset.')
      return
    }
    setBusy(true)
    try {
      const { error: err } = await supabase
        .from('eventos')
        .update({
          plantilla_publica: plantilla,
          color_accento_hex: accentToSave,
        })
        .eq('id', evento.id)
      if (err) {
        setError(err.message)
        return
      }
      await registrarAuditoria({
        organizacionId: evento.organizacion_id,
        eventoId: evento.id,
        usuarioId,
        accion: 'evento_pantalla_publica',
        detalle: { plantilla_publica: plantilla, color_accento_hex: accentToSave },
      })
      toast.success('Pantalla pública actualizada')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const pickerValue =
    normalizeAccentHex(hexInput) ?? defaultAccentForPlantilla(plantilla).toLowerCase()

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-foreground">Pantalla pública (TV)</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Plantilla y color de acento para el proyector. El acento ayuda a armonizar con el logo de la organización
        (elige un tono similar al de la marca).
      </p>
      <p className="mt-2 break-all text-sm text-muted-foreground">
        URL:{' '}
        <a href={urlPublica} className="font-mono text-primary underline" target="_blank" rel="noreferrer">
          {urlPublica}
        </a>
        <Button type="button" variant="ghost" size="sm" className="ml-2 h-8" onClick={() => void copiarUrl()}>
          Copiar
        </Button>
      </p>
      <div className="mt-4 space-y-3">
        <div className="space-y-2">
          <Label htmlFor="tv-plantilla">Plantilla</Label>
          <select
            id="tv-plantilla"
            value={plantilla}
            disabled={!puedeEditarTv}
            onChange={(e) => setPlantilla(normalizePlantillaPublica(e.target.value))}
            className="border-input bg-background flex h-10 w-full max-w-xs rounded-md border px-3 py-2 text-sm"
          >
            <option value="oscuro">Oscuro (por defecto)</option>
            <option value="claro">Claro</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tv-hex">Color de acento (opcional)</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Selector de color"
              disabled={!puedeEditarTv}
              value={pickerValue}
              onChange={(e) => setHexInput(e.target.value.toUpperCase())}
              className="h-10 w-14 cursor-pointer rounded border border-border bg-background disabled:opacity-50"
            />
            <Input
              id="tv-hex"
              placeholder="#2563EB"
              className="max-w-[9rem] font-mono uppercase"
              disabled={!puedeEditarTv}
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!puedeEditarTv}
              onClick={() => setHexInput('')}
            >
              Quitar (default del tema)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Presets:</p>
          <div className="flex flex-wrap gap-2">
            {PUBLICO_ACCENT_PRESETS.map((p) => (
              <Button
                key={p.hex}
                type="button"
                variant="outline"
                size="sm"
                disabled={!puedeEditarTv}
                className="gap-2"
                onClick={() => setHexInput(p.hex)}
              >
                <span className="size-3 rounded-sm border border-border" style={{ backgroundColor: p.hex }} />
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      {!puedeEditarTv && (
        <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
          El evento está cerrado o publicado; la plantilla TV no se puede editar desde aquí.
        </p>
      )}
      <Button type="button" className="mt-4" disabled={!puedeEditarTv || busy} onClick={() => void guardarTv()}>
        {busy ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            Guardando…
          </>
        ) : (
          'Guardar pantalla pública'
        )}
      </Button>
    </SimplePanel>
  )
}

type Categoria = { id: string; nombre: string; orden: number }
type Criterio = {
  id: string
  nombre: string
  puntaje_maximo: number
  orden: number
  es_criterio_desempate: boolean
}
type Participante = { id: string; codigo: string; nombre_completo: string }
type Jurado = { id: string; nombre_completo: string; orden: number }

function SeccionCategorias({
  eventoId,
  estado,
  onChanged,
}: {
  eventoId: string
  estado: EstadoEvento
  onChanged: () => void | Promise<void>
}) {
  const [rows, setRows] = useState<Categoria[]>([])
  const [nombre, setNombre] = useState('')
  const [categoriaDeleteId, setCategoriaDeleteId] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [eliminandoCategoria, setEliminandoCategoria] = useState(false)
  const editable = estado === 'borrador'

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('categorias')
      .select('id, nombre, orden')
      .eq('evento_id', eventoId)
      .order('orden')
    setRows((data ?? []) as Categoria[])
  }, [eventoId])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setAgregando(true)
    try {
      const orden = rows.length ? Math.max(...rows.map((r) => r.orden)) + 1 : 1
      const { error } = await supabase.from('categorias').insert({
        evento_id: eventoId,
        nombre: nombre.trim(),
        orden,
      })
      if (!error) {
        setNombre('')
        await load()
        await onChanged()
      }
    } finally {
      setAgregando(false)
    }
  }

  async function ejecutarEliminarCategoria() {
    const id = categoriaDeleteId
    if (!id) return
    setEliminandoCategoria(true)
    try {
      const { error } = await supabase.from('categorias').delete().eq('id', id)
      if (!error) {
        await load()
        await onChanged()
      }
    } finally {
      setCategoriaDeleteId(null)
      setEliminandoCategoria(false)
    }
  }

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-slate-900">Categorías</h3>
      <ul className="mt-3 divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              {r.orden}. {r.nombre}
            </span>
            {editable && (
              <button
                type="button"
                className="text-red-600 hover:underline"
                onClick={() => setCategoriaDeleteId(r.id)}
              >
                Eliminar
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => void agregar(e)}>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre categoría"
            disabled={agregando}
            className="min-w-[200px] flex-1 rounded border px-3 py-2 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={agregando}
            className="inline-flex items-center justify-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {agregando ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
            {agregando ? 'Añadiendo…' : 'Añadir'}
          </button>
        </form>
      )}

      <AlertDialog
        open={categoriaDeleteId !== null}
        onOpenChange={(o) => {
          if (!o && !eliminandoCategoria) setCategoriaDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo debe hacerse si la categoría no tiene participantes. Si existen participantes o datos
              vinculados, la operación puede fallar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminandoCategoria}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminandoCategoria}
              onClick={(e) => {
                e.preventDefault()
                void ejecutarEliminarCategoria()
              }}
            >
              {eliminandoCategoria ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Eliminando…
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SimplePanel>
  )
}

function SeccionCriterios({
  eventoId,
  estado,
  organizacionId,
  usuarioId,
  onChanged,
}: {
  eventoId: string
  estado: EstadoEvento
  organizacionId: string
  usuarioId: string
  onChanged: () => void | Promise<void>
}) {
  const [rows, setRows] = useState<Criterio[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [criterioDeleteId, setCriterioDeleteId] = useState<string | null>(null)
  const [agregandoCriterio, setAgregandoCriterio] = useState(false)
  const [guardandoCriterio, setGuardandoCriterio] = useState(false)
  const [desempateBusy, setDesempateBusy] = useState(false)
  const [eliminandoCriterio, setEliminandoCriterio] = useState(false)
  const [plantillasOpts, setPlantillasOpts] = useState<{ id: string; nombre_plantilla: string }[]>([])
  const [plantillaAplicarId, setPlantillaAplicarId] = useState('')
  const [aplicandoPlantilla, setAplicandoPlantilla] = useState(false)
  const [confirmAplicarPlantilla, setConfirmAplicarPlantilla] = useState(false)
  const editable = estado === 'borrador'
  /** `evento_id` actual; evita aplicar un SELECT de un evento anterior si cambió la prop. */
  const eventoIdRef = useRef(eventoId)
  useEffect(() => {
    eventoIdRef.current = eventoId
  }, [eventoId])
  /** Encola SELECTs: el último en cola gana y ninguno corre en paralelo (misma idea que un solo flujo “eliminar”). */
  const loadQueueRef = useRef(Promise.resolve())

  const load = useCallback(() => {
    const eid = eventoId
    const queued = loadQueueRef.current.then(async () => {
      const { data, error } = await supabase
        .from('criterios')
        .select('id, nombre, puntaje_maximo, orden, es_criterio_desempate')
        .eq('evento_id', eid)
        .order('orden')
      if (eid !== eventoIdRef.current) return
      if (error) {
        setMsg(error.message)
        return
      }
      setRows((data ?? []) as Criterio[])
    })
    loadQueueRef.current = queued.catch(() => {})
    return queued
  }, [eventoId])

  useEffect(() => {
    loadQueueRef.current = Promise.resolve()
    void load()
  }, [load, eventoId])

  useEffect(() => {
    if (!editable) return
    void (async () => {
      const { data } = await supabase
        .from('plantillas_criterios')
        .select('id, nombre_plantilla')
        .eq('organizacion_id', organizacionId)
        .order('created_at', { ascending: false })
      setPlantillasOpts((data ?? []) as { id: string; nombre_plantilla: string }[])
    })()
  }, [organizacionId, editable])

  async function ejecutarAplicarPlantilla() {
    if (!plantillaAplicarId) return
    setAplicandoPlantilla(true)
    setMsg(null)
    try {
      const { error: rpcErr } = await supabase.rpc('admin_aplicar_plantilla_criterios', {
        p_evento_id: eventoId,
        p_plantilla_id: plantillaAplicarId,
      })
      if (rpcErr) {
        setMsg(rpcErr.message)
        toast.error(rpcErr.message)
        return
      }
      setConfirmAplicarPlantilla(false)
      await load()
      await onChanged()
      await registrarAuditoria({
        organizacionId,
        eventoId,
        usuarioId,
        accion: 'evento_criterios_desde_plantilla',
        detalle: { plantilla_id: plantillaAplicarId },
      })
      toast.success('Criterios cargados desde la plantilla')
    } finally {
      setAplicandoPlantilla(false)
    }
  }

  async function agregar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const max = Number(fd.get('max') ?? 10)
    const des = fd.get('desempate') === 'on'
    if (!nombre) return
    setAgregandoCriterio(true)
    try {
      const { data: maxOrdenRow } = await supabase
        .from('criterios')
        .select('orden')
        .eq('evento_id', eventoId)
        .order('orden', { ascending: false })
        .limit(1)
        .maybeSingle()
      const ordenMax = maxOrdenRow?.orden != null ? Number(maxOrdenRow.orden) : 0
      const orden = ordenMax + 1
      if (des) {
        await supabase.from('criterios').update({ es_criterio_desempate: false }).eq('evento_id', eventoId)
      }
      const { error } = await supabase.from('criterios').insert({
        evento_id: eventoId,
        nombre,
        puntaje_maximo: max,
        orden,
        es_criterio_desempate: des,
      })
      if (error) {
        setMsg(error.message)
        return
      }
      e.currentTarget.reset()
      await load()
      await onChanged()
    } finally {
      setAgregandoCriterio(false)
    }
  }

  async function marcarDesempate(id: string) {
    setMsg(null)
    setDesempateBusy(true)
    try {
      await supabase.from('criterios').update({ es_criterio_desempate: false }).eq('evento_id', eventoId)
      await supabase.from('criterios').update({ es_criterio_desempate: true }).eq('id', id)
      await load()
      await onChanged()
    } finally {
      setDesempateBusy(false)
    }
  }

  async function guardarEdicion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    const id = editingId
    if (!id) return
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const max = Number(fd.get('max') ?? 0)
    const des = fd.get('desempate') === 'on'
    if (!nombre) {
      setMsg('El nombre es obligatorio.')
      return
    }
    if (Number.isNaN(max) || max < 0) {
      setMsg('El puntaje máximo debe ser un número ≥ 0.')
      return
    }
    setGuardandoCriterio(true)
    try {
      if (des) {
        await supabase.from('criterios').update({ es_criterio_desempate: false }).eq('evento_id', eventoId)
      }
      const { error } = await supabase
        .from('criterios')
        .update({
          nombre,
          puntaje_maximo: max,
          es_criterio_desempate: des,
        })
        .eq('id', id)
      if (error) {
        setMsg(error.message)
        return
      }
      setEditingId(null)
      await load()
      await onChanged()
    } finally {
      setGuardandoCriterio(false)
    }
  }

  function solicitarEliminarCriterio(id: string) {
    setMsg(null)
    if (rows.length <= 1) {
      setMsg('Debe existir al menos un criterio de calificación.')
      return
    }
    void (async () => {
      const { count, error: countErr } = await supabase
        .from('calificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('criterio_id', id)
      if (countErr) {
        setMsg(countErr.message)
        return
      }
      if ((count ?? 0) > 0) {
        setMsg('No se puede eliminar: ya hay calificaciones registradas para este criterio.')
        return
      }
      setCriterioDeleteId(id)
    })()
  }

  async function ejecutarEliminarCriterio() {
    const id = criterioDeleteId
    if (!id) return
    setEliminandoCriterio(true)
    try {
      const { error } = await supabase.from('criterios').delete().eq('id', id)
      if (error) {
        setMsg(error.message)
        return
      }
      if (editingId === id) setEditingId(null)
      await load()
      await onChanged()
    } finally {
      setCriterioDeleteId(null)
      setEliminandoCriterio(false)
    }
  }

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-slate-900">Criterios de calificación</h3>
      {editable && plantillasOpts.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
          <p className="font-medium text-slate-800">Cargar desde plantilla</p>
          <p className="mt-1 text-xs text-slate-600">
            Solo en borrador y si aún no hay calificaciones. Reemplaza todos los criterios del evento por los de la
            plantilla elegida.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={plantillaAplicarId}
              onChange={(e) => setPlantillaAplicarId(e.target.value)}
              className="border-input bg-background h-10 min-w-[12rem] rounded-md border px-3 text-sm"
            >
              <option value="">Elegir plantilla…</option>
              {plantillasOpts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre_plantilla}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!plantillaAplicarId || aplicandoPlantilla}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
              onClick={() => setConfirmAplicarPlantilla(true)}
            >
              Aplicar plantilla
            </button>
            <Link
              to="/admin/plantillas-criterios"
              className="text-xs text-primary underline underline-offset-2"
            >
              Gestionar plantillas
            </Link>
          </div>
        </div>
      )}
      {msg && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}
      <ul className="mt-3 space-y-3 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="border-b border-slate-100 pb-3">
            {editable && editingId === r.id ? (
              <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => void guardarEdicion(e)}>
                <input
                  name="nombre"
                  defaultValue={r.nombre}
                  required
                  disabled={guardandoCriterio}
                  className="rounded border px-3 py-2 sm:col-span-2 disabled:opacity-50"
                />
                <input
                  name="max"
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={Number(r.puntaje_maximo)}
                  disabled={guardandoCriterio}
                  className="rounded border px-3 py-2 disabled:opacity-50"
                />
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    name="desempate"
                    type="checkbox"
                    defaultChecked={r.es_criterio_desempate}
                    disabled={guardandoCriterio}
                  />
                  Criterio de desempate (desmarca los demás al guardar)
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={guardandoCriterio}
                    className="inline-flex items-center justify-center gap-2 rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {guardandoCriterio ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
                    {guardandoCriterio ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    className="text-sm text-slate-600 underline disabled:opacity-50"
                    disabled={guardandoCriterio}
                    onClick={() => {
                      setEditingId(null)
                      setMsg(null)
                    }}
                  >
                    Cancelar
                  </button>
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
                {editable && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      className="text-slate-700 underline"
                      onClick={() => {
                        setMsg(null)
                        setEditingId(r.id)
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => solicitarEliminarCriterio(r.id)}
                    >
                      Eliminar
                    </button>
                    {!r.es_criterio_desempate && (
                      <button
                        type="button"
                        disabled={desempateBusy}
                        className="inline-flex items-center gap-1 text-slate-600 underline disabled:opacity-50"
                        onClick={() => void marcarDesempate(r.id)}
                      >
                        {desempateBusy ? (
                          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                        ) : null}
                        Usar como desempate
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={(e) => void agregar(e)}>
          <input
            name="nombre"
            placeholder="Nombre"
            required
            disabled={agregandoCriterio}
            className="rounded border px-3 py-2 disabled:opacity-50"
          />
          <input
            name="max"
            type="number"
            min={0}
            step={0.5}
            defaultValue={10}
            disabled={agregandoCriterio}
            className="rounded border px-3 py-2 disabled:opacity-50"
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input name="desempate" type="checkbox" disabled={agregandoCriterio} />
            Marcar como criterio de desempate (desmarca otros)
          </label>
          <button
            type="submit"
            disabled={agregandoCriterio}
            className="inline-flex items-center justify-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50 sm:col-span-2"
          >
            {agregandoCriterio ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
            {agregandoCriterio ? 'Añadiendo…' : 'Añadir criterio'}
          </button>
        </form>
      )}

      <AlertDialog
        open={criterioDeleteId !== null}
        onOpenChange={(o) => {
          if (!o && !eliminandoCriterio) setCriterioDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este criterio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El criterio se eliminará del evento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminandoCriterio}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminandoCriterio}
              onClick={(e) => {
                e.preventDefault()
                void ejecutarEliminarCriterio()
              }}
            >
              {eliminandoCriterio ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Eliminando…
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmAplicarPlantilla}
        onOpenChange={(o) => {
          if (!o && !aplicandoPlantilla) setConfirmAplicarPlantilla(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar criterios del evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán los criterios actuales de este evento y se copiarán los de la plantilla. No debe haber
              calificaciones registradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aplicandoPlantilla}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={aplicandoPlantilla}
              onClick={(e) => {
                e.preventDefault()
                void ejecutarAplicarPlantilla()
              }}
            >
              {aplicandoPlantilla ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Aplicando…
                </>
              ) : (
                'Sí, aplicar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SimplePanel>
  )
}

async function siguienteCodigoParticipante(categoriaId: string): Promise<string> {
  const { data } = await supabase.from('participantes').select('codigo').eq('categoria_id', categoriaId)
  const nums = (data ?? [])
    .map((r) => parseInt(String(r.codigo), 10))
    .filter((n) => !Number.isNaN(n))
  const n = nums.length ? Math.max(...nums) + 1 : 1
  return String(n).padStart(2, '0')
}

function SeccionParticipantes({
  eventoId,
  estado,
  onChanged,
  categoriasRevision,
}: {
  eventoId: string
  estado: EstadoEvento
  onChanged: () => void
  /** Se incrementa al crear/eliminar categorías (otra sección); fuerza recarga del desplegable. */
  categoriasRevision: number
}) {
  const [cats, setCats] = useState<Categoria[]>([])
  const [catId, setCatId] = useState<string>('')
  const [parts, setParts] = useState<Participante[]>([])
  const [nombre, setNombre] = useState('')
  const [participanteDeleteId, setParticipanteDeleteId] = useState<string | null>(null)
  const [agregandoParticipante, setAgregandoParticipante] = useState(false)
  const [eliminandoParticipante, setEliminandoParticipante] = useState(false)
  const editable = estado === 'borrador' || estado === 'abierto'

  const loadCats = useCallback(async () => {
    const { data } = await supabase
      .from('categorias')
      .select('id, nombre, orden')
      .eq('evento_id', eventoId)
      .order('orden')
    const list = (data ?? []) as Categoria[]
    setCats(list)
    setCatId((prev) => {
      if (list.length === 0) return ''
      if (!prev || !list.some((c) => c.id === prev)) return list[0].id
      return prev
    })
  }, [eventoId])

  const loadParts = useCallback(async () => {
    if (!catId) return
    const { data } = await supabase
      .from('participantes')
      .select('id, codigo, nombre_completo')
      .eq('categoria_id', catId)
      .order('codigo')
    setParts((data ?? []) as Participante[])
  }, [catId])

  useEffect(() => {
    void loadCats()
  }, [loadCats, categoriasRevision])

  useEffect(() => {
    void loadParts()
  }, [loadParts])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!catId || !nombre.trim()) return
    setAgregandoParticipante(true)
    try {
      const codigo = await siguienteCodigoParticipante(catId)
      const { error } = await supabase.from('participantes').insert({
        categoria_id: catId,
        nombre_completo: nombre.trim(),
        codigo,
      })
      if (!error) {
        setNombre('')
        await loadParts()
        onChanged()
      }
    } finally {
      setAgregandoParticipante(false)
    }
  }

  async function ejecutarEliminarParticipante() {
    const id = participanteDeleteId
    if (!id) return
    setEliminandoParticipante(true)
    try {
      const { error } = await supabase.from('participantes').delete().eq('id', id)
      if (!error) {
        await loadParts()
        onChanged()
      }
    } finally {
      setParticipanteDeleteId(null)
      setEliminandoParticipante(false)
    }
  }

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-slate-900">Participantes</h3>
      <div className="mt-2">
        <label className="text-sm text-slate-600">Categoría</label>
        <select
          value={catId}
          onChange={(e) => setCatId(e.target.value)}
          disabled={agregandoParticipante}
          className="mt-1 w-full max-w-md rounded border px-3 py-2 disabled:opacity-50"
        >
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {parts.map((p) => (
          <li key={p.id} className="flex justify-between py-2 text-sm">
            <span>
              <span className="font-mono text-slate-500">{p.codigo}</span> {p.nombre_completo}
            </span>
            {editable && (
              <button type="button" className="text-red-600" onClick={() => setParticipanteDeleteId(p.id)}>
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => void agregar(e)}>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo"
            disabled={agregandoParticipante}
            className="min-w-[200px] flex-1 rounded border px-3 py-2 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={agregandoParticipante}
            className="inline-flex items-center justify-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {agregandoParticipante ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
            {agregandoParticipante ? 'Añadiendo…' : 'Añadir'}
          </button>
        </form>
      )}

      <AlertDialog
        open={participanteDeleteId !== null}
        onOpenChange={(o) => {
          if (!o && !eliminandoParticipante) setParticipanteDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar participante?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el participante de esta categoría. Si tiene calificaciones, la operación puede no
              permitirse según las reglas de la base de datos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminandoParticipante}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminandoParticipante}
              onClick={(e) => {
                e.preventDefault()
                void ejecutarEliminarParticipante()
              }}
            >
              {eliminandoParticipante ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Quitando…
                </>
              ) : (
                'Quitar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SimplePanel>
  )
}

function SeccionJurados({
  eventoId,
  estado,
  organizacionId,
  usuarioId,
  planOrg,
  onChanged,
  setError,
}: {
  eventoId: string
  estado: EstadoEvento
  organizacionId: string
  usuarioId: string
  planOrg: string
  onChanged: () => void
  setError: (s: string | null) => void
}) {
  const [rows, setRows] = useState<Jurado[]>([])
  const [nombre, setNombre] = useState('')
  const [juradoDeleteId, setJuradoDeleteId] = useState<string | null>(null)
  const [agregandoJurado, setAgregandoJurado] = useState(false)
  const [eliminandoJurado, setEliminandoJurado] = useState(false)
  const [eventosOrigen, setEventosOrigen] = useState<{ id: string; nombre: string; fecha: string }[]>([])
  const [origenImportId, setOrigenImportId] = useState('')
  const [importandoJurados, setImportandoJurados] = useState(false)
  const [confirmImportJurados, setConfirmImportJurados] = useState(false)
  const editable = estado === 'borrador' || estado === 'abierto'

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('jurados')
      .select('id, nombre_completo, orden')
      .eq('evento_id', eventoId)
      .order('orden')
    setRows((data ?? []) as Jurado[])
  }, [eventoId])

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    if (!editable) return
    void (async () => {
      const { data } = await supabase
        .from('eventos')
        .select('id, nombre, fecha')
        .eq('organizacion_id', organizacionId)
        .neq('id', eventoId)
        .order('created_at', { ascending: false })
      setEventosOrigen((data ?? []) as { id: string; nombre: string; fecha: string }[])
    })()
  }, [organizacionId, eventoId, editable])

  async function ejecutarImportarJurados() {
    if (!origenImportId) return
    setImportandoJurados(true)
    setError(null)
    try {
      const { data: agregados, error: rpcErr } = await supabase.rpc('admin_copiar_jurados_evento', {
        p_destino_id: eventoId,
        p_origen_id: origenImportId,
      })
      if (rpcErr) {
        setError(rpcErr.message)
        toast.error(rpcErr.message)
        return
      }
      const n = typeof agregados === 'number' ? agregados : 0
      setConfirmImportJurados(false)
      await load()
      onChanged()
      await registrarAuditoria({
        organizacionId,
        eventoId,
        usuarioId,
        accion: 'evento_jurados_importados',
        detalle: { origen_evento_id: origenImportId, agregados: n },
      })
      toast.success(
        n > 0 ? `Se añadieron ${n} jurado(s).` : 'No había jurados nuevos por importar (o límite del plan).',
      )
    } finally {
      setImportandoJurados(false)
    }
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    if (!puedeAgregarJurado(planOrg, rows.length)) {
      setError('Tu plan gratuito permite como máximo 3 jurados. Actualiza el plan o elimina un jurado.')
      return
    }
    setError(null)
    setAgregandoJurado(true)
    try {
      const orden = rows.length ? Math.max(...rows.map((r) => r.orden)) + 1 : 1
      const { error } = await supabase.from('jurados').insert({
        evento_id: eventoId,
        nombre_completo: nombre.trim(),
        orden,
      })
      if (!error) {
        setNombre('')
        await load()
        onChanged()
      }
    } finally {
      setAgregandoJurado(false)
    }
  }

  async function ejecutarEliminarJurado() {
    const id = juradoDeleteId
    if (!id) return
    setEliminandoJurado(true)
    try {
      const { error } = await supabase.from('jurados').delete().eq('id', id)
      if (!error) {
        await load()
        onChanged()
      }
    } finally {
      setJuradoDeleteId(null)
      setEliminandoJurado(false)
    }
  }

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-slate-900">Jurados</h3>
      {editable && eventosOrigen.length > 0 && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
          <p className="font-medium text-slate-800">Importar desde otro evento</p>
          <p className="mt-1 text-xs text-slate-600">
            Copia nombres y orden desde un evento anterior de la misma organización. No duplica nombres que ya existan
            aquí. Plan gratuito: máximo 3 jurados en total.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={origenImportId}
              onChange={(e) => setOrigenImportId(e.target.value)}
              className="border-input bg-background h-10 min-w-[12rem] max-w-full flex-1 rounded-md border px-3 text-sm"
            >
              <option value="">Elegir evento origen…</option>
              {eventosOrigen.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nombre} ({ev.fecha})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!origenImportId || importandoJurados}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
              onClick={() => setConfirmImportJurados(true)}
            >
              Importar jurados
            </button>
          </div>
        </div>
      )}
      <ol className="mt-3 list-decimal pl-5 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between py-1">
            <span>{r.nombre_completo}</span>
            {editable && (
              <button type="button" className="text-red-600" onClick={() => setJuradoDeleteId(r.id)}>
                Eliminar
              </button>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => void agregar(e)}>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo del jurado"
            disabled={agregandoJurado}
            className="min-w-[200px] flex-1 rounded border px-3 py-2 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={agregandoJurado}
            className="inline-flex items-center justify-center gap-2 rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {agregandoJurado ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
            {agregandoJurado ? 'Añadiendo…' : 'Añadir'}
          </button>
        </form>
      )}
      {planOrg === 'gratuito' && rows.length >= 3 && (
        <p className="mt-3 text-xs text-amber-800">Plan gratuito: máximo 3 jurados.</p>
      )}

      <AlertDialog
        open={juradoDeleteId !== null}
        onOpenChange={(o) => {
          if (!o && !eliminandoJurado) setJuradoDeleteId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar jurado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará al jurado de la lista del evento. Si ya registró calificaciones, la operación puede no
              permitirse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminandoJurado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={eliminandoJurado}
              onClick={(e) => {
                e.preventDefault()
                void ejecutarEliminarJurado()
              }}
            >
              {eliminandoJurado ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Eliminando…
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmImportJurados}
        onOpenChange={(o) => {
          if (!o && !importandoJurados) setConfirmImportJurados(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Importar jurados?</AlertDialogTitle>
            <AlertDialogDescription>
              Se añadirán al final de la lista los jurados del evento elegido que aún no figuren aquí (mismo nombre).
              Respeta el límite de tu plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importandoJurados}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={importandoJurados}
              onClick={(e) => {
                e.preventDefault()
                void ejecutarImportarJurados()
              }}
            >
              {importandoJurados ? (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                  Importando…
                </>
              ) : (
                'Importar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SimplePanel>
  )
}

async function validarListoParaAbrir(eventoId: string): Promise<string | null> {
  const { data: crit } = await supabase.from('criterios').select('id').eq('evento_id', eventoId)
  if (!crit?.length) return 'Debe haber al menos un criterio.'
  const { data: jur } = await supabase.from('jurados').select('id').eq('evento_id', eventoId)
  if (!jur?.length) return 'Debe haber al menos un jurado.'
  const { data: cats } = await supabase.from('categorias').select('id').eq('evento_id', eventoId)
  if (!cats?.length) return 'Debe haber al menos una categoría.'
  for (const c of cats) {
    const { count } = await supabase
      .from('participantes')
      .select('*', { count: 'exact', head: true })
      .eq('categoria_id', c.id)
    if (!count || count < 1) return 'Cada categoría necesita al menos un participante.'
  }
  return null
}

function SeccionEstado({
  evento,
  perfil,
  onUpdated,
  setError,
}: {
  evento: Evento
  perfil: { id: string; organizacionId: string; email: string }
  onUpdated: () => void
  setError: (s: string | null) => void
}) {
  const [busy, setBusy] = useState(false)

  async function transicion(nuevo: EstadoEvento) {
    setError(null)
    setBusy(true)
    try {
      if (nuevo === 'abierto') {
        const v = await validarListoParaAbrir(evento.id)
        if (v) {
          setError(v)
          return
        }
      }
      const { error: err } = await supabase
        .from('eventos')
        .update({ estado: nuevo })
        .eq('id', evento.id)
      if (err) {
        const code = (err as { code?: string }).code
        const msg = (err.message ?? '').toLowerCase()
        if (
          code === '23505' ||
          msg.includes('ux_evento_activo') ||
          msg.includes('duplicate key') ||
          msg.includes('unique constraint')
        ) {
          setError(
            'Ya hay otro evento abierto o en calificación en tu organización. Cierra o finaliza ese evento antes de activar este.',
          )
        } else {
          setError(err.message)
        }
        return
      }
      await registrarAuditoria({
        organizacionId: perfil.organizacionId,
        eventoId: evento.id,
        usuarioId: perfil.id,
        accion: 'evento_estado',
        detalle: { anterior: evento.estado, nuevo },
      })
      onUpdated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-slate-900">Estado del evento</h3>
      <p className="mt-1 text-sm text-slate-600">
        Flujo: borrador → abierto (jurados entran) → calificando → cerrado (notas bloqueadas).
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {evento.estado === 'borrador' && (
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void transicion('abierto')}
          >
            {busy ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
            Activar evento (pasar a abierto)
          </button>
        )}
        {evento.estado === 'abierto' && (
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void transicion('calificando')}
          >
            {busy ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
            Iniciar calificación
          </button>
        )}
        {evento.estado === 'calificando' && (
          <button
            type="button"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void transicion('cerrado')}
          >
            {busy ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : null}
            Cerrar calificación
          </button>
        )}
      </div>
    </SimplePanel>
  )
}
