import * as XLSX from 'xlsx'
import type { CalificacionInput, CriterioMeta, ParticipanteMeta } from '@/utils/ranking'
import { rankingPorCategoria } from '@/utils/ranking'
import { nombreArchivoEvento } from '@/lib/export-filename'

type JuradoRow = { id: string; nombre_completo: string; orden: number }
type CatRow = { id: string; nombre: string; orden: number }

type CriterioConNombre = CriterioMeta & { nombre: string }

export function buildExcelConcurso(params: {
  nombreEvento: string
  fechaIso: string
  categorias: CatRow[]
  criterios: CriterioConNombre[]
  jurados: JuradoRow[]
  participantesPorCategoria: Map<string, ParticipanteMeta[]>
  calificaciones: CalificacionInput[]
  puestosPremio?: number
}): { blob: Blob; filename: string } {
  const {
    nombreEvento,
    fechaIso,
    categorias,
    criterios,
    jurados,
    participantesPorCategoria,
    calificaciones,
    puestosPremio = 3,
  } = params
  const juradoIds = [...jurados].sort((a, b) => a.orden - b.orden).map((j) => j.id)
  const juradoLabels = [...jurados].sort((a, b) => a.orden - b.orden).map((j) => j.nombre_completo)
  const critOrden = [...criterios].sort((a, b) => a.orden - b.orden)

  const wb = XLSX.utils.book_new()

  const resumenRows: (string | number)[][] = [['Categoría', 'Puesto', 'Código', 'Participante', 'Puntaje final']]

  for (const cat of [...categorias].sort((a, b) => a.orden - b.orden)) {
    const parts = participantesPorCategoria.get(cat.id) ?? []
    const calCat = calificaciones.filter((c) => parts.some((p) => p.id === c.participante_id))
    const ranked = rankingPorCategoria(parts, juradoIds, criterios, calCat)

    const head: (string | number)[] = [
      'Código',
      'Nombre',
      ...juradoLabels.flatMap((jn) => critOrden.map((cr) => `${jn.slice(0, 12)}_${cr.nombre.slice(0, 14)}`)),
      'Promedio final',
      'Puesto',
    ]
    const data: (string | number)[][] = [head]

    const calMap = new Map<string, Map<string, Map<string, number>>>()
    for (const c of calCat) {
      if (!calMap.has(c.participante_id)) calMap.set(c.participante_id, new Map())
      const pm = calMap.get(c.participante_id)!
      if (!pm.has(c.jurado_id)) pm.set(c.jurado_id, new Map())
      pm.get(c.jurado_id)!.set(c.criterio_id, c.puntaje)
    }

    for (const row of ranked) {
      const line: (string | number)[] = [row.codigo, row.nombre_completo]
      for (const jid of juradoIds) {
        for (const cr of critOrden) {
          const v = calMap.get(row.participante_id)?.get(jid)?.get(cr.id)
          line.push(v ?? '')
        }
      }
      line.push(row.puntaje_final, row.puesto)
      data.push(line)
    }

    for (const row of ranked.slice(0, puestosPremio)) {
      resumenRows.push([cat.nombre, row.puesto, row.codigo, row.nombre_completo, row.puntaje_final])
    }

    const ws = XLSX.utils.aoa_to_sheet(data)
    const safeName = cat.nombre.slice(0, 28).replace(/[[\]*?:/\\]/g, '')
    XLSX.utils.book_append_sheet(wb, ws, safeName || 'Cat')
  }

  const wsRes = XLSX.utils.aoa_to_sheet(resumenRows)
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const filename = nombreArchivoEvento(nombreEvento, fechaIso, 'xlsx')
  return { blob, filename }
}

export function descargarBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
