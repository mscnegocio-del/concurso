const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generarCodigoAccesoEvento(): string {
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += CHARSET[Math.floor(Math.random() * CHARSET.length)]
  }
  return s
}
