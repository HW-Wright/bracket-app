# The Gang Does a Bracket

Private mobile-first bracket voting app for 8 friends. Full requirements: `SPEC.md` (source of truth; read it before changing behaviour). History, Harry's reasons, what was tried and dropped, platform quirks, settings outside the repo and open items: `HANDOVER.md`.

## Stack
- Vite + React 19 + TypeScript, Tailwind v4 (tokens in `src/index.css` `@theme`), react-router `HashRouter`.
- Supabase (Postgres, Auth, Storage, Realtime, RPC). Edge Functions only where the secret key is required.
- Hosted on GitHub Pages (public repo). `vite.config.ts` uses `base: './'` so the build works at any path.
- Node 24 LTS (`.nvmrc`). Run `nvm use` first.

## Commands
- `npm run dev`: local dev server (needs `.env`; a `.env.local` overrides it, e.g. to point at the local stack)
- `npm test`: Vitest (pure logic in `src/**/*.test.ts`)
- `npm run typecheck`, `npm run lint`, `npm run build`
- `supabase start` / `supabase db reset`: local stack (Docker) for RLS/RPC tests. Ask Harry before starting Docker (8 GB Mac; its VM has crashed under memory pressure); afterwards `supabase stop` and quit Docker Desktop.
- `npm run test:db`: pgTAP RLS tests in `supabase/tests/database` (local stack)
- `npm run test:auth`: login + admin-users integration test (local stack + `supabase functions serve`)
- `npm run seed:users` / `seed:users:local`: create users from gitignored `users.local.json` (idempotent; the first targets LIVE). Don't open `users.local.json` (starting passwords) unless Harry asks.
- `supabase db push`: apply migrations to the linked live project (ask Harry before destructive changes)
- `supabase functions deploy <name> --use-api`: deploy an Edge Function

## Auth model
- Username login: `usernameToEmail()` in `supabase/functions/_shared/username.ts` maps `joe` to `joe@users.gang-bracket.invalid`. Shared by app, scripts and functions; keep it runtime-agnostic.
- `profiles` (is_admin, must_change_password, active). Clients can only SELECT; writes go through service role (seed script, `admin-users` function). `is_admin()` is the helper for policies.
- Deactivation = `active=false` + an auth ban.
- Function EXECUTE is opt-in: default privileges are revoked, so every new function needs an explicit `grant execute ... to authenticated` (or anon).

## Brackets & nominations
- One active bracket (`archived_at is null`, enforced by a unique index). Phases: draft -> nominations -> review -> live -> complete.
- `brackets.size` (8/16/32/64/128, default 64) is set in `create_bracket` / `update_bracket` and can change until seeding is locked. `archive_bracket()` archives a complete bracket now; `create_bracket` still auto-archives a complete one. Archiving only stamps `archived_at`: all data stays.
- Phase moves via admin RPCs (`create_bracket`, `set_bracket_phase`, ...); `require_admin()` guards them.
- Nominations are written only through `save_nominations(bracket, text[])` (replaces the caller's list). RLS: own rows always; the admin always (Harry's choice); everyone once phase is past `nominations`. Client code must filter by `user_id` when it wants "my" nominations.
- `normaliseEntry()` / `entryKey()` in `src/lib/normalise.ts`: comparison forms (key = normalised with spaces removed).
- Harry's decision: exact `entryKey` matches auto-combine at close (splittable); fuzzy matches are suggestions only. See SPEC §5.2.
- A list counts only when complete: exactly 15, no repeated `entry_key` (`nomination_list_status()`, mirrored by `listStatus()` in TS). Incomplete lists are kept but excluded from seeding.
- SQL `normalise_entry()` / `entry_key()` mirror the TS versions; `complete_lists.test.sql` checks parity cases.
- `abandon_bracket()` deletes the active bracket in any phase (typed title): every table referencing `brackets` must `on delete cascade`. The UI then removes its images from storage.

## Review, seeding & bracket structure
- Closing nominations runs `build_entries()`: one `entries` row per `entry_key` from complete lists; each counted nomination's `entry_id` = the entry it ORIGINALLY landed in. Reopening deletes entries.
- Merge = `entries.merged_into` (target = earlier-created entry, so it keeps its tiebreak). Scores are always computed by `entry_standings()` over the merge tree with the best-rank-per-user rule, so unmerge is just clearing `merged_into`. `split_entry()` undoes an auto-combine by spelling.
- Order: points desc, nominators desc, stored `tiebreak` asc. `tiebreak` is set once at insert and never rewritten.
- Points per counted nomination = `brackets.base_points` + 16 − rank; `nominationPoints()` in `src/lib/normalise.ts` mirrors it (scoring.test.sql). New brackets default to base 15 (Harry, 2026-11-03: how many nominated counts for more than rank); brackets created before have 0, so their points never change. Clients can't change it.
- Rounds use one scale for every size: round r holds 2^(7-r) entries (0 = R128, 1 = R64 ... 4 = QF, 5 = SF, 6 = final; round 6 slot 1 = third place). The final is always round 6; smaller brackets start at `first_round(size)` / `firstRound(size)`. Never index `ROUNDS` by `round - 1`: use `roundName()` / `roundShort()`.
- `lock_seeding()` sets seeds 1..size, creates one stage per round numbered from 1 (stage = round - first round + 1) and all `matchups` (round r slot s fed by r-1 slots 2s/2s+1), opens stage 1, deals mystery seeds, phase -> live.
- `bracket_order()` / `first_round()` in SQL mirror `src/lib/bracket.ts`; seeding.test.sql and sizes.test.sql check parity.
- Entry images: public bucket `entry-images`, admin-only writes (storage policies). Client resizes in `src/lib/image.ts`.
- `npm run test:storage`: storage policy integration test (local).

