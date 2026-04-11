import { useCallback, useState } from 'react'
import type { ActaCategoriaPdf } from '@/components/acta/ActaConcursoPdf'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { puedeExportarPdf } from '@/lib/planes'
import { supabase } from '@/lib/supabase'
import type { CalificacionInput, CriterioMeta, ParticipanteMeta } from '@/utils/ranking'
import { rankingPorCategoria } from '@/utils/ranking'

type EventoExport = {
  id: string
  organizacion_id: string
  nombre: string
  descripcion: string | null
  fecha: string
  estado: string
  puestos_a_premiar: number
}

export function AdminExportaciones({
  evento,
  planOrganizacion,
  setError,
}: {
  evento: EventoExport
  planOrganizacion: string
  setError: (s: string | null) => void
}) {
  const puedeExportar = evento.estado === 'cerrado' || evento.estado === 'publicado'
  const puedePdfPlan = puedeExportarPdf(planOrganizacion)
  const [busy, setBusy] = useState<'idle' | 'xlsx' | 'pdf'>('idle')

  const ejecutar = useCallback(async () => {
    const { data: org, error: eOrg } = await supabase
      .from('organizaciones')
      .select('nombre, logo_url, logo_subsede_url')
      .eq('id', evento.organizacion_id)
      .single()
    if (eOrg || !org) throw new Error(eOrg?.message ?? 'No se pudo cargar la organización.')

    const { data: cats, error: eCats } = await supabase
      .from('categorias')
      .select('id, nombre, orden')
      .eq('evento_id', evento.id)
      .order('orden')
    if (eCats) throw new Error(eCats.message)
    const categorias = cats ?? []
    if (categorias.length === 0) throw new Error('No hay categorías.')

    const { data: crit, error: eCrit } = await supabase
      .from('criterios')
      .select('id, nombre, orden, es_criterio_desempate')
      .eq('evento_id', evento.id)
      .order('orden')
    if (eCrit) throw new Error(eCrit.message)
    const criterios: (CriterioMeta & { nombre: string })[] = (crit ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      orden: c.orden,
      es_criterio_desempate: c.es_criterio_desempate,
    }))
    if (criterios.length === 0) throw new Error('No hay criterios.')

    const { data: jur, error: eJur } = await supabase
      .from('jurados')
      .select('id, nombre_completo, orden')
      .eq('evento_id', evento.id)
      .order('orden')
    if (eJur) throw new Error(eJur.message)
    const jurados = jur ?? []
    if (jurados.length === 0) throw new Error('No hay jurados.')

    const catIds = categorias.map((c) => c.id)
    const { data: parts, error: ePart } = await supabase
      .from('participantes')
      .select('id, codigo, nombre_completo, categoria_id')
      .in('categoria_id', catIds)
    if (ePart) throw new Error(ePart.message)
    const participantes = (parts ?? []).filter(
      (p): p is ParticipanteMeta & { categoria_id: string } => Boolean(p.categoria_id),
    )
    if (participantes.length === 0) throw new Error('No hay participantes.')

    const partIds = participantes.map((p) => p.id)
    const { data: calRows, error: eCal } = await supabase
      .from('calificaciones')
      .select('participante_id, jurado_id, criterio_id, puntaje')
      .in('participante_id', partIds)
    if (eCal) throw new Error(eCal.message)
    const calificaciones: CalificacionInput[] = (calRows ?? []).map((c) => ({
      participante_id: c.participante_id,
      jurado_id: c.jurado_id,
      criterio_id: c.criterio_id,
      puntaje: Number(c.puntaje),
    }))

    const participantesPorCategoria = new Map<string, ParticipanteMeta[]>()
    for (const p of participantes) {
      const list = participantesPorCategoria.get(p.categoria_id) ?? []
      list.push(p)
      participantesPorCategoria.set(p.categoria_id, list)
    }

    const juradoIds = jurados.map((j) => j.id)
    const categoriasPdf: ActaCategoriaPdf[] = []
    for (const cat of categorias) {
      const plist = participantesPorCategoria.get(cat.id) ?? []
      const calCat = calificaciones.filter((c) => plist.some((p) => p.id === c.participante_id))
      const ranked = rankingPorCategoria(plist, juradoIds, criterios, calCat)
      const ganadores = ranked.slice(0, evento.puestos_a_premiar).map((r) => ({
        puesto: r.puesto,
        codigo: r.codigo,
        nombre: r.nombre_completo,
        puntaje: r.puntaje_final,
      }))
      categoriasPdf.push({ nombre: cat.nombre, ganadores })
    }

    return {
      org,
      categorias,
      criterios,
      jurados,
      participantesPorCategoria,
      calificaciones,
      categoriasPdf,
    }
  }, [evento])

  async function onExcel() {
    setError(null)
    setBusy('xlsx')
    try {
      const { buildExcelConcurso, descargarBlob } = await import('@/lib/excel-export')
      const d = await ejecutar()
      const { blob, filename } = buildExcelConcurso({
        nombreEvento: evento.nombre,
        fechaIso: evento.fecha,
        categorias: d.categorias,
        criterios: d.criterios,
        jurados: d.jurados,
        participantesPorCategoria: d.participantesPorCategoria,
        calificaciones: d.calificaciones,
        puestosPremio: evento.puestos_a_premiar,
      })
      descargarBlob(blob, filename)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar Excel.')
    } finally {
      setBusy('idle')
    }
  }

  async function onPdf() {
    if (!puedePdfPlan) {
      setError('El plan gratuito no incluye exportación PDF. Actualiza el plan de la organización (super admin).')
      return
    }
    setError(null)
    setBusy('pdf')
    try {
      const { descargarActaPdf } = await import('@/lib/acta-pdf-download')
      const d = await ejecutar()
      await descargarActaPdf({
        nombreEvento: evento.nombre,
        fechaIso: evento.fecha,
        orgNombre: d.org.nombre,
        logoPjUrl: d.org.logo_url,
        logoSubsedeUrl: d.org.logo_subsede_url,
        descripcion: evento.descripcion,
        jurados: d.jurados.map((j) => j.nombre_completo),
        categorias: d.categoriasPdf,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar PDF.')
    } finally {
      setBusy('idle')
    }
  }

  return (
    <SimplePanel>
      <h3 className="text-lg font-semibold text-foreground">Exportación</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Excel y acta PDF con ranking oficial. Disponible cuando el evento está{' '}
        <strong>cerrado</strong> o <strong>publicado</strong>. El PDF requiere plan distinto de gratuito.
      </p>
      {puedeExportar && !puedePdfPlan && (
        <Alert className="mt-3">
          <AlertDescription>
            Tu organización está en <strong>plan gratuito</strong>: puedes descargar Excel; el PDF está deshabilitado.
          </AlertDescription>
        </Alert>
      )}
      {!puedeExportar && (
        <Alert className="mt-3 border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertDescription>
            Cierra el evento desde «Estado del evento» para habilitar exportaciones.
          </AlertDescription>
        </Alert>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="default"
          className="bg-emerald-700 text-white hover:bg-emerald-800"
          disabled={!puedeExportar || busy !== 'idle'}
          onClick={() => void onExcel()}
        >
          {busy === 'xlsx' ? 'Generando Excel…' : 'Descargar Excel'}
        </Button>
        <Button
          type="button"
          disabled={!puedeExportar || !puedePdfPlan || busy !== 'idle'}
          onClick={() => void onPdf()}
        >
          {busy === 'pdf' ? 'Generando PDF…' : 'Descargar acta PDF'}
        </Button>
      </div>
    </SimplePanel>
  )
}
