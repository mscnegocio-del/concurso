import { describe, expect, it } from 'vitest'
import { maxJuradosPorPlan, puedeAgregarJurado, puedeExportarPdf } from './planes'

describe('planes', () => {
  it('PDF deshabilitado en gratuito', () => {
    expect(puedeExportarPdf('gratuito')).toBe(false)
    expect(puedeExportarPdf('free')).toBe(false)
    expect(puedeExportarPdf('basico')).toBe(true)
    expect(puedeExportarPdf('institucional')).toBe(true)
  })

  it('límite de jurados en gratuito', () => {
    expect(maxJuradosPorPlan('gratuito')).toBe(3)
    expect(puedeAgregarJurado('gratuito', 2)).toBe(true)
    expect(puedeAgregarJurado('gratuito', 3)).toBe(false)
    expect(puedeAgregarJurado('basico', 99)).toBe(true)
  })
})
