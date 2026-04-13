import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type AuthLoadingPlaceholderProps = {
  /** Por defecto pantalla completa; en rutas anidadas usar p. ej. `min-h-[40vh]`. */
  className?: string
  /** Texto para lectores de pantalla. */
  label?: string
}

export function AuthLoadingPlaceholder({
  className,
  label = 'Cargando',
}: AuthLoadingPlaceholderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-center justify-center p-6', className ?? 'min-h-dvh')}
    >
      <span className="sr-only">{label}</span>
      <div className="w-full max-w-lg space-y-3">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}
