import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type RankFila = {
  participante_id: string
  codigo: string
  nombre_completo: string
  puntaje_final: number
  promedio_por_criterio?: Record<string, number>
}

type Props = {
  empatesDetectados: Array<{ lugar: number; filas: RankFila[] }>
  criterioDesempate: { id: string; nombre: string } | null
}

export function DesempateInlinePanel({ empatesDetectados, criterioDesempate }: Props) {
  const [expandido, setExpandido] = useState<Set<number>>(new Set())

  const toggleExpandir = (lugar: number) => {
    const nuevo = new Set(expandido)
    if (nuevo.has(lugar)) {
      nuevo.delete(lugar)
    } else {
      nuevo.add(lugar)
    }
    setExpandido(nuevo)
  }

  if (empatesDetectados.length === 0) {
    return null
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">⚔️ Desempates detectados</p>

      {!criterioDesempate ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Sin criterio de desempate configurado. La resolución debe hacerse manualmente.
        </p>
      ) : null}

      {empatesDetectados.map(({ lugar, filas }) => (
        <details
          key={lugar}
          open={expandido.has(lugar)}
          className="group"
        >
          <summary
            onClick={(e) => {
              e.preventDefault()
              toggleExpandir(lugar)
            }}
            className="flex cursor-pointer items-center gap-2 rounded bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            <ChevronDown
              className={cn('size-4 shrink-0 transition-transform', expandido.has(lugar) && 'rotate-180')}
              aria-hidden
            />
            <span>{lugar}° lugar — {filas.length} participante{filas.length !== 1 ? 's' : ''} empatad{filas.length !== 1 ? 'os' : 'a'}</span>
          </summary>

          <div className="mt-2 space-y-2">
            {criterioDesempate ? (
              <>
                <p className="px-3 text-xs font-medium text-muted-foreground">
                  Criterio de desempate: <span className="font-semibold text-foreground">{criterioDesempate.nombre}</span>
                </p>
                <div className="space-y-1.5 px-3">
                  {filas
                    .sort((a, b) => {
                      const puntajeCriterioA = a.promedio_por_criterio?.[criterioDesempate.id] ?? 0
                      const puntajeCriterioB = b.promedio_por_criterio?.[criterioDesempate.id] ?? 0
                      return puntajeCriterioB - puntajeCriterioA
                    })
                    .map((fila, idx) => {
                      const puntajeCriterio = fila.promedio_por_criterio?.[criterioDesempate.id] ?? 0
                      const esGanador = idx === 0
                      return (
                        <div
                          key={fila.participante_id}
                          className={cn(
                            'flex items-center justify-between rounded border px-2.5 py-1.5 text-xs',
                            esGanador
                              ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/20'
                              : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/20'
                          )}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-foreground">
                              {esGanador ? '✓ ' : ''}{fila.nombre_completo}
                            </span>
                            <span className="text-muted-foreground">
                              Código: <span className="font-mono">{fila.codigo}</span>
                            </span>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-semibold text-foreground">
                              {puntajeCriterio.toFixed(2)}
                            </span>
                            <span className="text-muted-foreground">
                              (Total: {fila.puntaje_final.toFixed(2)})
                            </span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </>
            ) : (
              <div className="px-3">
                {filas.map((fila) => (
                  <div key={fila.participante_id} className="py-1.5 text-xs text-foreground">
                    <div className="font-medium">{fila.nombre_completo}</div>
                    <div className="text-muted-foreground">
                      {fila.codigo} — Puntaje: {fila.puntaje_final.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}
