import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

const AZUL = '#1e3a8a'
const AZUL_CLARO = '#dbeafe'
const GRIS_FILA = '#f8fafc'
const GRIS_TEXT = '#64748b'
const BORDE = '#e2e8f0'

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#171717',
  },
  // ── Encabezado ──────────────────────────────────────────────────────────
  headerLogos: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    marginBottom: 12,
  },
  logo: { width: 110, height: 70, objectFit: 'contain' },
  logoDivider: { width: 1, height: 50, backgroundColor: BORDE },
  dividerLine: { borderBottomWidth: 2, borderBottomColor: AZUL, marginBottom: 10 },
  orgNombre: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 3 },
  eventoTitulo: { fontSize: 17, fontWeight: 'bold', textAlign: 'center', color: AZUL, marginBottom: 12 },
  // ── Metadata ─────────────────────────────────────────────────────────────
  metaRow: { flexDirection: 'row', gap: 24, marginBottom: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', gap: 4 },
  metaLabel: { color: GRIS_TEXT },
  metaValor: { fontWeight: 'bold' },
  // ── Sección genérica ─────────────────────────────────────────────────────
  section: { marginTop: 14 },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: AZUL,
    backgroundColor: AZUL_CLARO,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  line: { marginBottom: 3 },
  // ── Criterios ─────────────────────────────────────────────────────────────
  criterioRow: { flexDirection: 'row', gap: 6, marginBottom: 2 },
  criterioNum: { color: GRIS_TEXT, width: 14 },
  // ── Categoría ─────────────────────────────────────────────────────────────
  catBlock: { marginTop: 12 },
  catNombre: {
    fontWeight: 'bold',
    fontSize: 10,
    color: AZUL,
    marginBottom: 1,
  },
  catSub: { color: GRIS_TEXT, fontSize: 8, marginBottom: 4 },
  // ── Tabla de ganadores ────────────────────────────────────────────────────
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: AZUL,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDE,
  },
  tableRowAlt: { backgroundColor: GRIS_FILA },
  colPuesto: { width: 40, color: '#fff', fontWeight: 'bold', fontSize: 8 },
  colNombre: { flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 8 },
  colCodigo: { width: 60, color: '#fff', fontWeight: 'bold', fontSize: 8 },
  colPuntaje: { width: 52, textAlign: 'right', color: '#fff', fontWeight: 'bold', fontSize: 8 },
  colPuestoD: { width: 40, fontSize: 8 },
  colNombreD: { flex: 1, fontSize: 8 },
  colCodigoD: { width: 60, fontSize: 8, color: GRIS_TEXT },
  colPuntajeD: { width: 52, textAlign: 'right', fontSize: 8, fontWeight: 'bold' },
  // ── Firmas ───────────────────────────────────────────────────────────────
  firmasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  firmaItem: { width: '45%', marginBottom: 16 },
  firmaLinea: { borderBottomWidth: 1, borderBottomColor: '#94a3b8', marginBottom: 4, height: 24 },
  firmaNombre: { fontSize: 8, textAlign: 'center', color: GRIS_TEXT },
  firmaRol: { fontSize: 7, textAlign: 'center', color: '#94a3b8' },
  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDE,
    paddingTop: 4,
    fontSize: 7,
    color: '#94a3b8',
  },
})

export type ActaGanador = {
  puesto: number
  codigo: string
  nombre: string
  puntaje: number
}

export type ActaCategoriaPdf = {
  nombre: string
  totalParticipantes: number
  ganadores: ActaGanador[]
}

const PUESTOS: Record<number, string> = { 1: '1°', 2: '2°', 3: '3°' }

