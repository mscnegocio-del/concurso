import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Logo y nombre de la organización para cabeceras de panel (RLS: misma org).
 */
export function useOrganizacionBranding(orgId: string | undefined) {
  const [nombre, setNombre] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const reloadBranding = useCallback(async () => {
    if (!orgId) {
      setNombre('')
      setLogoUrl(null)
      return
    }
    const { data: row } = await supabase
      .from('organizaciones')
      .select('nombre, logo_url')
      .eq('id', orgId)
      .maybeSingle()
    if (!row) {
      setNombre('')
      setLogoUrl(null)
      return
    }
    setNombre((row as { nombre: string }).nombre)
    setLogoUrl((row as { logo_url: string | null }).logo_url)
  }, [orgId])

  useEffect(() => {
    queueMicrotask(() => void reloadBranding())
  }, [reloadBranding])

  return { nombre, logoUrl, reloadBranding }
}
