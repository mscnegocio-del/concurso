import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthLoadingPlaceholder } from '@/components/layouts/AuthLoadingPlaceholder'
import { useAuth } from '@/hooks/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <AuthLoadingPlaceholder className="min-h-[40vh]" label="Cargando sesión" />
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
