import { buildMarketingLink, type MarketingUtmMedium } from '@/lib/marketing'
import { cn } from '@/lib/utils'

type Props = {
  utmMedium: MarketingUtmMedium
  className?: string
  /** Estilo para fondos oscuros (pantalla pública). */
  darkSurface?: boolean
  /** Pantalla pública tema claro: contraste sobre fondo claro. */
  publicoLight?: boolean
}

export function ConuroMarketingCta({ utmMedium, className, darkSurface, publicoLight }: Props) {
  const href = buildMarketingLink({ utm_medium: utmMedium })
  return (
    <p
      className={cn(
        'text-pretty text-xs leading-snug',
        publicoLight && 'text-slate-600',
        darkSurface && !publicoLight && 'text-slate-500',
        !darkSurface && !publicoLight && 'text-muted-foreground',
        className,
      )}
    >
      ¿Organizas concursos o competencias con varios jurados?{' '}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'font-medium underline-offset-2 hover:underline',
          publicoLight && 'text-blue-800 hover:text-blue-950',
          darkSurface && !publicoLight && 'text-slate-300 hover:text-white',
          !darkSurface && !publicoLight && 'text-primary',
        )}
      >
        ConcursoAPP es gratuito para empezar
      </a>
      {' — gestión, jurados y pantalla pública.'}
    </p>
  )
}
