import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#171717',
  },
  logos: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  logo: { width: 90, height: 50, objectFit: 'contain' },
  title: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 11, textAlign: 'center', color: '#64748b', marginBottom: 16 },
  section: { marginTop: 12 },
  h: { fontSize: 12, fontWeight: 'bold', marginBottom: 6, color: '#1e3a8a' },
  line: { marginBottom: 3 },
  cat: { marginTop: 10 },
  podium: { marginLeft: 8, marginTop: 4 },
})

export type ActaGanador = {
  puesto: number
  codigo: string
  nombre: string
  puntaje: number
}

export type ActaCategoriaPdf = {
  nombre: string
  ganadores: ActaGanador[]
}

export function ActaConcursoPdf({
  orgNombre,
  logoPjUrl,
  logoSubsedeUrl,
  eventoNombre,
  fechaTexto,
  descripcion,
  jurados,
  categorias,
}: {
  orgNombre: string
  logoPjUrl: string | null
  logoSubsedeUrl: string | null
  eventoNombre: string
  fechaTexto: string
  descripcion: string | null
  jurados: string[]
  categorias: ActaCategoriaPdf[]
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.logos}>
          {logoPjUrl ? <Image style={styles.logo} src={logoPjUrl} /> : <View style={{ width: 90 }} />}
          {logoSubsedeUrl ? <Image style={styles.logo} src={logoSubsedeUrl} /> : <View style={{ width: 90 }} />}
        </View>
        <Text style={styles.title}>{orgNombre}</Text>
        <Text style={styles.subtitle}>Acta de resultados — {eventoNombre}</Text>
        <Text style={styles.line}>Fecha del evento: {fechaTexto}</Text>
        {descripcion ? <Text style={styles.line}>Temática: {descripcion}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.h}>Jurado calificador</Text>
          {jurados.map((n, i) => (
            <Text key={i} style={styles.line}>
              {i + 1}. {n}
            </Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.h}>Resultados por categoría</Text>
          {categorias.map((c, i) => (
            <View key={i} style={styles.cat} wrap={false}>
              <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>{c.nombre}</Text>
              {c.ganadores.map((g) => (
                <Text key={`${g.puesto}-${g.codigo}`} style={styles.podium}>
                  {g.puesto}° {g.nombre} ({g.codigo}) — {g.puntaje} pts.
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={{ marginTop: 32 }}>
          <Text style={styles.line}>Espacio para firmas de jurados: ________________________________</Text>
        </View>
        <Text
          style={{ position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: '#94a3b8' }}
          fixed
        >
          Documento generado electrónicamente — Poder Judicial del Perú
        </Text>
      </Page>
    </Document>
  )
}
