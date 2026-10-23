// Admin-only user management: add a user, reset a password, deactivate/reactivate.
// Needs the service role key, so it lives here rather than in a Postgres RPC.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isValidUsername, MIN_PASSWORD_LENGTH, normaliseUsername, usernameToEmail } from '../_shared/username.ts'

type Action =
  | { action: 'add_user'; username: string; displayName: string; tempPassword: string }
  | { action: 'reset_password'; userId: string; tempPassword: string }
  | { action: 'set_active'; userId: string; active: boolean }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function checkPassword(pw: unknown): string {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  return pw
}

async function requireAdmin(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Not signed in')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Not signed in')
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin, active')
    .eq('id', data.user.id)
    .maybeSingle()
  if (!profile?.is_admin || !profile.active) throw new HttpError(403, 'Admins only')
  return data.user.id
}

async function handle(body: Action, callerId: string) {
  switch (body.action) {
    case 'add_user': {
      const username = normaliseUsername(body.username ?? '')
      if (!isValidUsername(username)) throw new HttpError(400, 'Username must be 2–24 letters, digits, - or _')
      const displayName = (body.displayName ?? '').trim()
      if (!displayName) throw new HttpError(400, 'Display name is required')
      const { data, error } = await admin.auth.admin.createUser({
        email: usernameToEmail(username),
        password: checkPassword(body.tempPassword),
        email_confirm: true,
        user_metadata: { username },
      })
      if (error) throw new HttpError(400, error.message)
      const { error: pErr } = await admin
        .from('profiles')
        .insert({ id: data.user.id, username, display_name: displayName, must_change_password: true })
      if (pErr) {
        await admin.auth.admin.deleteUser(data.user.id)
        throw new HttpError(400, pErr.message)
      }
      return { userId: data.user.id }
    }

    case 'reset_password': {
      const { error } = await admin.auth.admin.updateUserById(body.userId, {
        password: checkPassword(body.tempPassword),
      })
      if (error) throw new HttpError(400, error.message)
      await admin.from('profiles').update({ must_change_password: true }).eq('id', body.userId)
      return { ok: true }
    }

    case 'set_active': {
      if (body.userId === callerId && !body.active) throw new HttpError(400, "You can't deactivate yourself")
      // A ban blocks sign-in and token refresh; ~100 years is effectively permanent.
      const { error } = await admin.auth.admin.updateUserById(body.userId, {
        ban_duration: body.active ? 'none' : '876000h',
      })
      if (error) throw new HttpError(400, error.message)
      await admin.from('profiles').update({ active: body.active }).eq('id', body.userId)
      return { ok: true }
    }

    default:
      throw new HttpError(400, 'Unknown action')
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const callerId = await requireAdmin(req)
    return json(await handle(await req.json(), callerId))
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    return json({ error: err instanceof Error ? err.message : 'Unexpected error' }, status)
  }
})
