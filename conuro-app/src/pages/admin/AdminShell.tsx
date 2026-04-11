import { NavLink, Outlet } from 'react-router-dom'
import { PanelLayout } from '@/components/layouts/PanelLayout'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export function AdminShell() {
  const { signOut } = useAuth()
  return (
    <PanelLayout
      title="Administración"
      onLogout={() => void signOut()}
      subNav={
        <nav className="flex flex-col gap-1">
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
            Evento
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
        </nav>
      }
    >
      <Outlet />
    </PanelLayout>
  )
}
