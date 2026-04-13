/** Valores de `organizaciones.plan` alineados al negocio (CLAUDE.md). */
export type PlanOrganizacion = 'gratuito' | 'basico' | 'institucional' | string

export function normalizarPlan(plan: string | null | undefined): PlanOrganizacion {
  const p = (plan ?? 'gratuito').toLowerCase().trim()
  if (p === 'free') return 'gratuito'
  return p
}

/** Plan gratuito no incluye exportación PDF. */
export function puedeExportarPdf(plan: string | null | undefined): boolean {
  return normalizarPlan(plan) !== 'gratuito'
}

/** Máximo de jurados por evento según plan (solo gratuito acotado en MVP). */
export function maxJuradosPorPlan(plan: string | null | undefined): number | null {
  const p = normalizarPlan(plan)
  if (p === 'gratuito') return 3
  return null
}

export function puedeAgregarJurado(plan: string | null | undefined, juradosActuales: number): boolean {
  const max = maxJuradosPorPlan(plan)
  if (max === null) return true
  return juradosActuales < max
}
