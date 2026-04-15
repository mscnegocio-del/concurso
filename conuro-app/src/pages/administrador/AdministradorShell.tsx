import { NavLink, Outlet } from 'react-router-dom'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'
import { useOrganizacionBranding } from '@/hooks/useOrganizacionBranding'
import { cn } from '@/lib/utils'

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
      userInfo={
        perfil
          ? { name: perfil.nombreCompleto, email: perfil.email, role: 'Coordinador' }
          : undefined
      }
      subNav={
        <nav className="flex flex-col gap-1">
          <NavLink
            to="/administrador"
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
            to="/administrador/historial"
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
        </nav>
      }
    >
      <Outlet />
    </PanelLayout>
  )
}
