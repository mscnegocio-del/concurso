import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[ConcursoAPP] Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env (ver .env.example).',
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    global: {
      fetch: (input, init = {}) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
        }),
    },
  },
)
