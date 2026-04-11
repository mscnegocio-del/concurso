import { Outlet } from 'react-router-dom'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'

export function SuperShell() {
  const { signOut } = useAuth()
  return (
    <PanelLayout title="Super administración" onLogout={() => void signOut()}>
      <Outlet />
    </PanelLayout>
  )
}
