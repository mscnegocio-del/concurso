import { useContext } from 'react'
import {
  JuradoContext,
  type JuradoContextValue,
} from '@/contexts/jurado-context-value'

export function useJurado(): JuradoContextValue {
  const ctx = useContext(JuradoContext)
  if (!ctx) {
    throw new Error('useJurado debe usarse dentro de JuradoProvider')
  }
  return ctx
}
