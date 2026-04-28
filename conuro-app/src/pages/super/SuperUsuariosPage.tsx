import { Loader2, Trash2, Mail } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SimplePanel } from '@/components/layouts/PanelLayout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Organizacion = {
  id: string
  nombre: string
}

type Usuario = {
  id: string
  email: string
  nombre_completo: string
  rol: string
  created_at: string
  email_confirmado: boolean
}

export function SuperUsuariosPage() {
  const { perfil } = useAuth()
  const [orgs, setOrgs] = useState<Organizacion[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOrgs, setLoadingOrgs] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNombre, setInviteNombre] = useState('')
  const [inviteRol, setInviteRol] = useState<'admin' | 'coordinador'>('admin')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Cargar organizaciones
  useEffect(() => {
    ;(async () => {
      setLoadingOrgs(true)
      try {
        const { data, error: err } = await supabase.from('organizaciones').select('id, nombre').eq('activo', true)
        if (err) {
          setError(err.message)
        } else {
          setOrgs((data ?? []) as Organizacion[])
          if (data && data.length > 0) {
            setSelectedOrgId(data[0].id)
          }
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setLoadingOrgs(false)
      }
    })()
  }, [])

  const loadUsuarios = useCallback(async (orgId: string) => {
    if (!orgId) {
      setUsuarios([])
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('admin_listar_usuarios', { p_org_id: orgId })
      if (err) {
        setError(err.message)
      } else {
        setUsuarios((data ?? []) as Usuario[])
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Cargar usuarios cuando cambia org seleccionada
  useEffect(() => {
    void loadUsuarios(selectedOrgId)
  }, [selectedOrgId, loadUsuarios])

  // Realtime subscription
  useEffect(() => {
    if (!selectedOrgId) return
    const subscription = supabase
      .channel(`usuarios:org:${selectedOrgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios', filter: `organizacion_id=eq.${selectedOrgId}` },
        () => {
          void loadUsuarios(selectedOrgId)
        },
      )
      .subscribe()
    return () => {
      void subscription.unsubscribe()
    }
  }, [selectedOrgId, loadUsuarios])

  async function handleInvitar(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedOrgId || !perfil) return
    setInviteError(null)
    setInviting(true)
    try {
      const response = await fetch('/functions/v1/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          nombre_completo: inviteNombre,
          rol: inviteRol,
          organizacion_id: selectedOrgId,
        }),
      })
      if (!response.ok) {
        const err = await response.json()
        setInviteError(err.error || 'Error al invitar usuario')
        return
      }
      toast.success(`Invitación enviada a ${inviteEmail}`)
      setInviteEmail('')
      setInviteNombre('')
      setInviteRol('admin')
      await loadUsuarios(selectedOrgId)
    } catch (e) {
      setInviteError(String(e))
    } finally {
      setInviting(false)
    }
  }

  async function handleEliminar(usuarioId: string, email: string) {
    if (usuarioId === perfil?.id) {
      toast.error('No puedes eliminar tu propia cuenta')
      return
    }
    if (!confirm(`¿Eliminar usuario ${email}? Esta acción no se puede deshacer.`)) return
    try {
      const { error: err } = await supabase.rpc('admin_eliminar_usuario', { p_usuario_id: usuarioId })
      if (err) {
        toast.error(err.message)
        return
      }
      toast.success('Usuario eliminado')
      await loadUsuarios(selectedOrgId)
    } catch (e) {
      toast.error(String(e))
    }
  }

  if (!perfil) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Gestión de usuarios</h2>
        <p className="mt-1 text-muted-foreground">
          Crea y gestiona usuarios para todas las organizaciones.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loadingOrgs ? (
        <Skeleton className="h-10 w-full max-w-xs" />
      ) : (
        <SimplePanel>
          <Label htmlFor="org-select">Seleccionar organización</Label>
          <select
            id="org-select"
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-2 flex h-10 w-full max-w-xs rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="">-- Seleccionar org --</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.nombre}
              </option>
            ))}
          </select>
        </SimplePanel>
      )}

      {selectedOrgId && (
        <>
          <SimplePanel>
            <h3 className="text-lg font-semibold text-foreground">Invitar usuario</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Envía una invitación por email. El usuario confirmará su cuenta desde el link.
            </p>
            {inviteError && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}
            <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={(e) => handleInvitar(e)}>
              <div className="min-w-[10rem] flex-1 space-y-2">
                <Label htmlFor="inv-email">Email</Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  placeholder="admin@institucion.edu.pe"
                />
              </div>
              <div className="min-w-[10rem] flex-1 space-y-2">
                <Label htmlFor="inv-nombre">Nombre completo</Label>
                <Input
                  id="inv-nombre"
                  value={inviteNombre}
                  onChange={(e) => setInviteNombre(e.target.value)}
                  required
                  placeholder="Juan García"
                />
              </div>
              <div className="min-w-[10rem] space-y-2">
                <Label htmlFor="inv-rol">Rol</Label>
                <select
                  id="inv-rol"
                  value={inviteRol}
                  onChange={(e) => setInviteRol(e.target.value as 'admin' | 'coordinador')}
                  className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <option value="admin">Admin</option>
                  <option value="coordinador">Coordinador</option>
                </select>
              </div>
              <Button type="submit" disabled={inviting} className="w-full sm:w-auto">
                {inviting ? (
                  <>
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    Invitando…
                  </>
                ) : (
                  <>
                    <Mail className="size-4" aria-hidden />
                    Invitar
                  </>
                )}
              </Button>
            </form>
          </SimplePanel>

          <SimplePanel>
            <h3 className="text-lg font-semibold text-foreground">Usuarios</h3>
            {loading ? (
              <div className="mt-4 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : usuarios.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Sin usuarios en esta organización.</p>
            ) : (
              <div className="mt-4 divide-y divide-border overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Email</th>
                      <th className="px-4 py-3 text-left font-medium">Nombre</th>
                      <th className="px-4 py-3 text-left font-medium">Rol</th>
                      <th className="px-4 py-3 text-left font-medium">Estado</th>
                      <th className="px-4 py-3 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3">{u.email}</td>
                        <td className="px-4 py-3">{u.nombre_completo}</td>
                        <td className="px-4 py-3">
                          <Badge variant={u.rol === 'admin' ? 'default' : 'secondary'}>{u.rol}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {u.email_confirmado ? (
                            <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                              Confirmado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                              Pendiente
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleEliminar(u.id, u.email)}
                            disabled={u.id === perfil.id}
                            className={cn(u.id === perfil.id && 'opacity-50 cursor-not-allowed')}
                          >
                            <Trash2 className="size-4" aria-hidden />
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SimplePanel>
        </>
      )}
    </div>
  )
}
