import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

const MAX_BYTES = 2 * 1024 * 1024
const MIME_OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function extFor(file: File): string {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/gif') return 'gif'
  return 'jpg'
}

export function AdminOrganizacionPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const [nombre, setNombre] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoSubUrl, setLogoSubUrl] = useState<string | null>(null)
  const [sonidoActivo, setSonidoActivo] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'main' | 'sub' | 'sonido' | null>(null)

  const load = useCallback(async () => {
    if (!orgId) return
    setError(null)
    const { data, error: e } = await supabase
      .from('organizaciones')
      .select('nombre, logo_url, logo_subsede_url, sonido_revelacion_activo')
      .eq('id', orgId)
      .maybeSingle()
    if (e) {
      setError(e.message)
      return
    }
    const row = data as {
      nombre: string
      logo_url: string | null
      logo_subsede_url: string | null
      sonido_revelacion_activo?: boolean
    } | null
    if (row) {
      setNombre(row.nombre)
      setLogoUrl(row.logo_url)
      setLogoSubUrl(row.logo_subsede_url)
      setSonidoActivo(row.sonido_revelacion_activo !== false)
    }
  }, [orgId])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await load()
      setLoading(false)
    })()
  }, [load])

  async function subirLogo(which: 'main' | 'sub', file: File | undefined) {
    if (!orgId || !file) return
    setError(null)
    if (!MIME_OK.has(file.type)) {
      setError('Usa JPEG, PNG, WebP o GIF.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('El archivo supera 2 MB.')
      return
    }
    setBusy(which === 'main' ? 'main' : 'sub')
    try {
      const path = `${orgId}/${which === 'main' ? 'logo' : 'logo-subsede'}-${Date.now()}.${extFor(file)}`
      const { error: upErr } = await supabase.storage.from('org-logos').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (upErr) {
        setError(upErr.message)
        return
      }
      const { data: pub } = supabase.storage.from('org-logos').getPublicUrl(path)
      const url = pub.publicUrl
      const patch =
        which === 'main' ? { logo_url: url } : { logo_subsede_url: url }
      const { error: dbErr } = await supabase.from('organizaciones').update(patch).eq('id', orgId)
      if (dbErr) {
        setError(dbErr.message)
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function quitarLogo(which: 'main' | 'sub') {
    if (!orgId) return
    setBusy(which === 'main' ? 'main' : 'sub')
    setError(null)
    try {
      const patch = which === 'main' ? { logo_url: null } : { logo_subsede_url: null }
      const { error: dbErr } = await supabase.from('organizaciones').update(patch).eq('id', orgId)
      if (dbErr) {
        setError(dbErr.message)
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function toggleSonido(checked: boolean) {
    if (!orgId) return
    setBusy('sonido')
    setError(null)
    try {
      const { error: dbErr } = await supabase
        .from('organizaciones')
        .update({ sonido_revelacion_activo: checked })
        .eq('id', orgId)
      if (dbErr) {
        setError(dbErr.message)
        return
      }
      setSonidoActivo(checked)
    } finally {
      setBusy(null)
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
      <SimplePanel>
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Cargando</span>
      </SimplePanel>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Organización</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Logos para acta, pantalla pública y paneles. Máx. 2 MB; JPEG, PNG, WebP o GIF.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin">← Inicio</Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <SimplePanel>
        <h3 className="text-lg font-semibold text-foreground">{nombre}</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Sonido en pantalla pública:</strong> al revelar una nueva categoría en
          el proyector, el navegador puede reproducir un tono breve si la organización lo tiene activo. En muchas TVs
          el autoplay de audio está bloqueado hasta que alguien interactúa con la página (un toque en la pantalla suele
          bastar).
        </p>
        <div className="mt-4 flex items-center gap-3">
          <input
            id="sonido-org"
            type="checkbox"
            className="border-input size-4 rounded"
            checked={sonidoActivo}
            disabled={busy === 'sonido'}
            onChange={(e) => void toggleSonido(e.target.checked)}
          />
          <Label htmlFor="sonido-org" className="text-sm font-normal">
            Tono al publicar resultados (revelación)
          </Label>
        </div>
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-base font-semibold text-foreground">Logo institucional</h3>
        <p className="mt-1 text-sm text-muted-foreground">Cabecera pública, PDF y paneles internos.</p>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className="mt-3 h-20 max-w-full object-contain object-left"
            aria-hidden
          />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Sin logo cargado.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} asChild>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  void subirLogo('main', f)
                }}
              />
              {busy === 'main' ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Subiendo…
                </>
              ) : (
                'Subir o reemplazar'
              )}
            </label>
          </Button>
          {logoUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void quitarLogo('main')}
            >
              Quitar
            </Button>
          ) : null}
        </div>
      </SimplePanel>

      <SimplePanel>
        <h3 className="text-base font-semibold text-foreground">Logo subsede</h3>
        <p className="mt-1 text-sm text-muted-foreground">Segundo logo en acta oficial (p. ej. sede local).</p>
        {logoSubUrl ? (
          <img
            src={logoSubUrl}
            alt=""
            className="mt-3 h-20 max-w-full object-contain object-left"
            aria-hidden
          />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Sin logo cargado.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} asChild>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  void subirLogo('sub', f)
                }}
              />
              {busy === 'sub' ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Subiendo…
                </>
              ) : (
                'Subir o reemplazar'
              )}
            </label>
          </Button>
          {logoSubUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void quitarLogo('sub')}
            >
              Quitar
            </Button>
          ) : null}
        </div>
      </SimplePanel>
    </div>
  )
}
