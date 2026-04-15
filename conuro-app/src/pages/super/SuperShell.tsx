import { NavLink, Outlet } from 'react-router-dom'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export function SuperShell() {
  const { signOut, perfil } = useAuth()
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
          <NavLink
            to="/super"
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
            Organizaciones
          </NavLink>
        </nav>
      }
    >
      <Outlet />
    </PanelLayout>
  )
}
