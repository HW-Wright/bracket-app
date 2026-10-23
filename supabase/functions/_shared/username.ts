// Shared by the web app, the seed script and Edge Functions. Keep it free of runtime-specific APIs.

/** Placeholder domain for Supabase Auth's required email. Never shown to users; no mail is ever sent. */
export const LOGIN_EMAIL_DOMAIN = 'users.gang-bracket.invalid'

const USERNAME_RE = /^[a-z][a-z0-9_-]{1,23}$/

export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_RE.test(normaliseUsername(raw))
}

export function usernameToEmail(raw: string): string {
  const username = normaliseUsername(raw)
  if (!USERNAME_RE.test(username)) throw new Error(`Invalid username "${raw}"`)
  return `${username}@${LOGIN_EMAIL_DOMAIN}`
}

export const MIN_PASSWORD_LENGTH = 6
