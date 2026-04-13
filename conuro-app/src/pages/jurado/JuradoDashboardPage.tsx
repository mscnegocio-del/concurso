import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useJurado } from '@/hooks/useJurado'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Fila = {
  id: string
  nombre: string
  orden: number
  total_participantes: number
  participantes_completos: number
}

export function JuradoDashboardPage() {
  const { session } = useJurado()
  const [rows, setRows] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.tokenSesion) return
    void (async () => {
      const { data, error: e } = await supabase.rpc('jurado_listar_categorias', {
        p_token: session.tokenSesion,
      })
      if (e) setError(e.message)
      else setRows((data ?? []) as Fila[])
    })()
  }, [session?.tokenSesion])

  if (!session) return null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Categorías</CardTitle>
          <CardDescription>
            Elige una categoría para ver participantes y calificar en orden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/jurado/panel/categoria/${r.id}`}
                  className={cn(
                    'flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent/50',
                  )}
                >
                  <span className="font-medium text-foreground">{r.nombre}</span>
                  <span className="text-muted-foreground">
                    {r.participantes_completos}/{r.total_participantes} listos
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length === 0 && !error && (
            <p className="mt-4 text-sm text-muted-foreground">No hay categorías en este evento.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
