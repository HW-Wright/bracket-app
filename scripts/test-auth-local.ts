// Integration test for username login, forced password change and the admin-users Edge Function.
// LOCAL STACK ONLY. Creates throwaway ztest-* users and deletes them afterwards.
//
//   supabase start && supabase functions serve   # in another terminal
//   npm run test:auth
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { usernameToEmail } from '../supabase/functions/_shared/username.ts'
import { getTarget } from './target.ts'

const target = getTarget('local', execFileSync)
const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' })
const publishableKey = (status.match(/^(?:PUBLISHABLE_KEY|ANON_KEY)="?([^"\n]+)/m) ?? [])[1]
assert.ok(publishableKey, 'no publishable/anon key from supabase status')

const service = createClient(target.url, target.secretKey, { auth: { persistSession: false } })
const client = () => createClient(target.url, publishableKey, { auth: { persistSession: false } })
const created: string[] = []

async function makeUser(username: string, password: string, isAdmin = false) {
  const { data, error } = await service.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  })
  if (error) throw error
  created.push(data.user.id)
  const { error: pErr } = await service
    .from('profiles')
    .insert({ id: data.user.id, username, display_name: username, is_admin: isAdmin })
  if (pErr) throw pErr
  return data.user.id
}

async function signIn(username: string, password: string): Promise<SupabaseClient> {
  const c = client()
  const { error } = await c.auth.signInWithPassword({ email: usernameToEmail(username), password })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return c
}

async function call(c: SupabaseClient | null, body: object) {
  const res = await fetch(`${target.url}/functions/v1/admin-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      ...(c ? { Authorization: `Bearer ${(await c.auth.getSession()).data.session!.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as Record<string, string> }
}

const flag = async (id: string) =>
  (await service.from('profiles').select('must_change_password').eq('id', id).single()).data!.must_change_password

async function step(name: string, fn: () => Promise<void>) {
  await fn()
  console.log(`  ✓ ${name}`)
}

async function main() {
  console.log(`Auth integration tests against ${target.label}`)
  await makeUser('ztest-admin', 'admin-pass-1', true)
  await makeUser('ztest-user', 'user-pass-1')

  await step('login is case-insensitive', async () => {
    await signIn('ZTest-User', 'user-pass-1')
  })
  await step('wrong password is rejected', async () => {
    await assert.rejects(signIn('ztest-user', 'nope-nope'))
  })
  await step('function rejects anonymous callers (401)', async () => {
    assert.equal((await call(null, { action: 'add_user' })).status, 401)
  })
  await step('function rejects non-admins (403)', async () => {
    const user = await signIn('ztest-user', 'user-pass-1')
    assert.equal((await call(user, { action: 'add_user' })).status, 403)
  })

  const admin = await signIn('ztest-admin', 'admin-pass-1')
  let newId = ''
  await step('admin adds a user who must change password', async () => {
    const res = await call(admin, { action: 'add_user', username: 'ztest-new', displayName: 'New', tempPassword: 'temp-123' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    newId = res.body.userId
    created.push(newId)
    assert.equal(await flag(newId), true)
  })
  await step('duplicate username is rejected', async () => {
    const res = await call(admin, { action: 'add_user', username: 'ZTEST-NEW', displayName: 'Dup', tempPassword: 'temp-123' })
    assert.equal(res.status, 400)
  })
  await step('short temp password is rejected', async () => {
    const res = await call(admin, { action: 'reset_password', userId: newId, tempPassword: '123' })
    assert.equal(res.status, 400)
  })
  await step('user changes password and clears the flag', async () => {
    const c = await signIn('ztest-new', 'temp-123')
    assert.equal((await c.auth.updateUser({ password: 'mine-456' })).error, null)
    assert.equal((await c.rpc('complete_password_change')).error, null)
    assert.equal(await flag(newId), false)
    await signIn('ztest-new', 'mine-456')
  })
  await step('admin reset sets temp password and re-raises the flag', async () => {
    assert.equal((await call(admin, { action: 'reset_password', userId: newId, tempPassword: 'reset-789' })).status, 200)
    assert.equal(await flag(newId), true)
    await signIn('ztest-new', 'reset-789')
  })
  await step('deactivated user cannot sign in; reactivated can', async () => {
    assert.equal((await call(admin, { action: 'set_active', userId: newId, active: false })).status, 200)
    await assert.rejects(signIn('ztest-new', 'reset-789'), (e: { code?: string }) => e.code === 'user_banned')
    assert.equal((await call(admin, { action: 'set_active', userId: newId, active: true })).status, 200)
    await signIn('ztest-new', 'reset-789')
  })
  await step('admin cannot deactivate themselves', async () => {
    const { data } = await admin.auth.getUser()
    assert.equal((await call(admin, { action: 'set_active', userId: data.user!.id, active: false })).status, 400)
  })
  await step('non-admin cannot promote themselves via a direct update', async () => {
    const user = await signIn('ztest-user', 'user-pass-1')
    const { error } = await user.from('profiles').update({ is_admin: true }).eq('username', 'ztest-user')
    assert.ok(error, 'expected permission error')
  })
  console.log('All auth tests passed.')
}

main()
  .catch((err) => {
    console.error('FAILED:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    for (const id of created) await service.auth.admin.deleteUser(id)
  })
