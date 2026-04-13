import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AuthContext } from '@/contexts/auth-context-value'
import { supabase } from '@/lib/supabase'
import type { RolUsuario, UsuarioPerfil } from '@/types/auth'

function mapPerfil(row: {
  id: string
  organizacion_id: string
  email: string
  rol: RolUsuario
  nombre_completo: string
}): UsuarioPerfil {
  return {
    id: row.id,
    organizacionId: row.organizacion_id,
    email: row.email,
    rol: row.rol,
    nombreCompleto: row.nombre_completo,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null)
  /** Solo hidratación inicial de sesión (getSession); no incluye la consulta a `usuarios`. */
  const [loading, setLoading] = useState(true)
  const [perfilError, setPerfilError] = useState<string | null>(null)
  const perfilLoadGen = useRef(0)

  const loadPerfil = useCallback(async (uid: string) => {
    const gen = ++perfilLoadGen.current
    setPerfilError(null)
    let data: Parameters<typeof mapPerfil>[0] | null = null
    let error: { message: string } | null = null
    try {
      const res = await supabase
        .from('usuarios')
        .select('id, organizacion_id, email, rol, nombre_completo')
        .eq('id', uid)
        .maybeSingle()
      data = res.data as Parameters<typeof mapPerfil>[0] | null
      error = res.error
    } catch (e) {
      if (gen !== perfilLoadGen.current) return
      setPerfil(null)
      setPerfilError(e instanceof Error ? e.message : 'Error al cargar el perfil')
      return
    }

    if (gen !== perfilLoadGen.current) return

    if (error) {
      setPerfil(null)
      setPerfilError(error.message)
      return
    }
    if (!data) {
      setPerfil(null)
      setPerfilError(
        'Tu cuenta no está registrada en el sistema. Contacta al administrador.',
      )
      return
    }
    setPerfil(mapPerfil(data))
  }, [])

  const refreshPerfil = useCallback(async () => {
    const uid = user?.id
    if (!uid) {
      setPerfil(null)
      setPerfilError(null)
      return
    }
    await loadPerfil(uid)
  }, [user?.id, loadPerfil])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const {
          data: { session: s },
          error: sessionError,
        } = await supabase.auth.getSession()
        if (cancelled) return
        if (sessionError) {
          console.warn('[auth] getSession:', sessionError.message)
          setSession(null)
          setUser(null)
        } else {
          setSession(s)
          setUser(s?.user ?? null)
          if (s?.user?.id) {
            void loadPerfil(s.user.id)
          }
        }
      } catch (e) {
        console.error('[auth] getSession', e)
        if (!cancelled) {
          setSession(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user?.id) {
        void loadPerfil(s.user.id)
      } else {
        perfilLoadGen.current += 1
        setPerfil(null)
        setPerfilError(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [loadPerfil])

  const signOut = useCallback(async () => {
    perfilLoadGen.current += 1
    await supabase.auth.signOut()
    setPerfil(null)
    setPerfilError(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      session,
      perfil,
      loading,
      perfilError,
      refreshPerfil,
      signOut,
    }),
    [user, session, perfil, loading, perfilError, refreshPerfil, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
