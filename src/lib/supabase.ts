import { createClient } from '@supabase/supabase-js'
import { readSupabaseEnv } from './env'

const env = readSupabaseEnv(import.meta.env)

// Persisted session + auto refresh keeps friends logged in on their phones.
export const supabase = createClient(env.url, env.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
