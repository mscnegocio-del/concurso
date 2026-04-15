import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

type EventoRow = {
  id: string
  nombre: string
  fecha: string
  estado: string
  codigo_acceso: string
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  abierto: 'Abierto',
  calificando: 'Calificando',
  cerrado: 'Cerrado',
  publicado: 'Publicado',
}

const ESTADO_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  borrador: 'secondary',
  abierto: 'default',
  calificando: 'default',
  cerrado: 'outline',
  publicado: 'outline',
}

function formatFecha(fecha: string): string {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function AdministradorHistorialPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const navigate = useNavigate()
  const [eventos, setEventos] = useState<EventoRow[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const cargar = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const { data } = await supabase
      .from('eventos')
      .select('id, nombre, fecha, estado, codigo_acceso')
      .eq('organizacion_id', orgId)
      .lt('fecha', today)
      .order('fecha', { ascending: false })
    setEventos((data as EventoRow[]) ?? [])
    setLoading(false)
  }, [orgId, today])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (!orgId) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Historial</h2>
        {!loading && eventos.length > 0 && (
          <span className="text-sm text-muted-foreground">{eventos.length} evento{eventos.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : eventos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <History className="h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium text-muted-foreground">Sin eventos anteriores</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {eventos.map((e) => (
            <Card key={e.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{e.nombre}</CardTitle>
                  <Badge variant={ESTADO_VARIANT[e.estado] ?? 'secondary'} className="shrink-0">
                    {ESTADO_LABEL[e.estado] ?? e.estado}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{formatFecha(e.fecha)}</p>
              </CardHeader>
              <CardContent className="pt-0 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/administrador/evento/${e.id}`)}
                >
                  Ver coordinación →
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
