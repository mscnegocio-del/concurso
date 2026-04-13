export type RolUsuario = 'super_admin' | 'admin' | 'administrador'

export type UsuarioPerfil = {
  id: string
  organizacionId: string
  email: string
  rol: RolUsuario
  nombreCompleto: string
}
