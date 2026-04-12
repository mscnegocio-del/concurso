import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { JuradoContext } from '@/contexts/jurado-context-value'
import { JURADO_SESSION_KEY } from '@/lib/constants'
import type { JuradoSession } from '@/types/jurado'

function readStored(): JuradoSession | null {
  try {
    const raw = sessionStorage.getItem(JURADO_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as JuradoSession
    if (
      parsed &&
      parsed.eventoId &&
      parsed.juradoId &&
      parsed.nombreCompleto &&
      parsed.codigoAcceso &&
      parsed.tokenSesion
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function JuradoProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<JuradoSession | null>(readStored)

  const setSession = useCallback((s: JuradoSession | null) => {
    if (s) {
      sessionStorage.setItem(JURADO_SESSION_KEY, JSON.stringify(s))
    } else {
      sessionStorage.removeItem(JURADO_SESSION_KEY)
    }
    setSessionState(s)
  }, [])

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(JURADO_SESSION_KEY)
    setSessionState(null)
  }, [])

  const value = useMemo(
    () => ({ session, setSession, clearSession }),
    [session, setSession, clearSession],
  )

  return (
    <JuradoContext.Provider value={value}>{children}</JuradoContext.Provider>
  )
}
