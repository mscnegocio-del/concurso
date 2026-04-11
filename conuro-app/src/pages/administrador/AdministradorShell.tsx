import { Outlet } from 'react-router-dom'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'

export function AdministradorShell() {
  const { signOut } = useAuth()
  return (
    <PanelLayout title="Panel coordinador" onLogout={() => void signOut()}>
      <Outlet />
    </PanelLayout>
  )
}
