// Dev-only dry run: simulates a complete bracket end to end against the LOCAL stack with eight fake users,
// then wipes everything it created. Exercises the real RPCs and RLS, exactly as the app uses them.
//
//   supabase start && npm run dry-run            # run and wipe
//   npm run dry-run -- --keep                    # leave it in place to click around (wipe with --wipe)
//   npm run dry-run -- --stages=2            # stop with stage 3 open, keep data
//   npm run dry-run -- --wipe
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { usernameToEmail } from '../supabase/functions/_shared/username.ts'
import { getTarget } from './target.ts'

const PREFIX = 'zdry'
const TITLE = 'Dry run: greatest films'
const PASSWORD = 'dry-run-pass'
const POOL = [
  'Heat', 'Alien', 'Aliens', 'The Thing', 'Jaws', 'Spider-Man', 'Spider-Man 2', 'The Godfather', 'Goodfellas', 'Casablanca',
  'Vertigo', 'Psycho', 'Rear Window', 'Chinatown', 'Taxi Driver', 'Raging Bull', 'Fargo', 'No Country for Old Men', 'Se7en', 'Zodiac',
  'The Matrix', 'Blade Runner', 'Terminator 2', 'RoboCop', 'Die Hard', 'Predator', 'Back to the Future', 'E.T.', 'Jurassic Park', 'Paddington 2',
  'Toy Story', 'Up', 'WALL·E', 'Spirited Away', 'My Neighbour Totoro', 'Amélie', 'Parasite', 'Oldboy', 'Seven Samurai', 'Ran',
  'Lawrence of Arabia', 'Apocalypse Now', 'Platoon', 'Full Metal Jacket', 'The Shining', 'A Clockwork Orange', '2001: A Space Odyssey', 'Dr. Strangelove', 'Barry Lyndon', 'Eyes Wide Shut',
  'Pulp Fiction', 'Reservoir Dogs', 'Jackie Brown', 'Kill Bill', 'Fight Club', 'The Social Network', 'Gone Girl', 'Inception', 'Interstellar', 'The Dark Knight',
  'Memento', 'Mad Max: Fury Road', 'Gladiator', 'Titanic', 'Arrival', 'Sicario', 'Dune', 'Whiplash', 'La La Land', 'Moonlight',
  'Get Out', 'Hereditary', 'The Exorcist', 'Halloween', 'Scream', 'Ghostbusters', 'Groundhog Day', 'Airplane!', 'Withnail and I', 'Hot Fuzz',
]
// Spelling variants some users type instead, to exercise auto-combine (exact) and suggestions (near).
const VARIANTS: Record<string, string[]> = {
  'Spider-Man': ['spiderman', 'Spider Man'],
  'The Thing': ['thing'],
  'Se7en': ['se7en'],
  'The Dark Knight': ['Dark Knight', 'The Dark Knight!'],
  Alien: ['Alein'], // typo: a fuzzy suggestion, not an auto-combine
}

const rand = (n: number) => Math.floor(Math.random() * n)
const shuffle = <T>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)

const target = getTarget('local', execFileSync)
const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
const publishableKey = (status.match(/^(?:PUBLISHABLE_KEY|ANON_KEY)="?([^"\n]+)/m) ?? [])[1]
const service = createClient(target.url, target.secretKey, { auth: { persistSession: false } })

async function wipe() {
  await service.from('brackets').delete().eq('title', TITLE)
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data.users.filter((u) => u.email?.startsWith(`${PREFIX}-`))) await service.auth.admin.deleteUser(u.id)
}

async function signIn(username: string): Promise<SupabaseClient> {
  const c = createClient(target.url, publishableKey, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: usernameToEmail(username), password: PASSWORD })
  if (error) throw error
  return c
}

