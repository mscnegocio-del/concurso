import { Home, LayoutDashboard, LogOut } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import {
  MobileBottomNavButton,
  MobileBottomNavItem,
  MobilePanelBottomNav,
} from '@/components/layouts/MobilePanelBottomNav'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'
import { useOrganizacionBranding } from '@/hooks/useOrganizacionBranding'

export function AdministradorShell() {
  const { signOut, perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const { nombre: orgNombre, logoUrl } = useOrganizacionBranding(orgId)

  return (
    <PanelLayout
      title="Panel coordinador"
      brandingLogoUrl={logoUrl}
      brandingAlt={orgNombre}
      onLogout={() => void signOut()}
      mobileBottomNav={
        <MobilePanelBottomNav>
          <MobileBottomNavItem to="/administrador" end icon={<LayoutDashboard />} label="Coordinación" />
          <MobileBottomNavItem to="/" end icon={<Home />} label="Inicio" />
          <MobileBottomNavButton icon={<LogOut />} label="Salir" onClick={() => void signOut()} />
        </MobilePanelBottomNav>
      }
    >
      <Outlet />
    </PanelLayout>
  )
}
