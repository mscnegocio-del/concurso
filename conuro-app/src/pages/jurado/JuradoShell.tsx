import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { ConuroMarketingCta } from '@/components/marketing/ConuroMarketingCta'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useJurado } from '@/hooks/useJurado'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function JuradoShell() {
  const { session, clearSession } = useJurado()
  const [eventoId, setEventoId] = useState<string | null>(null)
  const [alertaCierre, setAlertaCierre] = useState(false)
  const prevEstadoRef = useRef<string | null>(null)

  const resolverSesion = useCallback(async () => {
    if (!session?.tokenSesion) return null
    const { data } = await supabase.rpc('jurado_resolver_sesion', { p_token: session.tokenSesion })
    return data?.[0] as { evento_id: string; evento_estado: string } | undefined
  }, [session?.tokenSesion])

  useEffect(() => {
    if (!session?.tokenSesion) return
    void (async () => {
      const row = await resolverSesion()
      if (row?.evento_id) {
        setEventoId(row.evento_id)
        prevEstadoRef.current = row.evento_estado
      }
    })()
  }, [session?.tokenSesion, resolverSesion])

  useEffect(() => {
    if (!eventoId || !session?.tokenSesion) return

    const t = window.setInterval(async () => {
      const row = await resolverSesion()
      if (!row) return
      if (row.evento_estado === 'cerrado' && prevEstadoRef.current !== 'cerrado') {
        setAlertaCierre(true)
      }
      prevEstadoRef.current = row.evento_estado
    }, 8_000)

    const ch = supabase
      .channel(`jurado-shell-evento-${eventoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'eventos', filter: `id=eq.${eventoId}` },
        (payload) => {
          const nuevo = (payload.new as { estado: string }).estado
          if (nuevo === 'cerrado' && prevEstadoRef.current !== 'cerrado') {
            setAlertaCierre(true)
          }
          prevEstadoRef.current = nuevo
        },
      )
      .subscribe()

    return () => {
      window.clearInterval(t)
      void supabase.removeChannel(ch)
    }
  }, [eventoId, session?.tokenSesion, resolverSesion])

  if (!session) return null
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-[env(safe-area-inset-bottom)]">
      <header className="border-b bg-card shadow-sm">
        <div
          className={cn(
            'mx-auto flex max-w-lg flex-wrap items-center justify-between gap-3 px-4 py-3 sm:max-w-2xl',
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {session.logoUrl ? (
              <img
                src={session.logoUrl}
                alt=""
                className="mt-5 size-9 shrink-0 rounded object-contain sm:mt-6"
                aria-hidden
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground" asChild>
                <Link to="/">Inicio</Link>
              </Button>
              <p className="truncate text-sm font-medium text-foreground">{session.eventoNombre}</p>
              <p className="text-xs text-muted-foreground">Jurado: {session.nombreCompleto}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => clearSession()}>
            Salir
          </Button>
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:max-w-2xl">
        <Outlet />
      </main>
      <footer className="mx-auto w-full max-w-lg shrink-0 border-t border-border/60 px-4 py-3 sm:max-w-2xl">
        <ConuroMarketingCta utmMedium="jurado_panel" className="text-center" />
      </footer>

      <AlertDialog open={alertaCierre}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Calificación cerrada</AlertDialogTitle>
            <AlertDialogDescription>
              El coordinador ha cerrado la calificación. Tus notas quedaron guardadas y ya no pueden modificarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setAlertaCierre(false)}>
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
