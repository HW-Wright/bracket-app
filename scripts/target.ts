// Resolves which Supabase project a dev script talks to.
import type { execFileSync as ExecFileSync } from 'node:child_process'

export interface Target {
  label: string
  url: string
  secretKey: string
}

export function getTarget(kind: 'live' | 'local', execFileSync: typeof ExecFileSync): Target {
  if (kind === 'local') {
    const out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
    const env = Object.fromEntries(
      out
        .split('\n')
        .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => [m[1], m[2]]),
    )
    const secretKey = env.SECRET_KEY || env.SERVICE_ROLE_KEY
    if (!env.API_URL || !secretKey) throw new Error('Local stack not running? Try `supabase start`.')
    return { label: `local stack (${env.API_URL})`, url: env.API_URL, secretKey }
  }

  const url = process.env.VITE_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY in .env')
  return { label: `LIVE project (${url})`, url, secretKey }
}
