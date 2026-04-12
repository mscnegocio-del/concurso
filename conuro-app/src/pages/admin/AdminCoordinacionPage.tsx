import { SimplePanel } from '@/components/layouts/PanelLayout'
import { CoordinacionSalaPanel } from '@/components/coordinacion/CoordinacionSalaPanel'
import { useAuth } from '@/hooks/useAuth'
import { useEventoFocoOrg } from '@/hooks/useEventoFocoOrg'

const AVISO =
  'Mismas acciones que el panel del coordinador. Úsalo si no hay coordinador en sala o para urgencias (publicar en el proyector).'

export function AdminCoordinacionPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const { evento, ready, error, reload } = useEventoFocoOrg(orgId)

  if (!perfil) return null

  if (!orgId) {
    return (
      <SimplePanel>
        <p className="text-muted-foreground">Sin organización asignada.</p>
      </SimplePanel>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <SimplePanel>
          <p className="text-sm text-destructive">{error}</p>
        </SimplePanel>
      )}
      <CoordinacionSalaPanel
        perfil={perfil}
        orgId={orgId}
        evento={evento}
        eventoReady={ready}
        onReloadEvento={() => void reload()}
        avisoAdmin={AVISO}
      />
    </div>
  )
}
