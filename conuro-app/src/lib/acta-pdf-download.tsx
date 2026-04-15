import { pdf } from '@react-pdf/renderer'
import {
  ActaConcursoPdf,
  type ActaCategoriaPdf,
} from '@/components/acta/ActaConcursoPdf'
import { nombreArchivoEvento } from '@/lib/export-filename'

export async function descargarActaPdf(params: {
  nombreEvento: string
  fechaIso: string
  orgNombre: string
  logoPjUrl: string | null
  logoSubsedeUrl: string | null
  descripcion: string | null
  codigoAcceso: string
  criteriosNombres: string[]
  jurados: string[]
  categorias: ActaCategoriaPdf[]
}): Promise<{ filename: string }> {
  const fechaTexto = new Date(params.fechaIso).toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const blob = await pdf(
    <ActaConcursoPdf
      orgNombre={params.orgNombre}
      logoPjUrl={params.logoPjUrl}
      logoSubsedeUrl={params.logoSubsedeUrl}
      eventoNombre={params.nombreEvento}
      fechaTexto={fechaTexto}
      descripcion={params.descripcion}
      codigoAcceso={params.codigoAcceso}
      criteriosNombres={params.criteriosNombres}
      jurados={params.jurados}
      categorias={params.categorias}
    />,
  ).toBlob()
  const filename = nombreArchivoEvento(params.nombreEvento, params.fechaIso, 'pdf')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
  return { filename }
}
