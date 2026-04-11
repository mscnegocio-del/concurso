import { Link, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useJurado } from '@/hooks/useJurado'
import { cn } from '@/lib/utils'

export function JuradoShell() {
  const { session, clearSession } = useJurado()
  if (!session) return null
  return (
    <div className="min-h-dvh bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="border-b bg-card shadow-sm">
        <div
          className={cn(
            'mx-auto flex max-w-lg flex-wrap items-center justify-between gap-3 px-4 py-3 sm:max-w-2xl',
          )}
        >
          <div className="min-w-0 flex-1">
            <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground" asChild>
              <Link to="/">Inicio</Link>
            </Button>
            <p className="truncate text-sm font-medium text-foreground">{session.eventoNombre}</p>
            <p className="text-xs text-muted-foreground">Jurado: {session.nombreCompleto}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => clearSession()}>
            Salir
          </Button>
        </div>
        <Separator />
      </header>
      <main className="mx-auto max-w-lg px-4 py-6 sm:max-w-2xl">
        <Outlet />
      </main>
    </div>
  )
}
