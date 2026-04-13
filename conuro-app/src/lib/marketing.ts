/** Superficie desde la que se enlaza la web de producto (UTM medium). */
export type MarketingUtmMedium = 'jurado_login' | 'jurado_panel' | 'publico_tv' | 'home'

/**
 * URL base de la landing / marketing. Opcional: si falta, se usa VITE_APP_URL o el origen actual.
 */
export function getMarketingSiteUrl(): string {
  const custom = import.meta.env.VITE_MARKETING_SITE_URL?.trim()
  if (custom) return custom.replace(/\/$/, '')
  const app = import.meta.env.VITE_APP_URL?.trim()
  if (app) return app.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/**
 * Enlace absoluto a la web de producto con parámetros UTM para analítica.
 */
export function buildMarketingLink(opts: {
  utm_medium: MarketingUtmMedium
  utm_campaign?: string
}): string {
  const base = getMarketingSiteUrl() || (typeof window !== 'undefined' ? window.location.origin : '')
  const u = new URL(base)
  u.searchParams.set('utm_source', 'app')
  u.searchParams.set('utm_medium', opts.utm_medium)
  if (opts.utm_campaign) u.searchParams.set('utm_campaign', opts.utm_campaign)
  return u.toString()
}
