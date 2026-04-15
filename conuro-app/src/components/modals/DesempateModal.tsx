import { cn } from '@/lib/utils'

export type DesempateInfo = {
  puesto: number
  criterioDesempate: string
  participante1: {
    nombre: string
    puntajeTotal: number
    puntajeCriterio: number
  }
  participante2: {
    nombre: string
    puntajeTotal: number
    puntajeCriterio: number
  }
}

export function DesempateModal({
  isOpen,
  desempate,
  onClose,
  isDark,
  accentColor,
}: {
  isOpen: boolean
  desempate: DesempateInfo | null
  onClose: () => void
  isDark?: boolean
  accentColor?: string | null
}) {
  if (!isOpen || !desempate) return null

  const puestoLabel = ['', '1er', '2do', '3er'][desempate.puesto] || `${desempate.puesto}°`
  const winner = desempate.participante1.puntajeCriterio >= desempate.participante2.puntajeCriterio
    ? desempate.participante1
    : desempate.participante2
  const loser = winner === desempate.participante1 ? desempate.participante2 : desempate.participante1

  const bgColor = isDark
    ? 'bg-slate-900 border-slate-700'
    : 'bg-white border-slate-200'
  const textColor = isDark ? 'text-white' : 'text-slate-900'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Modal de desempate"
    >
      <div
        className={cn(
          'w-full max-w-sm rounded-2xl border shadow-2xl transition-all duration-300',
          bgColor,
        )}
        onClick={(e) => e.stopPropagation()}
        style={{ '--desempate-accent': accentColor ?? '#dc2626' } as React.CSSProperties}
      >
        {/* Header */}
        <div
          className="border-b border-inherit px-6 py-4"
          style={{
            backgroundColor: `color-mix(in srgb, var(--desempate-accent) 15%, transparent)`,
          }}
        >
          <h2 className={cn('text-center text-xl font-bold', textColor)}>
            ⚔️ Desempate — {puestoLabel} lugar
          </h2>
        </div>

        {/* Content */}
        <div className={cn('px-6 py-6', textColor)}>
          <p className="mb-4 text-center text-sm font-medium text-slate-600 dark:text-slate-400">
            Criterio de desempate: <strong>{desempate.criterioDesempate}</strong>
          </p>

          {/* Comparison */}
          <div className="space-y-4">
            {/* Winner */}
            <div
              className="rounded-xl border-2 p-4"
              style={{
                borderColor: `color-mix(in srgb, var(--desempate-accent, #dc2626) 60%, transparent)`,
                backgroundColor: `color-mix(in srgb, var(--desempate-accent, #dc2626) 10%, transparent)`,
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  🏆 Ganador
                </span>
                <span
                  className="rounded-full px-3 py-1 text-sm font-bold text-white"
                  style={{ backgroundColor: 'var(--desempate-accent, #dc2626)' }}
                >
                  {winner.puntajeCriterio}
                </span>
              </div>
              <p className={cn('font-semibold text-base', textColor)}>{winner.nombre}</p>
            </div>

            {/* Loser */}
            <div className="rounded-xl border border-slate-300 p-4 dark:border-slate-600">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Participante
                </span>
                <span className="rounded-full border border-slate-300 px-3 py-1 text-sm font-bold dark:border-slate-600">
                  {loser.puntajeCriterio}
                </span>
              </div>
              <p className={cn('font-semibold text-base', textColor)}>{loser.nombre}</p>
            </div>
          </div>

          {/* Info */}
          <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
            El desempate fue resuelto automáticamente según la configuración del evento.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-inherit px-6 py-4">
          <button
            onClick={onClose}
            className={cn(
              'w-full rounded-lg px-4 py-2 font-semibold transition-colors',
              isDark
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-900',
            )}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
