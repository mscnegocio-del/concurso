import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, CalendarClock } from 'lucide-react'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'
import { useOrganizacionBranding } from '@/hooks/useOrganizacionBranding'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
  end?: boolean
}

export function AdministradorShell() {
  const { signOut, perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const { nombre: orgNombre, logoUrl } = useOrganizacionBranding(orgId)

  const navItems: NavItem[] = [
    { to: '/administrador', label: 'Inicio', icon: <LayoutDashboard className="size-4" />, end: true },
    { to: '/administrador/historial', label: 'Historial', icon: <CalendarClock className="size-4" /> },
  ]

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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                )
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      }
    >
      <Outlet />
    </PanelLayout>
  )
}
