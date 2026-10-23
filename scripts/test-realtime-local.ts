// Integration test: live tallies reach other users over Realtime; votes themselves stay private.
// LOCAL STACK ONLY; cleans up after itself.   supabase start && npm run test:realtime
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { usernameToEmail } from '../supabase/functions/_shared/username.ts'
import { getTarget } from './target.ts'

const target = getTarget('local', execFileSync)
const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
const publishableKey = (status.match(/^(?:PUBLISHABLE_KEY|ANON_KEY)="?([^"\n]+)/m) ?? [])[1]
const service = createClient(target.url, target.secretKey, { auth: { persistSession: false } })
const users: string[] = []
let bracketId = ''

async function user(username: string): Promise<SupabaseClient> {
  const { data, error } = await service.auth.admin.createUser({ email: usernameToEmail(username), password: 'pass-123456', email_confirm: true })
  if (error) throw error
  users.push(data.user.id)
  await service.from('profiles').insert({ id: data.user.id, username, display_name: username, must_change_password: false })
  const c = createClient(target.url, publishableKey, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email: usernameToEmail(username), password: 'pass-123456' })
  await c.realtime.setAuth((await c.auth.getSession()).data.session!.access_token)
  return c
}

async function main() {
  const watcher = await user('ztest-watch')
  const voter = await user('ztest-vote')
  const { data: b } = await service.from('brackets').insert({ title: 'ztest-rt', phase: 'live' }).select('id').single()
  bracketId = b!.id
  const { data: es } = await service.from('entries').insert([{ bracket_id: bracketId, name: 'A' }, { bracket_id: bracketId, name: 'B' }]).select('id')
  await service.from('stages').insert({ bracket_id: bracketId, number: 1, round: 1, label: 'R64 A', status: 'open' })
  const { data: m } = await service.from('matchups').insert({ bracket_id: bracketId, round: 1, slot: 0, stage: 1, entry_a: es![0].id, entry_b: es![1].id }).select('id').single()

  const tallies: { votes_a: number }[] = []
  // Wait for Realtime's "Subscribed to PostgreSQL" system message: change streaming is only live after it.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime never confirmed the postgres_changes subscription')), 20000)
    watcher
      .channel('rt-test')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matchup_tallies', filter: `bracket_id=eq.${bracketId}` }, (p) => tallies.push(p.new as { votes_a: number }))
      .on('system', {}, (msg: { extension?: string; status?: string; message?: string }) => {
        if (msg.extension === 'postgres_changes') {
          clearTimeout(timer)
          if (msg.status === 'ok') resolve()
          else reject(new Error(`postgres_changes: ${msg.message}`))
        }
      })
      .subscribe((s) => (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? reject(new Error(s)) : undefined))
  })

  const { error } = await voter.rpc('cast_vote', { p_matchup_id: m!.id, p_entry_id: es![0].id })
  assert.equal(error, null, error?.message)

  for (let i = 0; i < 50 && tallies.length === 0; i++) await new Promise((r) => setTimeout(r, 100))
  assert.ok(tallies.length > 0, 'watcher should receive a tally update')
  assert.equal(tallies.at(-1)!.votes_a, 1)
  console.log('  ✓ tally update reached another user over Realtime')

  // The votes table isn't in the Realtime publication, so subscribing to it is refused outright.
  const refused = await new Promise<string>((resolve) => {
    watcher
      .channel('rt-votes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => resolve('received a vote event'))
      .on('system', {}, (msg: { extension?: string; status?: string }) => {
        if (msg.extension === 'postgres_changes') resolve(msg.status === 'ok' ? 'subscribed' : 'refused')
      })
      .subscribe()
    setTimeout(() => resolve('timeout'), 15000)
  })
  assert.equal(refused, 'refused', 'subscribing to votes must be refused')
  const { data: seen } = await watcher.from('votes').select('*')
  assert.equal(seen!.length, 0, 'watcher cannot read the voter\'s vote while open')
  console.log('  ✓ the vote itself stays private')
  console.log('All realtime tests passed.')
  await watcher.removeAllChannels()
}

main()
  .catch((err) => {
    console.error('FAILED:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    if (bracketId) await service.from('brackets').delete().eq('id', bracketId)
    for (const id of users) await service.auth.admin.deleteUser(id)
    process.exit()
  })
