import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/routing/RequireAuth'
import { RequireJurado } from '@/components/routing/RequireJurado'
import { RequireRole } from '@/components/routing/RequireRole'
import { AuthProvider } from '@/contexts/auth-context'
import { JuradoProvider } from '@/contexts/jurado-context'
import { AdminCoordinacionPage } from '@/pages/admin/AdminCoordinacionPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminEventoEntryPage } from '@/pages/admin/AdminEventoEntryPage'
import { AdminHistorialPage } from '@/pages/admin/AdminHistorialPage'
import { AdminEventoPage } from '@/pages/admin/AdminEventoPage'
import { AdminOrganizacionPage } from '@/pages/admin/AdminOrganizacionPage'
import { AdminShell } from '@/pages/admin/AdminShell'
import { AdministradorDashboardPage } from '@/pages/administrador/AdministradorDashboardPage'
import { AdministradorShell } from '@/pages/administrador/AdministradorShell'
import { HomePage } from '@/pages/HomePage'
import { JuradoLoginPage } from '@/pages/JuradoLoginPage'
import { JuradoCalificarPage } from '@/pages/jurado/JuradoCalificarPage'
import { JuradoCategoriaPage } from '@/pages/jurado/JuradoCategoriaPage'
import { JuradoDashboardPage } from '@/pages/jurado/JuradoDashboardPage'
import { JuradoShell } from '@/pages/jurado/JuradoShell'
import { LoginPage } from '@/pages/LoginPage'
import { PublicoEventoPage } from '@/pages/publico/PublicoEventoPage'
import { SuperOrganizacionesPage } from '@/pages/super/SuperOrganizacionesPage'
import { SuperShell } from '@/pages/super/SuperShell'

export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <JuradoProvider>
          <AuthProvider>
            <ErrorBoundary title="Error en la aplicación">
            <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/jurado" element={<JuradoLoginPage />} />
            <Route
              path="/jurado/panel"
              element={
                <RequireJurado>
                  <JuradoShell />
                </RequireJurado>
              }
            >
              <Route index element={<JuradoDashboardPage />} />
              <Route path="categoria/:categoriaId" element={<JuradoCategoriaPage />} />
              <Route
                path="categoria/:categoriaId/participante/:participanteId"
                element={<JuradoCalificarPage />}
              />
            </Route>
            <Route path="/publico/:eventoSlug" element={<PublicoEventoPage />} />

            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <RequireRole allowed={['admin']}>
                    <AdminShell />
                  </RequireRole>
                </RequireAuth>
              }
            >
              <Route index element={<AdminDashboardPage />} />
              <Route path="evento" element={<AdminEventoEntryPage />} />
              <Route path="evento/:eventoId" element={<AdminEventoPage />} />
              <Route path="historial" element={<AdminHistorialPage />} />
              <Route path="coordinacion" element={<AdminCoordinacionPage />} />
              <Route path="organizacion" element={<AdminOrganizacionPage />} />
            </Route>

            <Route
              path="/administrador"
              element={
                <RequireAuth>
                  <RequireRole allowed={['administrador']}>
                    <AdministradorShell />
                  </RequireRole>
                </RequireAuth>
              }
            >
              <Route index element={<AdministradorDashboardPage />} />
            </Route>

            <Route
              path="/super"
              element={
                <RequireAuth>
                  <RequireRole allowed={['super_admin']}>
                    <SuperShell />
                  </RequireRole>
                </RequireAuth>
              }
            >
              <Route index element={<SuperOrganizacionesPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </ErrorBoundary>
            <Toaster position="top-center" richColors closeButton />
          </AuthProvider>
        </JuradoProvider>
      </BrowserRouter>
    </TooltipProvider>
  )
}
