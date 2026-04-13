/** Motor de ranking alineado a reglas de negocio: promedio por jurado y desempate en cascada por criterios. */

export type CriterioMeta = {
  id: string
  orden: number
  es_criterio_desempate: boolean
}

export type CalificacionInput = {
  participante_id: string
  jurado_id: string
  criterio_id: string
  puntaje: number
}

export type ParticipanteMeta = {
  id: string
  codigo: string
  nombre_completo: string
  categoria_id?: string
}

/** Orden de comparación en empates: primero criterio de desempate, luego el resto por `orden`. */
export function ordenCriteriosParaDesempate(criterios: CriterioMeta[]): string[] {
  const byOrden = [...criterios].sort((a, b) => a.orden - b.orden)
  const des = byOrden.find((c) => c.es_criterio_desempate)
  if (!des) return byOrden.map((c) => c.id)
  const otros = byOrden.filter((c) => c.id !== des.id)
  return [des.id, ...otros.map((c) => c.id)]
}

const EPS = 1e-9

function eq(a: number, b: number) {
  return Math.abs(a - b) < EPS
}

function compareNum(a: number, b: number) {
  if (eq(a, b)) return 0
  return a < b ? -1 : 1
}

/** Promedio por criterio (media de puntajes de cada jurado en ese criterio). */
export function promedioPorCriterio(
  participanteId: string,
  criterioId: string,
  juradoIds: string[],
  calMap: Map<string, Map<string, Map<string, number>>>,
): number {
  let sum = 0
  let n = 0
  for (const jid of juradoIds) {
    const v = calMap.get(participanteId)?.get(jid)?.get(criterioId)
    if (v !== undefined && v !== null && !Number.isNaN(v)) {
      sum += v
      n += 1
    }
  }
  return n > 0 ? sum / n : 0
}

/**
 * Puntaje final: para cada jurado, suma de criterios; luego promedio entre jurados.
 */
export function puntajeFinalParticipante(
  participanteId: string,
  juradoIds: string[],
  criterioIds: string[],
  calMap: Map<string, Map<string, Map<string, number>>>,
): number {
  if (juradoIds.length === 0) return 0
  const totales: number[] = []
  for (const jid of juradoIds) {
    let s = 0
    for (const cid of criterioIds) {
      const v = calMap.get(participanteId)?.get(jid)?.get(cid)
      if (v !== undefined && v !== null && !Number.isNaN(v)) s += v
    }
    totales.push(s)
  }
  const sum = totales.reduce((a, b) => a + b, 0)
  return sum / totales.length
}

export type RankedRow = {
  puesto: number
  participante_id: string
  codigo: string
  nombre_completo: string
  puntaje_final: number
  promedio_por_criterio: Record<string, number>
}

function buildCalMap(califs: CalificacionInput[]): Map<string, Map<string, Map<string, number>>> {
  const m = new Map<string, Map<string, Map<string, number>>>()
  for (const c of califs) {
    if (!m.has(c.participante_id)) m.set(c.participante_id, new Map())
    const pm = m.get(c.participante_id)!
    if (!pm.has(c.jurado_id)) pm.set(c.jurado_id, new Map())
    pm.get(c.jurado_id)!.set(c.criterio_id, c.puntaje)
  }
  return m
}

/**
 * Ranking oficial por categoría con desempate en cascada.
 */
export function rankingPorCategoria(
  participantes: ParticipanteMeta[],
  juradoIds: string[],
  criterios: CriterioMeta[],
  calificaciones: CalificacionInput[],
): RankedRow[] {
  const criterioIds = [...criterios].sort((a, b) => a.orden - b.orden).map((c) => c.id)
  const ordenDes = ordenCriteriosParaDesempate(criterios)
  const calMap = buildCalMap(calificaciones)

  const enriched = participantes.map((p) => {
    const promedio_por_criterio: Record<string, number> = {}
    for (const cid of criterioIds) {
      promedio_por_criterio[cid] = promedioPorCriterio(p.id, cid, juradoIds, calMap)
    }
    return {
      participante_id: p.id,
      codigo: p.codigo,
      nombre_completo: p.nombre_completo,
      puntaje_final: puntajeFinalParticipante(p.id, juradoIds, criterioIds, calMap),
      promedio_por_criterio,
    }
  })

  enriched.sort((a, b) => {
    const cmp = compareNum(b.puntaje_final, a.puntaje_final)
    if (cmp !== 0) return cmp
    for (const cid of ordenDes) {
      const va = a.promedio_por_criterio[cid] ?? 0
      const vb = b.promedio_por_criterio[cid] ?? 0
      const c2 = compareNum(vb, va)
      if (c2 !== 0) return c2
    }
    return a.nombre_completo.localeCompare(b.nombre_completo, 'es')
  })

  const rows: RankedRow[] = []
  let i = 0
  let nextPuesto = 1
  while (i < enriched.length) {
    const e0 = enriched[i]
    const key0 = tieKey(e0, ordenDes)
    let j = i + 1
    while (j < enriched.length) {
      const ej = enriched[j]
      if (tieKey(ej, ordenDes) !== key0) break
      j += 1
    }
    const puestoAsignado = nextPuesto
    const block = enriched.slice(i, j)
    for (const e of block) {
      rows.push({
        puesto: puestoAsignado,
        participante_id: e.participante_id,
        codigo: e.codigo,
        nombre_completo: e.nombre_completo,
        puntaje_final: Math.round(e.puntaje_final * 100) / 100,
        promedio_por_criterio: Object.fromEntries(
          Object.entries(e.promedio_por_criterio).map(([k, v]) => [k, Math.round(v * 100) / 100]),
        ),
      })
    }
    nextPuesto += block.length
    i = j
  }

  return rows
}

function tieKey(
  e: {
    puntaje_final: number
    promedio_por_criterio: Record<string, number>
    nombre_completo: string
  },
  ordenDes: string[],
) {
  return [
    e.puntaje_final,
    ...ordenDes.map((cid) => e.promedio_por_criterio[cid] ?? 0),
    e.nombre_completo,
  ].join('|')
}
