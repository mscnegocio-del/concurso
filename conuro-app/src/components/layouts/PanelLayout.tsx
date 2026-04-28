import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
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
import { cn } from '@/lib/utils'

function SidebarNav({
  title,
  subNav,
  logoutLabel,
  onLogout,
  brandingLogoUrl,
  brandingAlt,
  userInfo,
}: {
  title: string
  subNav?: ReactNode
  logoutLabel: string
  onLogout: () => void | Promise<void>
  brandingLogoUrl?: string | null
  brandingAlt?: string
  userInfo?: { name: string; email: string; role?: string }
}) {
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ConcursoAPP</p>
        {brandingLogoUrl ? (
          <img
            src={brandingLogoUrl}
            alt={brandingAlt ? `${brandingAlt}` : ''}
            className="mt-2 h-9 max-w-[11rem] object-contain object-left"
            loading="lazy"
            decoding="async"
            style={reduceMotion ? undefined : { transition: 'opacity 0.2s ease' }}
          />
        ) : null}
        <h1 className="mt-1 text-lg font-semibold leading-tight text-sidebar-foreground">{title}</h1>
        {subNav ? <div className="mt-4 space-y-1">{subNav}</div> : null}
      </div>
      <div className="mt-auto border-t border-sidebar-border p-4 space-y-3">
        {userInfo && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground leading-tight">
              {userInfo.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{userInfo.email}</p>
            {userInfo.role && (
              <span className="mt-1 inline-block rounded-full bg-sidebar-accent px-2 py-0.5 text-xs text-sidebar-accent-foreground">
                {userInfo.role}
              </span>
            )}
          </div>
        )}
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
  /** Barra fija inferior en &lt;lg (reemplaza el menú hamburguesa). */
  mobileBottomNav,
  brandingLogoUrl,
  brandingAlt,
  userInfo,
}: {
  title: string
  onLogout: () => void | Promise<void>
  logoutLabel?: string
  children?: ReactNode
  subNav?: ReactNode
  mobileBottomNav?: ReactNode
  /** Logo institucional (URL pública de Storage o externa). */
  brandingLogoUrl?: string | null
  /** Texto alternativo del logo (nombre de la organización). */
  brandingAlt?: string
  /** Información del usuario autenticado para mostrar en el sidebar. */
  userInfo?: { name: string; email: string; role?: string }
}) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const useMobileBottomNav = Boolean(mobileBottomNav)
  const showMobileSheet = !useMobileBottomNav

  useEffect(() => {
    queueMicrotask(() => setMobileOpen(false))
  }, [location.pathname])

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:block">
        <SidebarNav
          title={title}
          subNav={subNav}
          logoutLabel={logoutLabel}
          onLogout={onLogout}
          brandingLogoUrl={brandingLogoUrl}
          brandingAlt={brandingAlt}
          userInfo={userInfo}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-background px-4 py-3 lg:hidden">
          {showMobileSheet ? (
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
                  brandingLogoUrl={brandingLogoUrl}
                  brandingAlt={brandingAlt}
                  userInfo={userInfo}
                />
              </SheetContent>
            </Sheet>
          ) : null}
          {brandingLogoUrl ? (
            <img
              src={brandingLogoUrl}
              alt=""
              className="h-8 max-w-[6rem] shrink-0 object-contain"
              aria-hidden
            />
          ) : null}
          <h1 className="min-w-0 truncate text-base font-semibold text-foreground">{title}</h1>
        </header>

        <main
          className={cn(
            'mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8 lg:py-8',
            useMobileBottomNav &&
              'max-lg:pb-[calc(5rem+env(safe-area-inset-bottom,0px))]',
          )}
        >
          {children ?? <Outlet />}
        </main>

        {useMobileBottomNav ? (
          <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">{mobileBottomNav}</div>
        ) : null}
      </div>
    </div>
  )
}

export function SimplePanel({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn('p-6 shadow-sm', className)}>{children}</Card>
}
