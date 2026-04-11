import { useCallback, useEffect, useState } from 'react'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

type Org = {
  id: string
  nombre: string
  slug: string
  plan: string
  activo: boolean
  logo_url: string | null
  logo_subsede_url: string | null
}

const PLANES = [
  { value: 'gratuito', label: 'Gratuito' },
  { value: 'basico', label: 'Básico' },
  { value: 'institucional', label: 'Institucional' },
]

export function SuperOrganizacionesPage() {
  const [rows, setRows] = useState<Org[]>([])
  const [error, setError] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    const { data, error: e } = await supabase
      .from('organizaciones')
      .select('id, nombre, slug, plan, activo, logo_url, logo_subsede_url')
      .order('nombre')
    if (e) setError(e.message)
    else setRows((data ?? []) as Org[])
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    const n = nombre.trim()
    const s = slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    if (n.length < 2 || s.length < 2) {
      setError('Nombre y slug (mín. 2 caracteres, slug solo a-z, números y guiones).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: e } = await supabase.from('organizaciones').insert({
        nombre: n,
        slug: s,
        plan: 'gratuito',
        activo: true,
      })
      if (e) {
        setError(e.message)
        return
      }
      setNombre('')
      setSlug('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function guardarPlan(id: string, plan: string) {
    setError(null)
    const { error: e } = await supabase.from('organizaciones').update({ plan }).eq('id', id)
    if (e) setError(e.message)
    else await load()
  }

  async function toggleActivo(id: string, activo: boolean) {
    setError(null)
    const { error: e } = await supabase.from('organizaciones').update({ activo: !activo }).eq('id', id)
    if (e) setError(e.message)
    else await load()
  }

  return (
    <div className="space-y-6">
      <SimplePanel>
        <h2 className="text-lg font-semibold text-foreground">Organizaciones (multi-tenant)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Alta de clientes institucionales y asignación de plan. Los usuarios admin se enlazan a cada organización
          desde el panel de Supabase Auth / tabla <span className="font-mono">usuarios</span>.
        </p>
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form className="mt-6 grid max-w-xl gap-4 sm:grid-cols-2" onSubmit={(e) => void crear(e)}>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org-nombre">Nombre institución</Label>
            <Input
              id="org-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre institución"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="org-slug">Slug URL</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="ej: corte-lima"
            />
          </div>
          <Button type="submit" disabled={busy} className="sm:col-span-2">
            {busy ? 'Creando…' : 'Crear organización'}
          </Button>
        </form>
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-base font-semibold text-foreground">Listado</h3>
        <ul className="mt-4 divide-y divide-border">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">{o.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{o.slug}</span> · {o.activo ? 'activa' : 'inactiva'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={o.plan}
                  onChange={(e) => void guardarPlan(o.id, e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
                >
                  {PLANES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                  {!PLANES.some((p) => p.value === o.plan) && (
                    <option value={o.plan}>{o.plan}</option>
                  )}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void toggleActivo(o.id, o.activo)}
                >
                  {o.activo ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {rows.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No hay organizaciones.</p>
        )}
      </SimplePanel>
    </div>
  )
}
