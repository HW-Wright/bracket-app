// Creates (or deletes) a throwaway "Test – ignore" bracket in REVIEW with 64 dummy entries, so voting can be
// tried on phones without collecting 64 real nominations. Never touches any other bracket.
//
//   npm run test-bracket -- create [--local]
//   npm run test-bracket -- delete [--local]
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { getTarget } from './target.ts'

const TITLE = 'Test – ignore'
const VILLAINS = [
  'Darth Vader', 'Hannibal Lecter', 'The Joker', 'Hans Gruber', 'Nurse Ratched', 'Annie Wilkes', 'Pennywise', 'Norman Bates',
  'Anton Chigurh', 'Patrick Bateman', 'Bane', 'Thanos', 'Voldemort', 'Sauron', 'Agent Smith', 'The Terminator',
  'HAL 9000', 'Freddy Krueger', 'Michael Myers', 'Jason Voorhees', 'Jack Torrance', 'Regan MacNeil', 'Ursula', 'Scar',
  'Cruella de Vil', 'Maleficent', 'Jafar', 'Captain Hook', 'The Wicked Witch', 'Gollum', 'Loki', 'Magneto',
  'Lex Luthor', 'General Zod', 'Dracula', 'Frankenstein’s Monster', 'Amon Goeth', 'Hans Landa', 'Bill the Butcher', 'Alonzo Harris',
  'Gordon Gekko', 'Tony Montana', 'Keyser Söze', 'John Doe', 'Max Cady', 'Frank Booth', 'Alex DeLarge', 'Mr Potter',
  'The Predator', 'The Xenomorph', 'T-1000', 'Roy Batty', 'Colonel Kurtz', 'Bellatrix Lestrange', 'Dolores Umbridge', 'Syndrome',
  'Hopper', 'Gaston', 'Shere Khan', 'Mrs Danvers', 'Harry Lime', 'Auric Goldfinger', 'Ernst Blofeld', 'Mr Blonde',
]

async function main() {
  const [, , cmd] = process.argv
  const target = getTarget(process.argv.includes('--local') ? 'local' : 'live', execFileSync)
  const db = createClient(target.url, target.secretKey, { auth: { persistSession: false } })

  if (cmd === 'delete') {
    const { data, error } = await db.from('brackets').delete().eq('title', TITLE).select('id')
    if (error) throw error
    for (const b of data ?? []) {
      const { data: files } = await db.storage.from('entry-images').list(b.id, { limit: 1000 })
      if (files?.length) await db.storage.from('entry-images').remove(files.map((f) => `${b.id}/${f.name}`))
    }
    console.log(`Deleted ${data?.length ?? 0} "${TITLE}" bracket(s) from ${target.label}`)
    return
  }

  if (cmd !== 'create') throw new Error('Usage: npm run test-bracket -- create|delete [--local]')

  const { data: active } = await db.from('brackets').select('id, title').is('archived_at', null).maybeSingle()
  if (active) throw new Error(`An active bracket already exists ("${active.title}"). Abandon or finish it first.`)
  const { data: admin } = await db.from('profiles').select('id').eq('is_admin', true).limit(1).maybeSingle()

  const { data: bracket, error } = await db
    .from('brackets')
    .insert({
      title: TITLE,
      description: 'Dummy entries for testing voting. Abandon when done.',
      phase: 'review',
      created_by: admin?.id ?? null,
      nominations_opened_at: new Date().toISOString(),
      nominations_closed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw error
  const { error: entryError } = await db
    .from('entries')
    .insert(VILLAINS.map((name) => ({ bracket_id: bracket.id, name, manual: true })))
  if (entryError) throw entryError
  console.log(`Created "${TITLE}" in review with ${VILLAINS.length} entries on ${target.label}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
