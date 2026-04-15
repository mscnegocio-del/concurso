const prefix = 'ConcursoAPP_org_evento_foco_'

export function getStoredEventoFoco(orgId: string): string | null {
  try {
    const v = localStorage.getItem(`${prefix}${orgId}`)
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function setStoredEventoFoco(orgId: string, eventoId: string): void {
  try {
    localStorage.setItem(`${prefix}${orgId}`, eventoId)
  } catch {
    /* ignore */
  }
}
