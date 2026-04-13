import { createContext } from 'react'
import type { JuradoSession } from '@/types/jurado'

export type JuradoContextValue = {
  session: JuradoSession | null
  setSession: (s: JuradoSession | null) => void
  clearSession: () => void
}

export const JuradoContext = createContext<JuradoContextValue | null>(null)