async function call(c: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await c.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

async function main() {
  if (process.argv.includes('--wipe')) {
    await wipe()
    return console.log('Wiped dry-run data.')
  }
  console.log(`Dry run against ${target.label}`)
  await wipe()

  // 1. Eight users; the first is admin. All past the forced password change.
  const names = ['Harry', 'Kier', 'Ollie', 'Reiss', 'Joe', 'Sean', 'Conor', 'Hutton']
  const clients: SupabaseClient[] = []
  for (const [i, display] of names.entries()) {
    const username = `${PREFIX}-${display.toLowerCase()}`
    const { data, error } = await service.auth.admin.createUser({ email: usernameToEmail(username), password: PASSWORD, email_confirm: true })
    if (error) throw error
    await service.from('profiles').insert({ id: data.user.id, username, display_name: `${display} (dry)`, is_admin: i === 0, must_change_password: false })
    clients.push(await signIn(username))
  }
  const [admin] = clients
  const { data: active } = await service.from('brackets').select('title').is('archived_at', null).maybeSingle()
  if (active) throw new Error(`An active bracket exists locally ("${active.title}"); abandon it first.`)

  // 2. Bracket + nominations. One user (Hutton) stops at 10 so their list doesn't count.
  const bracketId = (await call(admin, 'create_bracket', { p_title: TITLE, p_description: 'Simulated by scripts/dry-run.ts' })) as string
  await call(admin, 'set_bracket_phase', { p_bracket_id: bracketId, p_to: 'nominations' })
  for (const [i, c] of clients.entries()) {
    const picks = shuffle(POOL).slice(0, i === 7 ? 10 : 15).map((t) => (VARIANTS[t] && Math.random() < 0.5 ? VARIANTS[t][rand(VARIANTS[t].length)] : t))
    const key = (t: string) => t.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '')
    const unique = [...new Map(picks.map((p) => [key(p), p])).values()]
    while (unique.length < (i === 7 ? 10 : 15)) unique.push(`Filler ${i}-${unique.length}`)
    await call(c, 'save_nominations', { p_bracket_id: bracketId, p_items: unique })
  }
  const progress = ((await call(clients[3], 'nomination_progress', { p_bracket_id: bracketId })) as { submitted: number; total: number }[])[0]
  console.log(`  nominations: ${progress.submitted} of ${progress.total} complete (Hutton deliberately incomplete)`)
  const { data: peek } = await clients[3].from('nominations').select('user_id').eq('bracket_id', bracketId)
  assert.ok(peek!.every((n) => n.user_id === peek![0].user_id), 'blind while open')

  // 3. Close: entries built, exact variants combined. Merge one fuzzy suggestion; top up to 64 if short.
  await call(admin, 'set_bracket_phase', { p_bracket_id: bracketId, p_to: 'review' })
  const suggestions = (await call(admin, 'duplicate_suggestions', { p_bracket_id: bracketId })) as { entry_a: string; entry_b: string; name_a: string; name_b: string }[]
  // Like Harry would: merge the genuine typo, leave e.g. "Spider-Man 2" vs "Spider-Man" alone.
  const typo = suggestions.find((s) => [s.name_a, s.name_b].includes('Alein'))
  console.log(`  ${suggestions.length} suggestions: ${suggestions.slice(0, 3).map((s) => `${s.name_a} ~ ${s.name_b}`).join('; ')}`)
  if (typo) {
    await call(admin, 'merge_entries', { p_a: typo.entry_a, p_b: typo.entry_b, p_name: 'Alien' })
    console.log(`  merged suggestion: ${typo.name_a} + ${typo.name_b} -> Alien`)
  }
  let standings = (await call(admin, 'entry_standings', { p_bracket_id: bracketId })) as { name: string; points: number; spellings: string[]; removed: boolean }[]
  const combined = standings.filter((s) => s.spellings.length > 1)
  console.log(`  entries: ${standings.length} (${combined.length} with several spellings, e.g. ${combined.slice(0, 2).map((s) => s.spellings.join(' / ')).join('; ') || 'none'})`)
  for (let i = standings.filter((s) => !s.removed).length; i < 64; i++) await call(admin, 'add_manual_entry', { p_bracket_id: bracketId, p_name: `Manual ${i + 1}` })
  standings = (await call(admin, 'entry_standings', { p_bracket_id: bracketId })) as typeof standings
  console.log(`  seed 1: ${standings[0].name} (${standings[0].points} pts)`)

  // 4. Lock and play every stage with random votes (each user votes in ~80% of matchups).
  await call(admin, 'lock_seeding', { p_bracket_id: bracketId })
  const { data: stages } = await service.from('stages').select('number, label').eq('bracket_id', bracketId).order('number')
  // --stages=N: close only the first N stages and leave the next one open (for clicking around).
  const stopArg = process.argv.find((a) => a.startsWith('--stages='))
  const stopAfter = stopArg ? Number(stopArg.split('=')[1]) : Infinity
  for (const stage of stages!) {
    if (stage.number > stopAfter) {
      const { data: ms } = await service.from('matchups').select('id, entry_a, entry_b').eq('bracket_id', bracketId).eq('stage', stage.number)
      for (const c of clients.slice(1, 6)) for (const m of ms!) if (Math.random() < 0.6) await call(c, 'cast_vote', { p_matchup_id: m.id, p_entry_id: Math.random() < 0.5 ? m.entry_a : m.entry_b })
      console.log(`  stopped with ${stage.label} open (some votes cast)`)
      console.log(`Kept. Log in locally as ${PREFIX}-harry / ${PASSWORD}. Wipe with: npm run dry-run -- --wipe`)
      return
    }
    const { data: ms } = await service.from('matchups').select('id, entry_a, entry_b').eq('bracket_id', bracketId).eq('stage', stage.number)
    let cast = 0
    for (const c of clients) {
      for (const m of ms!) {
        if (Math.random() < 0.8) {
          await call(c, 'cast_vote', { p_matchup_id: m.id, p_entry_id: Math.random() < 0.5 ? m.entry_a : m.entry_b })
          cast++
        }
      }
    }
    // Voters stay hidden while open.
    const { data: visible } = await clients[4].from('votes').select('user_id, matchups!inner(stage, bracket_id)').eq('matchups.bracket_id', bracketId).eq('matchups.stage', stage.number)
    assert.ok(visible!.every((v) => v.user_id === visible![0]?.user_id), 'only own votes visible while open')
    // Tallies match the real votes.
    const { data: tallies } = await service.from('matchup_tallies').select('votes_a, votes_b').eq('bracket_id', bracketId).eq('stage', stage.number)
    assert.equal(tallies!.reduce((n, t) => n + t.votes_a + t.votes_b, 0), cast, 'tallies add up to votes cast')

    await call(admin, 'close_stage_and_advance', { p_bracket_id: bracketId })
    const { data: decided } = await service.from('matchups').select('decided_by').eq('bracket_id', bracketId).eq('stage', stage.number)
    const tosses = decided!.filter((d) => d.decided_by === 'coin_toss').length
    console.log(`  ${stage.label}: ${ms!.length} games, ${cast} votes, ${tosses} coin toss${tosses === 1 ? '' : 'es'}`)
  }

  // 5. Result.
  const { data: b } = await service.from('brackets').select('phase').eq('id', bracketId).single()
  assert.equal(b!.phase, 'complete')
  const { data: undecided } = await service.from('matchups').select('id').eq('bracket_id', bracketId).is('winner', null)
  assert.equal(undecided!.length, 0, 'every matchup decided')
  const { data: finals } = await service
    .from('matchups')
    .select('slot, entry_a, entry_b, winner, w:entries!matchups_winner_fkey(name, seed)')
    .eq('bracket_id', bracketId)
    .eq('round', 6)
    .order('slot')
  const champ = finals![0].w as unknown as { name: string; seed: number }
  const third = finals![1].w as unknown as { name: string; seed: number }
  console.log(`  CHAMPION: ${champ.name} (seed ${champ.seed}); third place: ${third.name} (seed ${third.seed})`)

  if (process.argv.includes('--keep')) {
    console.log(`Kept. Log in locally as ${PREFIX}-harry / ${PASSWORD}. Wipe with: npm run dry-run -- --wipe`)
  } else {
    await wipe()
    console.log('Dry run passed and wiped.')
  }
}

main().catch(async (err) => {
  console.error('DRY RUN FAILED:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
