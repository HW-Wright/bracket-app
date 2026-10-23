// Smoke test: the app's PostgREST queries for Bracket/Entry/Stats/Archive succeed as a signed-in user
// against a locally simulated bracket with closed stages. LOCAL ONLY; cleans up.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
// Keep in step with MATCHUP_SELECT in src/bracket/useStage.ts
const MATCHUP_SELECT = 'id, round, slot, stage, winner, decided_by, a:entries!matchups_entry_a_fkey(id, name, seed, image_path), b:entries!matchups_entry_b_fkey(id, name, seed, image_path)'
import { usernameToEmail } from '../supabase/functions/_shared/username.ts'
import { getTarget } from './target.ts'

const target = getTarget('local', execFileSync)
const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
const key = (status.match(/^(?:PUBLISHABLE_KEY|ANON_KEY)="?([^"\n]+)/m) ?? [])[1]
const service = createClient(target.url, target.secretKey, { auth: { persistSession: false } })
const users: string[] = []
let bracketId = ''

async function user(username: string, isAdmin: boolean) {
  const { data } = await service.auth.admin.createUser({ email: usernameToEmail(username), password: 'pass-123456', email_confirm: true })
  users.push(data.user!.id)
  await service.from('profiles').insert({ id: data.user!.id, username, display_name: username, is_admin: isAdmin, must_change_password: false })
  const c = createClient(target.url, key, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email: usernameToEmail(username), password: 'pass-123456' })
  return c
}

async function main() {
  const admin = await user('ztest-admin', true)
  const joe = await user('ztest-joe', false)
  const { data: b } = await service.from('brackets').insert({ title: 'ztest-smoke', phase: 'review' }).select('id').single()
  bracketId = b!.id
  await service.from('entries').insert(Array.from({ length: 64 }, (_, i) => ({ bracket_id: bracketId, name: `E${i + 1}`, manual: true, tiebreak: i })))
  assert.equal((await admin.rpc('lock_seeding', { p_bracket_id: bracketId })).error, null)
  const { data: r1 } = await admin.from('matchups').select('id, entry_a').eq('bracket_id', bracketId).eq('round', 1)
  for (const m of r1!) await joe.rpc('cast_vote', { p_matchup_id: m.id, p_entry_id: m.entry_a })
  assert.equal((await admin.rpc('close_stage_and_advance', { p_bracket_id: bracketId })).error, null)

  const checks: [string, PromiseLike<{ error: { message: string } | null; data: unknown }>][] = [
    ['matchups embed', joe.from('matchups').select(MATCHUP_SELECT).eq('bracket_id', bracketId)],
    ['votes inner join', joe.from('votes').select('matchup_id, user_id, entry_id, matchups!inner(bracket_id)').eq('matchups.bracket_id', bracketId)],
    ['tallies', joe.from('matchup_tallies').select('matchup_id, votes_a, votes_b').eq('bracket_id', bracketId)],
    ['stages', joe.from('stages').select('number, round, label, status').eq('bracket_id', bracketId)],
    ['archive finals', joe.from('matchups').select(`bracket_id, ${MATCHUP_SELECT}`).eq('round', 6).in('bracket_id', [bracketId])],
    ['standings', joe.rpc('entry_standings', { p_bracket_id: bracketId })],
    ['entry nominations', joe.from('nominations').select('rank, text, user_id, profiles(display_name)').in('entry_id', [r1![0].entry_a])],
  ]
  for (const [name, q] of checks) {
    const { error, data } = await q
    assert.equal(error, null, `${name}: ${error?.message}`)
    console.log(`  ✓ ${name} (${Array.isArray(data) ? data.length : 1} rows)`)
  }
  const { data: votes } = await joe.from('votes').select('matchup_id, matchups!inner(bracket_id)').eq('matchups.bracket_id', bracketId)
  assert.equal(votes!.length, 32, 'joe sees the 32 revealed stage-1 votes')
  console.log('All query smoke tests passed.')
}

main()
  .catch((err) => {
    console.error('FAILED:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    if (bracketId) await service.from('brackets').delete().eq('id', bracketId)
    for (const id of users) await service.auth.admin.deleteUser(id)
  })
