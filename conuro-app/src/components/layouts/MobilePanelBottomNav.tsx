import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/utils'

export function MobilePanelBottomNav({ children }: { children: ReactNode }) {
  return (
    <nav
      className="flex items-stretch border-t border-border bg-card pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-0.5 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
      aria-label="Navegación principal"
    >
      {children}
    </nav>
  )
}

export function MobileBottomNavItem({
  to,
  end,
  icon,
  label,
}: {
  to: string
  end?: boolean
  icon: ReactNode
  label: string
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[10px] font-medium leading-tight transition-colors sm:text-[11px]',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="line-clamp-2 max-w-full text-center">{label}</span>
    </NavLink>
  )
}

export function MobileBottomNavButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[10px] font-medium leading-tight text-muted-foreground transition-colors hover:text-foreground sm:text-[11px]"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <span className="line-clamp-2 max-w-full text-center">{label}</span>
    </button>
  )
}
