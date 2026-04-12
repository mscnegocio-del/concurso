export type PlantillaPublica = 'oscuro' | 'claro'

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

/** Presets sugeridos para alinear con logos institucionales (solo atajos; el admin puede poner cualquier #RRGGBB válido). */
export const PUBLICO_ACCENT_PRESETS = [
  { label: 'Azul', hex: '#1E3A5F' },
  { label: 'Verde', hex: '#0F766E' },
  { label: 'Granate', hex: '#7F1D1D' },
  { label: 'Dorado', hex: '#B45309' },
  { label: 'Violeta', hex: '#6D28D9' },
  { label: 'Cielo', hex: '#0369A1' },
  { label: 'Ámbar', hex: '#F59E0B' },
  { label: 'Índigo', hex: '#2563EB' },
] as const

export function normalizePlantillaPublica(v: unknown): PlantillaPublica {
  return v === 'claro' ? 'claro' : 'oscuro'
}

export function normalizeAccentHex(v: string | null | undefined): string | null {
  if (v == null || typeof v !== 'string') return null
  const t = v.trim()
  return HEX_RE.test(t) ? t.toUpperCase() : null
}

export function defaultAccentForPlantilla(p: PlantillaPublica): string {
  return p === 'claro' ? '#2563EB' : '#F59E0B'
}

/** Acento final: hex guardado si es válido; si no, default del tema. */
export function resolvePublicoAccent(plantilla: PlantillaPublica, hex: string | null | undefined): string {
  return normalizeAccentHex(hex) ?? defaultAccentForPlantilla(plantilla)
}