export function ActaConcursoPdf({
  orgNombre,
  logoPjUrl,
  logoSubsedeUrl,
  eventoNombre,
  fechaTexto,
  descripcion,
  codigoAcceso,
  criteriosNombres,
  jurados,
  categorias,
}: {
  orgNombre: string
  logoPjUrl: string | null
  logoSubsedeUrl: string | null
  eventoNombre: string
  fechaTexto: string
  descripcion: string | null
  codigoAcceso: string
  criteriosNombres: string[]
  jurados: string[]
  categorias: ActaCategoriaPdf[]
}) {
  const tieneAmbosLogos = Boolean(logoPjUrl && logoSubsedeUrl)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Logos ── */}
        <View style={styles.headerLogos}>
          {logoPjUrl ? <Image style={styles.logo} src={logoPjUrl} /> : null}
          {tieneAmbosLogos ? <View style={styles.logoDivider} /> : null}
          {logoSubsedeUrl ? <Image style={styles.logo} src={logoSubsedeUrl} /> : null}
        </View>

        {/* ── Títulos ── */}
        <View style={styles.dividerLine} />
        <Text style={styles.orgNombre}>{orgNombre}</Text>
        <Text style={styles.eventoTitulo}>{eventoNombre}</Text>

        {/* ── Metadatos ── */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Fecha del evento:</Text>
            <Text style={styles.metaValor}>{fechaTexto}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Código:</Text>
            <Text style={styles.metaValor}>{codigoAcceso.toUpperCase()}</Text>
          </View>
          {descripcion ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Temática:</Text>
              <Text style={styles.metaValor}>{descripcion}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Criterios de evaluación ── */}
        {criteriosNombres.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>Criterios de evaluación</Text>
            {criteriosNombres.map((c, i) => (
              <View key={i} style={styles.criterioRow}>
                <Text style={styles.criterioNum}>{i + 1}.</Text>
                <Text>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Jurado calificador ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Jurado calificador</Text>
          {jurados.map((n, i) => (
            <View key={i} style={styles.criterioRow}>
              <Text style={styles.criterioNum}>{i + 1}.</Text>
              <Text>{n}</Text>
            </View>
          ))}
        </View>

        {/* ── Resultados por categoría ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Resultados por categoría</Text>
          {categorias.map((c, ci) => (
            <View key={ci} style={styles.catBlock} wrap={false}>
              <Text style={styles.catNombre}>{c.nombre}</Text>
              <Text style={styles.catSub}>{c.totalParticipantes} participante{c.totalParticipantes !== 1 ? 's' : ''} en competencia</Text>

              {/* Cabecera de tabla */}
              <View style={styles.tableHeader}>
                <Text style={styles.colPuesto}>Puesto</Text>
                <Text style={styles.colNombre}>Participante</Text>
                <Text style={styles.colCodigo}>Código</Text>
                <Text style={styles.colPuntaje}>Puntaje</Text>
              </View>

              {/* Filas de ganadores */}
              {c.ganadores.map((g, gi) => (
                <View
                  key={`${g.puesto}-${g.codigo}`}
                  style={[styles.tableRow, gi % 2 !== 0 ? styles.tableRowAlt : {}]}
                >
                  <Text style={styles.colPuestoD}>{PUESTOS[g.puesto] ?? `${g.puesto}°`}</Text>
                  <Text style={styles.colNombreD}>{g.nombre}</Text>
                  <Text style={styles.colCodigoD}>{g.codigo}</Text>
                  <Text style={styles.colPuntajeD}>{g.puntaje.toFixed(2)} pts.</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* ── Firmas individuales por jurado ── */}
        <View style={[styles.section, { marginTop: 28 }]} wrap={false}>
          <Text style={styles.sectionHeader}>Firmas del jurado calificador</Text>
          <View style={styles.firmasGrid}>
            {jurados.map((n, i) => (
              <View key={i} style={styles.firmaItem}>
                <View style={styles.firmaLinea} />
                <Text style={styles.firmaNombre}>{n}</Text>
                <Text style={styles.firmaRol}>Jurado calificador</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Footer fijo con paginación ── */}
        <View style={styles.footer} fixed>
          <Text>Documento generado electrónicamente — Poder Judicial del Perú</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
