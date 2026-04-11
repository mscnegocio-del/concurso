import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

function SidebarNav({
  title,
  subNav,
  logoutLabel,
  onLogout,
}: {
  title: string
  subNav?: ReactNode
  logoutLabel: string
  onLogout: () => void | Promise<void>
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conuro</p>
        <h1 className="mt-1 text-lg font-semibold leading-tight text-sidebar-foreground">{title}</h1>
        {subNav ? <div className="mt-4 space-y-1">{subNav}</div> : null}
      </div>
      <div className="px-4 py-3">
        <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground" asChild>
          <Link to="/">Inicio</Link>
        </Button>
      </div>
      <div className="mt-auto border-t border-sidebar-border p-4">
        <Button
          variant="outline"
          className="w-full border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          type="button"
          onClick={() => void onLogout()}
        >
          {logoutLabel}
        </Button>
      </div>
    </div>
  )
}

export function PanelLayout({
  title,
  onLogout,
  logoutLabel = 'Cerrar sesión',
  children,
  subNav,
}: {
  title: string
  onLogout: () => void | Promise<void>
  logoutLabel?: string
  children?: ReactNode
  subNav?: ReactNode
}) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    // Cerrar menú móvil al cambiar de ruta (equivalente a desmontar el sheet).
    queueMicrotask(() => setMobileOpen(false))
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border lg:block">
        <SidebarNav
          title={title}
          subNav={subNav}
          logoutLabel={logoutLabel}
          onLogout={onLogout}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Menú</SheetTitle>
              </SheetHeader>
              <SidebarNav
                title={title}
                subNav={subNav}
                logoutLabel={logoutLabel}
                onLogout={onLogout}
              />
            </SheetContent>
          </Sheet>
          <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}

export function SimplePanel({ children }: { children: ReactNode }) {
  return <Card className="p-6 shadow-sm">{children}</Card>
}
