import { NavLink, Outlet } from 'react-router-dom'
import { Building2, Users } from 'lucide-react'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
  end?: boolean
}

export function SuperShell() {
  const { signOut, perfil } = useAuth()

  const navItems: NavItem[] = [
    { to: '/super', label: 'Organizaciones', icon: <Building2 className="size-4" />, end: true },
    { to: '/super/usuarios', label: 'Usuarios', icon: <Users className="size-4" /> },
  ]

  return (
    <PanelLayout
      title="Super administración"
      onLogout={() => void signOut()}
      userInfo={
        perfil
          ? { name: perfil.nombreCompleto, email: perfil.email, role: 'Super administrador' }
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
