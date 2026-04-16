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

type Usuario = {
  id: string
  email: string
  nombre_completo: string
  rol: string
  created_at: string
  email_confirmado: boolean
}

export function AdminUsuariosPage() {
  const { perfil } = useAuth()
  const orgId = perfil?.organizacionId
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNombre, setInviteNombre] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const loadUsuarios = useCallback(async () => {
    if (!orgId) return
    setError(null)
    try {
      // Llamar a RPC para listar usuarios
      const { data, error: err } = await supabase.rpc('admin_listar_usuarios', { p_org_id: orgId })
      if (err) {
        setError(err.message)
        return
      }
      setUsuarios((data ?? []) as Usuario[])
    } catch (e) {
      setError(String(e))
    }
  }, [orgId])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await loadUsuarios()
      setLoading(false)
    })()
  }, [loadUsuarios])

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return
    const subscription = supabase
      .channel(`usuarios:org:${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios', filter: `organizacion_id=eq.${orgId}` },
        () => {
          void loadUsuarios()
        },
      )
      .subscribe()
    return () => {
      void subscription.unsubscribe()
    }
  }, [orgId, loadUsuarios])

  async function handleInvitar(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !perfil) return
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
          rol: 'administrador',
          organizacion_id: orgId,
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
      await loadUsuarios()
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
      await loadUsuarios()
    } catch (e) {
      toast.error(String(e))
    }
  }

  if (!perfil || !orgId) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Usuarios</h2>
        <p className="mt-1 text-muted-foreground">
          Gestiona coordinadores y administradores de tu organización.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
        <form className="mt-4 flex max-w-lg flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={(e) => handleInvitar(e)}>
          <div className="min-w-[10rem] flex-1 space-y-2">
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="coordinador@institucion.edu.pe"
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
        <h3 className="text-lg font-semibold text-foreground">Usuarios de la organización</h3>
        {loading ? (
          <div className="mt-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : usuarios.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Sin usuarios adicionales todavía.</p>
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
    </div>
  )
}
