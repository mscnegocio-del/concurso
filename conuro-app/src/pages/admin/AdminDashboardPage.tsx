import { SimplePanel } from '@/components/layouts/PanelLayout'

export function AdminDashboardPage() {
  return (
    <SimplePanel>
      <h2 className="text-lg font-semibold text-slate-900">Resumen</h2>
      <p className="mt-2 text-sm text-slate-600">
        Sprint 2: rutas y sesión listas. En el Sprint 3 se conectará el CRUD de eventos,
        categorías, participantes y jurados.
      </p>
    </SimplePanel>
  )
}
