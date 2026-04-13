/** Nombre de archivo seguro: EventoNombre_YYYY-MM-DD.ext */
export function nombreArchivoEvento(nombreEvento: string, fechaIso: string, extension: string) {
  const d = fechaIso.slice(0, 10)
  const base = slugify(nombreEvento) || 'evento'
  return `${base}_${d}.${extension.replace(/^\./, '')}`
}

function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60)
}
