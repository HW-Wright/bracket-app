import { describe, expect, it } from 'vitest'
import { readSupabaseEnv } from './env'

describe('readSupabaseEnv', () => {
  it('returns trimmed values without a trailing slash', () => {
    expect(
      readSupabaseEnv({
        VITE_SUPABASE_URL: ' https://abc.supabase.co/ ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
      }),
    ).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_x' })
  })

  it('throws when a value is missing', () => {
    expect(() => readSupabaseEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co' })).toThrow(/Missing/)
  })

  it('throws on a non-URL', () => {
    expect(() =>
      readSupabaseEnv({ VITE_SUPABASE_URL: 'abc', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' }),
    ).toThrow(/http/)
  })
})
