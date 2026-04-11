import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useJurado } from '@/hooks/useJurado'

export function RequireJurado({ children }: { children: ReactNode }) {
  const { session } = useJurado()
  const location = useLocation()

  if (!session) {
    return <Navigate to="/jurado" state={{ from: location }} replace />
  }

  return <>{children}</>
}
