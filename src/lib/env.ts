export interface SupabaseEnv {
  url: string
  key: string
}

/** Validates the public Supabase config baked in at build time. */
export function readSupabaseEnv(raw: Record<string, string | undefined>): SupabaseEnv {
  const url = raw.VITE_SUPABASE_URL?.trim()
  const key = raw.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
  }
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`VITE_SUPABASE_URL must be an http(s) URL, got "${url}"`)
  }
  return { url: url.replace(/\/+$/, ''), key }
}
