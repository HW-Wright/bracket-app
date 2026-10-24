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
- Nominations are written only through `save_nominations(bracket, text[])` (replaces the caller's list). RLS: own rows always; the admin always (Harry's choice); everyone once phase is past `nominations`. Client code must filter by `user_id` when it wants "my" nominations.
- `normaliseEntry()` / `entryKey()` in `src/lib/normalise.ts`: comparison forms (key = normalised with spaces removed). Phase 4 needs a SQL twin.
- Harry's decision: exact `entryKey` matches auto-combine at close (splittable); fuzzy matches are suggestions only. See SPEC §5.2.
- A list counts only when complete: exactly 15, no repeated `entry_key` (`nomination_list_status()`, mirrored by `listStatus()` in TS). Incomplete lists are kept but excluded from seeding.
- SQL `normalise_entry()` / `entry_key()` mirror the TS versions; `complete_lists.test.sql` checks parity cases.
- `abandon_bracket()` deletes the active bracket in any phase (typed title): every table referencing `brackets` must `on delete cascade`. The UI then removes its images from storage.

## Review, seeding & bracket structure
- Closing nominations runs `build_entries()`: one `entries` row per `entry_key` from complete lists; each counted nomination's `entry_id` = the entry it ORIGINALLY landed in. Reopening deletes entries.
- Merge = `entries.merged_into` (target = earlier-created entry, so it keeps its tiebreak). Scores are always computed by `entry_standings()` over the merge tree with the best-rank-per-user rule, so unmerge is just clearing `merged_into`. `split_entry()` undoes an auto-combine by spelling.
- Order: points desc, nominators desc, stored `tiebreak` asc. `tiebreak` is set once at insert and never rewritten.
- `lock_seeding()` sets seeds 1-64, creates `stages` (6, one per round) and all `matchups` (round 1-6; round 6 slot 1 = third place; round r slot s fed by r-1 slots 2s/2s+1), opens stage 1 (the whole R64), phase -> live.
- `bracket_order()` / `stage_for()` in SQL mirror `src/lib/bracket.ts`; seeding.test.sql checks parity.
- Entry images: public bucket `entry-images`, admin-only writes (storage policies). Client resizes in `src/lib/image.ts`.
- `npm run test:storage`: storage policy integration test (local).

## Voting & advancement
- `votes` written only via `cast_vote()` while the stage is open. RLS: own rows always, everyone's once the stage is `closed`. Never subscribe to `votes` over Realtime (it isn't in the publication).
- `matchup_tallies` (trigger-maintained, one row per matchup) is what clients read and subscribe to for live counts. `stages` and `brackets` are also in the Realtime publication.
- Stages: one per round (6). Advance/undo look up whether a next stage exists rather than assuming a count.
- `close_stage_and_advance()`: one transaction; ties use stored `coin_toss_winner` if still valid else `random()` (then stored). `feed_forward()` fills the next round / third place. `stage_advances` is the undo stack for `undo_last_advance()` (typed UNDO). `override_matchup()` (typed OVERRIDE) only while the next matchup is undecided.
- `npm run test:realtime`: Realtime integration test (local).
- `npm run test-bracket -- create|delete [--local]`: throwaway "Test" bracket in review with 64 dummy entries (refuses if a real bracket is active).
- FKs into `entries` cascade/set null so deleting a bracket removes everything.

## History, stats, archive (Phase 6)
- `useBracketData(bracketId)` loads one bracket (active or archived): stages, matchups, tallies, visible votes, names; tallies live.
- Pure derivations in `src/lib/stats.ts` (upsets, voteTotals, entryPath, podium, pickStatus) with Vitest coverage.
- Screens: `/bracket` (round tabs + tree, champion card when complete), `/entry/:id`, `/stats`, `/archive`, `/archive/:id`. `MatchupCard` is shared (vote mode via `onPick`, read-only via `link`).
- `npm run test:queries`: PostgREST query smoke test (local).
- `npm run dry-run [-- --stages=N | --keep | --wipe]`: full simulated bracket on the local stack (8 fake users).

## Conventions
- All schema, RLS, functions, triggers and storage policies live in `supabase/migrations`. No dashboard edits.
- RLS on every table. Privacy rules (blind nominations, hidden voters) are enforced in the DB, not just the UI.
- Client env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public). `SUPABASE_SECRET_KEY` only in gitignored `.env` and function secrets. Never commit `.env` or `users.local.json`.
- GitHub Actions reads the public values from repo **variables** (not secrets) of the same names.
- Commit after each build phase, with tests passing.
- Design (SPEC §13): direction D colours (navy, court orange, yellow, amber, red LIVE) with direction F layouts/type: Roboto Condensed italic caps, DotGothic16 dot-matrix crawl text, IBM Plex Mono classified results, straight `Badge` tabs, white `plate` title plates, panels with navy-700 header strips. Every matchup is a "MATCH n" box (`MatchupCard`). Tokens/utilities in `src/index.css`; shared pieces in `src/components/ui.tsx`. No NCAA or broadcaster branding.

## Status
Phases 1–3 done, design direction D applied. Phase 4 done. Phase 5 done (6 stages, one per round). Phase 6 built; next Phase 7 (design polish) and 8 (dry run).
