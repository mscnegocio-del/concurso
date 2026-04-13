import { Link, Navigate } from 'react-router-dom'
import { ConuroMarketingCta } from '@/components/marketing/ConuroMarketingCta'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLoadingPlaceholder } from '@/components/layouts/AuthLoadingPlaceholder'
import { useAuth } from '@/hooks/useAuth'
import { useJurado } from '@/hooks/useJurado'
import { getRoleHome } from '@/lib/role-routes'

export function HomePage() {
  const { user, perfil, perfilError, loading } = useAuth()
  const { session: juradoSession } = useJurado()

  if (loading) {
    return <AuthLoadingPlaceholder label="Cargando sesión" />
  }

  if (user && perfilError) {
    return <Navigate to="/login" replace />
  }

  if (user && !perfil) {
    return <AuthLoadingPlaceholder label="Cargando perfil" />
  }

  if (user && perfil) {
    return <Navigate to={getRoleHome(perfil.rol)} replace />
  }

  if (juradoSession) {
    return <Navigate to="/jurado/panel" replace />
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sistema de Concurso</CardTitle>
          <CardDescription>
            Calificación con jurados, criterios y pantalla pública de resultados. Elige cómo deseas ingresar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link to="/login">Administración (correo y OTP)</Link>
          </Button>
          <Button variant="outline" asChild className="w-full">
            <Link to="/jurado">Soy jurado (código de evento)</Link>
          </Button>
        </CardContent>
      </Card>
      <div className="px-1">
        <ConuroMarketingCta utmMedium="home" className="text-center" />
      </div>
    </main>
  )
}
