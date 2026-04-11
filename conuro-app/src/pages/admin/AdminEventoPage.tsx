import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { registrarAuditoria } from '@/lib/audit'
import { AdminExportaciones } from '@/pages/admin/AdminExportaciones'
import { generarCodigoAccesoEvento } from '@/lib/codigo-evento'
import { puedeAgregarJurado } from '@/lib/planes'
import { SimplePanel } from '@/components/layouts/PanelLayout'
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
}

export function AdminEventoPage() {
  const { perfil } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [evento, setEvento] = useState<Evento | null>(null)
  const [orgPlan, setOrgPlan] = useState<string>('gratuito')

  const orgId = perfil?.organizacionId

  const cargar = useCallback(async () => {
    if (!orgId) return
    setError(null)
    const { data: orgRow } = await supabase.from('organizaciones').select('plan').eq('id', orgId).maybeSingle()
    setOrgPlan((orgRow as { plan?: string } | null)?.plan ?? 'gratuito')
    const { data, error: e } = await supabase
      .from('eventos')
      .select(
        'id, organizacion_id, nombre, descripcion, fecha, estado, codigo_acceso, puestos_a_premiar',
      )
      .eq('organizacion_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (e) {
      setError(e.message)
      setEvento(null)
      return
    }
    setEvento(data as Evento | null)
  }, [orgId])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await cargar()
      setLoading(false)
    })()
  }, [cargar])

  async function crearEventoInicial(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!orgId || !perfil) return
    setError(null)
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const fecha = String(fd.get('fecha') ?? '')
    const puestos = Number(fd.get('puestos') ?? 3)
    if (!nombre || !fecha) {
      setError('Nombre y fecha son obligatorios.')
      return
    }
    let codigo = generarCodigoAccesoEvento()
    for (let intento = 0; intento < 8; intento++) {
      const { data: ins, error: err } = await supabase
        .from('eventos')
        .insert({
          organizacion_id: orgId,
          nombre,
          descripcion: null,
          fecha,
          estado: 'borrador',
          codigo_acceso: codigo,
          puestos_a_premiar: puestos === 2 ? 2 : 3,
          plantilla_criterios_id: null,
        })
        .select(
          'id, organizacion_id, nombre, descripcion, fecha, estado, codigo_acceso, puestos_a_premiar',
        )
        .single()
      if (!err && ins) {
        setEvento(ins as Evento)
        await registrarAuditoria({
          organizacionId: orgId,
          eventoId: ins.id,
          usuarioId: perfil.id,
          accion: 'evento_creado',
          detalle: { nombre },
        })
        return
      }
      if (err?.code === '23505') {
        codigo = generarCodigoAccesoEvento()
        continue
      }
      setError(err?.message ?? 'No se pudo crear el evento.')
      return
    }
    setError('No se pudo generar un código de acceso único.')
  }

  if (!perfil) return null

  if (loading) {
    return (
      <SimplePanel>
        <p className="text-slate-600">Cargando evento…</p>
      </SimplePanel>
    )
  }

  if (!evento) {
    return (
      <SimplePanel>
        <h2 className="text-lg font-semibold text-slate-900">Crear evento</h2>
        <p className="mt-1 text-sm text-slate-600">
          Aún no hay un evento en tu organización. Crea uno en estado borrador para configurarlo.
        </p>
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
        <form className="mt-6 max-w-md space-y-4" onSubmit={(e) => void crearEventoInicial(e)}>
          <div>
            <label className="block text-sm font-medium text-slate-700">Nombre del evento</label>
            <input
              name="nombre"
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Fecha</label>
            <input
              name="fecha"
              type="date"
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Puestos a premiar</label>
            <select
              name="puestos"
              defaultValue={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value={2}>2 (1° y 2°)</option>
              <option value={3}>3 (podio completo)</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Crear borrador
          </button>
        </form>
      </SimplePanel>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      <EventoCabecera evento={evento} onReload={() => void cargar()} setError={setError} />
      <SeccionCategorias eventoId={evento.id} estado={evento.estado} onChanged={cargar} />
      <SeccionCriterios eventoId={evento.id} estado={evento.estado} onChanged={cargar} />
      <SeccionParticipantes eventoId={evento.id} estado={evento.estado} onChanged={cargar} />
      <SeccionJurados
        eventoId={evento.id}
        estado={evento.estado}
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

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (evento.estado !== 'borrador') return
    setError(null)
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const fecha = String(fd.get('fecha') ?? '')
    const { error: err } = await supabase
      .from('eventos')
      .update({ nombre, fecha })
      .eq('id', evento.id)
    if (err) setError(err.message)
    else {
      setEdit(false)
      onReload()
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
            <span className="font-mono font-semibold">{evento.codigo_acceso}</span>
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
            <button type="submit" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
              Guardar
            </button>
            <button type="button" className="text-sm text-slate-600" onClick={() => setEdit(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
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
  onChanged: () => void
}) {
  const [rows, setRows] = useState<Categoria[]>([])
  const [nombre, setNombre] = useState('')
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
    const orden = rows.length ? Math.max(...rows.map((r) => r.orden)) + 1 : 1
    const { error } = await supabase.from('categorias').insert({
      evento_id: eventoId,
      nombre: nombre.trim(),
      orden,
    })
    if (!error) {
      setNombre('')
      await load()
      onChanged()
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar categoría? Solo si no tiene participantes.')) return
    const { error } = await supabase.from('categorias').delete().eq('id', id)
    if (!error) {
      await load()
      onChanged()
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
                onClick={() => void eliminar(r.id)}
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
            className="min-w-[200px] flex-1 rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-sm text-white">
            Añadir
          </button>
        </form>
      )}
    </SimplePanel>
  )
}

function SeccionCriterios({
  eventoId,
  estado,
  onChanged,
}: {
  eventoId: string
  estado: EstadoEvento
  onChanged: () => void | Promise<void>
}) {
  const [rows, setRows] = useState<Criterio[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
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

  async function agregar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    const nombre = String(fd.get('nombre') ?? '').trim()
    const max = Number(fd.get('max') ?? 10)
    const des = fd.get('desempate') === 'on'
    if (!nombre) return
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
  }

  async function marcarDesempate(id: string) {
    setMsg(null)
    await supabase.from('criterios').update({ es_criterio_desempate: false }).eq('evento_id', eventoId)
    await supabase.from('criterios').update({ es_criterio_desempate: true }).eq('id', id)
    await load()
    await onChanged()
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
  }

  async function eliminarCriterio(id: string) {
    setMsg(null)
    if (rows.length <= 1) {
      setMsg('Debe existir al menos un criterio de calificación.')
      return
    }
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
    if (!confirm('¿Eliminar este criterio?')) return
    const { error } = await supabase.from('criterios').delete().eq('id', id)
    if (error) {
      setMsg(error.message)
      return
    }
    if (editingId === id) setEditingId(null)
    await load()
    await onChanged()
  }

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-slate-900">Criterios de calificación</h3>
      {msg && (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {msg}
        </p>
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
                  className="rounded border px-3 py-2 sm:col-span-2"
                />
                <input
                  name="max"
                  type="number"
                  min={0}
                  step={0.5}
                  defaultValue={Number(r.puntaje_maximo)}
                  className="rounded border px-3 py-2"
                />
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input name="desempate" type="checkbox" defaultChecked={r.es_criterio_desempate} />
                  Criterio de desempate (desmarca los demás al guardar)
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="submit" className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white">
                    Guardar
                  </button>
                  <button
                    type="button"
                    className="text-sm text-slate-600 underline"
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
                      onClick={() => void eliminarCriterio(r.id)}
                    >
                      Eliminar
                    </button>
                    {!r.es_criterio_desempate && (
                      <button
                        type="button"
                        className="text-slate-600 underline"
                        onClick={() => void marcarDesempate(r.id)}
                      >
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
          <input name="nombre" placeholder="Nombre" required className="rounded border px-3 py-2" />
          <input
            name="max"
            type="number"
            min={0}
            step={0.5}
            defaultValue={10}
            className="rounded border px-3 py-2"
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input name="desempate" type="checkbox" />
            Marcar como criterio de desempate (desmarca otros)
          </label>
          <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-sm text-white sm:col-span-2">
            Añadir criterio
          </button>
        </form>
      )}
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
}: {
  eventoId: string
  estado: EstadoEvento
  onChanged: () => void
}) {
  const [cats, setCats] = useState<Categoria[]>([])
  const [catId, setCatId] = useState<string>('')
  const [parts, setParts] = useState<Participante[]>([])
  const [nombre, setNombre] = useState('')
  const editable = estado === 'borrador' || estado === 'abierto'

  const loadCats = useCallback(async () => {
    const { data } = await supabase
      .from('categorias')
      .select('id, nombre, orden')
      .eq('evento_id', eventoId)
      .order('orden')
    const list = (data ?? []) as Categoria[]
    setCats(list)
    setCatId((prev) => (!prev && list[0] ? list[0].id : prev))
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
    queueMicrotask(() => {
      void loadCats()
    })
  }, [loadCats])

  useEffect(() => {
    queueMicrotask(() => {
      void loadParts()
    })
  }, [loadParts])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!catId || !nombre.trim()) return
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
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar participante?')) return
    const { error } = await supabase.from('participantes').delete().eq('id', id)
    if (!error) {
      await loadParts()
      onChanged()
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
          className="mt-1 w-full max-w-md rounded border px-3 py-2"
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
              <button type="button" className="text-red-600" onClick={() => void eliminar(p.id)}>
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
            className="min-w-[200px] flex-1 rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-sm text-white">
            Añadir
          </button>
        </form>
      )}
    </SimplePanel>
  )
}

function SeccionJurados({
  eventoId,
  estado,
  planOrg,
  onChanged,
  setError,
}: {
  eventoId: string
  estado: EstadoEvento
  planOrg: string
  onChanged: () => void
  setError: (s: string | null) => void
}) {
  const [rows, setRows] = useState<Jurado[]>([])
  const [nombre, setNombre] = useState('')
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

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    if (!puedeAgregarJurado(planOrg, rows.length)) {
      setError('Tu plan gratuito permite como máximo 3 jurados. Actualiza el plan o elimina un jurado.')
      return
    }
    setError(null)
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
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar jurado?')) return
    const { error } = await supabase.from('jurados').delete().eq('id', id)
    if (!error) {
      await load()
      onChanged()
    }
  }

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-slate-900">Jurados</h3>
      <ol className="mt-3 list-decimal pl-5 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between py-1">
            <span>{r.nombre_completo}</span>
            {editable && (
              <button type="button" className="text-red-600" onClick={() => void eliminar(r.id)}>
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
            className="min-w-[200px] flex-1 rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-sm text-white">
            Añadir
          </button>
        </form>
      )}
      {planOrg === 'gratuito' && rows.length >= 3 && (
        <p className="mt-3 text-xs text-amber-800">Plan gratuito: máximo 3 jurados.</p>
      )}
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
        setError(err.message)
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
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void transicion('abierto')}
          >
            Activar evento (pasar a abierto)
          </button>
        )}
        {evento.estado === 'abierto' && (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void transicion('calificando')}
          >
            Iniciar calificación
          </button>
        )}
        {evento.estado === 'calificando' && (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void transicion('cerrado')}
          >
            Cerrar calificación
          </button>
        )}
      </div>
    </SimplePanel>
  )
}
