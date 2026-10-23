// Creates the gang's auth users + profiles from users.local.json. Idempotent: existing users keep their
// passwords; only display name / admin flag are synced.
//
//   npm run seed:users          # live project (.env)
//   npm run seed:users:local    # local Docker stack
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  isValidUsername,
  MIN_PASSWORD_LENGTH,
  normaliseUsername,
  usernameToEmail,
} from '../supabase/functions/_shared/username.ts'
import { getTarget } from './target.ts'

interface SeedUser {
  username: string
  displayName: string
  password: string
  isAdmin?: boolean
}

function loadUsers(path: string): SeedUser[] {
  const users = JSON.parse(readFileSync(path, 'utf8')) as SeedUser[]
  const seen = new Set<string>()
  for (const u of users) {
    const name = normaliseUsername(u.username ?? '')
    if (!isValidUsername(name)) throw new Error(`Invalid username "${u.username}"`)
    if (seen.has(name)) throw new Error(`Duplicate username "${name}"`)
    seen.add(name)
    if (!u.displayName?.trim()) throw new Error(`${name}: displayName is required`)
    if ((u.password ?? '').length < MIN_PASSWORD_LENGTH) {
      throw new Error(`${name}: password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    }
  }
  if (!users.some((u) => u.isAdmin)) throw new Error('At least one user must have "isAdmin": true')
  return users
}

async function main() {
  const target = getTarget(process.argv.includes('--local') ? 'local' : 'live', execFileSync)
  const users = loadUsers('users.local.json')
  const admin = createClient(target.url, target.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw listError
  const byEmail = new Map(list.users.map((u) => [u.email, u]))

  console.log(`Seeding ${users.length} users into ${target.label}`)
  for (const u of users) {
    const username = normaliseUsername(u.username)
    const email = usernameToEmail(username)
    let id = byEmail.get(email)?.id
    let created = false

    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: u.password,
        email_confirm: true,
        user_metadata: { username },
      })
      if (error) throw new Error(`${username}: ${error.message}`)
      id = data.user.id
      created = true
    }

    // Upsert without touching must_change_password for existing users.
    const { error: profileError } = created
      ? await admin.from('profiles').insert({
          id,
          username,
          display_name: u.displayName.trim(),
          is_admin: !!u.isAdmin,
          must_change_password: true,
        })
      : await admin
          .from('profiles')
          .upsert(
            { id, username, display_name: u.displayName.trim(), is_admin: !!u.isAdmin },
            { onConflict: 'id' },
          )
    if (profileError) throw new Error(`${username} profile: ${profileError.message}`)

    console.log(`  ${created ? 'created ' : 'exists  '} ${username}${u.isAdmin ? ' (admin)' : ''}`)
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
