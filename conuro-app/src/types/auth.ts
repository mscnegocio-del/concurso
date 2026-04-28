export type RolUsuario = 'super_admin' | 'admin' | 'coordinador'

export type UsuarioPerfil = {
  id: string
  organizacionId: string
  email: string
  rol: RolUsuario
  nombreCompleto: string
}
