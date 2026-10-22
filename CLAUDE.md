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
- `supabase db push`: apply migrations to the linked live project (ask Harry before destructive changes)

## Conventions
- All schema, RLS, functions, triggers and storage policies live in `supabase/migrations`. No dashboard edits.
- RLS on every table. Privacy rules (blind nominations, hidden voters) are enforced in the DB, not just the UI.
- Client env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public). `SUPABASE_SECRET_KEY` only in gitignored `.env` and function secrets. Never commit `.env` or `users.local.json`.
- GitHub Actions reads the public values from repo **variables** (not secrets) of the same names.
- Commit after each build phase, with tests passing.
- Design: dark art deco, black + restrained muted gold. No Batman/DC references of any kind.

## Status
Phase 1 (scaffold & deploy) in progress.
