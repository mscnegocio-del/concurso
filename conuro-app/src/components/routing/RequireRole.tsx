import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { getRoleHome } from '@/lib/role-routes'
import type { RolUsuario } from '@/types/auth'

export function RequireRole({
  allowed,
  children,
}: {
  allowed: readonly RolUsuario[]
  children: ReactNode
}) {
  const { perfil, perfilError, user } = useAuth()

  if (user && !perfil && !perfilError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-600">
        Cargando perfil…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (perfilError || !perfil) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <p className="font-medium">No se pudo cargar tu perfil</p>
          <p className="mt-1 text-sm">{perfilError ?? 'Sin datos de usuario.'}</p>
        </div>
      </div>
    )
  }

  if (!allowed.includes(perfil.rol)) {
    return <Navigate to={getRoleHome(perfil.rol)} replace />
  }

  return <>{children}</>
}