## Voting & advancement
- `votes` written only via `cast_vote()` while the stage is open. RLS: own rows always, everyone's once the stage is `closed`. Never subscribe to `votes` over Realtime (it isn't in the publication).
- `matchup_tallies` (trigger-maintained, one row per matchup) is what clients read and subscribe to for live counts. `stages` and `brackets` are also in the Realtime publication.
- Stages: one per round (3 for 8 seeds, 6 for 64, 7 for 128). Advance/undo look up whether a next stage exists rather than assuming a count.
- `close_stage_and_advance()`: one transaction; ties use stored `coin_toss_winner` if still valid else `random()` (then stored). `feed_forward()` fills the next round / third place. `stage_advances` is the undo stack for `undo_last_advance()` (typed UNDO). `override_matchup()` (typed OVERRIDE) only while the next matchup is undecided. `unlock_seeding()` (typed UNLOCK) takes live -> review, deleting matchups/stages/votes/mystery seeds and seed numbers but keeping entries.
- `npm run test:realtime`: Realtime integration test (local).
- `npm run test-bracket -- create|delete [--local]`: throwaway "Test" bracket in review with 64 dummy entries (refuses if a real bracket is active). Targets LIVE unless `--local`.
- FKs into `entries` cascade/set null so deleting a bracket removes everything.

## History, stats, archive (Phase 6)
- `useBracketData(bracketId)` loads one bracket (active or archived): stages, matchups, tallies, visible votes, names; tallies live.
- Pure derivations in `src/lib/stats.ts` (upsets, voteTotals, entryPath, podium, pickStatus) with Vitest coverage. Kingmaker was dropped (Harry, 2026-10-30; removed 2026-11-02).
- Who voted for who: `WhoVoted` (Home, latest closed round) / `WhoVotedRound` (Bracket `?view=votes`), by player via `playerPicks()` or by match.
- Screens: `/bracket` (round tabs + tree, champion card when complete), `/entry/:id`, `/stats`, `/archive`, `/archive/:id`. `MatchupCard` is shared (vote mode via `onPick`, read-only via `link`).
- `npm run test:queries`: PostgREST query smoke test (local).
- `npm run dry-run [-- --size=N | --stages=N | --keep | --wipe]`: full simulated bracket on the local stack (8 fake users).

## Mystery seeds
- `mystery_seeds` (no client access at all) is dealt from the top half of the seeds (widened only if there are more players than that) by `assign_mystery_seeds()` at the end of `lock_seeding()`; `deal_mystery_seeds()` (admin) for brackets locked earlier.
- Clients read only `mystery_board(bracket)`: rows in seed order with entry fields null unless it's the caller's own row or revealed (lost a non-third-place matchup, or won the final). Never expose seed numbers for hidden rows.

## Conventions
- All schema, RLS, functions, triggers and storage policies live in `supabase/migrations`. No dashboard edits.
- RLS on every table. Privacy rules (blind nominations, hidden voters) are enforced in the DB, not just the UI.
- Client env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public). `SUPABASE_SECRET_KEY` only in gitignored `.env` and function secrets. Never commit `.env` or `users.local.json`.
- GitHub Actions reads the public values from repo **variables** (not secrets) of the same names.
- Commit after each build phase, with tests passing.
- Design (SPEC §13): direction D colours (navy, court orange, yellow, amber, red LIVE) with direction F layouts/type: Roboto Condensed italic caps, IBM Plex Mono teleprinter crawls, straight `Badge` tabs, `PageTitle` (plate on offset orange box with overlapping tabs) and `ActionLink` (orange bar on yellow offset), panels with navy-700 header strips, `Crawl` tone orange (top) / yellow (results). LIVE indicators use `LiveDot` (bold red, white rim, halo pulse), never a faded or pastel red. Every matchup is a "MATCH n" box (`MatchupCard`). Tokens/utilities in `src/index.css`; shared pieces in `src/components/ui.tsx`. No NCAA or broadcaster branding.

## Status
All eight build phases are done and live (2026-10-23), followed by Harry's changes through 2026-11-02, dated in SPEC with one commit each. Design is direction D colours with F layouts and G choices. The first real bracket (64 seeds) has been played to completion. Open items and known gaps are in `HANDOVER.md` section 8.
