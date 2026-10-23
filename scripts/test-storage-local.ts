// Integration test for entry-image storage rules. LOCAL STACK ONLY; cleans up after itself.
//   supabase start && npm run test:storage
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { usernameToEmail } from '../supabase/functions/_shared/username.ts'
import { getTarget } from './target.ts'

const target = getTarget('local', execFileSync)
const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
const publishableKey = (status.match(/^(?:PUBLISHABLE_KEY|ANON_KEY)="?([^"\n]+)/m) ?? [])[1]
const service = createClient(target.url, target.secretKey, { auth: { persistSession: false } })
const users: string[] = []
let bracketId = ''

async function user(username: string, isAdmin: boolean) {
  const { data, error } = await service.auth.admin.createUser({ email: usernameToEmail(username), password: 'pass-123456', email_confirm: true })
  if (error) throw error
  users.push(data.user.id)
  await service.from('profiles').insert({ id: data.user.id, username, display_name: username, is_admin: isAdmin, must_change_password: false })
  const c = createClient(target.url, publishableKey, { auth: { persistSession: false } })
  await c.auth.signInWithPassword({ email: usernameToEmail(username), password: 'pass-123456' })
  return c
}

const png = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')], { type: 'image/jpeg' })

async function main() {
  const admin = await user('ztest-admin', true)
  const joe = await user('ztest-joe', false)
  const { data: b } = await service.from('brackets').insert({ title: 'ztest', phase: 'review' }).select('id').single()
  bracketId = b!.id
  const { data: e } = await service.from('entries').insert({ bracket_id: bracketId, name: 'Heat' }).select('id').single()
  const path = `${bracketId}/${e!.id}-test.jpg`

  const denied = await joe.storage.from('entry-images').upload(`${bracketId}/joe.jpg`, png)
  assert.ok(denied.error, 'non-admin upload must fail')
  console.log('  ✓ non-admin cannot upload')

  const ok = await admin.storage.from('entry-images').upload(path, png, { contentType: 'image/jpeg' })
  assert.equal(ok.error, null, ok.error?.message)
  console.log('  ✓ admin can upload')

  const res = await fetch(admin.storage.from('entry-images').getPublicUrl(path).data.publicUrl)
  assert.equal(res.status, 200)
  console.log('  ✓ public URL readable without auth')

  assert.ok((await joe.rpc('set_entry_image', { p_entry_id: e!.id, p_path: path })).error, 'non-admin set_entry_image must fail')
  assert.equal((await admin.rpc('set_entry_image', { p_entry_id: e!.id, p_path: path })).error, null)
  assert.ok((await admin.rpc('set_entry_image', { p_entry_id: e!.id, p_path: 'elsewhere/x.jpg' })).error, 'path outside bracket rejected')
  console.log('  ✓ set_entry_image: admin only, path checked')

  const del = await joe.storage.from('entry-images').remove([path])
  assert.equal((del.data ?? []).length, 0, 'non-admin delete must not remove anything')
  assert.equal((await fetch(admin.storage.from('entry-images').getPublicUrl(path).data.publicUrl)).status, 200)
  console.log('  ✓ non-admin cannot delete')

  assert.equal((await admin.storage.from('entry-images').remove([path])).error, null)
  console.log('All storage tests passed.')
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
