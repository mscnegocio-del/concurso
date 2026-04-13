import { describe, expect, it } from 'vitest'
import {
  ordenCriteriosParaDesempate,
  rankingPorCategoria,
  type CalificacionInput,
  type CriterioMeta,
  type ParticipanteMeta,
} from './ranking'

const criterios: CriterioMeta[] = [
  { id: 'c1', orden: 1, es_criterio_desempate: false },
  { id: 'c2', orden: 2, es_criterio_desempate: true },
  { id: 'c3', orden: 3, es_criterio_desempate: false },
]

describe('ordenCriteriosParaDesempate', () => {
  it('pone primero el criterio de desempate y luego el resto por orden', () => {
    expect(ordenCriteriosParaDesempate(criterios)).toEqual(['c2', 'c1', 'c3'])
  })

  it('sin desempate explícito usa solo orden', () => {
    const cs: CriterioMeta[] = [
      { id: 'a', orden: 1, es_criterio_desempate: false },
      { id: 'b', orden: 2, es_criterio_desempate: false },
    ]
    expect(ordenCriteriosParaDesempate(cs)).toEqual(['a', 'b'])
  })
})

describe('rankingPorCategoria', () => {
  const jurados = ['j1', 'j2']
  const pa: ParticipanteMeta = { id: 'p1', codigo: '01', nombre_completo: 'Ana' }
  const pb: ParticipanteMeta = { id: 'p2', codigo: '02', nombre_completo: 'Bea' }

  it('ordena por puntaje final descendente', () => {
    const cal: CalificacionInput[] = [
      ...buildFull('p1', 10),
      ...buildFull('p2', 5),
    ]
    const r = rankingPorCategoria([pa, pb], jurados, criterios, cal)
    expect(r[0].participante_id).toBe('p1')
    expect(r[1].participante_id).toBe('p2')
  })

  it('desempata por criterio de desempate si el final coincide', () => {
    // Mismo total por jurado: en 3 criterios, p1 y p2 ambos suman 30 por jurado si usamos 10+10+10 vs 15+10+5 etc
    // Misma suma por jurado para ambos participantes -> mismo final
    const cal: CalificacionInput[] = [
      { participante_id: 'p1', jurado_id: 'j1', criterio_id: 'c1', puntaje: 10 },
      { participante_id: 'p1', jurado_id: 'j1', criterio_id: 'c2', puntaje: 5 },
      { participante_id: 'p1', jurado_id: 'j1', criterio_id: 'c3', puntaje: 5 },
      { participante_id: 'p1', jurado_id: 'j2', criterio_id: 'c1', puntaje: 10 },
      { participante_id: 'p1', jurado_id: 'j2', criterio_id: 'c2', puntaje: 5 },
      { participante_id: 'p1', jurado_id: 'j2', criterio_id: 'c3', puntaje: 5 },
      { participante_id: 'p2', jurado_id: 'j1', criterio_id: 'c1', puntaje: 8 },
      { participante_id: 'p2', jurado_id: 'j1', criterio_id: 'c2', puntaje: 8 },
      { participante_id: 'p2', jurado_id: 'j1', criterio_id: 'c3', puntaje: 4 },
      { participante_id: 'p2', jurado_id: 'j2', criterio_id: 'c1', puntaje: 8 },
      { participante_id: 'p2', jurado_id: 'j2', criterio_id: 'c2', puntaje: 8 },
      { participante_id: 'p2', jurado_id: 'j2', criterio_id: 'c3', puntaje: 4 },
    ]
    // p1 suma j1=20 j2=20 -> media 20; p2 suma j1=20 j2=20 -> 20. Empate final.
    // Promedio c2: p1 -> (5+5)/2=5, p2 -> (8+8)/2=8 -> gana p2 en desempate
    const r = rankingPorCategoria([pa, pb], jurados, criterios, cal)
    expect(r[0].participante_id).toBe('p2')
    expect(r[1].participante_id).toBe('p1')
  })

  it('segundo desempate: si final y c2 empatan, decide c1 u otro en orden', () => {
    const cal: CalificacionInput[] = [
      { participante_id: 'p1', jurado_id: 'j1', criterio_id: 'c1', puntaje: 10 },
      { participante_id: 'p1', jurado_id: 'j1', criterio_id: 'c2', puntaje: 5 },
      { participante_id: 'p1', jurado_id: 'j1', criterio_id: 'c3', puntaje: 5 },
      { participante_id: 'p1', jurado_id: 'j2', criterio_id: 'c1', puntaje: 10 },
      { participante_id: 'p1', jurado_id: 'j2', criterio_id: 'c2', puntaje: 5 },
      { participante_id: 'p1', jurado_id: 'j2', criterio_id: 'c3', puntaje: 5 },
      { participante_id: 'p2', jurado_id: 'j1', criterio_id: 'c1', puntaje: 6 },
      { participante_id: 'p2', jurado_id: 'j1', criterio_id: 'c2', puntaje: 5 },
      { participante_id: 'p2', jurado_id: 'j1', criterio_id: 'c3', puntaje: 9 },
      { participante_id: 'p2', jurado_id: 'j2', criterio_id: 'c1', puntaje: 6 },
      { participante_id: 'p2', jurado_id: 'j2', criterio_id: 'c2', puntaje: 5 },
      { participante_id: 'p2', jurado_id: 'j2', criterio_id: 'c3', puntaje: 9 },
    ]
    // Suma p1: 20+20=40/2=20 por jurado media de totales: j1=20 j2=20 -> final 20
    // p2: j1=20 j2=20 -> 20. Empate.
    // c2 promedio: ambos 5. Empate.
    // Siguiente en orden de desempate tras c2 es c1 luego c3: c1 promedio p1=10 p2=6 -> gana p1
    const r = rankingPorCategoria([pa, pb], jurados, criterios, cal)
    expect(r[0].participante_id).toBe('p1')
  })
})

function buildFull(pid: string, perCriterio: number): CalificacionInput[] {
  const out: CalificacionInput[] = []
  for (const jid of ['j1', 'j2']) {
    for (const c of criterios) {
      out.push({ participante_id: pid, jurado_id: jid, criterio_id: c.id, puntaje: perCriterio })
    }
  }
  return out
}
