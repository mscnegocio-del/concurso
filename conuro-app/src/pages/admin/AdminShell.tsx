import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, CalendarClock, Users, FileText, Building2, MonitorPlay } from 'lucide-react'
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

export function AdminShell() {
  const { signOut, perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const { nombre: orgNombre, logoUrl } = useOrganizacionBranding(orgId)

  const navItems: NavItem[] = [
    { to: '/admin', label: 'Inicio', icon: <LayoutDashboard className="size-4" />, end: true },
    { to: '/admin/historial', label: 'Historial', icon: <CalendarClock className="size-4" /> },
    { to: '/admin/usuarios', label: 'Usuarios', icon: <Users className="size-4" /> },
    { to: '/admin/plantillas-criterios', label: 'Plantillas de criterios', icon: <FileText className="size-4" /> },
    { to: '/admin/organizacion', label: 'Organización', icon: <Building2 className="size-4" /> },
    { to: '/admin/coordinacion', label: 'Panel en vivo', icon: <MonitorPlay className="size-4" /> },
  ]

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
