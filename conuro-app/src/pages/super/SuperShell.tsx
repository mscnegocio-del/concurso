import { Home, LogOut, Shield } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import {
  MobileBottomNavButton,
  MobileBottomNavItem,
  MobilePanelBottomNav,
} from '@/components/layouts/MobilePanelBottomNav'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'

export function SuperShell() {
  const { signOut } = useAuth()
  return (
    <PanelLayout
      title="Super administración"
      onLogout={() => void signOut()}
      mobileBottomNav={
        <MobilePanelBottomNav>
          <MobileBottomNavItem to="/" end icon={<Home />} label="Inicio" />
          <MobileBottomNavItem to="/super" end icon={<Shield />} label="Organizaciones" />
          <MobileBottomNavButton icon={<LogOut />} label="Salir" onClick={() => void signOut()} />
        </MobilePanelBottomNav>
      }
    >
      <Outlet />
    </PanelLayout>
  )
}
