import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  /** Ícono o marca visual sobre el eyebrow (opcional). */
  logo?: ReactNode
  /** Marca pequeña sobre el título (p. ej. ConcursoAPP). */
  eyebrow?: string
  title: string
  description?: ReactNode
  children: ReactNode
  /** Pie fuera del área de formulario (enlaces, CTA). */
  footer?: ReactNode
  className?: string
}

/**
 * Fondo y contenedor para login admin (OTP) y login jurado: gradiente suave, tarjeta con vidrio ligero.
 */
export function AuthGateLayout({
  logo,
  eyebrow = 'ConcursoAPP',
  title,
  description,
  children,
  footer,
  className,
}: Props) {
  return (
    <main
      className={cn(
        'relative isolate flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-background"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[28rem] w-[min(56rem,140vw)] -translate-x-1/2 rounded-[100%] bg-primary/[0.07] blur-3xl dark:bg-primary/[0.12]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 -z-10 h-72 w-72 translate-x-1/4 translate-y-1/4 rounded-full bg-muted/80 blur-3xl dark:bg-muted/40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1/2 left-0 -z-10 h-64 w-64 -translate-x-1/3 -translate-y-1/2 rounded-full bg-primary/5 blur-2xl dark:bg-primary/10"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-2xl border border-border/70 bg-card/90 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/5 backdrop-blur-md dark:bg-card/75 dark:ring-white/10 dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)]">
          <div className="border-b border-border/60 px-6 pt-7 pb-5 sm:px-8 sm:pt-8">
            {logo ? <div className="mb-3">{logo}</div> : null}
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
              {title}
            </h1>
            {description ? (
              <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</div>
            ) : null}
          </div>
          <div className="overflow-hidden px-6 py-6 sm:px-8 sm:py-7">{children}</div>
          {footer ? (
            <div className="border-t border-border/60 px-6 py-4 sm:px-8">{footer}</div>
          ) : null}
        </div>
      </div>
    </main>
  )
}
