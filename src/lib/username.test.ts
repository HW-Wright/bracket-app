import { describe, expect, it } from 'vitest'
import { isValidUsername, LOGIN_EMAIL_DOMAIN, normaliseUsername, usernameToEmail } from '../../supabase/functions/_shared/username.ts'

describe('username mapping', () => {
  it('is case-insensitive and trims', () => {
    expect(normaliseUsername('  Joe ')).toBe('joe')
    expect(usernameToEmail('JOE')).toBe(`joe@${LOGIN_EMAIL_DOMAIN}`)
    expect(usernameToEmail('joe')).toBe(usernameToEmail('Joe'))
  })

  it('accepts all eight gang usernames', () => {
    for (const u of ['harry', 'kier', 'ollie', 'reiss', 'joe', 'sean', 'conor', 'hutton']) {
      expect(isValidUsername(u)).toBe(true)
    }
  })

  it('rejects junk', () => {
    expect(isValidUsername('')).toBe(false)
    expect(isValidUsername('a')).toBe(false)
    expect(isValidUsername('joe@x.com')).toBe(false)
    expect(isValidUsername('jo e')).toBe(false)
    expect(() => usernameToEmail('1joe')).toThrow()
  })
})
