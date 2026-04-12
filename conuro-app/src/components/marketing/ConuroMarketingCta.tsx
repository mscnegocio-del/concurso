import { buildMarketingLink, type MarketingUtmMedium } from '@/lib/marketing'
import { cn } from '@/lib/utils'

type Props = {
  utmMedium: MarketingUtmMedium
  className?: string
  /** Estilo para fondos oscuros (pantalla pública). */
  darkSurface?: boolean
}

export function ConuroMarketingCta({ utmMedium, className, darkSurface }: Props) {
  const href = buildMarketingLink({ utm_medium: utmMedium })
  return (
    <p
      className={cn(
        'text-pretty text-xs leading-snug',
        darkSurface ? 'text-slate-500' : 'text-muted-foreground',
        className,
      )}
    >
      ¿Organizas concursos de dibujo o pintura?{' '}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'font-medium underline-offset-2 hover:underline',
          darkSurface ? 'text-slate-300 hover:text-white' : 'text-primary',
        )}
      >
        Conuro es gratuito para empezar
      </a>
      {' — gestión, jurados y pantalla pública.'}
    </p>
  )
}
