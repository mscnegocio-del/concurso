import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { UsuarioPerfil } from '@/types/auth'

export type AuthContextValue = {
  user: User | null
  session: Session | null
  perfil: UsuarioPerfil | null
  /** `true` solo mientras se resuelve la sesión de Supabase al iniciar; el perfil puede cargar después. */
  loading: boolean
  perfilError: string | null
  refreshPerfil: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
