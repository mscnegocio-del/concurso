export type JuradoSession = {
  eventoId: string
  eventoNombre: string
  codigoAcceso: string
  juradoId: string
  nombreCompleto: string
  orden: number
  /** Token opaco para RPCs de jurado (sin Supabase Auth). */
  tokenSesion: string
  /** Logo institucional (organización), si viene del RPC de ingreso. */
  logoUrl?: string | null
}
