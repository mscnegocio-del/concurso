import type { RolUsuario } from '@/types/auth'

export function getRoleHome(rol: RolUsuario): string {
  switch (rol) {
    case 'super_admin':
      return '/super'
    case 'admin':
      return '/admin'
    case 'coordinador':
      return '/administrador'
    default: {
      const _exhaustive: never = rol
      return _exhaustive
    }
  }
}
