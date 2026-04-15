import { Building2, ClipboardList, History, Home, LayoutList, LogOut, MonitorPlay } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  MobileBottomNavButton,
  MobileBottomNavItem,
  MobilePanelBottomNav,
} from '@/components/layouts/MobilePanelBottomNav'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'
import { useOrganizacionBranding } from '@/hooks/useOrganizacionBranding'
import { cn } from '@/lib/utils'

export function AdminShell() {
  const { signOut, perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const { nombre: orgNombre, logoUrl } = useOrganizacionBranding(orgId)

  return (
    <PanelLayout
      title="Administración"
      brandingLogoUrl={logoUrl}
      brandingAlt={orgNombre}
      onLogout={() => void signOut()}
      userInfo={
        perfil
          ? { name: perfil.nombreCompleto, email: perfil.email, role: 'Administrador' }
          : undefined
      }
      subNav={
        <nav className="flex flex-col gap-1">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )
            }
          >
            Inicio
          </NavLink>
          <NavLink
            to="/admin/evento"
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )
            }
          >
            Gestión del evento
          </NavLink>
          <NavLink
            to="/admin/coordinacion"
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )
            }
          >
            Coordinación de sala
          </NavLink>
          <NavLink
            to="/admin/historial"
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )
            }
          >
            Historial
          </NavLink>
          <NavLink
            to="/admin/plantillas-criterios"
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )
            }
          >
            Plantillas de criterios
          </NavLink>
          <NavLink
            to="/admin/organizacion"
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              )
            }
          >
            Organización
          </NavLink>
        </nav>
      }
      mobileBottomNav={
        <MobilePanelBottomNav>
          <MobileBottomNavItem to="/admin" end icon={<Home />} label="Inicio" />
          <MobileBottomNavItem to="/admin/evento" icon={<LayoutList />} label="Evento" />
          <MobileBottomNavItem to="/admin/coordinacion" icon={<MonitorPlay />} label="Sala" />
          <MobileBottomNavItem to="/admin/historial" icon={<History />} label="Historial" />
          <MobileBottomNavItem to="/admin/plantillas-criterios" icon={<ClipboardList />} label="Plantillas" />
          <MobileBottomNavItem to="/admin/organizacion" icon={<Building2 />} label="Org." />
          <MobileBottomNavButton icon={<LogOut />} label="Salir" onClick={() => void signOut()} />
        </MobilePanelBottomNav>
      }
    >
      <Outlet />
    </PanelLayout>
  )
}
