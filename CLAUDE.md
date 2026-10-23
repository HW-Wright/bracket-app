# The Gang Does a Bracket

Private mobile-first bracket voting app for 8 friends. Full requirements: `SPEC.md` (source of truth; read it before changing behaviour).

## Stack
- Vite + React 19 + TypeScript, Tailwind v4 (tokens in `src/index.css` `@theme`), react-router `HashRouter`.
- Supabase (Postgres, Auth, Storage, Realtime, RPC). Edge Functions only where the secret key is required.
- Hosted on GitHub Pages (public repo). `vite.config.ts` uses `base: './'` so the build works at any path.
- Node 24 LTS (`.nvmrc`). Run `nvm use` first.

## Commands
- `npm run dev`: local dev server (needs `.env`)
- `npm test`: Vitest (pure logic in `src/**/*.test.ts`)
- `npm run typecheck`, `npm run lint`, `npm run build`
- `supabase start` / `supabase db reset`: local stack (Docker) for RLS/RPC tests
- `npm run test:db`: pgTAP RLS tests in `supabase/tests/database` (local stack)
- `npm run test:auth`: login + admin-users integration test (local stack + `supabase functions serve`)
- `npm run seed:users` / `seed:users:local`: create users from gitignored `users.local.json` (idempotent)
- `supabase db push`: apply migrations to the linked live project (ask Harry before destructive changes)
- `supabase functions deploy <name> --use-api`: deploy an Edge Function

## Auth model
- Username login: `usernameToEmail()` in `supabase/functions/_shared/username.ts` maps `joe` to `joe@users.gang-bracket.invalid`. Shared by app, scripts and functions; keep it runtime-agnostic.
- `profiles` (is_admin, must_change_password, active). Clients can only SELECT; writes go through service role (seed script, `admin-users` function). `is_admin()` is the helper for policies.
- Deactivation = `active=false` + an auth ban.
- Function EXECUTE is opt-in: default privileges are revoked, so every new function needs an explicit `grant execute ... to authenticated` (or anon).

## Brackets & nominations
- One active bracket (`archived_at is null`, enforced by a unique index). Phases: draft -> nominations -> review -> live -> complete.
- Phase moves via admin RPCs (`create_bracket`, `set_bracket_phase`, ...); `require_admin()` guards them.
- Nominations are written only through `save_nominations(bracket, text[])` (replaces the caller's list). RLS: own rows always, everyone's once phase is past `nominations`. Blind applies to the admin too.
- `normaliseEntry()` / `entryKey()` in `src/lib/normalise.ts`: comparison forms (key = normalised with spaces removed). Phase 4 needs a SQL twin.
- Harry's decision: exact `entryKey` matches auto-combine at close (splittable); fuzzy matches are suggestions only. See SPEC §5.2.
- `abandon_bracket()` deletes a pre-live bracket: every table referencing `brackets` must `on delete cascade`.

## Conventions
- All schema, RLS, functions, triggers and storage policies live in `supabase/migrations`. No dashboard edits.
- RLS on every table. Privacy rules (blind nominations, hidden voters) are enforced in the DB, not just the UI.
- Client env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public). `SUPABASE_SECRET_KEY` only in gitignored `.env` and function secrets. Never commit `.env` or `users.local.json`.
- GitHub Actions reads the public values from repo **variables** (not secrets) of the same names.
- Commit after each build phase, with tests passing.
- Design: dark art deco, black + restrained muted gold. No Batman/DC references of any kind.

## Status
Phases 1–2 done. Phase 3 (brackets & nominations) built + deployed, awaiting Harry's phone test. Next: Phase 4 (review & seeding).
